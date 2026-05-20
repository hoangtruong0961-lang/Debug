import { StoredCharacter, WorldData, PlayerProfile, Entity } from '../../types';
import { extractJson } from '../../utils/regex';

export const CharacterImportService = {
  // Parse PNG or JSON from ArrayBuffer
  async parseBuffer(buffer: ArrayBuffer, contentType: string, fileName?: string): Promise<{ data: any; avatarUrl?: string }> {
    let data;
    let avatarUrl;

    if (contentType.includes('application/json') || fileName?.endsWith('.json')) {
      const text = new TextDecoder().decode(buffer);
      data = JSON.parse(text);
      if (data.node?.format === 'chara_card_v2' && data.node?.data) {
        data = data.node.data;
      }
      
      // Normalize JSON like PNGs
      if (data && (data.spec === 'chara_card_v2' || data.spec_version) && data.data) {
         data = { 
            ...data.data, 
            original_spec: data.spec || data.spec_version, 
            character_book: data.character_book || data.data.character_book 
         };
      }
    } else {
      // It's likely an image, we need to extract metadata and we can keep avatarUrl
      const uint8Array = new Uint8Array(buffer);
      const blob = new Blob([buffer], { type: contentType || 'image/png' });

      avatarUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      data = await this.analyzeSillyTavernImage(uint8Array);
      if (!data) {
         throw new Error("Không thể trích xuất meta-data từ file ảnh này.");
      }
    }

    return { data, avatarUrl };
  },

  // Parse URL from Chub or similar
  async parseUrl(url: string): Promise<{ data: any; avatarUrl?: string; name: string }> {
    const isJsonEndpoint = url.endsWith('.json') || url.includes('/api/');
    
    const response = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ark-client': 'ark-v2-client'
      },
      body: JSON.stringify({ 
        url: url, 
        method: 'GET',
        stream: !isJsonEndpoint
      })
    });
    
    if (!response.ok) throw new Error("Lỗi HTTP " + response.status);
    
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    
    const { data, avatarUrl } = await this.parseBuffer(buffer, contentType, url.split('/').pop());
    
    return { data, avatarUrl, name: url.split('/').pop() || 'url_import' };
  },

  async analyzeSillyTavernImage(uint8Array: Uint8Array): Promise<any | null> {
    let extractedData: any = null;

    // Helper to decode UTF-8 Base64 correctly (fixing font/encoding issues), robust version
    const decodeBase64UTF8 = (str: string) => {
      try {
        // Standard atob followed by escape/decodeURIComponent to handle multi-byte characters like Japanese/Chinese
        return decodeURIComponent(escape(atob(str)));
      } catch {
        try {
          // Modern robust fallback
          const binaryString = atob(str);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return new TextDecoder('utf-8').decode(bytes);
        } catch {
          try {
            return atob(str);
          } catch {
            return null;
          }
        }
      }
    };

    const parseData = (str: string) => {
      return JSON.parse(str);
    };

    const tryParsePayload = (payloadString: string) => {
      try {
        return parseData(payloadString);
      } catch {
        const decodedBase64 = decodeBase64UTF8(payloadString);
        if (decodedBase64) {
          try {
            return parseData(decodedBase64);
          } catch { /* continue */ }
        }
      }
      return null;
    };

    // 1. Check if it's a PNG and look for chunks
    const isPng = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
    
    if (isPng) {
      let offset = 8;
      while (offset < uint8Array.length) {
        if (offset + 8 > uint8Array.length) break;
        const length = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) | (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        const type = String.fromCharCode(uint8Array[offset + 4], uint8Array[offset + 5], uint8Array[offset + 6], uint8Array[offset + 7]);
        
        if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
          const chunkData = uint8Array.slice(offset + 8, offset + 8 + length);
          
          // Keyword is always first, null-terminated
          let nullIdx = 0;
          for (let i = 0; i < chunkData.length; i++) {
            if (chunkData[i] === 0) {
              nullIdx = i;
              break;
            }
          }
          
          const keyword = new TextDecoder('latin1').decode(chunkData.slice(0, nullIdx));
          
          if (keyword === 'chara' || keyword === 'SillyTavern') {
            let payloadBytes: Uint8Array | null = null;

            try {
              if (type === 'tEXt') {
                payloadBytes = chunkData.slice(nullIdx + 1);
              } else if (type === 'zTXt') {
                // compression method = chunkData[nullIdx + 1]
                const compressedData = chunkData.slice(nullIdx + 2);
                // Attempt decompression if running in browser with DecompressionStream
                if (typeof DecompressionStream !== 'undefined') {
                  const ds = new DecompressionStream('deflate');
                  const writer = ds.writable.getWriter();
                  writer.write(compressedData);
                  writer.close();
                  const reader = ds.readable.getReader();
                  const chunks = [];
                  let totalLength = 0;
                  while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) {
                      chunks.push(value);
                      totalLength += value.length;
                    }
                  }
                  payloadBytes = new Uint8Array(totalLength);
                  let pos = 0;
                  for (const c of chunks) {
                    payloadBytes.set(c, pos);
                    pos += c.length;
                  }
                }
              } else if (type === 'iTXt') {
                const compressionFlag = chunkData[nullIdx + 1];
                // const compressionMethod = chunkData[nullIdx + 2];
                // language tag ends with null
                let langNullIdx = nullIdx + 3;
                while (langNullIdx < chunkData.length && chunkData[langNullIdx] !== 0) langNullIdx++;
                // translated keyword ends with null
                let transNullIdx = langNullIdx + 1;
                while (transNullIdx < chunkData.length && chunkData[transNullIdx] !== 0) transNullIdx++;
                
                const rawPayloadData = chunkData.slice(transNullIdx + 1);
                
                if (compressionFlag === 0) {
                   payloadBytes = rawPayloadData;
                } else if (compressionFlag === 1 && typeof DecompressionStream !== 'undefined') {
                  const ds = new DecompressionStream('deflate');
                  const writer = ds.writable.getWriter();
                  writer.write(rawPayloadData);
                  writer.close();
                  const reader = ds.readable.getReader();
                  const chunks = [];
                  let totalLength = 0;
                  while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) {
                      chunks.push(value);
                      totalLength += value.length;
                    }
                  }
                  payloadBytes = new Uint8Array(totalLength);
                  let pos = 0;
                  for (const c of chunks) {
                    payloadBytes.set(c, pos);
                    pos += c.length;
                  }
                }
              }
            } catch (e) {
              console.warn("Lỗi giải mã chunk " + type, e);
            }

            if (payloadBytes) {
              const textDecoder = new TextDecoder('utf-8');
              const potentialData = textDecoder.decode(payloadBytes);
              const result = tryParsePayload(potentialData);
              if (result) {
                extractedData = result;
                break;
              }
            }
          }
        }
        
        offset += 12 + length;
        if (type === 'IEND') break;
      }
    }

    // 2. Fallback: Trailing Data
    if (!extractedData) {
      const textDecoder = new TextDecoder('utf-8');
      const tailSize = Math.min(uint8Array.length, 1024 * 1024);
      const tail = uint8Array.slice(uint8Array.length - tailSize);
      const tailText = textDecoder.decode(tail);
      
      const result = extractJson(tailText);
      if (result) {
        extractedData = result;
      }
    }

    if (extractedData) {
      // Normalize V2/V3 Spec like the old logic
      if (extractedData.data && (extractedData.spec === 'chara_card_v2' || extractedData.spec_version)) {
         extractedData = { 
            ...extractedData.data, 
            original_spec: extractedData.spec || extractedData.spec_version, 
            character_book: extractedData.character_book || extractedData.data.character_book 
         };
      }
    }

    return extractedData;
  },

  toStoredCharacter(data: any, avatarUrl?: string): StoredCharacter {
    // Determine spec and normalize basic info
    let spec = 'unknown';
    let name = 'Unknown';
    let description = '';
    let tags: string[] = [];

    if (data.spec === 'chara_card_v2' && data.data) {
       // Unnormalized JSON
       spec = 'chara_card_v2';
       name = data.data.name || 'Unknown';
       description = data.data.description || '';
       tags = data.data.tags || [];
    } else if (data.original_spec) {
       // Normalized flattened JSON
       spec = data.original_spec;
       name = data.name || 'Unknown';
       description = data.description || '';
       tags = data.tags || [];
    } else if (data.name) {
       // V1 or fully normalized without spec
       spec = data.spec || data.spec_version || 'v1';
       name = data.name;
       description = data.description || '';
       tags = data.tags || [];
    }

    return {
      id: crypto.randomUUID(),
      name,
      avatarUrl,
      description,
      tags,
      spec,
      rawData: data,
      importedAt: Date.now()
    };
  },

  // Transforms a StoredCharacter and Player Profile into WorldData for the game engine
  toWorldData(char: StoredCharacter, player: PlayerProfile): WorldData {
     // Handle both pre-flattened and raw data forms
     const data = (char.rawData && char.rawData.original_spec) ? char.rawData : ((char.spec === 'chara_card_v2' && char.rawData?.data) ? char.rawData.data : char.rawData);
     
     // Default setup for WorldData
     const entities: Entity[] = [];
     let lorebook: import('../../services/ai/lorebook/types').Lorebook | undefined;
     let regexScripts: import('../../types').RegexScript[] = [];
     
     // Map Character Entity
     const mainChar: Entity = {
        id: crypto.randomUUID(),
        name: data.name || char.name,
        type: "NPC",
        description: data.description || '',
        personality: data.personality || '',
        firstMessage: data.first_mes || '',
        systemPrompt: (data.system_prompt || '') + '\n' + (data.post_history_instructions || ''),
        scenario: data.scenario || '',
        exampleMessages: data.mes_example || '',
        alternate_greetings: data.alternate_greetings || []
     };
     entities.push(mainChar);

     // Map Lorebook
     const bookData = char.rawData.character_book || data.character_book;
     if (bookData) {
        const entries: Record<string, import('../../services/ai/lorebook/types').LorebookEntry> = {};
        
        if (bookData.entries && Array.isArray(bookData.entries)) {
           bookData.entries.forEach((entry: any, idx: number) => {
              const uid = entry.uid !== undefined ? String(entry.uid) : `entry_${idx}_${Date.now()}`;
              // Same mapping as in CardSTAnalyzer
              const order = entry.order !== undefined ? entry.order : (entry.insertion_order !== undefined ? entry.insertion_order : idx);
              const useRegex = entry.use_regex || false;
              let keys = entry.keys || [];
              let secondaryKeys = entry.secondary_keys || entry.keysecondary || entry.selective || [];
              const selectiveLogic = entry.selectiveLogic !== undefined ? entry.selectiveLogic : (entry.logical !== undefined ? entry.logical : 0);
              
              if (useRegex) {
                  keys = keys.map((k: string) => k.startsWith('/') ? k : `/${k}/`);
                  secondaryKeys = secondaryKeys.map((k: string) => k.startsWith('/') ? k : `/${k}/`);
              }

              entries[uid] = {
                uid,
                key: keys,
                keysecondary: secondaryKeys,
                selectiveLogic,
                content: entry.content || '',
                comment: entry.name,
                constant: entry.constant || false,
                position: entry.position === 'before_char' ? 1 : 2, 
                order: order,
                placement: [], 
                enabled: entry.enabled !== false,
                useRegex: useRegex,
              };
           });
        }
        lorebook = { entries };
     }

     // Map Regex Scripts
     if (char.rawData.regex_scripts && Array.isArray(char.rawData.regex_scripts)) {
        regexScripts = char.rawData.regex_scripts;
     } else if (data.extensions && data.extensions.regex_scripts) {
        regexScripts = data.extensions.regex_scripts;
     } else if (bookData?.extensions?.regex_scripts) {
        regexScripts = bookData.extensions.regex_scripts;
     }

     return {
        id: crypto.randomUUID(),
        player: player,
        entities: entities,
        lorebook: lorebook,
        world: {
           worldName: `ST: ${char.name}`,
           genre: 'Roleplay',
           context: data.scenario || '',
           firstMessage: data.first_mes || '',
        },
        config: {
           difficulty: "Thách thức",
           outputLength: "Trung bình",
           rules: [],
           perspective: "third",
        },
        extensions: {
            regex_scripts: regexScripts
        }
     } as WorldData;
  }
};


import { Type } from "@google/genai";
import { getAiClient } from "../client";
import { buildWorldCreationPrompt, getWorldCreationSystemInstruction } from "./prompts";
import { AppSettings, Entity } from "../../../types";
import { extractJson } from '../../../utils/regex';

export const worldAiService = {
  // --- WORLD CREATION ASSISTANT (STRICT LOGIC) ---

  async generateFieldContent(
    category: 'player' | 'world' | 'entity', 
    field: string, 
    contextData: Record<string, unknown>, 
    modelName: string = 'gemini-3.1-pro-preview',
    currentInput?: string, // New Parameter for Enrich Mode
    settings?: AppSettings
  ): Promise<string> {
    try {
      // 1. Get System Instruction based on Mode (Create vs Enrich)
      const systemInstruction = getWorldCreationSystemInstruction(category, field, currentInput);

      // 2. Build User Prompt
      // Note: buildWorldCreationPrompt now handles the switching logic inside
      let userPrompt = "";

      if (currentInput && currentInput.trim().length > 0) {
          // Enrich Mode: Prompt is handled by buildWorldCreationPrompt entirely
          userPrompt = buildWorldCreationPrompt(field, contextData, currentInput);
      } else {
          // Create Mode: Keep existing context construction logic for better randomness
          if (category === 'player') {
             userPrompt = `CHARACTER INFORMATION:
- Name: ${contextData.name}
- Gender: ${contextData.gender}
- Age: ${contextData.age}
- World Genre: ${contextData.genre || "Optional"}

REQUIREMENT: Write content for field: "${field}".`;
          } else if (category === 'world') {
             userPrompt = `WORLD INFORMATION:
- Genre: ${contextData.genre}
- World Name: ${contextData.worldName || "Untitled"}

REQUIREMENT: Write content for field: "${field}".`;
          } else if (category === 'entity') {
             userPrompt = `ENTITY INFORMATION:
- Name: ${contextData.name}
- Type: ${contextData.type} (NPC/LOCATION/CUSTOM)
- World Genre: ${contextData.genre || "Optional"}

REQUIREMENT: Write content for field: "${field}".`;
          }
      }

      // 3. Call AI
      const aiClient = getAiClient(settings);
      const response = await aiClient.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: currentInput ? 0.7 : 0.85, // Lower temp for enrichment to stay closer to source
          topK: 40,
          topP: 0.95,
        }
      });

      return response.text?.trim() || "";
    } catch {
      return "Không thể kết nối với AI. Vui lòng kiểm tra API Key hoặc thử lại sau.";
    }
  },

  async generateFullWorld(concept: string, modelName: string = 'gemini-3.1-pro-preview', settings?: AppSettings, existingData?: Record<string, unknown>): Promise<Record<string, unknown>> {
    let existingContext = "";
    if (existingData) {
        existingContext = `
[CURRENT DATA - MUST RESPECT AND NOT CHANGE]
${JSON.stringify(existingData, null, 2)}

IMPORTANT DIRECTIVES:
1. If a field in "CURRENT DATA" already has content, you MUST keep that content in the returned result.
2. You are only allowed to fill in empty fields (empty strings, empty arrays, or default values).
3. Use existing information to create new information that is logical and consistent.
4. If the 'entities' list already has data, keep them and add new entities until the required quantity is reached (total at least 4).
5. If the 'rules' list already has data, keep them and add new rules.
        `.trim();
    }

    const prompt = `
        You are a World Builder.
        Based on the core idea: "${concept}", build a complete RPG world setup.
        
        ${existingContext}

        Output requirements:
        1. Language: Vietnamese.
        2. Return in correct JSON format according to Schema.
        3. Content must be creative, logical, and have literary depth.
        4. World Name (worldName): MUST be unique, evocative, and deeply connected to the core idea and genre. Avoid generic names like "Thế giới huyền bí" or "Đại lục X". Use poetic, symbolic, or culturally relevant naming conventions.
        5. Build a layered world Bible based on high-standard worldbuilding frameworks:
           - Core Premise (corePremise): The foundational concept and overarching central conflict of the world.
           - Cosmology & Rules (cosmology): The structure of the universe, planes, or cosmic forces, plus fundamental physical and magical operational rules (e.g. magic system name, rules, limits, cost).
           - Timeline & History (timeline): 3-4 historical epochs with key events in bullet points.
           - Geography & Climate (geography): Notable biomes, climates, extreme terrains, and major legend cities.
           - Factions & Power Dynamics (factionsPower): The prominent guilds, factions, empires, or cults and their political tensions.
           - Economy & Resources (economyResources): Standard currency, trading routes, and rare/source energies.
           - Cultural Identity & Taboos (culturalIdentity): Cultural values, deep beliefs, customs, and sacred taboos.
           - Adventure Hooks (adventureHooks): 3-4 active adventure hooks or burning mysteries.
        6. Include:
           - 1 Main Character (Player): Has a biography, personality, goals, appearance, voice and tone, and narrative role (Choose from: Protagonist, Antagonist, Mentor & Ally, Foil) related to the core idea.
           - World Setting (World): Name, genre, detailed background/history description of each layer, and starting scenario (startingScenario).
           - 4 Entities (Entities): Include at least 1 NPC, 1 Location, 1 Item, 1 Faction.
           - 3-5 World Rules (Rules): Special rules, taboos, or operating mechanisms of this world.
           - Initial Game Time (initialGameTime): Choose a starting timestamp (Year, Month, Day, Hour, Minute) reasonable for the world context.
        
        NOTE ON ENTITY STRUCTURE:
        - For NPC: Must fill in Name, Gender, Age, Personality (personalityKeywords + personalityDetail), Biography (background), Appearance, Introduction (intro), Narrative Role (narrativeRole).
        - For Location/Faction/Custom: Gender/age fields can be empty, but background and appearance must be detailed.
        - For Item: Fill in appearance, background, rarity, and price.
      `;

      const aiClient = getAiClient(settings);
      const response = await aiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              player: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Tên nhân vật" },
                  gender: { type: Type.STRING, description: "Giới tính (Nam/Nữ/Khác)" },
                  age: { type: Type.STRING, description: "Tuổi" },
                  personality: { type: Type.STRING, description: "Tính cách nổi bật" },
                  background: { type: Type.STRING, description: "Tiểu sử và xuất thân" },
                  appearance: { type: Type.STRING, description: "Mô tả ngoại hình" },
                  voiceAndTone: { type: Type.STRING, description: "Giọng nói và văn phong (ngắn gọn, trầm, kiêu ngạo, v.v.)" },
                  narrativeRole: { type: Type.STRING, description: "Vai trò cốt truyện", enum: ['Protagonist', 'Antagonist', 'Mentor & Ally', 'Foil'] },
                  skills: { type: Type.STRING, description: "Kỹ năng đặc biệt" },
                  goal: { type: Type.STRING, description: "Mục tiêu chính" },
                },
                required: ['name', 'gender', 'age', 'personality', 'background', 'appearance', 'voiceAndTone', 'narrativeRole', 'skills', 'goal']
              },
              world: {
                type: Type.OBJECT,
                properties: {
                  worldName: { type: Type.STRING, description: "Tên thế giới" },
                  genre: { type: Type.STRING, description: "Thể loại" },
                  context: { type: Type.STRING, description: "Bối cảnh lịch sử, xã hội tổng thể" },
                  startingScenario: { type: Type.STRING, description: "Mô tả kịch bản/bối cảnh mở đầu khi người chơi bắt đầu hành trình lần đầu" },
                  corePremise: { type: Type.STRING, description: "Khái niệm cốt lõi, bí ẩn thế giới (2-3 đoạn văn)" },
                  cosmology: { type: Type.STRING, description: "Vũ trụ học & Quy luật ma thuật/khoa học" },
                  timeline: { type: Type.STRING, description: "Biên niên sử & Dòng thời gian lớn (bullet points)" },
                  geography: { type: Type.STRING, description: "Địa lý, khí hậu & Đô thị lớn" },
                  factionsPower: { type: Type.STRING, description: "Phe phái & Cơ cấu cân bằng quyền lực" },
                  economyResources: { type: Type.STRING, description: "Kinh tế & Tài nguyên đặc trưng" },
                  culturalIdentity: { type: Type.STRING, description: "Cộng đồng, bản sắc văn hóa & Cấm kỵ" },
                  adventureHooks: { type: Type.STRING, description: "Các móc phiêu lưu & Bí ẩn cấp bách" },
                  initialGameTime: {
                    type: Type.OBJECT,
                    description: "Thời gian khởi đầu của thế giới",
                    properties: {
                      year: { type: Type.INTEGER },
                      month: { type: Type.INTEGER },
                      day: { type: Type.INTEGER },
                      hour: { type: Type.INTEGER },
                      minute: { type: Type.INTEGER }
                    },
                    required: ['year', 'month', 'day', 'hour', 'minute']
                  }
                },
                required: ['worldName', 'genre', 'initialGameTime', 'corePremise', 'cosmology', 'timeline', 'geography', 'factionsPower', 'economyResources', 'culturalIdentity', 'adventureHooks', 'startingScenario']
              },
              rules: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách các quy tắc thế giới"
              },
              entities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['NPC', 'LOCATION', 'ITEM', 'FACTION', 'CUSTOM'] },
                    name: { type: Type.STRING },
                    // Detailed fields for generation
                    gender: { type: Type.STRING, nullable: true },
                    age: { type: Type.STRING, nullable: true },
                    personalityKeywords: { type: Type.STRING, description: "Từ khóa tính cách (Vui vẻ, Lạnh lùng...)" },
                    personalityDetail: { type: Type.STRING, description: "Diễn giải tính cách chi tiết" },
                    appearance: { type: Type.STRING, description: "Mô tả ngoại hình/diện mạo vật phẩm/địa thế" },
                    background: { type: Type.STRING, description: "Tiểu sử/Lịch sử hình thành/Nguồn gốc" },
                    intro: { type: Type.STRING, description: "Lời chào hoặc mô tả mở đầu" },
                    customType: { type: Type.STRING, nullable: true },
                    rarity: { type: Type.STRING, nullable: true, description: "Độ hiếm cho ITEM (Thường, Hiếm, Cổ vật, Sử thi)" },
                    price: { type: Type.STRING, nullable: true, description: "Giá giao thương cho ITEM" },
                  },
                  required: ['type', 'name', 'background', 'appearance']
                }
              }
            },
            required: ['player', 'world', 'entities']
          },
          temperature: 0.9
        }
      });

      if (response.text) {
        const data = extractJson<any>(response.text);
        if (!data) throw new Error("Cannot parse JSON from model response.");
        
        // Extract and map GameTime
        if (data.world && data.world.initialGameTime) {
            data.gameTime = data.world.initialGameTime;
            delete data.world.initialGameTime;
        }

        // Dynamically compile layered information into a high-standard World Context Markdown
        if (data.world) {
           const w = data.world;
           const parts: string[] = [];
           if (w.worldName) {
               parts.push(`# ${w.worldName.toUpperCase()}`);
               if (w.genre) {
                   parts.push(`*Thể loại: ${w.genre}*`);
               }
           }
           
           if (w.corePremise) parts.push(`## 📌 GIẢ THUYẾT CỐT LÕI (CORE PREMISE)\n${w.corePremise}`);
           if (w.cosmology) parts.push(`## 🔮 VŨ TRỤ HỌC & ĐỊA GIỚI (COSMOLOGY)\n${w.cosmology}`);
           if (w.timeline) parts.push(`## ⏳ DÒNG THỜI GIAN & LỊCH SỬ (TIMELINE)\n${w.timeline}`);
           if (w.geography) parts.push(`## 🗺️ ĐỊA LÝ & KHÍ HẬU (GEOGRAPHY & CLIMATE)\n${w.geography}`);
           if (w.factionsPower) parts.push(`## 🛡️ PHE PHÁI & CƠ CẤU QUYỀN LỰC (FACTIONS & POWER)\n${w.factionsPower}`);
           if (w.economyResources) parts.push(`## 🪙 KINH TẾ & TÀI NGUYÊN (ECONOMY & RESOURCES)\n${w.economyResources}`);
           if (w.culturalIdentity) parts.push(`## 🎭 BẢN SẮC VĂN HÓA & PHONG TỤC (CULTURE)\n${w.culturalIdentity}`);
           if (w.adventureHooks) parts.push(`## 🪝 MÓC PHIÊU LƯU (ADVENTURE HOOKS)\n${w.adventureHooks}`);
           
           w.context = parts.join('\n\n');
        }

        // Post-processing entities to match App Interface
        if (data.entities && Array.isArray(data.entities)) {
            data.entities = data.entities.map((ent: Record<string, unknown>, idx: number) => {
                // Merge details into the main 'description' field for the App
                let fullDesc: string;
                
                const entData = ent as Record<string, unknown>;
                const type = entData.type as string;
                const gender = entData.gender as string;
                const age = entData.age as string;
                const appearance = entData.appearance as string;
                const background = entData.background as string;
                const intro = entData.intro as string;
                const personalityKeywords = entData.personalityKeywords as string;
                const personalityDetail = entData.personalityDetail as string;
                const id = entData.id as string;
                const name = entData.name as string;
                const customType = entData.customType as string;
                const rarity = entData.rarity as string;
                const price = entData.price as string;

                if (type === 'NPC') {
                    fullDesc = `[Giới tính: ${gender || '?'}] [Tuổi: ${age || '?'}]\n`;
                    fullDesc += `\n>> NGOẠI HÌNH:\n${appearance}\n`;
                    fullDesc += `\n>> TIỂU SỬ:\n${background}\n`;
                    fullDesc += `\n>> GIỚI THIỆU:\n"${intro || '...'}"`;
                } else if (type === 'ITEM') {
                    fullDesc = `**Độ hiếm:** ${rarity || 'Thường'} | **Giá trị:** ${price || '0 Vàng'}\n\n`;
                    fullDesc += `>> DIỆN MẠO & ĐẶC ĐIỂM:\n${appearance}\n`;
                    fullDesc += `\n>> NGUỒN GỐC & TÁC DỤNG:\n${background}`;
                } else if (type === 'FACTION') {
                    fullDesc = `>> CƠ CẤU & TÔN CHỈ:\n${background}\n`;
                    fullDesc += `\n>> PHẠM VI CAI TRỊ & THẾ LỰC:\n${appearance}`;
                } else {
                    fullDesc = `${background}\n\n(Mô tả: ${appearance})`;
                }

                // Format Personality
                const fullPersonality = personalityKeywords 
                    ? `${personalityKeywords} - ${personalityDetail || ''}` 
                    : personalityDetail || "";

                return {
                    id: id || `ai-ent-${Date.now()}-${idx}`,
                    type: type,
                    name: name,
                    description: fullDesc, // App uses this
                    personality: fullPersonality, // App uses this for NPC
                    customType: customType,
                    rarity: rarity,
                    price: price
                } as Entity;
            });
        }

        // Setup config rules
        if (data.rules) {
            data.config = { rules: data.rules };
        }

        return data;
      }
      throw new Error("AI trả về phản hồi rỗng.");
  },

  async generateInitialTime(genre: string, context: string, modelName: string = 'gemini-3.1-pro-preview', settings?: AppSettings): Promise<Record<string, unknown>> {
    const prompt = `Based on world genre: "${genre}" and context: "${context}", choose a reasonable starting timestamp (Year, Month, Day, Hour, Minute). 
    Return in correct JSON format: {"year": number, "month": number, "day": number, "hour": number, "minute": number}.
    Example: Modern is 2026, Xianxia could be 1 or 9999, etc.`;

    const aiClient = getAiClient(settings);
    const response = await aiClient.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            year: { type: Type.INTEGER },
            month: { type: Type.INTEGER },
            day: { type: Type.INTEGER },
            hour: { type: Type.INTEGER },
            minute: { type: Type.INTEGER }
          },
          required: ['year', 'month', 'day', 'hour', 'minute']
        }
      }
    });

    if (response.text) {
      const parsed = extractJson<Record<string, unknown>>(response.text);
      if (parsed) return parsed;
      throw new Error("Cannot parse JSON from AI response.");
    }
    throw new Error("AI không thể tạo thời gian.");
  },

  async generateCharacterSheetFromKnowledge(
    knowledgeData: string,
    modelName: string = 'gemini-3.1-pro-preview',
    settings?: AppSettings
  ): Promise<Partial<import('../../../types').CharacterSheet>> {
    const prompt = `Bạn là một chuyên gia phân tích nhân vật (Character Analyst) và sáng tác Lore Truyện.
Nhiệm vụ của bạn là đọc Dữ Liệu Gốc (Knowledge/Lore/Wiki) sau đây và trích xuất/tổng hợp thành một bảng Character Sheet tiêu chuẩn.
Nếu thông tin không có sẵn trong dữ liệu gốc, hãy TỰ SUY LUẬN và SÁNG TẠO sao cho phù hợp và logic nhất với bối cảnh và văn phong của dữ liệu đó.

DỮ LIỆU GỐC:
"""
${knowledgeData}
"""

YÊU CẦU:
Trả về phản hồi dưới định dạng JSON theo đúng cấu trúc sau:
- name: Tên nhân vật.
- gender: Giới tính (Nam/Nữ/Vô tính...).
- age: Định lượng tuổi.
- appearance: Ngoại hình rành mạch.
- voiceAndTone: Giọng nói và Văn phong (khi nhân vật nói chuyện).
- personality: Tính cách chung.
- coreValues: Giá trị cốt lõi (điều không thể bẻ gãy).
- hardLimits: Giới hạn chịu đựng / Không bao giờ làm gì.
- definingEvents: Sự kiện định hình quá khứ.
- background: Tiểu sử đầy đủ.
- currentMood: Trạng thái nội tâm / Mood hiện tại.
- relationshipTags: Quan hệ (Bạn bè/Thù địch...).
- strengths: Điểm mạnh.
- weaknesses: Điểm yếu.
- narrativeRole: Vai trò trong câu chuyện.
- contradictions: Mâu thuẫn nội tâm.
- failureMode: Hành vi khi thất bại/hoảng loạn.
- exampleMessages: Ví dụ 3-4 lời thoại tiêu biểu của nhân vật (Mỗi dòng một câu).`;

    const aiClient = getAiClient(settings);
    const response = await aiClient.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            gender: { type: Type.STRING },
            age: { type: Type.STRING },
            appearance: { type: Type.STRING },
            voiceAndTone: { type: Type.STRING },
            personality: { type: Type.STRING },
            coreValues: { type: Type.STRING },
            hardLimits: { type: Type.STRING },
            definingEvents: { type: Type.STRING },
            background: { type: Type.STRING },
            currentMood: { type: Type.STRING },
            relationshipTags: { type: Type.STRING },
            strengths: { type: Type.STRING },
            weaknesses: { type: Type.STRING },
            narrativeRole: { type: Type.STRING },
            contradictions: { type: Type.STRING },
            failureMode: { type: Type.STRING },
            exampleMessages: { type: Type.STRING },
          }
        },
        temperature: 0.7
      }
    });

    if (response.text) {
      const parsed = extractJson<Partial<import('../../../types').CharacterSheet>>(response.text);
      if (parsed) return parsed;
      throw new Error("Không thể parse JSON từ phản hồi AI.");
    }
    throw new Error("AI không phản hồi.");
  }
};

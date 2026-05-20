
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AppSettings, SaveFile, SystemLog, ImageMetadata, StoredCharacter } from '../../types';
import { DEFAULT_SAFETY_SETTINGS, DIFFICULTY_LEVELS, OUTPUT_LENGTHS } from '../../constants/promptTemplates';
import { CompressionUtils } from '../../utils/compression';

export interface VectorData {
  id: string;
  text: string;
  embedding: number[];
  timestamp: number;
  role: 'user' | 'model' | 'novel_source' | 'story_bible'; // Added story_bible
  docId?: string; // If this is a novel_source, reference to the document ID
  saveId?: string; // Important to segregate by save for story_bible
  keyword?: string; // Subject for story_bible
  category?: string; // E.g., 'character', 'location', 'item', 'faction', 'relationship', 'lore', 'event'
  updateHistory?: { timestamp: number; content: string }[]; // Track over time
  // New fields for Encyclopedia Manager
  triggerMode?: 'always' | 'keyword' | 'semantic' | 'hybrid';
  keywords?: string[]; // tags/keywords for triggering
  tags?: string[]; // classification tags
  summary?: string; // Short summary
  priority?: number; // 0-100
  position?: 'before_char' | 'after_char' | 'before_history' | 'after_history' | 'in_chat';
  isSticky?: boolean;
  stickyTurns?: number;
  depth?: number;
  relatedEntries?: string[]; // Arrays of IDs
  isEnabled?: boolean;
}

interface RPGDatabase extends DBSchema {
  saves: {
    key: string;
    value: SaveFile;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  logs: {
    key: number;
    value: SystemLog;
    autoIncrement: true;
  };
  vectors: {
    key: string;
    value: VectorData;
  };
  assets: {
    key: string;
    value: { id: string; data: string; timestamp: number };
  };
  images: {
    key: string;
    value: ImageMetadata;
  };
  novel_docs: {
    key: string;
    value: { id: string; name: string; content: string; timestamp: number };
  };
  tavo_data: {
    key: string;
    value: any[];
  };
  characters: {
    key: string;
    value: StoredCharacter;
  };
}

const OLD_DB_NAME = 'aetheria-rpg-db';
const DB_NAME = 'ark-v2-db';
const DB_VERSION = 2; // bumped from 1 to 2

export const DEFAULT_SETTINGS: AppSettings = {
    javaScriptMode: 'auto',
    soundVolume: 50,
    musicVolume: 50,
    theme: 'dark',
    fontSize: 10,
    systemFont: 'Inter',
    realityDifficulty: 'Normal',
    contentBeautify: false,
    visualEffects: true,
    fullScreenMode: false,
    safetySettings: DEFAULT_SAFETY_SETTINGS,
    aiModel: 'gemini-3.1-pro-preview',
    backgroundAiModel: 'gemini-3-flash-preview',
    aiMode: 'single',
    embeddingModel: 'gemini-embedding-001',
    // Game Configuration Defaults
    perspective: 'third',
    difficulty: DIFFICULTY_LEVELS[1], // Normal
    outputLength: OUTPUT_LENGTHS[2], // Default (1200 - 2500 từ)
    customMinWords: 1000,
    customMaxWords: 3000,
    streamResponse: true,
    geminiApiKey: [],
    proxyUrl: '',
    proxyKey: '',
    proxyModel: '',
    proxyModels: [],
    proxyName: '',
    proxyUrl2: '',
    proxyKey2: '',
    proxyModel2: '',
    proxyModels2: [],
    proxyName2: '',
    useGeminiApi: true,
    proxyEnabled: false,
    enableVectorMemory: true,
    proxies: [],
    activeProxyId: undefined,
    storyDialogueColor: '#F97316',
    storyThinkingColor: '#A855F7',
    storyHighlightColor: '#FACC15',
    storyOnomatopoeiaColor: '#EF4444'
};

class DatabaseService {
  private dbPromise: Promise<IDBPDatabase<RPGDatabase>>;

  constructor() {
    this.dbPromise = openDB<RPGDatabase>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('saves')) {
          db.createObjectStore('saves', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('logs')) {
          db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        }
        // Task 3.1: Add vectors store
        if (!db.objectStoreNames.contains('vectors')) {
          const vectorStore = db.createObjectStore('vectors', { keyPath: 'id' });
          // Optional: Add index for timestamp if needed for cleanup later
          vectorStore.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('images')) {
          const imageStore = db.createObjectStore('images', { keyPath: 'id' });
          imageStore.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('novel_docs')) {
          db.createObjectStore('novel_docs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('tavo_data')) {
          db.createObjectStore('tavo_data');
        }
        if (!db.objectStoreNames.contains('characters')) {
          const charStore = db.createObjectStore('characters', { keyPath: 'id' });
          charStore.createIndex('importedAt', 'importedAt');
          charStore.createIndex('lastPlayedAt', 'lastPlayedAt');
        }
      },
    });
  }

  async checkConnection(): Promise<boolean> {
    try {
      const db = await this.dbPromise;
      return !!db;
    } catch {
      return false;
    }
  }

  async logEvent(message: string, type: 'info' | 'error' | 'warning' = 'info') {
    const db = await this.dbPromise;
    await db.add('logs', {
      timestamp: Date.now(),
      message,
      type
    } as SystemLog);
  }

  async getSettings(): Promise<AppSettings> {
    const db = await this.dbPromise;
    const settings = await db.get('settings', 'user_settings');
    
    if (!settings) {
        return DEFAULT_SETTINGS;
    }

    // Merge defaults with saved settings to ensure new fields exist
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };

    const isMobileDevice = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const targetFontSize = isMobileDevice ? 10 : 16;

    // MIGRATION: Auto-disable beautify content and set fontSize based on device
    if (mergedSettings.contentBeautify === true || mergedSettings.fontSize !== targetFontSize) {
      // We force these defaults initially or if they need to be auto-applied
      // To not override user's active manual changes every time, maybe we just do it once?
      // "Auto tắt", "luôn chọn cỡ chữ 10 là mặc định"
      // If we just override them it will stick.
      // Easiest is to force them here but still save. Wait, if we force it, the user can't change it.
      // So we use a migration flag or we just apply it if not migrated.
      if (!settings._uiMigrated3) {
        mergedSettings.contentBeautify = false;
        mergedSettings.fontSize = targetFontSize;
        mergedSettings._uiMigrated3 = true;
        setTimeout(() => this.saveSettings(mergedSettings), 0);
      }
    }

    // MIGRATION: Move old proxy settings to the new proxies array if empty
    if (mergedSettings.proxies.length === 0) {
      const migratedProxies: any[] = [];
      
      if (mergedSettings.proxyUrl) {
        migratedProxies.push({
          id: 'proxy-1',
          url: mergedSettings.proxyUrl,
          key: mergedSettings.proxyKey || '',
          model: mergedSettings.proxyModel || '',
          models: mergedSettings.proxyModels || [],
          isActive: true,
          type: 'google'
        });
      }
      
      if (mergedSettings.proxyUrl2) {
        migratedProxies.push({
          id: 'proxy-2',
          url: mergedSettings.proxyUrl2,
          key: mergedSettings.proxyKey2 || '',
          model: mergedSettings.proxyModel2 || '',
          models: mergedSettings.proxyModels2 || [],
          isActive: false,
          type: 'google'
        });
      }
      
      if (migratedProxies.length > 0) {
        mergedSettings.proxies = migratedProxies;
        mergedSettings.activeProxyId = migratedProxies[0].id;
        // Save the migrated settings
        setTimeout(() => this.saveSettings(mergedSettings), 0);
      }
    }

    return mergedSettings;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', settings, 'user_settings');
  }

  async hasSaves(): Promise<boolean> {
    const db = await this.dbPromise;
    const count = await db.count('saves');
    return count > 0;
  }

  async saveGameState(saveData: SaveFile): Promise<void> {
    const db = await this.dbPromise;
    // Compress the data part of the save file to save space
    const originalData = JSON.stringify(saveData.data);
    const compressedData = CompressionUtils.compress(originalData);
    
    // Create a copy with compressed data
    const compressedSave: SaveFile = {
      ...saveData,
      data: compressedData,
      _compressed: true // Flag to indicate compression
    };
    
    await db.put('saves', compressedSave);
  }

  async saveAutosave(saveData: SaveFile): Promise<void> {
    await this.saveGameState(saveData);
  }

  async getAllSaves(): Promise<SaveFile[]> {
    const db = await this.dbPromise;
    const rawSaves = await db.getAll('saves');
    
    return rawSaves.map((save: SaveFile) => {
      if (save._compressed && typeof save.data === 'string') {
        try {
          const decompressedData = CompressionUtils.decompress(save.data);
          return {
            ...save,
            data: JSON.parse(decompressedData),
            _compressed: undefined
          };
        } catch (e) {
          console.error('Failed to decompress save data:', e);
          return save;
        }
      }
      return save;
    });
  }

  async deleteSave(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('saves', id);
  }

  async clearAllSaves(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('saves');
  }

  // --- Vector Operations ---

  async saveVector(vectorData: VectorData): Promise<void> {
    const db = await this.dbPromise;
    await db.put('vectors', vectorData);
  }

  async getVector(id: string): Promise<VectorData | undefined> {
    const db = await this.dbPromise;
    return db.get('vectors', id);
  }

  async getAllVectors(): Promise<VectorData[]> {
    const db = await this.dbPromise;
    return db.getAll('vectors');
  }

  async hasVector(id: string): Promise<boolean> {
     const db = await this.dbPromise;
     const key = await db.getKey('vectors', id);
     return !!key;
  }

  async deleteVectorsByDocId(docId: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('vectors', 'readwrite');
    const store = tx.objectStore('vectors');
    
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.docId === docId) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // --- Asset Operations (for large files like background images) ---

  async saveAsset(id: string, data: string): Promise<void> {
    const db = await this.dbPromise;
    await db.put('assets', { id, data, timestamp: Date.now() });
  }

  async getAsset(id: string): Promise<string | undefined> {
    const db = await this.dbPromise;
    const asset = await db.get('assets', id);
    return asset?.data;
  }

  async deleteAsset(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('assets', id);
  }

  // --- Image Library Operations ---

  async saveImage(image: ImageMetadata): Promise<void> {
    const db = await this.dbPromise;
    await db.put('images', image);
  }

  async getImage(id: string): Promise<ImageMetadata | undefined> {
    const db = await this.dbPromise;
    return db.get('images', id);
  }

  async getAllImages(): Promise<ImageMetadata[]> {
    const db = await this.dbPromise;
    return db.getAll('images');
  }

  async deleteImage(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('images', id);
  }

  async clearAllImages(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('images');
  }

  // --- Novel Document Operations ---

  async saveNovelDoc(doc: { id: string; name: string; content: string; timestamp: number }): Promise<void> {
    const db = await this.dbPromise;
    await db.put('novel_docs', doc);
  }

  async getNovelDoc(id: string): Promise<{ id: string; name: string; content: string; timestamp: number } | undefined> {
    const db = await this.dbPromise;
    return db.get('novel_docs', id);
  }

  async getAllNovelDocs(): Promise<{ id: string; name: string; content: string; timestamp: number }[]> {
    const db = await this.dbPromise;
    return db.getAll('novel_docs');
  }

  async deleteNovelDoc(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('novel_docs', id);
  }

  // --- Tavo Data Operations ---

  async getTavoData(key: string): Promise<any[]> {
    try {
      const db = await this.dbPromise;
      const value = await db.get('tavo_data', key);
      return value || [];
    } catch {
      return [];
    }
  }

  async setTavoData(key: string, value: any[]): Promise<void> {
    const db = await this.dbPromise;
    await db.put('tavo_data', value, key);
  }

  // --- Character Library Operations ---

  async saveCharacter(char: StoredCharacter): Promise<void> {
    const db = await this.dbPromise;
    await db.put('characters', char);
  }

  async getCharacter(id: string): Promise<StoredCharacter | undefined> {
    const db = await this.dbPromise;
    return db.get('characters', id);
  }

  async getAllCharacters(): Promise<StoredCharacter[]> {
    const db = await this.dbPromise;
    return db.getAll('characters');
  }

  async deleteCharacter(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('characters', id);
  }

  async updateCharacterLastPlayed(id: string): Promise<void> {
    const db = await this.dbPromise;
    const char = await db.get('characters', id);
    if (char) {
      char.lastPlayedAt = Date.now();
      await db.put('characters', char);
    }
  }
}

export const dbService = new DatabaseService();

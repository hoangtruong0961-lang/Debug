
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Sparkles, Plus, Trash2, Edit2, Wand2, Play, 
  User, Compass, ScrollText, Users, Upload, Download, Clock,
  Eye, EyeOff, SlidersHorizontal, Globe2, Database,
  BookOpen, Search, ToggleLeft, ToggleRight
} from 'lucide-react';
import { NavigationProps, GameState, WorldData, AppSettings, PlayerProfile, WorldSettingConfig } from '../../../types';
import Button from '../../ui/Button';
import MarkdownRenderer from '../../common/MarkdownRenderer';
import { useWorldCreationStore } from '../../../store/worldCreationStore';
import EntityForm from './EntityForm';
import { CharacterSheetEditor } from './CharacterSheetEditor';
import { worldAiService } from '../../../services/ai/world-creation/service';
import { dbService } from '../../../services/db/indexedDB';
import { OUTPUT_LENGTHS, DIFFICULTY_LEVELS } from '../../../constants/promptTemplates';
import { Lorebook, LorebookEntry } from '../../../services/ai/lorebook/types';

const TABS = [
  { id: 0, label: "Nhân vật", icon: User },
  { id: 1, label: "Thế giới", icon: Compass },
  { id: 3, label: "Encyclopedia", icon: Users },
];

interface WorldCreationProps extends NavigationProps {
  initialData?: WorldData | null;
}

const WorldCreationScreen: React.FC<WorldCreationProps> = ({ onNavigate, onGameStart, initialData }) => {
  const store = useWorldCreationStore();
  
  // Destructure state from store for convenience
  const state = {
    currentTab: store.currentTab,
    player: store.player,
    world: store.world,
    config: store.config,
    entities: Array.isArray(store.entities) ? store.entities : [],
    gameTime: store.gameTime,
    lorebook: store.lorebook,
    isGenerating: store.isGenerating,
    generatingField: store.generatingField
  };

  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [conceptInput, setConceptInput] = useState('');
  const [aiModel, setAiModel] = useState<string>('gemini-3.1-pro-preview');
  const [worldSubTab, setWorldSubTab] = useState<'info' | 'foundation' | 'regional' | 'compiled'>('info');

  const [loreSearchTerm, setLoreSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // --- Dynamic World Bible Compiler ---
  // Periodically combines the world building sub-fields into a pristine context document
  useEffect(() => {
    const w = state.world;
    const parts: string[] = [];
    
    if (w.worldName) {
        parts.push(`# ${w.worldName.toUpperCase()}`);
        if (w.genre) {
            parts.push(`*Thể loại: ${w.genre}*\n`);
        }
    }
    
    if (w.corePremise) parts.push(`## 📌 GIẢ THUYẾT CỐT LÕI (CORE PREMISE)\n${w.corePremise}`);
    if (w.cosmology) parts.push(`## 🔮 VŨ TRỤ HỌC & ĐỊA GIỚI (COSMOLOGY)\n${w.cosmology}`);
    if (w.timeline) parts.push(`## ⏳ DÒNG THỜI GIAN & LỊCH SỬ (TIMELINE)\n${w.timeline}`);
    if (w.geography) parts.push(`## 🗺️ ĐỊA LÝ & KHÍ HẬU (GEOGRAPHY & CLIMATE)\n${w.geography}`);
    if (w.factionsPower) parts.push(`## 🛡️ PHE PHÁI & CƠ CẤU QUYỀN LỰC (FACTIONS & POWER)\n${w.factionsPower}`);
    if (w.economyResources) parts.push(`## 🪙 KINH TẾ & TÀI NGUYÊN (ECONOMY & RESOURCES)\n${w.economyResources}`);
    if (w.culturalIdentity) parts.push(`## 🎭 BẢN SẮC VĂN HÓA & NGHI LỄ (CULTURE & TABOOS)\n${w.culturalIdentity}`);
    if (w.adventureHooks) parts.push(`## 🪝 MÓC PHIÊU LƯU (ADVENTURE HOOKS)\n${w.adventureHooks}`);
    
    const compiled = parts.join('\n\n');
    
    // Safety check to keep manual context edit if it satisfies some rules or prevent endless loops
    if (compiled && compiled !== state.world.context) {
        store.updateWorld('context', compiled);
    }
  }, [
    state.world.worldName,
    state.world.genre,
    state.world.corePremise,
    state.world.cosmology,
    state.world.timeline,
    state.world.geography,
    state.world.factionsPower,
    state.world.economyResources,
    state.world.culturalIdentity,
    state.world.adventureHooks
  ]);

  // --- Bidirectional Entity & Encyclopedia (Lorebook) Synchronizer ---
  useEffect(() => {
    const currentEntities = state.entities || [];
    const currentLorebook = state.lorebook || { entries: {} };
    const currentEntries = currentLorebook.entries || {};

    let entitiesChanged = false;
    let lorebookChanged = false;

    const nextEntities = [...currentEntities];
    const nextEntries = { ...currentEntries };

    // 1. Sync Entities -> Lorebook Entries
    currentEntities.forEach((entity) => {
      const entryId = entity.id;
      const existingEntry = currentEntries[entryId];

      const content = entity.type === 'NPC'
        ? `Họ Tên: ${entity.name}\nTuổi: ${entity.age || 'Chưa rõ'}\nGiới tính: ${entity.gender || 'Chưa rõ'}\nTính cách: ${entity.personality || 'Chưa rõ'}\nNgoại hình: ${entity.appearance || 'Chưa rõ'}\nTiểu sử: ${entity.description || entity.background || 'Chưa rõ'}`
        : entity.description;

      const expectedComment = `[Entity:${entity.type}] ${entity.name}`;
      const expectedKeys = [entity.name];

      if (!existingEntry) {
        nextEntries[entryId] = {
          uid: entryId,
          key: expectedKeys,
          content: content,
          comment: expectedComment,
          constant: false,
          disable: false,
          order: entity.type === 'NPC' ? 50 : 100,
        };
        lorebookChanged = true;
      } else {
        const hasKeyDiff = JSON.stringify(existingEntry.key) !== JSON.stringify(expectedKeys);
        const hasCommentDiff = existingEntry.comment !== expectedComment;
        const hasContentDiff = existingEntry.content !== content;

        if (hasKeyDiff || hasCommentDiff || hasContentDiff) {
          nextEntries[entryId] = {
            ...existingEntry,
            key: expectedKeys,
            comment: expectedComment,
            content: content,
          };
          lorebookChanged = true;
        }
      }
    });

    // 2. Sync Lorebook Entries -> Entities (Only imports missing entries as entities, no overwrite reversion)
    Object.keys(currentEntries).forEach((entryId) => {
      const entry = currentEntries[entryId];
      const existingEntityIndex = nextEntities.findIndex((e) => String(e.id) === String(entryId));

      let type: import('../../../types').EntityType = 'CUSTOM';
      let name = entry.key[0] || 'Chưa đặt tên';

      if (entry.comment) {
        const match = entry.comment.match(/^\[Entity:(NPC|LOCATION|ITEM|FACTION|CUSTOM)\]\s*(.*)$/);
        if (match) {
          type = match[1] as import('../../../types').EntityType;
          if (match[2]) name = match[2];
        } else if (entry.comment.startsWith('NPC:') || entry.comment.toLowerCase().includes('character')) {
          type = 'NPC';
        } else if (entry.comment.startsWith('LOCATION:') || entry.comment.toLowerCase().includes('location')) {
          type = 'LOCATION';
        } else if (entry.comment.startsWith('ITEM:') || entry.comment.toLowerCase().includes('item')) {
          type = 'ITEM';
        } else if (entry.comment.startsWith('FACTION:') || entry.comment.toLowerCase().includes('faction')) {
          type = 'FACTION';
        }
      }

      if (existingEntityIndex === -1) {
        const hasEntityPrefix = entry.comment && entry.comment.startsWith('[Entity:');
        
        if (hasEntityPrefix) {
          delete nextEntries[entryId];
          lorebookChanged = true;
        } else {
          nextEntities.push({
            id: String(entry.uid),
            name: name,
            type: type,
            description: entry.content,
            personality: '',
            avatar: ''
          });
          entitiesChanged = true;

          nextEntries[entryId] = {
            ...entry,
            comment: `[Entity:${type}] ${name}`
          };
          lorebookChanged = true;
        }
      }
    });

    if (lorebookChanged) {
      store.updateLorebook({
        ...currentLorebook,
        entries: nextEntries
      });
    }

    if (entitiesChanged) {
      store.setEntities(nextEntities);
    }
  }, [state.entities, state.lorebook, store]);

  // --- AI Helper Function (UPDATED WITH VALIDATION & ENRICHMENT) ---
  const handleAiGenerate = async (field: string, category: 'player' | 'world') => {
    // 1. Validation Logic
    if (category === 'player') {
        const { name, gender, age } = state.player;
        if (!name || !gender || !age) {
            return;
        }
    } else if (category === 'world') {
        if (!state.world.genre && field !== 'genre') {
            return;
        }
    }

    store.setGenerating(true, field);
    try {
      // 2. Build Explicit Context
      const contextData = category === 'player' 
        ? { ...state.player, genre: state.world.genre } 
        : { 
            genre: state.world.genre, 
            worldName: state.world.worldName, 
            concept: conceptInput,
            corePremise: state.world.corePremise,
            cosmology: state.world.cosmology,
            timeline: state.world.timeline,
            geography: state.world.geography,
            factionsPower: state.world.factionsPower,
            economyResources: state.world.economyResources,
            culturalIdentity: state.world.culturalIdentity,
            adventureHooks: state.world.adventureHooks
          };

      // 3. Get Current Value for Enrichment
      let currentValue = "";
      if (category === 'player') {
          // @ts-expect-error - Dynamic access
          currentValue = state.player[field] || "";
      } else {
          // @ts-expect-error - Dynamic access
          currentValue = state.world[field] || "";
      }

      const content = await worldAiService.generateFieldContent(category, field, contextData, aiModel, currentValue, settings || undefined);
      
      // Dispatch based on field type
      if (['name', 'gender', 'age', 'personality', 'background', 'appearance', 'skills', 'goal'].includes(field)) {
        store.updatePlayer(field as keyof PlayerProfile, content);
      } else if (['worldName', 'context', 'genre', 'corePremise', 'cosmology', 'timeline', 'geography', 'factionsPower', 'economyResources', 'culturalIdentity', 'adventureHooks'].includes(field)) {
        store.updateWorld(field as keyof WorldSettingConfig, content);
      }
    } catch (error: unknown) {
      console.error("AI Error", error);
    } finally {
      store.setGenerating(false);
    }
  };
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bgImage, setBgImage] = useState<string | null>("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
  const bgBlur = localStorage.getItem('ark_v2_bg_blur') !== 'false';
  
  // Initial Load (Settings, Import Data, and Background)
  useEffect(() => {
    store.reset(); // Reset on clear mount if needed, or you can omit
    dbService.getSettings().then(s => {
      setSettings(s);
      if (s.aiModel) setAiModel(s.aiModel);
    });

    dbService.getAsset('ark_v2_custom_bg').then(savedBg => {
      if (savedBg) {
        setBgImage(savedBg);
      } else {
        dbService.getAsset('ark_v1_custom_bg').then(legacyBg => {
          if (legacyBg) {
            setBgImage(legacyBg);
          } else {
            setBgImage("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
          }
        });
      }
    });

    // Check if there is initial data passed from Main Menu Import
    if (initialData) {
       store.importData(initialData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const handleAiSuggestTime = async () => {
    if (!state.world.genre) {
        return;
    }

    store.setGenerating(true, 'gameTime');
    try {
      const timeData = await worldAiService.generateInitialTime(state.world.genre, state.world.context, aiModel, settings || undefined);
      store.autoFillAll({ gameTime: timeData });
    } catch (error: unknown) {
      console.error("AI Time Error", error);
    } finally {
      store.setGenerating(false);
    }
  };

  const handleAutoFillAll = async () => {
    if (!conceptInput.trim()) return;
    store.setGenerating(true);
    try {
      const data = await worldAiService.generateFullWorld(conceptInput, aiModel, settings || undefined);
      store.autoFillAll(data);
    } finally {
      store.setGenerating(false);
    }
  };

  // --- Import / Export Logic ---
  const handleExportWorld = () => {
    if (!settings) return;

    const exportData: WorldData = {
        player: state.player,
        world: state.world,
        config: {
            ...state.config,
            difficulty: settings.difficulty,
            outputLength: settings.outputLength,
            perspective: settings.perspective,
            customMinWords: settings.customMinWords,
            customMaxWords: settings.customMaxWords
        },
        entities: state.entities,
        gameTime: state.gameTime,
        lorebook: state.lorebook
    };
    
    const worldName = state.world.worldName.replace(/\s+/g, '_') || 'unknown_world';
    const playerName = state.player.name.replace(/\s+/g, '_') || 'unknown_player';
    const timestamp = Date.now();
    const fileName = `ARK_${worldName}_${playerName}_${timestamp}.json`;
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content) as WorldData;
        
        if (!parsedData.player || !parsedData.world || !parsedData.config) {
            throw new Error("Cấu trúc file không hợp lệ");
        }

        store.importData(parsedData);
      } catch (error: unknown) {
        console.error(error);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset
  };

   // --- Start Game Logic ---
  const handleStartGame = async () => {
     if (!settings) return;

     const worldData: WorldData = {
        id: initialData?.id || `campaign-${crypto.randomUUID()}`,
        player: state.player,
        world: state.world,
        config: {
            ...state.config,
            difficulty: settings.difficulty,
            outputLength: settings.outputLength,
            perspective: settings.perspective,
            customMinWords: settings.customMinWords,
            customMaxWords: settings.customMaxWords
        },
        entities: state.entities,
        gameTime: state.gameTime,
        lorebook: state.lorebook,
        savedState: { history: [], turnCount: 0 }
     };
     
     if (!worldData.player.name || !worldData.world.worldName) {
         return;
     }

     try {
         await dbService.saveAutosave({
             id: `autosave-${Date.now()}`,
             name: `${worldData.world.worldName} - Khởi tạo`,
             createdAt: Date.now(),
             updatedAt: Date.now(),
             data: worldData
         });
     } catch (err: unknown) {
         console.error("Autosave failed", err);
     }

     if (onGameStart) {
         onGameStart(worldData);
     }
  };

  // --- RENDER FUNCTIONS FOR TABS ---

  const handleAiGenPlayerKnowledge = async () => {
    if (!state.player.knowledge_train?.trim()) {
        alert("Vui lòng tải lên Dữ Liệu Gốc (Knowledge / Lore) trước.");
        return;
    }

    store.setGenerating(true, 'knowledge_train');
    try {
      const generatedSheet = await worldAiService.generateCharacterSheetFromKnowledge(state.player.knowledge_train, aiModel, settings || undefined);
      
      // Update each generated field into the player store
      Object.entries(generatedSheet).forEach(([field, value]) => {
        if (value && typeof value === 'string') {
          store.updatePlayer(field as any, value);
        }
      });
      // Keep the original knowledge_train value
      store.updatePlayer('knowledge_train', state.player.knowledge_train);

    } catch (error) {
      console.error(error);
      alert("Lỗi khi tạo hình nhân vật từ Knowledge.");
    } finally {
      store.setGenerating(false);
    }
  };

  const knowledgeInputRef = useRef<HTMLInputElement>(null);

  const handleImportKnowledge = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const content = e.target?.result as string;
              // Format JSON if valid
              try {
                  const parsed = JSON.parse(content);
                  const stringified = JSON.stringify(parsed, null, 2);
                  store.updatePlayer('knowledge_train', stringified);
              } catch (e) {
                  store.updatePlayer('knowledge_train', content);
              }
              store.updatePlayer('knowledge_filename', file.name);
              store.updatePlayer('knowledge_size', file.size as any);
          } catch (error) {
              console.error(error);
          }
      };
      reader.readAsText(file);
      event.target.value = '';
  };

  const renderPlayerTab = () => (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-0.5 mb-1">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2" style={{ fontFamily: 'Arial', lineHeight: '18px' }}>
          <User size={18} className="text-mystic-accent" /> Thiết lập Nhân Vật Chính
        </h3>
      </div>
      <CharacterSheetEditor 
         data={state.player} 
         onChange={(field, value) => store.updatePlayer(field as any, value)} 
      />
    </div>
  );

  const renderWorldTab = () => {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar flex flex-col h-full">
        <div className="border-b border-slate-200 dark:border-slate-700 pb-2 mb-2 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2" style={{ fontFamily: 'Arial', lineHeight: '18px' }}>
            <Compass size={18} className="text-mystic-accent" /> Không Gian Thiết Lập Thế Giới
          </h3>
          
          {/* Main AI Trigger representing Context or general layers */}
          <div className="flex gap-2 shrink-0">
            <Button 
              variant="secondary"
              className="py-1 px-3 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              onClick={async () => {
                if (worldSubTab === 'info') {
                  await handleAiGenerate('worldName', 'world');
                } else if (worldSubTab === 'foundation') {
                  await handleAiGenerate('corePremise', 'world');
                } else if (worldSubTab === 'regional') {
                  await handleAiGenerate('geography', 'world');
                } else {
                  await handleAiGenerate('context', 'world');
                }
              }}
              disabled={state.isGenerating || !state.world.genre}
              icon={state.isGenerating ? <span className="animate-spin">⏳</span> : <Sparkles size={14} />}
            >
              🚀 AI Tư Vấn Nhanh Phân Mục
            </Button>
          </div>
        </div>

        {/* Modular Layered Worldbuilding Tabs -- Kimi System */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-1 shrink-0 scrollbar-none custom-scrollbar">
          <button
            type="button"
            onClick={() => setWorldSubTab('info')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all border whitespace-nowrap flex items-center gap-1.5 ${
              worldSubTab === 'info'
                ? 'bg-mystic-accent/10 border-mystic-accent/30 text-mystic-accent font-extrabold shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>🕹️</span> Thông tin & Khởi hành
          </button>
          <button
            type="button"
            onClick={() => setWorldSubTab('foundation')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all border whitespace-nowrap flex items-center gap-1.5 ${
              worldSubTab === 'foundation'
                ? 'bg-mystic-accent/10 border-mystic-accent/30 text-mystic-accent font-extrabold shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>🏗️</span> Lớp 1: Nền tảng (Foundation)
          </button>
          <button
            type="button"
            onClick={() => setWorldSubTab('regional')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all border whitespace-nowrap flex items-center gap-1.5 ${
              worldSubTab === 'regional'
                ? 'bg-mystic-accent/10 border-mystic-accent/30 text-mystic-accent font-extrabold shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>🗺️</span> Lớp 2: Vùng miền & Khế ước
          </button>
          <button
            type="button"
            onClick={() => setWorldSubTab('compiled')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all border whitespace-nowrap flex items-center gap-1.5 ${
              worldSubTab === 'compiled'
                ? 'bg-mystic-accent/20 border-mystic-accent/50 text-mystic-accent font-black shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>📖</span> World Bible Tổng Hợp
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 mt-2">
          {worldSubTab === 'info' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-4 uppercase tracking-wider flex items-center gap-2">
                  <Globe2 size={16} className="text-mystic-accent" /> Thông Tin Cơ Bản
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputGroup 
                    label="Tên thế giới" 
                    value={state.world.worldName} 
                    onChange={(v) => store.updateWorld('worldName', v)} 
                    onAi={() => handleAiGenerate('worldName', 'world')}
                    loading={state.isGenerating && state.generatingField === 'worldName'}
                    placeholder="Ví dụ: Lam Tinh Cổ Đại, Vùng Đất Ma Thuật..."
                    description="Tên gọi chính thức của thế giới này."
                  />
                  <InputGroup 
                    label="Thể loại" 
                    value={state.world.genre} 
                    onChange={(v) => store.updateWorld('genre', v)} 
                    onAi={() => handleAiGenerate('genre', 'world')}
                    loading={state.isGenerating && state.generatingField === 'genre'}
                    placeholder="Ví dụ: Tiên Hiệp, Cyberpunk, Darksouls-like..."
                    description="Thể loại sẽ là bối cảnh định hướng toàn bộ AI sáng tạo."
                  />
                </div>
              </div>

              {/* World Difficulty Selection Section */}
              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-mystic-accent" /> Độ khó thế giới
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {DIFFICULTY_LEVELS.map((diff) => {
                    const isSelected = settings?.difficulty?.id === diff.id;
                    let colorClass = "border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600";
                    let selectBadge = "text-slate-500 bg-slate-100 dark:bg-slate-800";
                    let icon = "🌐";
                    
                    if (diff.id === 'easy') {
                      icon = "🌸";
                      if (isSelected) {
                        colorClass = "border-emerald-500 ring-2 ring-emerald-500/10 dark:ring-emerald-500/20";
                        selectBadge = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold";
                      }
                    } else if (diff.id === 'normal') {
                      icon = "⚖️";
                      if (isSelected) {
                        colorClass = "border-sky-500 ring-2 ring-sky-500/10 dark:ring-sky-500/20";
                        selectBadge = "bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold";
                      }
                    } else if (diff.id === 'hard') {
                      icon = "⚔️";
                      if (isSelected) {
                        colorClass = "border-amber-500 ring-2 ring-amber-500/10 dark:ring-amber-500/20";
                        selectBadge = "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold";
                      }
                    } else if (diff.id === 'torment') {
                      icon = "💀";
                      if (isSelected) {
                        colorClass = "border-red-500 ring-2 ring-red-500/10 dark:ring-red-500/20";
                        selectBadge = "bg-red-500/15 text-red-600 dark:text-red-400 font-black";
                      }
                    }

                    return (
                      <button
                        key={diff.id}
                        type="button"
                        onClick={() => {
                          if (!settings) return;
                          const newSettings = { ...settings, difficulty: diff };
                          setSettings(newSettings);
                          dbService.saveSettings(newSettings);
                        }}
                        className={`flex flex-col text-left p-3 rounded-2xl border transition-all cursor-pointer bg-white dark:bg-slate-900/40 h-full justify-between gap-1 shadow-sm ${colorClass}`}
                      >
                        <div className="flex items-center gap-2 mb-1 w-full">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs ${selectBadge}`}>
                            {icon}
                          </span>
                          <span className="font-extrabold text-[11px] text-slate-800 dark:text-slate-200">
                            {diff.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal flex-1">
                          {diff.id === 'easy' && "Dễ - thế giới hoạt động ấm áp sủng vật ngọt ngào, người chơi bất tử luôn gặp đại vận."}
                          {diff.id === 'normal' && "Bình thường - thế giới hoạt động bình thường người chơi không thể chết không có bất lợi cho nhân vật người chơi."}
                          {diff.id === 'hard' && "Khó - thế giới chân thực tàn khốc hơn, nước đi sai mầm mống bất lợi nguy hiểm tích tụ gánh nặng."}
                          {diff.id === 'torment' && "Địa Ngục - nhân vật người chơi 1 save chết lập tức màn hình hiện ra đã chết chỉ 2 lựa chọn tạo thế giới mới và về menu (save bị xóa sạch)."}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Clock size={16} className="text-mystic-accent" /> Thời Gian Khởi Đầu
                    </h4>
                    <button 
                      onClick={handleAiSuggestTime}
                      disabled={state.isGenerating}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-stone-50 dark:bg-mystic-900 hover:bg-mystic-accent/10 hover:border-mystic-accent hover:text-mystic-accent text-xs text-slate-500 dark:text-slate-400 transition-all font-semibold cursor-pointer"
                      title="AI Gợi ý thời gian hợp lý"
                    >
                      {state.isGenerating && state.generatingField === 'gameTime' ? (
                        <span className="animate-spin block w-3 h-3 border-2 border-mystic-accent border-t-transparent rounded-full" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      <span>AI Gợi ý thời mốc</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-2 flex-1 items-start mt-2">
                    <TimeInput 
                      label="Năm" 
                      value={state.gameTime.year} 
                      onChange={(v) => store.updateGameTime('year', v)} 
                    />
                    <TimeInput 
                      label="Tháng" 
                      value={state.gameTime.month} 
                      min={1} max={12}
                      onChange={(v) => store.updateGameTime('month', v)} 
                    />
                    <TimeInput 
                      label="Ngày" 
                      value={state.gameTime.day} 
                      min={1} max={31}
                      onChange={(v) => store.updateGameTime('day', v)} 
                    />
                    <TimeInput 
                      label="Giờ" 
                      value={state.gameTime.hour} 
                      min={0} max={23}
                      onChange={(v) => store.updateGameTime('hour', v)} 
                    />
                    <TimeInput 
                      label="Phút" 
                      value={state.gameTime.minute} 
                      min={0} max={59}
                      onChange={(v) => store.updateGameTime('minute', v)} 
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-3">
                    Thiết lập mốc thời khởi điểm cụ thể in-game.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4 flex flex-col">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-2 uppercase tracking-wider flex items-center gap-2">
                    <Wand2 size={16} className="text-mystic-accent" /> Kịch Bản Bắt Đầu (Sự khởi đầu)
                  </h4>
                  <TextAreaGroup 
                    label="" 
                    value={state.world.startingScenario || ''} 
                    onChange={(v) => store.updateWorld('startingScenario', v)} 
                    height="h-28"
                    placeholder="Hành động khi người chơi bước chân vào RPG lần đầu. VD: Bạn tỉnh dậy trên bãi biển hoang sơ tàn phá, ký ức rỗng tuếch, bên tai vang vọng tiếng sóng gầm rú..."
                    description="Mô tả bối cảnh mở đầu để định đoạt lời thoại tiên quyết của game."
                  />
                </div>
              </div>
            </div>
          )}

          {worldSubTab === 'foundation' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="p-3 bg-mystic-accent/5 border border-mystic-accent/15 rounded-xl text-xs text-mystic-accent leading-relaxed flex items-center gap-2">
                <span>🛡️</span>
                <span><strong>LỚP 1 - FOUNDATION (Nền tảng vĩ mô):</strong> Định hình khung cố định bất biến về cấu trúc thế giới, định luật vật lý/ma tuật cốt tủy và dòng lịch sử chính. AI đóng vai trò tuyệt đối tuân thủ lớp nền này.</span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4 space-y-4">
                <TextAreaGroup 
                  label="Giả Thuyết Cốt Lõi (Core Premise)" 
                  value={state.world.corePremise || ''} 
                  onChange={(v) => store.updateWorld('corePremise', v)} 
                  onAi={() => handleAiGenerate('corePremise', 'world')}
                  loading={state.isGenerating && state.generatingField === 'corePremise'}
                  height="h-32"
                  placeholder="Ví dụ: Mặt trăng nứt rạn rớt những mảnh vỡ thần tính xuống vương quốc đại lục, reo rắc ma pháp biến dị điên cuồng..."
                  description="Bản tóm tắt ý niệm tối thượng khai mở vũ trụ và xung đột trung tâm của thế giới."
                />

                <TextAreaGroup 
                  label="Vũ Trụ Học & Định Luật Hệ Thống (Cosmology & Rules)" 
                  value={state.world.cosmology || ''} 
                  onChange={(v) => store.updateWorld('cosmology', v)} 
                  onAi={() => handleAiGenerate('cosmology', 'world')}
                  loading={state.isGenerating && state.generatingField === 'cosmology'}
                  height="h-32"
                  placeholder="Ví dụ: Có 3 chiều không gian: Trầm Tích, Phàm Trần, Vực Sâu. Định luật năng lượng dựa trên tiếng Thần Ca, dùng sinh mệnh tố làm chất dấn của bùa pháp..."
                  description="Các luật siêu nhiên, cấu trúc thế giới bên ngoài, và ràng buộc phản phệ phép thuật bất biến."
                />

                <TextAreaGroup 
                  label="Dòng Lịch Sử & Kỷ Nguyên Biên Niên (Timeline)" 
                  value={state.world.timeline || ''} 
                  onChange={(v) => store.updateWorld('timeline', v)} 
                  onAi={() => handleAiGenerate('timeline', 'world')}
                  loading={state.isGenerating && state.generatingField === 'timeline'}
                  height="h-32"
                  placeholder="Ví dụ: 
- Kỷ Người Khách Thần (Era 0 - 500): Khởi chế thế giới linh thiêng.
- Kỷ Sương Mù (Era 500 - 1500): Thần Linh diệt vong, sương mù vây khốn."
                  description="Sắp xếp cột mốc lịch sử lớn tạo tác nên hiện thực xã hội ngày nay."
                />
              </div>
            </div>
          )}

          {worldSubTab === 'regional' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 leading-relaxed flex items-center gap-2">
                <span>🗺️</span>
                <span><strong>LỚP 2 - REGIONAL FRAMEWORK (Khung cấu trúc vùng miền):</strong> Tập trung mô tả chi tiết không gian địa lý, các thành thị mấu chốt, bản sắc cộng đồng, tôn giáo, cấm kỵ văn hóa và các mầm mống phiêu lưu túc trực.</span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextAreaGroup 
                    label="Địa Lý & Khí Hậu Vùng Miền" 
                    value={state.world.geography || ''} 
                    onChange={(v) => store.updateWorld('geography', v)} 
                    onAi={() => handleAiGenerate('geography', 'world')}
                    loading={state.isGenerating && state.generatingField === 'geography'}
                    height="h-36"
                    placeholder="Ví dụ: Các thung lũng đá xích sắt ngập tràn mưa sương muối lạnh lẽo, pháo đài ngầm ẩn sâu trong đất ấm..."
                    description="Cấu trúc khí hậu sinh tồn cực đoan và những khu định cư cốt mốc."
                  />

                  <TextAreaGroup 
                    label="Phe Phái & Cơ Cấu Quyền Lực" 
                    value={state.world.factionsPower || ''} 
                    onChange={(v) => store.updateWorld('factionsPower', v)} 
                    onAi={() => handleAiGenerate('factionsPower', 'world')}
                    loading={state.isGenerating && state.generatingField === 'factionsPower'}
                    height="h-36"
                    placeholder="Ví dụ: Liên Bang Ánh Sáng lũng đoạn, Thọ Tộc bế quan tỏa cảng, tàn binh lính đánh thuê buôn lậu cổ vật..."
                    description="Các bang hội, triều đình thống lĩnh cùng cán cân quyền vị tranh quyền lợi."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextAreaGroup 
                    label="Kinh Tế & Tài Nguyên Đặc Hữu" 
                    value={state.world.economyResources || ''} 
                    onChange={(v) => store.updateWorld('economyResources', v)} 
                    onAi={() => handleAiGenerate('economyResources', 'world')}
                    loading={state.isGenerating && state.generatingField === 'economyResources'}
                    height="h-36"
                    placeholder="Ví dụ: Đồng tiền vảy cá bằng bạc cô đặc, đất thiêng chứa kết quả đá linh hồn sạc năng lượng..."
                    description="Hàng rào tiền tệ lưu thông thương nghiệp, kho báu khai thác, nguồn nhiên liệu ma mị."
                  />

                  <TextAreaGroup 
                    label="Bản Sắc Văn Hóa & Điều Cấm Kỵ (Taboo)" 
                    value={state.world.culturalIdentity || ''} 
                    onChange={(v) => store.updateWorld('culturalIdentity', v)} 
                    onAi={() => handleAiGenerate('culturalIdentity', 'world')}
                    loading={state.isGenerating && state.generatingField === 'culturalIdentity'}
                    height="h-36"
                    placeholder="Ví dụ: Tộc thợ lò coi lửa là linh thần tối thượng; Tuyệt đối không được hát dưới trời trăng tròn nếu không muốn thu hút hóa thú..."
                    description="Đời sống tín ngưỡng, phong tục dị thường và luật lệ tôn nghiêm kiêng kỵ."
                  />
                </div>

                <TextAreaGroup 
                  label="Điểm Gợi Phiêu Lưu & Móc Cốt Truyện (Adventure Hooks)" 
                  value={state.world.adventureHooks || ''} 
                  onChange={(v) => store.updateWorld('adventureHooks', v)} 
                  onAi={() => handleAiGenerate('adventureHooks', 'world')}
                  loading={state.isGenerating && state.generatingField === 'adventureHooks'}
                  height="h-28"
                  placeholder="Ví dụ: 
- Thống lĩnh của Đền Thánh mất tích trong hầm quặng sâu bất thường.
- Ngọn hải đăng cổ bỗng cháy rực ánh sáng tím phát tín hiệu kỳ dị..."
                  description="Những bí mật hiểm họa khẩn cấp sẵn sàng lôi sòng người chơi vào trải nghiệm."
                />
              </div>
            </div>
          )}

          {worldSubTab === 'compiled' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl text-xs text-amber-600 dark:text-amber-400 leading-relaxed flex items-center gap-2">
                <span>📚</span>
                <span><strong>COMPILATION LAYER (Hồ sơ World Bible):</strong> Đây là siêu văn bản Markdown kết toán tự hiệu ứng tích hợp cả 3 lớp vĩ mô, trung mô, vi mô làm bối cảnh chính nạp cho bộ não AI lúc tương tác câu chuyện. Bạn có thể tự mình điều khiển tinh hoa tệp dưới đây.</span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-xl p-4 flex flex-col h-[400px]">
                <TextAreaGroup 
                  label="Context Tối Thượng Thao Tác (World Context)" 
                  value={state.world.context} 
                  onChange={(v) => store.updateWorld('context', v)} 
                  height="h-[340px]"
                  placeholder="Tuyệt phung tự động hiển thị Markdown của các lớp bối cảnh..."
                  description="Vật chứa tối tăm của tất cả tri thức dòng tộc của thế giới RPG của bạn."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };



  const renderEntitiesTab = () => {
    // Lọc danh sách thực thể bách khoa
    const filteredEntities = state.entities.filter(ent => {
      // 1. Lọc theo danh mục
      if (selectedCategoryFilter !== 'ALL' && ent.type !== selectedCategoryFilter) {
        return false;
      }
      // 2. Lọc theo từ khóa tìm kiếm
      if (!loreSearchTerm) return true;
      const lowerSearch = loreSearchTerm.toLowerCase();
      return (
        ent.name.toLowerCase().includes(lowerSearch) ||
        (ent.description && ent.description.toLowerCase().includes(lowerSearch)) ||
        (ent.personality && ent.personality.toLowerCase().includes(lowerSearch)) ||
        (ent.background && ent.background.toLowerCase().includes(lowerSearch))
      );
    });

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* Header & Công cụ hành động */}
        <div className="border-b border-slate-200 dark:border-slate-700/60 pb-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1" style={{ fontFamily: 'Arial', lineHeight: '18px' }}>
              <BookOpen size={18} className="text-mystic-accent" /> Cẩm Nang Bách Khoa (Encyclopedia)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quản lý toàn bộ NPC, địa danh, thần khí, phe phái và kỳ thư trong game. AI tự động sắp xếp và ghi nhớ sâu làm bối cảnh RPG.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Thanh tìm kiếm */}
            <div className="relative flex items-center min-w-[200px]">
              <Search size={14} className="absolute left-3 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm nội dung entry..." 
                value={loreSearchTerm}
                onChange={(e) => setLoreSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-medium rounded-xl appearance-none focus:outline-none focus:border-mystic-accent transition-colors shadow-inner"
              />
            </div>
            {/* Nút thêm thực thể mới */}
            <Button 
              variant="primary" 
              onClick={() => { setEditingEntityId(null); setShowEntityForm(true); }} 
              icon={<Plus size={16} />}
              className="font-bold whitespace-nowrap"
            >
              Thêm Thẻ Bách Khoa
            </Button>
          </div>
        </div>

        {/* Bộ lọc nhanh bách khoa (Encyclopedia Quick Categories) */}
        <div className="flex gap-1 overflow-x-auto pb-3 mb-4 shrink-0 scrollbar-none custom-scrollbar border-b border-dashed border-slate-200 dark:border-slate-800">
          {[
            { id: 'ALL', label: 'Tất cả thẻ', icon: '📖', count: state.entities.length },
            { id: 'NPC', label: 'Nhân vật (NPC)', icon: '👥', count: state.entities.filter(e => e.type === 'NPC').length },
            { id: 'LOCATION', label: 'Địa điểm / Địa danh', icon: '🗺️', count: state.entities.filter(e => e.type === 'LOCATION').length },
            { id: 'ITEM', label: 'Cổ vật & Vật phẩm', icon: '⚔️', count: state.entities.filter(e => e.type === 'ITEM').length },
            { id: 'FACTION', label: 'Phe phái & Tổ chức', icon: '🛡️', count: state.entities.filter(e => e.type === 'FACTION').length },
            { id: 'CUSTOM', label: 'Tri thức & Khái niệm', icon: '📜', count: state.entities.filter(e => e.type === 'CUSTOM').length }
          ].map(cat => {
            const isSelected = selectedCategoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-mystic-accent/10 border-mystic-accent/40 text-mystic-accent font-extrabold shadow-sm'
                    : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-mystic-accent/25' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Danh sách các thẻ */}
        <div className="flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEntities.map(ent => {
              // Xác định nhãn & màu sắc đại diện cho phân loại bách khoa
              const catConfig = {
                NPC: { label: 'Nhân vật', color: 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10', icon: '👥' },
                LOCATION: { label: 'Địa danh', color: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', icon: '🗺️' },
                ITEM: { label: 'Vật phẩm', color: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10', icon: '⚔️' },
                FACTION: { label: 'Tổ chức', color: 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10', icon: '🛡️' },
                CUSTOM: { label: 'Tri thức', color: 'border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10', icon: '📜' }
              }[ent.type] || { label: 'Tùy biến', color: 'border-slate-400 bg-slate-100 text-slate-600', icon: '📝' };

              return (
                <div 
                  key={ent.id} 
                  className="bg-white dark:bg-slate-950/25 border border-slate-200 dark:border-slate-850/80 p-4.5 rounded-2xl hover:border-mystic-accent hover:shadow-[0_4px_12px_-5px_rgba(var(--color-mystic-accent),0.15)] transition-all group relative flex flex-col"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider flex items-center gap-1 ${catConfig.color}`}>
                        <span>{catConfig.icon}</span>
                        <span>{catConfig.label}</span>
                      </span>
                    </div>
                    <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingEntityId(ent.id); setShowEntityForm(true); }} 
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-mystic-accent transition-colors"
                        title="Chỉnh sửa mục từ"
                      >
                        <Edit2 size={14}/>
                      </button>
                      <button 
                        onClick={() => {
                          if (window.confirm(`Bạn có chắc chắn muốn xóa "${ent.name}" khỏi Cẩm Nang Bách Khoa?`)) {
                            store.removeEntity(ent.id);
                          }
                        }} 
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-red-500 transition-colors"
                        title="Xóa mục từ"
                      >
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </div>

                  <h4 className="font-extrabold text-slate-800 dark:text-slate-100 mb-1.5 truncate text-sm leading-tight">
                    {ent.name}
                  </h4>

                  {/* Hiển thị chi tiết thông tin theo loại nếu là NPC */}
                  {ent.type === 'NPC' ? (
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="space-y-1 my-1">
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-600 dark:text-slate-300">Giới tính:</span> {ent.gender || 'Chưa rõ'}
                          <span className="text-slate-300">|</span>
                          <span className="font-bold text-slate-600 dark:text-slate-300">Tuổi:</span> {ent.age !== undefined ? `${ent.age} tuổi` : 'Chưa rõ'}
                        </div>
                        {ent.narrativeRole && (
                          <div className="text-[10px] bg-mystic-accent/5 text-mystic-accent border border-mystic-accent/10 px-2 py-0.5 rounded-md inline-block font-mono font-semibold">
                            Archetype: {ent.narrativeRole}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-2 pt-1 border-t border-slate-100 dark:border-slate-900/80 leading-relaxed font-normal">
                        {ent.description || ent.personality || ent.background || 'Chưa có thông tin bách khoa.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-4 mb-3 flex-1 leading-relaxed font-normal" style={{ wordBreak: 'break-word' }}>
                      {ent.description || 'Chưa có thông tin bách khoa chi tiết.'}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Khi không hiển thị mục từ nào */}
            {filteredEntities.length === 0 && (
              <div className="col-span-full border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl flex flex-col items-center justify-center p-12 text-slate-400 dark:text-slate-500 text-center">
                <Database size={36} className="mb-3 text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Thư viện bách khoa không có kết quả phù hợp</p>
                <p className="text-xs mt-1 text-slate-500">
                  {state.entities.length === 0 
                    ? 'Thế giới đang đợi bạn sáng tạo nét chấm bút đầu tiên. Hãy nhấn "Thêm Thẻ Bách Khoa" ngay.'
                    : 'Hãy thử đổi cụm từ tìm kiếm hoặc chuyển đổi bộ lọc danh mục bách khoa ở trên.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const currentTabIndex = TABS.findIndex(t => t.id === state.currentTab);
  const nextTab = currentTabIndex < TABS.length - 1 ? TABS[currentTabIndex + 1].id : null;
  const prevTab = currentTabIndex > 0 ? TABS[currentTabIndex - 1].id : null;

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {/* Background Layer */}
      {bgImage && (
        <>
          <div 
            className="absolute inset-0 z-0 transition-all duration-700"
            style={{ 
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: `brightness(0.4) ${bgBlur ? 'blur(8px)' : 'blur(0px)'}`
            }}
          />
          <div className="absolute inset-0 z-0 bg-stone-100/30 dark:bg-black/40 backdrop-blur-[4px]" />
        </>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".json" 
        className="hidden" 
      />

      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 relative z-10 w-full overflow-hidden mt-safe">
          {/* Header */}
          <div className="w-full max-w-6xl flex items-center justify-between mb-4 mt-2 xl:mb-6">
            <div className="w-32 flex justify-start">
              <button onClick={() => onNavigate(GameState.MENU)} className="text-slate-600 dark:text-slate-300 hover:text-mystic-accent transition-colors flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl backdrop-blur-md shadow-sm border border-slate-200 dark:border-slate-800">
                  <ArrowLeft size={18} /> <span className="hidden sm:inline font-bold uppercase tracking-wider text-xs">Quay lại</span>
              </button>
            </div>
            <h2 className="text-xl md:text-3xl font-black text-slate-800 dark:text-white drop-shadow-md tracking-[0.2em] uppercase font-serif text-center flex-1">
                Khởi Tạo Thế Giới
            </h2>
            <div className="w-32 flex justify-end" />
          </div>

          {/* Main Wizard Card */}
          <div className="w-full max-w-5xl flex-1 flex flex-col bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl min-h-0 mx-auto">
            
            {/* Top Concept & Knowledge Bar */}
            <div className="flex flex-col gap-4 p-4 md:p-6 border-b border-slate-200 dark:border-slate-800">
               {/* Concept Area */}
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                 <div className="flex-1 w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-2 border border-slate-200 dark:border-slate-800 focus-within:border-mystic-accent/50 focus-within:shadow-[0_0_15px_rgba(56,189,248,0.15)] flex gap-3 items-center transition-all">
                    <div className="p-2 bg-mystic-accent/10 rounded-xl">
                        <Wand2 className="text-mystic-accent shrink-0" size={20} />
                    </div>
                    <input 
                       value={conceptInput}
                       onChange={(e) => setConceptInput(e.target.value)}
                       placeholder="Nhập ý tưởng sơ khởi (VD: Tu tiên đô thị, cyberpunk ma pháp...)"
                       className="flex-1 bg-transparent border-none text-sm font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
                    />
                 </div>
                 <div className="w-full sm:w-auto shrink-0 flex gap-2">
                   <Button 
                      variant="ghost" 
                      className="flex-1 sm:flex-none py-3 px-6 text-sm bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all font-bold group rounded-2xl" 
                      onClick={handleAutoFillAll}
                      isLoading={state.isGenerating && !state.generatingField}
                   >
                      <div className="flex items-center justify-center gap-2">
                          <Sparkles size={18} className="group-hover:rotate-12 group-hover:scale-110 transition-transform text-amber-500" />
                          Tạo Nhanh Bằng AI
                      </div>
                   </Button>
                 </div>
               </div>

               {/* Knowledge/Lore Area */}
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                 <div className="flex-1 w-full flex items-center gap-3">
                   <div 
                      className="flex items-center gap-3 w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-2 px-3 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer hover:border-mystic-accent/50 hover:shadow-[0_0_15px_rgba(56,189,248,0.15)]" 
                      onClick={() => knowledgeInputRef.current?.click()}
                   >
                       <div className="p-2 bg-green-500/10 rounded-xl shrink-0">
                           <Upload className="text-green-600 dark:text-green-500" size={20} />
                       </div>
                       <div className="flex-1 flex flex-col justify-center min-w-0">
                           <span className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
                               Dữ Liệu Gốc (Knowledge / Lore)
                           </span>
                           <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                               {state.player.knowledge_filename ? (
                                   <span className="text-mystic-accent">
                                       Đã tải: {state.player.knowledge_filename} 
                                       {state.player.knowledge_size && ` (${(state.player.knowledge_size / 1024).toFixed(1)} KB)`}
                                   </span>
                               ) : (
                                   "Tải lên tài liệu (JSON, TXT, MD...)"
                               )}
                           </span>
                       </div>
                       <input 
                          type="file" 
                          ref={knowledgeInputRef} 
                          onChange={handleImportKnowledge} 
                          accept=".json,.txt,.md" 
                          className="hidden" 
                       />
                   </div>
                 </div>
                 <div className="w-full sm:w-auto shrink-0 flex gap-2">
                     <Button
                        variant="secondary"
                        onClick={handleAiGenPlayerKnowledge}
                        disabled={state.isGenerating || !state.player.knowledge_train?.trim()}
                        icon={state.isGenerating && state.generatingField === 'knowledge_train' ? <span className="animate-spin">⏳</span> : <Sparkles size={16} />}
                        className="flex-1 sm:flex-none py-3 px-6 text-sm bg-gradient-to-br from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 text-green-600 dark:text-green-400 border border-green-500/30 transition-all font-bold group rounded-2xl"
                     >
                        {state.isGenerating && state.generatingField === 'knowledge_train' ? "Đang xử lý..." : "AI GEN KNOWLEDGE"}
                     </Button>
                 </div>
               </div>
            </div>

            {/* Horizontal Stepper (Tabs) */}
            <div className="px-2 md:px-8 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-start sm:justify-center bg-slate-50/50 dark:bg-slate-900/30 overflow-x-auto no-scrollbar custom-scrollbar-hide">
               <div className="flex items-center gap-1 sm:gap-4 lg:gap-8 min-w-max px-2">
                  {TABS.map((tab, idx) => {
                      const isActive = state.currentTab === tab.id;
                      return (
                          <div key={tab.id} className="flex items-center">
                              <button
                                 onClick={() => store.setTab(tab.id)}
                                 className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-3 py-2 px-2 sm:px-4 rounded-2xl transition-all duration-300 relative group ${
                                     isActive 
                                         ? 'bg-mystic-accent/10 dark:bg-mystic-accent/20 text-mystic-accent border border-mystic-accent/20 shadow-sm' 
                                         : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-transparent'
                                 }`}
                              >
                                  <div className={`p-1.5 sm:p-2 rounded-xl transition-all ${isActive ? 'bg-white dark:bg-slate-900 shadow-sm text-mystic-accent' : 'group-hover:scale-110'}`}>
                                    <tab.icon size={16} className={`sm:w-[18px] sm:h-[18px] ${isActive ? 'animate-pulse' : ''}`} />
                                  </div>
                                  <div className="flex flex-col items-center sm:items-start whitespace-nowrap">
                                     <span className="block text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">Bước {idx + 1}</span>
                                     <span className={`font-bold tracking-wide ${isActive ? 'text-[11px] sm:text-sm text-mystic-accent line-clamp-1' : 'text-[10px] sm:text-sm'}`}>{tab.label}</span>
                                  </div>
                              </button>
                              {idx < TABS.length - 1 && (
                                  <div className="w-1.5 sm:w-4 lg:w-8 h-[2px] rounded-full mx-1 sm:mx-2 lg:mx-4 bg-slate-200 dark:bg-slate-800 shrink-0" />
                              )}
                          </div>
                      );
                  })}
               </div>
            </div>

            {/* Stepper Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 relative">
               <AnimatePresence mode="wait">
                  {state.currentTab === 0 && <motion.div key="tab0" initial={{opacity:0, y:-10, filter: 'blur(4px)'}} animate={{opacity:1, y:0, filter: 'blur(0px)'}} exit={{opacity:0, y:10, filter: 'blur(4px)'}} transition={{ duration: 0.2 }} className="h-full max-w-4xl mx-auto">{renderPlayerTab()}</motion.div>}
                  {state.currentTab === 1 && <motion.div key="tab1" initial={{opacity:0, y:-10, filter: 'blur(4px)'}} animate={{opacity:1, y:0, filter: 'blur(0px)'}} exit={{opacity:0, y:10, filter: 'blur(4px)'}} transition={{ duration: 0.2 }} className="h-full max-w-4xl mx-auto">{renderWorldTab()}</motion.div>}
                  {state.currentTab === 3 && <motion.div key="tab3" initial={{opacity:0, y:-10, filter: 'blur(4px)'}} animate={{opacity:1, y:0, filter: 'blur(0px)'}} exit={{opacity:0, y:10, filter: 'blur(4px)'}} transition={{ duration: 0.2 }} className="h-full max-w-4xl mx-auto">{renderEntitiesTab()}</motion.div>}
               </AnimatePresence>
            </div>
            
            {/* Bottom Action Bar */}
            <div className="p-4 md:p-6 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 rounded-b-3xl">
               <div className="hidden sm:flex gap-2 w-full sm:w-auto">
                  <Button variant="ghost" icon={<Upload size={16}/>} className="flex-1 sm:flex-none py-3 px-5 text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 transition-colors" onClick={handleImportClick}>Nhập</Button>
                  <Button variant="ghost" icon={<Download size={16}/>} className="flex-1 sm:flex-none py-3 px-5 text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 transition-colors" onClick={handleExportWorld}>Xuất</Button>
               </div>

               <div className="hidden lg:flex items-center gap-4 bg-white dark:bg-slate-950 rounded-2xl p-2 px-4 border border-slate-200 dark:border-slate-800 shadow-sm">
                   <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                       <User size={14} className="text-mystic-accent shrink-0" />
                       <span className="font-bold max-w-[150px] truncate">{state.player.name || <span className="text-slate-400 font-normal italic">Chưa có nhân vật</span>}</span>
                   </div>
                   <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800" />
                   <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                       <Compass size={14} className="text-mystic-accent shrink-0" />
                       <span className="font-bold max-w-[150px] truncate">{state.world.worldName || <span className="text-slate-400 font-normal italic">Chưa có bối cảnh</span>}</span>
                   </div>
               </div>

               <div className="w-full sm:w-auto sm:min-w-[240px] flex gap-2">
                  {prevTab !== null && (
                    <Button 
                       variant="ghost" 
                       className="sm:hidden flex-1 py-4 text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl"
                       onClick={() => store.setTab(prevTab)}
                    >
                       Quay Lại
                    </Button>
                  )}
                  {nextTab !== null ? (
                    <Button 
                       variant="primary" 
                       className="sm:hidden flex-[2] py-4 shadow-[0_4px_15px_rgba(56,189,248,0.2)] hover:shadow-[0_6px_20px_rgba(56,189,248,0.3)] text-xs font-black uppercase tracking-widest bg-mystic-accent hover:bg-blue-500 text-white rounded-2xl"
                       onClick={() => store.setTab(nextTab)}
                    >
                       Tiếp Tục
                    </Button>
                  ) : null}
                  <Button 
                     variant="primary" 
                     className={`${nextTab !== null ? 'hidden sm:block' : 'w-full'} w-full sm:w-auto flex-[2] py-4 shadow-[0_4px_20px_rgba(56,189,248,0.25)] hover:shadow-[0_6px_25px_rgba(56,189,248,0.4)] hover:-translate-y-1 text-sm font-black uppercase tracking-widest bg-gradient-to-r from-mystic-accent to-blue-600 hover:from-blue-500 hover:to-mystic-accent transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed group rounded-2xl`}
                     disabled={!state.player.name || !state.world.worldName}
                     onClick={handleStartGame}
                  >
                     <div className="flex items-center justify-center gap-2">
                         <Play size={20} className="group-disabled:opacity-50 group-hover:translate-x-1 transition-transform fill-white" />
                         Tạo Trò Chơi
                     </div>
                  </Button>
               </div>
            </div>
          </div>
      </div>

      {showEntityForm && (
        <EntityForm 
            initialData={editingEntityId ? state.entities.find(e => e.id === editingEntityId) : undefined}
            onCancel={() => setShowEntityForm(false)}
            onSave={(entity) => {
                if (editingEntityId) {
                    store.updateEntity(editingEntityId, entity);
                } else {
                    store.addEntity(entity);
                }
                setShowEntityForm(false);
            }}
        />
      )}
    </div>
  );
};

const InputGroup = ({ label, value, onChange, placeholder, onAi, loading = false }: { label: string, value: string, onChange: (v: string) => void, placeholder?: string, onAi?: () => void, loading?: boolean }) => (
    <div className="mb-1 relative flex flex-col">
        <div className="flex justify-between items-center mb-0.5">
            <label className="text-xs font-medium text-mystic-accent">{label}</label>
            {onAi && (
                <button 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAi();
                    }} 
                    disabled={loading} 
                    className="group flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-stone-50 dark:bg-mystic-900 hover:bg-mystic-accent/10 hover:border-mystic-accent hover:text-mystic-accent text-[10px] text-slate-500 dark:text-slate-400 transition-all cursor-pointer z-10"
                >
                    {loading ? (
                        <span className="animate-spin block w-2.5 h-2.5 border-2 border-mystic-accent border-t-transparent rounded-full" />
                    ) : (
                        <Sparkles size={10} className="group-hover:scale-110 transition-transform" />
                    )}
                    <span>AI Gợi ý</span>
                </button>
            )}
        </div>
        <input 
            type="text" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-1.5 text-stone-900 dark:text-slate-100 outline-none focus:border-mystic-accent transition-colors text-xs"
            placeholder={placeholder}
        />
    </div>
);

const TimeInput = ({ label, value, onChange, min, max }: { label: string, value: number, onChange: (v: number) => void, min?: number, max?: number }) => (
    <div className="flex flex-col gap-0.5">
        <label className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 text-center">{label}</label>
        <input 
            type="number" 
            value={isNaN(value) ? '' : value}
            min={min}
            max={max}
            onChange={(e) => {
                if (e.target.value === '') {
                    onChange(0); // or handle empty state gracefully if 0 is preferred
                } else {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) onChange(val);
                }
            }}
            className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-1 text-stone-900 dark:text-slate-100 outline-none focus:border-mystic-accent text-center text-xs font-mono"
        />
    </div>
);

const TextAreaGroup = ({ label, value, onChange, onAi, height = 'h-24', loading = false, placeholder }: { label: string, value: string, onChange: (v: string) => void, onAi?: () => void, height?: string, loading?: boolean, placeholder?: string }) => {
    const [isPreview, setIsPreview] = useState(false);
    
    return (
        <div className="relative flex flex-col mb-1">
            <div className="flex justify-between items-center mb-0.5">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-mystic-accent">{label}</label>
                    <button 
                        type="button"
                        onClick={() => setIsPreview(!isPreview)}
                        className="text-slate-400 hover:text-mystic-accent transition-colors"
                        title={isPreview ? "Chỉnh sửa" : "Xem trước Markdown"}
                    >
                        {isPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                </div>
                {onAi && (
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAi();
                        }} 
                        disabled={loading} 
                        className="group flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-stone-50 dark:bg-mystic-900 hover:bg-mystic-accent/10 hover:border-mystic-accent hover:text-mystic-accent text-[10px] text-slate-500 dark:text-slate-400 transition-all cursor-pointer z-10"
                    >
                        {loading ? (
                            <span className="animate-spin block w-2.5 h-2.5 border-2 border-mystic-accent border-t-transparent rounded-full" />
                        ) : (
                            <Sparkles size={10} className="group-hover:scale-110 transition-transform" />
                        )}
                        <span>AI Gợi ý</span>
                    </button>
                )}
            </div>
            {isPreview ? (
                <div className={`w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-stone-900 dark:text-slate-100 overflow-y-auto custom-scrollbar text-xs ${height}`}>
                    <MarkdownRenderer content={value || "*Chưa có nội dung*"} />
                </div>
            ) : (
                <textarea 
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-stone-900 dark:text-slate-100 outline-none focus:border-mystic-accent transition-colors text-xs resize-none custom-scrollbar ${height}`}
                    placeholder={placeholder}
                />
            )}
        </div>
    );
};

export default WorldCreationScreen;

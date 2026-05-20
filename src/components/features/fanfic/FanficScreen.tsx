
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Sparkles, Plus, Trash2, Edit2, Wand2, Play, 
  User, Compass, ScrollText, Users, Upload, Download, Clock,
  X, Search, ChevronRight, Eye, EyeOff, FileText
} from 'lucide-react';
import { NavigationProps, GameState, WorldData, AppSettings } from '../../../types';
import Button from '../../ui/Button';
import MarkdownRenderer from '../../common/MarkdownRenderer';
import { useWorldCreationStore } from '../../../store/worldCreationStore';
import EntityForm from '../world-creation/EntityForm';
import { CharacterSheetEditor } from '../world-creation/CharacterSheetEditor';
import { worldAiService } from '../../../services/ai/world-creation/service';
import { fanficAiService, FanficCharacter } from '../../../services/ai/fanfic/service';
import { dbService } from '../../../services/db/indexedDB';

const TABS = [
  { id: 0, label: "Nhân vật", icon: User },
  { id: 1, label: "Thế giới", icon: Compass },
  { id: 3, label: "Encyclopedia", icon: Users },
];

interface FanficScreenProps extends NavigationProps {
  onGameStart?: (data: WorldData) => void;
  initialData?: WorldData | null;
}

interface WorkCharacter {
  name?: string;
  role?: string;
  gender?: string;
  age?: string;
  personality?: string;
  description?: string;
  appearance?: string;
  skills?: string;
  goal?: string;
  lineage?: string;
  identities?: { name: string; role: string }[];
}

interface ImportedWork {
  title?: string;
  worldSetting?: string;
  plot?: string;
  characters?: WorkCharacter[];
}

const FanficScreen: React.FC<FanficScreenProps> = ({ onNavigate, onGameStart, initialData }) => {
  const store = useWorldCreationStore();
  const state = {
    currentTab: store.currentTab,
    player: store.player,
    world: store.world,
    config: store.config,
    entities: store.entities,
    gameTime: store.gameTime,
    lorebook: store.lorebook,
    isGenerating: store.isGenerating,
    generatingField: store.generatingField
  };

  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [originalWorkName, setOriginalWorkName] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [analyzedCharacters, setAnalyzedCharacters] = useState<FanficCharacter[]>([]);
  const [importedWorks, setImportedWorks] = useState<ImportedWork[]>([]);
  const [showWorkSelector, setShowWorkSelector] = useState(false);
  const [workSearchTerm, setWorkSearchTerm] = useState('');
  const [workFilterCountry, setWorkFilterCountry] = useState('All');
  const [workFilterGenre, setWorkFilterGenre] = useState('All');
  const [workSortBy, setWorkSortBy] = useState<'title' | 'chars_desc' | 'chars_asc'>('title');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useState(false);
  const [aiModel, setAiModel] = useState<string>('gemini-3.1-pro-preview');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtFileInputRef = useRef<HTMLInputElement>(null);
  const [bgImage, setBgImage] = useState<string | null>("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
  const bgBlur = localStorage.getItem('ark_v2_bg_blur') !== 'false';
  
  useEffect(() => {
    store.reset(); // Reset global store on mount for FanficScreen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const handleAnalyze = async () => {
    if (!originalContent.trim() && !originalWorkName.trim()) {
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await fanficAiService.analyzeFanfic(originalContent, originalWorkName, settings || undefined);
      setAnalyzedCharacters(result.characters);
      
      // Tự động cập nhật bối cảnh thế giới từ tóm tắt
      store.updateWorld('context', result.summary);
      setIsAnalysisCollapsed(true);
    } catch (error: any) {
      console.error("Analyze Error", error);
      alert("Lỗi khi phân tích: " + (error?.message || "Không rõ nguyên nhân. Vui lòng kiểm tra lại nội dung."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTxtFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setOriginalContent(e.target?.result as string);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Initial Load (Settings & Import Data)
  useEffect(() => {
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

    // Check if there is initial data passed
    if (initialData) {
       store.importData(initialData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  // --- AI Helper Function ---
  const handleAiGenerate = async (field: string, category: 'player' | 'world') => {
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
      const contextData = category === 'player' 
        ? { ...state.player, genre: state.world.genre } 
        : { genre: state.world.genre, worldName: state.world.worldName, originalWorkName };

      let currentValue = "";
      if (category === 'player') {
          // @ts-expect-error - Dynamic access
          currentValue = state.player[field] || "";
      } else {
          // @ts-expect-error - Dynamic access
          currentValue = state.world[field] || "";
      }

      const content = await worldAiService.generateFieldContent(category, field, contextData, aiModel, currentValue, settings || undefined);
      
      if (['name', 'gender', 'age', 'personality', 'background', 'appearance', 'skills', 'goal'].includes(field)) {
        store.updatePlayer(field as keyof PlayerProfile, content);
      } else if (['worldName', 'context', 'genre'].includes(field)) {
        store.updateWorld(field as keyof WorldSettingConfig, content);
      }
    } catch (error: unknown) {
      console.error("AI Error", error);
    } finally {
      store.setGenerating(false);
    }
  };

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
    if (!originalWorkName.trim()) return;
    store.setGenerating(true);
    try {
      // Sử dụng tên tác phẩm gốc và tóm tắt (nếu có) làm ý tưởng để AI tạo thế giới đồng nhân
      let concept = `Đồng nhân của tác phẩm: ${originalWorkName}`;
      if (state.world.context) {
        concept += `\n\nBối cảnh và nội dung gốc:\n${state.world.context}`;
      }
      
      // Thu thập dữ liệu hiện tại để AI tôn trọng
      const existingData = {
        player: state.player,
        world: state.world,
        entities: state.entities,
        rules: state.config.rules,
        gameTime: state.gameTime
      };

      const data = await worldAiService.generateFullWorld(concept, aiModel, settings || undefined, existingData);
      store.autoFillAll(data);
    } catch (error: unknown) {
      console.error("AI AutoFill Error", error);
    } finally {
      store.setGenerating(false);
    }
  };

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
        gameTime: state.gameTime
    };
    
    const worldName = state.world.worldName.replace(/\s+/g, '_') || 'unknown_world';
    const playerName = state.player.name.replace(/\s+/g, '_') || 'unknown_player';
    const timestamp = Date.now();
    const fileName = `FANFIC_${worldName}_${playerName}_${timestamp}.json`;
    
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

  const applyWorkData = (work: ImportedWork) => {
    setOriginalWorkName(work.title || '');
    
    // Kết hợp bối cảnh và cốt truyện để làm context thế giới
    let context = "";
    if (work.worldSetting) context += `BỐI CẢNH:\n${work.worldSetting}\n\n`;
    if (work.plot) context += `CỐT TRUYỆN:\n${work.plot}`;
    
    store.updateWorld('context', context.trim());
    
    // Chuyển đổi danh sách nhân vật sang định dạng FanficCharacter
    if (work.characters && Array.isArray(work.characters)) {
      const mappedChars: FanficCharacter[] = work.characters.map((c: WorkCharacter) => {
        let background = c.description || '';
        if (c.lineage) background += `\nLai lịch: ${c.lineage}`;
        if (c.identities && Array.isArray(c.identities)) {
          background += `\nDanh tính khác: ${c.identities.map((i: { name: string; role: string }) => `${i.name} (${i.role})`).join(', ')}`;
        }

        return {
          name: c.name || '',
          role: c.role || '',
          gender: c.gender || 'Chưa rõ',
          age: c.age || 'Chưa rõ',
          personality: c.personality || 'Chưa rõ',
          background: background.trim() || 'Chưa rõ',
          appearance: c.appearance || 'Chưa rõ',
          skills: c.skills || 'Chưa rõ',
          goal: c.goal || 'Chưa rõ'
        };
      });
      setAnalyzedCharacters(mappedChars);
      
      // Thêm các nhân vật quan trọng vào danh sách thực thể (NPC) nếu chưa có nhiều
      if (state.entities.length < 5) {
        work.characters.slice(0, 15).forEach((c: WorkCharacter) => {
          // Kiểm tra xem thực thể đã tồn tại chưa
          if (c.name && !state.entities.some(e => e.name === c.name)) {
            let desc = c.description || c.role || 'Nhân vật từ tác phẩm gốc';
            if (c.identities && Array.isArray(c.identities)) {
              desc += ` (Danh tính: ${c.identities.map((i: { name: string; role: string }) => i.name).join(', ')})`;
            }

            store.addEntity({
                name: c.name,
                type: 'NPC',
                description: desc,
                properties: {
                  role: c.role,
                  lineage: c.lineage,
                  identities: c.identities
                }
            });
          }
        });
      }
    }
    
    setIsAnalysisCollapsed(true);
    setShowWorkSelector(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content);
        
        // Kiểm tra xem đây là danh sách tác phẩm gốc (định dạng người dùng cung cấp)
        if (Array.isArray(parsedData) && parsedData.length > 0 && (parsedData[0].title || parsedData[0].worldSetting)) {
          setImportedWorks(parsedData);
          setShowWorkSelector(true);
        } 
        // Kiểm tra nếu là một tác phẩm đơn lẻ
        else if (parsedData.title && (parsedData.worldSetting || parsedData.characters)) {
          applyWorkData(parsedData);
        }
        // Đây là dữ liệu lưu game chuẩn (WorldData)
        else if (parsedData.player && parsedData.world) {
          store.importData(parsedData as WorldData);
        } else {
          console.warn("Định dạng tệp không được hỗ trợ");
        }
      } catch (error: unknown) {
        console.error("Import Error", error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleStartGame = async () => {
     if (!settings) return;

     const worldData: WorldData = {
        id: `campaign-${crypto.randomUUID()}`,
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
        savedState: { history: [], turnCount: 0 }
     };
     
     if (!worldData.player.name || !worldData.world.worldName) {
         return;
     }

     try {
         await dbService.saveAutosave({
             id: `autosave-fanfic-${Date.now()}`,
             name: `[Đồng Nhân] ${worldData.world.worldName}`,
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

  const handleAiGenPlayerKnowledge = async () => {
    if (!state.player.knowledge_train?.trim()) {
        alert("Vui lòng nhập dữ liệu gốc (Knowledge Base) vào bảng Nhân Vật Chính trước.");
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

  const renderPlayerTab = () => (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-0.5 mb-1">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2" style={{ fontFamily: 'Arial', lineHeight: '18px' }}>
          <User size={18} className="text-mystic-accent" /> Thiết lập Nhân Vật Chính
        </h3>
        <Button
            variant="secondary"
            onClick={handleAiGenPlayerKnowledge}
            disabled={state.isGenerating || !state.player.knowledge_train?.trim()}
            icon={state.isGenerating && state.generatingField === 'knowledge_train' ? <span className="animate-spin">⏳</span> : <Sparkles size={16} />}
            className="py-1 px-3 text-xs bg-green-500 hover:bg-green-600 text-white"
        >
            {state.isGenerating && state.generatingField === 'knowledge_train' ? "Đang xử lý AI..." : "AI GEN KNOWLEDGE"}
        </Button>
      </div>

      {analyzedCharacters.length > 0 && (
        <div className="bg-mystic-accent/5 p-3 rounded-lg border border-mystic-accent/20 mb-4">
          <label className="block text-xs font-bold text-mystic-accent uppercase mb-2">Chọn nhân vật từ tác phẩm gốc</label>
          <select 
            className="w-full bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700 rounded p-2 text-stone-900 dark:text-slate-100 outline-none focus:border-mystic-accent text-sm"
            onChange={(e) => {
              const charName = e.target.value;
              if (charName === 'new') {
                store.updatePlayer('name', '');
                return;
              }
              const char = analyzedCharacters.find(c => c.name === charName);
              if (char) {
                store.updatePlayer('name', char.name || '');
                store.updatePlayer('gender', char.gender || '');
                store.updatePlayer('age', char.age || '');
                store.updatePlayer('personality', char.personality || '');
                store.updatePlayer('background', char.background || '');
                store.updatePlayer('appearance', char.appearance || '');
                store.updatePlayer('skills', char.skills || '');
                store.updatePlayer('goal', char.goal || '');
              }
            }}
          >
            <option value="new">-- Tạo nhân vật mới tự do --</option>
            {analyzedCharacters.map(char => (
              <option key={char.name} value={char.name}>{char.name} ({char.role})</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-1 italic">* Chọn một nhân vật để tự động điền thông tin chi tiết.</p>
        </div>
      )}

      <CharacterSheetEditor 
         data={state.player} 
         onChange={(field, value) => store.updatePlayer(field as any, value)} 
      />
    </div>
  );

  const renderWorldTab = () => {
    return (
      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-0.5 mb-1 flex items-center gap-2" style={{ fontFamily: 'Arial', lineHeight: '18px' }}>
          <Compass size={18} className="text-mystic-accent" /> Bối Cảnh Thế Giới Đồng Nhân
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputGroup 
              label="Tên thế giới" 
              value={state.world.worldName} 
              onChange={(v) => store.updateWorld('worldName', v)} 
              onAi={() => handleAiGenerate('worldName', 'world')}
              loading={state.isGenerating && state.generatingField === 'worldName'}
              placeholder="Ví dụ: Hỏa Ảnh Thế Giới, Tam Quốc Diễn Nghĩa..."
            />
            <InputGroup 
              label="Thể loại" 
              value={state.world.genre} 
              onChange={(v) => store.updateWorld('genre', v)} 
              onAi={() => handleAiGenerate('genre', 'world')}
              loading={state.isGenerating && state.generatingField === 'genre'}
              placeholder="Ví dụ: Tiên Hiệp, Cyberpunk, Hậu Tận Thế..."
            />
        </div>
        <TextAreaGroup 
          label="Bối cảnh & Lịch sử" 
          value={state.world.context} 
          onChange={(v) => store.updateWorld('context', v)} 
          height="h-56"
          placeholder="Mô tả bối cảnh thế giới đồng nhân..."
          onAi={() => handleAiGenerate('context', 'world')}
          loading={state.isGenerating && state.generatingField === 'context'}
        />

        <div className="bg-stone-100 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-mystic-accent">
                    <Clock size={16} />
                    <span>Thời gian khởi đầu</span>
                </div>
                <button 
                    onClick={handleAiSuggestTime}
                    disabled={state.isGenerating}
                    className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-stone-50 dark:bg-mystic-900 hover:bg-mystic-accent/10 hover:border-mystic-accent hover:text-mystic-accent text-xs text-slate-500 dark:text-slate-400 transition-all"
                >
                    {state.isGenerating && state.generatingField === 'gameTime' ? (
                        <span className="animate-spin block w-3 h-3 border-2 border-mystic-accent border-t-transparent rounded-full" />
                    ) : (
                        <Sparkles size={12} />
                    )}
                    <span>AI Gợi ý</span>
                </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <TimeInput label="Năm" value={state.gameTime.year} onChange={(v) => store.updateGameTime('year', v)} />
                <TimeInput label="Tháng" value={state.gameTime.month} min={1} max={12} onChange={(v) => store.updateGameTime('month', v)} />
                <TimeInput label="Ngày" value={state.gameTime.day} min={1} max={31} onChange={(v) => store.updateGameTime('day', v)} />
                <TimeInput label="Giờ" value={state.gameTime.hour} min={0} max={23} onChange={(v) => store.updateGameTime('hour', v)} />
                <TimeInput label="Phút" value={state.gameTime.minute} min={0} max={59} onChange={(v) => store.updateGameTime('minute', v)} />
            </div>
        </div>

        <TextAreaGroup 
          label="Kịch bản khởi đầu (Tùy chọn)" 
          value={state.world.startingScenario || ''} 
          onChange={(v) => store.updateWorld('startingScenario', v)} 
          height="h-28"
          placeholder="Nhập hành động hoặc tình huống bắt đầu cụ thể..."
        />
      </div>
    );
  };



  const renderEntitiesTab = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
       <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-0.5 mb-1 flex items-center gap-2" style={{ fontFamily: 'Arial', lineHeight: '18px' }}>
          <Users size={18} className="text-mystic-accent" /> Danh Sách Thực Thể & NPC
       </h3>
       <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
             Thêm các nhân vật phụ hoặc địa danh quan trọng từ tác phẩm gốc.
          </p>
          <Button variant="primary" onClick={() => { setEditingEntityId(null); setShowEntityForm(true); }} icon={<Plus size={16} />}>
             Thêm thực thể
          </Button>
       </div>

       <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 custom-scrollbar pr-2">
            {state.entities.map(ent => (
                <div key={ent.id} className="bg-stone-100 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 p-4 rounded-lg hover:border-mystic-accent/50 transition-colors group relative">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                ent.type === 'NPC' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' : 
                                ent.type === 'LOCATION' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 
                                ent.type === 'ITEM' ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200' :
                                'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                            }`}>
                                {ent.type}
                            </span>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200">{ent.name}</h4>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingEntityId(ent.id); setShowEntityForm(true); }} className="p-1 hover:text-mystic-accent"><Edit2 size={14}/></button>
                            <button onClick={() => store.removeEntity(ent.id)} className="p-1 hover:text-red-400"><Trash2 size={14}/></button>
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{ent.description}</p>
                </div>
            ))}
            {state.entities.length === 0 && (
                <div className="col-span-full border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center h-32 text-slate-400 dark:text-slate-500">
                    Chưa có thực thể nào.
                </div>
            )}
       </div>
    </div>
  );

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
                Đồng Nhân
            </h2>
            <div className="w-32 flex justify-end" />
          </div>

          {/* Main Wizard Card */}
          <div className="w-full max-w-5xl flex-1 flex flex-col bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl min-h-0 mx-auto overflow-hidden">
            
            {/* Top Concept Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
               <div className="flex-1 w-full flex flex-col gap-2">
                   <div className="flex justify-between items-center px-1">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tác Phẩm Gốc</span>
                       <button 
                           onClick={() => setIsAnalysisCollapsed(!isAnalysisCollapsed)}
                           className="text-[10px] text-mystic-accent hover:underline transition-all flex items-center gap-1"
                       >
                           <FileText size={12}/> {isAnalysisCollapsed ? 'Phân Tích Tác Phẩm' : 'Ẩn Phân Tích'}
                       </button>
                   </div>
                   <div className="w-full bg-slate-50 dark:bg-slate-900 rounded-2xl p-2 border border-slate-200 dark:border-slate-800 focus-within:border-mystic-accent/50 focus-within:shadow-[0_0_15px_rgba(56,189,248,0.15)] flex gap-3 items-center transition-all">
                      <div className="p-2 bg-mystic-accent/10 rounded-xl">
                          <Wand2 className="text-mystic-accent shrink-0" size={20} />
                      </div>
                      <input 
                         value={originalWorkName}
                         onChange={(e) => setOriginalWorkName(e.target.value)}
                         placeholder="Nhập IP/Tên Tác Phẩm (VD: Harry Potter, Genshin Impact)..."
                         className="flex-1 bg-transparent border-none text-sm font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
                      />
                   </div>
               </div>
               
               <div className="w-full md:w-auto shrink-0 flex gap-2 md:mt-6">
                 <Button 
                    variant="ghost" 
                    className="flex-1 md:flex-none py-3 px-4 text-sm bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-all font-bold group rounded-2xl" 
                    onClick={() => setShowWorkSelector(true)}
                    disabled={importedWorks.length === 0}
                 >
                    <div className="flex items-center justify-center gap-2">
                        <Clock size={16} className="group-hover:scale-110 transition-transform" />
                        Lịch Sử
                    </div>
                 </Button>

                 <Button 
                    variant="ghost" 
                    className="flex-1 md:flex-none py-3 px-6 text-sm bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all font-bold group rounded-2xl" 
                    onClick={handleAutoFillAll}
                    isLoading={state.isGenerating && !state.generatingField}
                 >
                    <div className="flex items-center justify-center gap-2">
                        <Sparkles size={18} className="group-hover:rotate-12 group-hover:scale-110 transition-transform text-amber-500" />
                        Tạo Nhanh Đồng Nhân
                    </div>
                 </Button>
               </div>
            </div>

            {/* Analyzer (Collapsible) Area */}
            <AnimatePresence>
                {!isAnalysisCollapsed && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0"
                    >
                        <div className="p-4 md:p-6 space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Nội dung tác phẩm gốc để phân tích</label>
                                <div className="flex gap-2">
                                    <input type="file" ref={txtFileInputRef} onChange={handleTxtFileChange} accept=".txt" className="hidden" />
                                    <Button variant="ghost" onClick={() => txtFileInputRef.current?.click()} className="text-[10px] py-1 px-2 border border-slate-300 dark:border-slate-700 hover:border-mystic-accent text-slate-600 rounded-lg" icon={<Upload size={12}/>}>Tải TXT</Button>
                                    <Button variant="ghost" onClick={() => setOriginalContent('')} className="text-[10px] py-1 px-2 border border-slate-300 dark:border-slate-700 hover:text-red-500 text-slate-600 rounded-lg" icon={<Trash2 size={12}/>}>Xóa</Button>
                                </div>
                            </div>
                            <textarea 
                                value={originalContent}
                                onChange={(e) => setOriginalContent(e.target.value)}
                                placeholder="Dán nội dung truyện vào đây (tối đa vài ngàn từ) để AI phân tích..."
                                className="w-full h-24 sm:h-32 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 focus:border-mystic-accent focus:ring-1 focus:ring-mystic-accent outline-none resize-none custom-scrollbar"
                            />
                            <div className="flex justify-end mt-2">
                                <Button 
                                    variant="primary" 
                                    className="py-2 px-6 text-xs font-bold tracking-widest rounded-xl shadow-md cursor-pointer" 
                                    onClick={handleAnalyze}
                                    isLoading={isAnalyzing}
                                    icon={<Sparkles size={14} />}
                                >
                                    BẮT ĐẦU PHÂN TÍCH
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Horizontal Stepper (Tabs) */}
            <div className="px-4 md:px-8 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-center bg-slate-50/50 dark:bg-slate-900/30 overflow-x-auto no-scrollbar shrink-0">
               <div className="flex items-center gap-2 sm:gap-4 lg:gap-8 min-w-max">
                  {TABS.map((tab, idx) => {
                      const isActive = state.currentTab === tab.id;
                      return (
                          <div key={tab.id} className="flex items-center">
                              <button
                                 onClick={() => store.setTab(tab.id)}
                                 className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-3 py-2 px-3 sm:px-4 rounded-2xl transition-all duration-300 relative group ${
                                     isActive 
                                         ? 'bg-mystic-accent/10 dark:bg-mystic-accent/20 text-mystic-accent border border-mystic-accent/20 shadow-sm' 
                                         : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-transparent'
                                 }`}
                              >
                                  <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-white dark:bg-slate-900 shadow-sm text-mystic-accent' : 'group-hover:scale-110'}`}>
                                    <tab.icon size={18} className={isActive ? 'animate-pulse' : ''} />
                                  </div>
                                  <div className="flex flex-col items-center sm:items-start">
                                     <span className="hidden sm:block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">Bước {idx + 1}</span>
                                     <span className="font-bold text-[10px] sm:text-sm tracking-wide">{tab.label}</span>
                                  </div>
                              </button>
                              {idx < TABS.length - 1 && (
                                  <div className="hidden sm:block w-4 lg:w-8 h-[2px] rounded-full mx-2 lg:mx-4 bg-slate-200 dark:bg-slate-800" />
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
               <div className="flex gap-2 w-full sm:w-auto">
                  <Button variant="ghost" icon={<Upload size={16}/>} className="flex-1 sm:flex-none py-3 px-5 text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 transition-colors" onClick={handleImportClick}>Nhập</Button>
                  <Button variant="ghost" icon={<Download size={16}/>} className="flex-1 sm:flex-none py-3 px-5 text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 transition-colors" onClick={handleExportWorld}>Xuất</Button>
               </div>

               <div className="hidden lg:flex items-center gap-4 bg-white dark:bg-slate-950 rounded-2xl p-2 px-4 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-md">
                   <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                       <User size={14} className="text-mystic-accent shrink-0" />
                       <span className="font-bold max-w-[150px] truncate">{state.player.name || <span className="text-slate-400 font-normal italic">Chưa có VN</span>}</span>
                   </div>
                   <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800" />
                   <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                       <Compass size={14} className="text-mystic-accent shrink-0" />
                       <span className="font-bold max-w-[150px] truncate">{state.world.worldName || <span className="text-slate-400 font-normal italic">Chưa có bối cảnh</span>}</span>
                   </div>
               </div>

               <div className="w-full sm:w-auto sm:min-w-[240px]">
                  <Button 
                     variant="primary" 
                     className="w-full py-4 shadow-[0_4px_20px_rgba(56,189,248,0.25)] hover:shadow-[0_6px_25px_rgba(56,189,248,0.4)] hover:-translate-y-1 text-sm font-black uppercase tracking-widest bg-gradient-to-r from-mystic-accent to-blue-600 hover:from-blue-500 hover:to-mystic-accent transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed group rounded-2xl cursor-pointer"
                     disabled={state.entities.length < 1 || !state.player.name || !state.world.worldName}
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

      {showWorkSelector && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div 
            className="fixed inset-0" 
            onClick={() => setShowWorkSelector(false)} 
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative bg-white dark:bg-slate-900 w-full max-w-md h-full shadow-[-20px_0_50px_rgba(0,0,0,0.1)] border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Header - Minimal & Clean */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-mystic-accent/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="text-mystic-accent" size={16} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Thư viện tác phẩm</h3>
              </div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setImportedWorks([]);
                    setShowWorkSelector(false);
                  }}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  title="Xóa tất cả"
                >
                  <Trash2 size={16} />
                </button>
                <button 
                  onClick={() => setShowWorkSelector(false)}
                  className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Search & Filters - Compact List Style */}
            <div className="p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Tìm kiếm tác phẩm..."
                  value={workSearchTerm}
                  onChange={(e) => setWorkSearchTerm(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs outline-none focus:ring-1 focus:ring-mystic-accent transition-all"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={workFilterCountry}
                  onChange={(e) => setWorkFilterCountry(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-[10px] font-bold outline-none"
                >
                  <option value="All">Quốc gia</option>
                  {Array.from(new Set(importedWorks.map(w => w.country).filter(Boolean))).sort().map(c => (
                    <option key={c as string} value={c as string}>{c as string}</option>
                  ))}
                </select>
                <select
                  value={workFilterGenre}
                  onChange={(e) => setWorkFilterGenre(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-[10px] font-bold outline-none"
                >
                  <option value="All">Thể loại</option>
                  {Array.from(new Set(importedWorks.map(w => w.genre).filter(Boolean))).sort().map(g => (
                    <option key={g as string} value={g as string}>{g as string}</option>
                  ))}
                </select>
                <select
                  value={workSortBy}
                  onChange={(e) => setWorkSortBy(e.target.value as 'title' | 'chars_desc' | 'chars_asc')}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-[10px] font-bold outline-none"
                >
                  <option value="title">Tên A-Z</option>
                  <option value="chars_desc">Nhiều NV</option>
                  <option value="chars_asc">Ít NV</option>
                </select>
              </div>
            </div>
            
            {/* List Content - Clean & Dense */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {importedWorks
                .filter(work => {
                  const matchesSearch = 
                    (work.title?.toLowerCase() || "").includes(workSearchTerm.toLowerCase()) || 
                    (work.description?.toLowerCase() || "").includes(workSearchTerm.toLowerCase());
                  const matchesCountry = workFilterCountry === 'All' || work.country === workFilterCountry;
                  const matchesGenre = workFilterGenre === 'All' || work.genre === workFilterGenre;
                  return matchesSearch && matchesCountry && matchesGenre;
                })
                .sort((a, b) => {
                  if (workSortBy === 'title') return (a.title || "").localeCompare(b.title || "");
                  if (workSortBy === 'chars_desc') return (b.characters?.length || 0) - (a.characters?.length || 0);
                  if (workSortBy === 'chars_asc') return (a.characters?.length || 0) - (b.characters?.length || 0);
                  return 0;
                })
                .map((work, idx) => (
                <button
                  key={work.id || idx}
                  onClick={() => applyWorkData(work)}
                  className="w-full flex flex-col p-5 border-b border-slate-50 dark:border-slate-800/50 hover:bg-mystic-accent/5 transition-all text-left group"
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-mystic-accent transition-colors line-clamp-1 text-sm">
                      {work.title}
                    </h4>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-mystic-accent group-hover:translate-x-1 transition-all" />
                  </div>
                  
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {work.description || work.plot || "Không có mô tả."}
                  </p>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      <Users size={10} className="text-mystic-accent" />
                      <span>{work.characters?.length || 0} Nhân vật</span>
                    </div>
                    {work.genre && (
                      <span className="text-[9px] font-bold text-mystic-accent bg-mystic-accent/10 px-1.5 py-0.5 rounded">
                        {work.genre}
                      </span>
                    )}
                    {work.country && (
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {work.country}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              
              {/* Empty State */}
              {importedWorks.length > 0 && importedWorks.filter(work => {
                  const matchesSearch = 
                    (work.title?.toLowerCase() || "").includes(workSearchTerm.toLowerCase());
                  const matchesCountry = workFilterCountry === 'All' || work.country === workFilterCountry;
                  const matchesGenre = workFilterGenre === 'All' || work.genre === workFilterGenre;
                  return matchesSearch && matchesCountry && matchesGenre;
                }).length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 px-10 text-center">
                  <Search size={32} className="mb-4 opacity-10" />
                  <p className="text-sm font-medium">Không tìm thấy tác phẩm phù hợp</p>
                  <button 
                    onClick={() => { setWorkSearchTerm(''); setWorkFilterCountry('All'); setWorkFilterGenre('All'); }}
                    className="mt-4 text-[11px] font-bold text-mystic-accent hover:underline uppercase tracking-widest"
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              )}
            </div>

            {/* Footer - Subtle Stats */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] text-slate-400 font-medium text-center uppercase tracking-[0.2em]">
                Chọn một tác phẩm để áp dụng dữ liệu
              </p>
            </div>
          </motion.div>
        </div>
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
                    onChange(0);
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

export default FanficScreen;

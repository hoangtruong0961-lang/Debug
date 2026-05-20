
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavigationProps, GameState, AppSettings, ThinkingBudgetLevel, ThinkingLevel, NarrativePerspective } from '../../../types';
import SafetySettings from './SafetySettings';
import RegexScriptsManager from '../gameplay/components/RegexScriptsManager';
import { dbService, DEFAULT_SETTINGS } from '../../../services/db/indexedDB';
import Button from '../../ui/Button';
import { Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, Globe, RefreshCw, Sparkles, Sliders, Database, Shield, Zap, Palette, Monitor, HardDrive, Server } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { DIFFICULTY_LEVELS, OUTPUT_LENGTHS } from '../../../constants/promptTemplates';

interface SettingsScreenProps extends NavigationProps {
  fromGame?: boolean;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onNavigate, fromGame }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'display' | 'game' | 'advanced' | 'api'>('general');
  const { setTheme, setFontFamily, setFontSize, setVisualEffects } = useTheme();
  const [localFontSize, setLocalFontSize] = useState<string>('');
  const [manualKeyText, setManualKeyText] = useState('');

  const [bgImage, setBgImage] = useState<string | null>("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
  const bgBlur = localStorage.getItem('ark_v2_bg_blur') !== 'false';

  useEffect(() => {
    const load = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      if (s) {
        setLocalFontSize(s.fontSize.toString());
      }

      const savedBg = await dbService.getAsset('ark_v2_custom_bg');
      if (savedBg) {
        setBgImage(savedBg);
      } else {
        const legacyBg = await dbService.getAsset('ark_v1_custom_bg');
        if (legacyBg) {
          setBgImage(legacyBg);
        } else {
          setBgImage("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
        }
      }
    };
    load();
  }, []);

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      if (!prev) return null;
      const newSettings = { ...prev, [key]: value };
      
      // Side effects should be triggered after state update
      setTimeout(() => {
        dbService.saveSettings(newSettings);
        if (key === 'theme') setTheme(value as 'light' | 'dark');
        if (key === 'systemFont') setFontFamily(value as string);
        if (key === 'fontSize') {
          setFontSize(value as number);
          setLocalFontSize(value.toString());
        }
        if (key === 'visualEffects') setVisualEffects(value as boolean);
      }, 0);
      
      return newSettings;
    });
  };

  const handleMultipleChanges = (changes: Partial<AppSettings>) => {
    setSettings(prev => {
      if (!prev) return null;
      const newSettings = { ...prev, ...changes };
      
      // Side effects should be triggered after state update
      setTimeout(() => {
        dbService.saveSettings(newSettings);
        Object.entries(changes).forEach(([key, value]) => {
          if (key === 'theme') setTheme(value as 'light' | 'dark');
          if (key === 'systemFont') setFontFamily(value as string);
          if (key === 'fontSize') {
            setFontSize(value as number);
            setLocalFontSize(value.toString());
          }
          if (key === 'visualEffects') setVisualEffects(value as boolean);
        });
      }, 0);
      
      return newSettings;
    });
  };

  const handleGlobalUpdate = (newSettings: AppSettings) => {
    setSettings(newSettings);
    dbService.saveSettings(newSettings);
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    await dbService.saveSettings(settings);
    setIsSaving(false);
    onNavigate(fromGame ? GameState.PLAYING : GameState.MENU);
  };

  const handleResetFactory = async () => {
      setSettings(DEFAULT_SETTINGS);
      await dbService.saveSettings(DEFAULT_SETTINGS);
  };

  const handleAddManualKeys = () => {
    const newKeys = manualKeyText.split('\n').map(k => k.trim()).filter(k => k !== '');
    if (newKeys.length > 0) {
      const currentKeys = settings?.geminiApiKey || [];
      const updatedKeys = [...currentKeys];
      newKeys.forEach(nk => { if (!updatedKeys.includes(nk)) updatedKeys.push(nk); });
      handleChange('geminiApiKey', updatedKeys);
      setManualKeyText('');
    }
  };

  const handleLoadModels = async () => {
    if (!settings?.proxies || settings.proxies.length === 0) {
      return;
    }
    
    setIsSaving(true);
    let updatedSettings = { ...settings };
    const updatedProxies = [...settings.proxies];

    const processModelData = (data: any, currentModel: string) => {
      let modelList: string[] = [];
      
      const extractId = (m: any): string | null => {
        if (typeof m === 'string') return m;
        if (m && typeof m === 'object') {
          return m.id || m.name || m.model || m.slug || m.key || null;
        }
        return null;
      };

      if (Array.isArray(data)) {
        modelList = data.map(extractId).filter((m): m is string => !!m);
      } else if (data && Array.isArray(data.data)) {
        // OpenAI style
        modelList = data.data.map(extractId).filter((m): m is string => !!m);
      } else if (data && Array.isArray(data.models)) {
        // Google style
        modelList = data.models.map(m => {
          const id = extractId(m);
          return id ? id.replace('models/', '') : null;
        }).filter((m): m is string => !!m);
      } else if (data && data.data && Array.isArray(data.data.models)) {
        // Some other providers
        modelList = data.data.models.map(extractId).filter((m): m is string => !!m);
      } else if (data && Array.isArray(data.model_names)) {
        // Simple string array providers
        modelList = data.model_names.filter((m: any) => typeof m === 'string');
      }
      
      // Filter out duplicates and empty values
      modelList = Array.from(new Set(modelList.filter(m => m && typeof m === 'string')));

      if (modelList.length > 0) {
        // Sắp xếp theo yêu cầu: Chữ A-Z, Số từ lớn đến nhỏ
        modelList.sort((a, b) => {
          const split = (s: string) => s.match(/(\d+)|(\D+)/g) || [];
          const aParts = split(a);
          const bParts = split(b);
          
          for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
            const aP = aParts[i];
            const bP = bParts[i];
            const aIsNum = /^\d+$/.test(aP);
            const bIsNum = /^\d+$/.test(bP);
            
            if (aIsNum && bIsNum) {
              // Nếu cả hai là số, xếp từ lớn đến nhỏ (Descending)
              const diff = parseInt(bP) - parseInt(aP);
              if (diff !== 0) return diff;
            } else {
              // Nếu là chữ, xếp theo a-z (Ascending)
              const comp = aP.toLowerCase().localeCompare(bP.toLowerCase());
              if (comp !== 0) return comp;
            }
          }
          return aParts.length - bParts.length;
        });

        return {
          models: modelList,
          model: modelList.includes(currentModel) ? currentModel : modelList[0]
        };
      } else {
        throw new Error("Proxy không trả về danh sách model hợp lệ");
      }
    };

    const loadFromProxy = async (url: string, key: string, currentModel: string, type?: string) => {
      // Normalize URL: remove trailing slash
      const baseUrl = url.replace(/\/$/, '');
      const isOpenAI = type === 'openai' || type === 'openrouter' || baseUrl.toLowerCase().includes('/v1') || baseUrl.toLowerCase().includes('openrouter.ai') || baseUrl.toLowerCase().includes('groq.com');
      
      const tryFetch = async (fetchUrl: string, useGoogleKey: boolean = false) => {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };

          if (key) {
            if (isOpenAI && !useGoogleKey) {
              headers['Authorization'] = `Bearer ${key}`;
            } else {
              headers['x-goog-api-key'] = key;
            }
          }

          // For Google style, also try appending key to URL to bypass some CORS header restrictions
          const finalUrl = (!isOpenAI && key && !fetchUrl.includes('key=')) 
            ? `${fetchUrl}${fetchUrl.includes('?') ? '&' : '?'}key=${key}`
            : fetchUrl;

          const response = await fetch(finalUrl, { headers });
          if (response.ok) return await response.json();
          return null;
        } catch (e) {
          return null;
        }
      };

      try {
        // Try multiple common paths based on detected type
        const paths = isOpenAI ? [
          `${baseUrl}/models`,
          baseUrl.replace(/\/v1$/, '') + '/models',
          `${baseUrl}`
        ] : [
          `${baseUrl}/v1beta/models`,
          `${baseUrl}/v1/models`,
          `${baseUrl}/models`,
          baseUrl
        ];

        for (const path of paths) {
          // Try with standard headers
          let data = await tryFetch(path, false);
          
          // If failed and not OpenAI, try with Google key header
          if (!data && !isOpenAI) {
            data = await tryFetch(path, true);
          }

          if (data) {
            try {
              return processModelData(data, currentModel);
            } catch (e) {
              continue;
            }
          }
        }
        
        throw new Error("Không thể tải danh sách model (CORS hoặc URL sai). Bạn có thể nhập tên model thủ công.");
      } catch (err: unknown) {
        console.error("Proxy Error:", err);
        throw err;
      }
    };

    try {
      const loadPromises = updatedProxies.map(async (proxy, index) => {
        if (!proxy.url) return;
        try {
          const result = await loadFromProxy(proxy.url, proxy.key || '', proxy.model || '', proxy.type);
          updatedProxies[index] = {
            ...proxy,
            models: result.models,
            model: result.model,
            lastError: undefined
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Proxy ${index + 1}: ${message}`);
          updatedProxies[index] = {
            ...proxy,
            lastError: message
          };
        }
      });

      await Promise.all(loadPromises);
      
      updatedSettings = {
        ...updatedSettings,
        proxies: updatedProxies
      };
      
      setSettings(updatedSettings);
      await dbService.saveSettings(updatedSettings);
    } catch (err: unknown) {
      console.error("General Proxy Error:", err);
    } finally {
      setIsSaving(false);
    }
  };
  const addProxy = () => {
    if (!settings) return;
    const newProxy = {
      id: `proxy-${Date.now()}`,
      url: '',
      key: '',
      model: '',
      models: [],
      isActive: false,
      type: 'google' as const
    };
    const updatedProxies = [...settings.proxies, newProxy];
    handleMultipleChanges({
      proxies: updatedProxies,
      activeProxyId: settings.activeProxyId || newProxy.id
    });
  };

  const removeProxy = (id: string) => {
    if (!settings) return;
    const updatedProxies = settings.proxies.filter(p => p.id !== id);
    let newActiveId = settings.activeProxyId;
    if (newActiveId === id) {
      newActiveId = updatedProxies.length > 0 ? updatedProxies[0].id : undefined;
    }
    handleMultipleChanges({
      proxies: updatedProxies,
      activeProxyId: newActiveId
    });
  };

  const updateProxy = (id: string, updates: Partial<any>) => {
    if (!settings) return;
    const updatedProxies = settings.proxies.map(p => {
      if (p.id === id) {
        const newProxy = { ...p, ...updates };
        // Auto-detect type if URL changed and type not explicitly provided
        if (updates.url !== undefined && updates.type === undefined) {
          const url = updates.url.toLowerCase();
          if (url.includes('openrouter.ai')) newProxy.type = 'openrouter';
          else if (url.includes('groq.com') || url.includes('/v1')) newProxy.type = 'openai';
          else newProxy.type = 'google';
        }
        return newProxy;
      }
      return p;
    });
    handleChange('proxies', updatedProxies);
  };

  const moveProxy = (index: number, direction: 'up' | 'down') => {
    if (!settings) return;
    const newProxies = [...settings.proxies];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newProxies.length) return;
    
    [newProxies[index], newProxies[targetIndex]] = [newProxies[targetIndex], newProxies[index]];
    handleChange('proxies', newProxies);
  };

  const handleResetApiTab = () => {
    if (settings) {
      setSettings({
        ...settings,
        geminiApiKey: [],
        proxies: [],
        activeProxyId: undefined,
        useGeminiApi: true,
        proxyEnabled: false
      });
    }
  };

  const handleImportTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      // Try JSON first
      try {
        const parsed = JSON.parse(content);
        if (settings) {
            // Guess type from URL
            const url = parsed.proxyUrl || parsed.url || '';
            let type: 'google' | 'openai' | 'openrouter' = 'google';
            if (url.includes('openrouter.ai')) type = 'openrouter';
            else if (url.includes('groq.com') || url.includes('/v1')) type = 'openai';

            const newProxy = {
              id: `proxy-${Date.now()}`,
              url: url,
              key: parsed.proxyKey || parsed.key || '',
              model: parsed.proxyModel || parsed.model || '',
              models: Array.isArray(parsed.proxyModels || parsed.models) ? (parsed.proxyModels || parsed.models) : [],
              isActive: true,
              type: type
            };

            setSettings({
                ...settings,
                proxies: [...settings.proxies, newProxy],
                activeProxyId: newProxy.id,
                geminiApiKey: Array.isArray(parsed.geminiApiKey) 
                    ? [...(settings.geminiApiKey || []), ...parsed.geminiApiKey] 
                    : (parsed.geminiApiKey ? [...(settings.geminiApiKey || []), parsed.geminiApiKey] : settings.geminiApiKey)
            });
            return;
        }
      } catch {
        // Not JSON, continue to TXT parsing
      }

      // TXT Parsing logic
      const lines = content.split('\n').map(l => l.trim()).filter(l => l !== '');
      const newGeminiKeys: string[] = [...(settings?.geminiApiKey || [])];
      const newProxies: any[] = [];
      
      let currentProxy: any = null;
      const geminiKeyRegex = /^AIzaSy[A-Za-z0-9_-]{33}$/;

      lines.forEach(line => {
        // 1. Check for Gemini API Keys
        if (geminiKeyRegex.test(line)) {
          if (!newGeminiKeys.includes(line)) {
            newGeminiKeys.push(line);
          }
          return;
        }

        // 2. Check for common pipe-separated format: URL|KEY|NAME or URL|KEY
        if (line.includes('|') && line.startsWith('http')) {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 2) {
            const url = parts[0];
            let type: 'google' | 'openai' | 'openrouter' = 'google';
            if (url.includes('openrouter.ai')) type = 'openrouter';
            else if (url.includes('groq.com') || url.includes('/v1')) type = 'openai';

            newProxies.push({
              id: crypto.randomUUID(),
              url: url,
              key: parts[1],
              model: '',
              models: [],
              isActive: true,
              type: type
            });
            return;
          }
        }

        // 3. Check for multi-line format (URL followed by Key/Name)
        if (line.startsWith('http')) {
          // If we were already building a proxy, push it
          if (currentProxy && currentProxy.url && currentProxy.key) {
            newProxies.push(currentProxy);
          }
          
          let type: 'google' | 'openai' | 'openrouter' | 'custom' = 'google';
          if (line.includes('openrouter.ai')) type = 'openrouter';
          else if (line.includes('groq.com') || line.includes('/v1')) type = 'openai';

          currentProxy = {
            id: crypto.randomUUID(),
            url: line,
            key: '',
            model: '',
            models: [],
            isActive: true,
            type: type
          };
        } else if (currentProxy) {
          if (line.toLowerCase().includes('proxy_key:') || line.toLowerCase().includes('key:')) {
            currentProxy.key = line.split(':')[1]?.trim() || currentProxy.key;
          } else if (line.length > 20 && !currentProxy.key) {
            // Heuristic: long string after URL is likely the key
            currentProxy.key = line;
          }
        }
      });

      // Push the last proxy if it exists
      if (currentProxy && currentProxy.url && currentProxy.key) {
        newProxies.push(currentProxy);
      }

      if (settings) {
        const updatedSettings = { 
          ...settings, 
          geminiApiKey: newGeminiKeys,
          proxies: [...settings.proxies, ...newProxies]
        };
        
        if (newProxies.length > 0) {
          updatedSettings.activeProxyId = newProxies[newProxies.length - 1].id;
        }

        setSettings(updatedSettings);
        dbService.saveSettings(updatedSettings);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!settings) return <div className="flex items-center justify-center h-full text-slate-400">Đang tải cấu hình...</div>;

  const defaultModels = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro-preview",
    "gemini-2.5-flash-preview"
  ];
  const allAvailableModels = Array.from(new Set([
    ...defaultModels,
    ...(settings?.proxies?.flatMap(p => p.models || []) || [])
  ])).filter(Boolean);
  if (settings.aiModel && !allAvailableModels.includes(settings.aiModel)) allAvailableModels.push(settings.aiModel);
  if (settings.backgroundAiModel && !allAvailableModels.includes(settings.backgroundAiModel)) allAvailableModels.push(settings.backgroundAiModel);

  const tabs = [
    { id: 'general', label: 'Hệ thống AI', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'display', label: 'Giao diện', icon: <Monitor className="w-4 h-4" /> },
    { id: 'game', label: 'Trò chơi', icon: <Palette className="w-4 h-4" /> },
    { id: 'advanced', label: 'Nâng cao', icon: <Shield className="w-4 h-4" /> },
    { id: 'api', label: 'Mạng & API', icon: <Globe className="w-4 h-4" /> }
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 lg:p-10 overflow-hidden">
      {/* Background Layer mimicking the menu background */}
      {bgImage && (
        <>
          <div 
            className="absolute inset-0 z-0 transition-all duration-700"
            style={{ 
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: `brightness(0.35) ${bgBlur ? 'blur(8px)' : 'blur(0px)'}`
            }}
          />
          <div className="absolute inset-0 z-0 bg-stone-100/20 dark:bg-black/45 backdrop-blur-[5px]" />
        </>
      )}

      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col md:flex-row h-full w-full max-w-7xl bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 rounded-2xl md:rounded-[32px] shadow-2xl overflow-hidden backdrop-blur-xl relative z-10"
      >
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 lg:w-80 flex flex-col bg-stone-50/50 dark:bg-slate-950/50 border-b md:border-b-0 md:border-r border-stone-200 dark:border-slate-800/80 p-4 md:p-6 lg:p-8 shrink-0">
          <div className="flex items-center gap-3 mb-6 md:mb-10">
            <div className="w-10 h-10 rounded-xl bg-mystic-accent/20 border border-mystic-accent/30 flex items-center justify-center text-mystic-accent shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-100 tracking-wide">Cấu Hình</h2>
              <p className="text-[10px] text-mystic-accent/70 uppercase tracking-widest font-bold">Ark V5 System</p>
            </div>
          </div>

          {/* Desktop Tabs */}
          <div className="hidden md:flex flex-col gap-2 relative">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative z-10 ${
                  activeTab === tab.id 
                    ? 'text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeTabBg" 
                    className="absolute inset-0 bg-mystic-accent/20 border border-mystic-accent/40 rounded-xl -z-10 shadow-[0_0_15px_rgba(56,189,248,0.1)]"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <span className={activeTab === tab.id ? 'text-mystic-accent' : ''}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Mobile Tabs */}
          <div className="md:hidden flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm transition-all ${
                  activeTab === tab.id 
                    ? 'bg-mystic-accent/20 border-mystic-accent/40 text-white font-bold border' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 font-medium border'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-mystic-accent' : ''}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-auto hidden md:flex flex-col gap-3 pt-8">
            <Button 
                variant="ghost" 
                onClick={handleResetFactory}
                className="w-full text-red-400 hover:text-red-300 border border-red-900/30 hover:border-red-500/50 hover:bg-red-500/10 transition-all font-medium justify-center h-12 rounded-xl"
            >
                Khôi phục Mặc định
            </Button>
            <Button 
                variant="primary" 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full bg-mystic-accent hover:bg-mystic-accent/90 text-slate-950 font-bold border-none shadow-[0_0_20px_rgba(56,189,248,0.4)] justify-center h-12 rounded-xl"
            >
                {isSaving ? 'Đang lưu...' : (fromGame ? 'Lưu & Quay Lại' : 'Lưu & Đóng')}
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-stone-100/30 dark:bg-slate-900/30 relative">
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 lg:p-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="max-w-3xl mx-auto space-y-8 pb-32 md:pb-12"
              >
                {/* 1. HỆ THỐNG AI */}
                {activeTab === 'general' && (
                  <div className="space-y-8">
                    <div className="space-y-2 flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                          <Sparkles className="text-mystic-accent" /> Mô Hình Trí Tuệ Nhân Tạo
                        </h3>
                        <p className="text-sm text-slate-400">Tùy chỉnh "bộ não" của hệ thống cho các xử lý nội tại.</p>
                      </div>
                      <Button 
                          variant="ghost"
                          className="text-xs h-9 px-4 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 rounded-xl"
                          onClick={handleLoadModels}
                          disabled={isSaving || !settings.proxyEnabled || !settings.proxies?.length}
                      >
                          {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                          Tải Model (Proxy)
                      </Button>
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 space-y-6">
                      {/* Hybrid Mode Toggle */}
                      <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-700/50">
                        <div className="space-y-1">
                          <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400" /> Hệ thống Hybrid (Đa tác tử)
                          </label>
                          <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed pr-8">
                            Bật để cho phép sử dụng mô hình riêng biệt cho các tác vụ nền (như Tóm tắt, Trích xuất cốt truyện) giúp giảm chi phí và tăng tốc độ.
                          </p>
                        </div>
                        <button
                          onClick={() => handleChange('aiMode', settings.aiMode === 'hybrid' ? 'single' : 'hybrid')}
                          className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-300 ${settings.aiMode === 'hybrid' ? 'bg-mystic-accent' : 'bg-slate-700'}`}
                        >
                          <motion.div 
                            layout
                            className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                            animate={{ x: settings.aiMode === 'hybrid' ? 24 : 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-400" /> Mô hình Trực tiếp (Primary Agent)
                        </label>
                        <select 
                            value={settings.aiModel}
                            onChange={(e) => handleChange('aiModel', e.target.value)}
                            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3.5 text-sm text-slate-200 focus:border-mystic-accent focus:ring-1 focus:ring-mystic-accent outline-none transition-all shadow-inner"
                        >
                            {allAvailableModels.map(m => (
                                <option key={m} value={m}>{
                                  m === "gemini-3.1-pro-preview" ? "Gemini 3.1 Pro (Khuyên dùng - Logic cao)" :
                                  m === "gemini-3-flash-preview" ? "Gemini 3 Flash (Tốc độ cao)" : m
                                }</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-500 font-medium">Xử lý viết truyện và phản hồi trực tiếp dựa trên hành động.</p>
                      </div>

                      {settings.aiMode === 'hybrid' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-3 pt-2"
                        >
                          <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-sky-400" /> Mô hình Nền (Background Agent)
                          </label>
                          <select 
                              value={settings.backgroundAiModel || 'gemini-3-flash-preview'}
                              onChange={(e) => handleChange('backgroundAiModel', e.target.value)}
                              className="w-full bg-slate-900/80 border border-slate-700/70 rounded-xl p-3.5 text-sm text-slate-200 focus:border-mystic-accent focus:ring-1 focus:ring-mystic-accent outline-none transition-all shadow-inner bg-slate-800/20"
                          >
                              {allAvailableModels.map(m => (
                                  <option key={m} value={m}>{
                                    m === "gemini-3.1-pro-preview" ? "Gemini 3.1 Pro (Khuyên dùng - Logic cao)" :
                                    m === "gemini-3-flash-preview" ? "Gemini 3 Flash (Tốc độ cao)" : m
                                  }</option>
                              ))}
                          </select>
                          <p className="text-[11px] text-slate-500 font-medium">Thực hiện tính toán ẩn, tự động tóm tắt, trích xuất cốt truyện (VD: gemini-3-flash-preview, gpt-4o-mini). Nhập mã nếu dùng proxy riêng.</p>
                        </motion.div>
                      )}

                      <div className="space-y-3 pt-2">
                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                          <Database className="w-4 h-4 text-indigo-400" /> Mô hình Vector (Embedding)
                        </label>
                        <select 
                            value={settings.embeddingModel || 'gemini-embedding-001'}
                            onChange={(e) => handleChange('embeddingModel', e.target.value)}
                            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3.5 text-sm text-slate-200 focus:border-mystic-accent focus:ring-1 focus:ring-mystic-accent outline-none transition-all shadow-inner"
                        >
                            <option value="gemini-embedding-001">gemini-embedding-001 (Mặc định)</option>
                            <option value="text-embedding-005">text-embedding-005</option>
                            <option value="gemini-embedding-2">gemini-embedding-2</option>
                            <option value="text-multilingual-embedding-002">text-multilingual-embedding-002</option>
                        </select>
                        <p className="text-[11px] text-slate-500 font-medium">Dùng để mã hóa ký ức dài hạn của hệ thống.</p>
                      </div>

                      <div className="pt-6 border-t border-slate-700/50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                              <HardDrive className="w-4 h-4 text-mystic-accent" /> Bộ nhớ RAG (Retrieval-Augmented Generation)
                            </label>
                            <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed pr-8">
                              Tự động lưu trữ và truy xuất các sự kiện trong quá khứ để tránh AI bị quên cốt truyện dài hạn.
                            </p>
                          </div>
                          <button
                            onClick={() => handleChange('enableVectorMemory', !settings.enableVectorMemory)}
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-300 ${settings.enableVectorMemory ? 'bg-mystic-accent' : 'bg-slate-700'}`}
                          >
                            <motion.div 
                              layout
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                              animate={{ x: settings.enableVectorMemory ? 24 : 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. GIAO DIỆN */}
                {activeTab === 'display' && (
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Monitor className="text-mystic-accent" /> Hiển Thị & Giao Diện
                      </h3>
                      <p className="text-sm text-slate-400">Điều chỉnh trải nghiệm nhìn phù hợp với cá nhân.</p>
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-sm font-bold text-slate-300">Phông chữ hệ thống</label>
                        <select 
                            value={settings.systemFont}
                            onChange={(e) => handleChange('systemFont', e.target.value)}
                            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                        >
                            <option value="Inter">Inter (Hiện đại)</option>
                            <option value="Playfair Display">Playfair Display (Truyền thống)</option>
                            <option value="Lora">Lora (Sách truyện)</option>
                            <option value="Noto Sans Vietnamese">Noto Sans (Chuẩn Việt)</option>
                            <option value="JetBrains Mono">JetBrains Mono (Code)</option>
                        </select>
                      </div>

                      <div className="space-y-3">
                        <label className="text-sm font-bold text-slate-300">Cỡ chữ (px)</label>
                        <input 
                            type="number"
                            value={localFontSize}
                            onChange={(e) => {
                                const val = e.target.value;
                                setLocalFontSize(val);
                                const num = parseInt(val);
                                if (!isNaN(num) && num >= 1 && num <= 40) {
                                    handleChange('fontSize', num);
                                }
                            }}
                            onBlur={() => {
                                if (!localFontSize || isNaN(parseInt(localFontSize))) {
                                    setLocalFontSize(settings.fontSize.toString());
                                }
                            }}
                            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                            min="1" max="40"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 space-y-6">
                      {[
                        { id: 'theme', label: 'Chế độ Nền Sáng', desc: 'Sử dụng giao diện màu sáng thay vì tối.', state: settings.theme === 'light', toggle: () => handleChange('theme', settings.theme === 'light' ? 'dark' : 'light') },
                        { id: 'visualEffects', label: 'Hiệu ứng Hình Ảnh', desc: 'Bật các hiệu ứng particle, glow, và animations. Tắt để tối ưu hiệu suất.', state: settings.visualEffects, toggle: () => handleChange('visualEffects', !settings.visualEffects) },
                        { id: 'contentBeautify', label: 'Làm Đẹp Nội Dung', desc: 'Tự động định dạng văn bản, thêm icon và box cho hệ thống hiển thị.', state: settings.contentBeautify, toggle: () => handleChange('contentBeautify', !settings.contentBeautify) },
                        { id: 'fullScreenMode', label: 'Toàn Màn Hình', desc: 'Ẩn thanh trạng thái hệ điều hành (Chỉ tác dụng trên một số thiết bị).', state: settings.fullScreenMode, toggle: () => {
                            handleChange('fullScreenMode', !settings.fullScreenMode);
                            if (!settings.fullScreenMode) document.documentElement.requestFullscreen().catch(() => {});
                            else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                        }},
                      ].map((item, idx) => (
                        <div key={item.id} className={`flex items-start justify-between gap-4 ${idx > 0 ? 'pt-6 border-t border-slate-700/50' : ''}`}>
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-300">{item.label}</label>
                            <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed pr-8">{item.desc}</p>
                          </div>
                          <button
                            onClick={item.toggle}
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-300 ${item.state ? 'bg-mystic-accent' : 'bg-slate-700'}`}
                          >
                            <motion.div 
                              layout
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                              animate={{ x: item.state ? 24 : 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 space-y-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/50">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-300">Giao Diện Truyện</h4>
                          <p className="text-[11px] md:text-xs text-slate-400">Tùy chỉnh màu sắc cho các thành phần đặc biệt trong đoạn truyện.</p>
                        </div>
                        <button 
                            onClick={() => handleMultipleChanges({
                                storyDialogueColor: '#F97316',
                                storyThinkingColor: '#A855F7',
                                storyHighlightColor: '#FACC15',
                                storyOnomatopoeiaColor: '#EF4444'
                            })}
                            className="bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors border border-slate-600 flex items-center gap-1 shrink-0"
                        >
                          <RefreshCw className="w-3 h-3" /> Khôi Phục Mặc Định
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-300">Màu Hội Thoại 「...」</label>
                            <span className="text-xs font-mono text-slate-500">{settings.storyDialogueColor || '#F97316'}</span>
                          </div>
                          <div className="flex gap-3">
                            <input 
                              type="color" 
                              value={settings.storyDialogueColor || '#F97316'}
                              onChange={(e) => handleChange('storyDialogueColor', e.target.value)}
                              className="w-8 h-8 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 bg-slate-900/50 rounded p-2 text-sm text-slate-300">
                              Nhân vật nói: <span style={{color: settings.storyDialogueColor || '#F97316'}}>「Xin chào người lữ hành!」</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-300">Màu Suy Nghĩ ﹁...﹂</label>
                            <span className="text-xs font-mono text-slate-500">{settings.storyThinkingColor || '#A855F7'}</span>
                          </div>
                          <div className="flex gap-3">
                            <input 
                              type="color" 
                              value={settings.storyThinkingColor || '#A855F7'}
                              onChange={(e) => handleChange('storyThinkingColor', e.target.value)}
                              className="w-8 h-8 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 bg-slate-900/50 rounded p-2 text-sm text-slate-300">
                              Nhân vật nghĩ thầm: <span style={{color: settings.storyThinkingColor || '#A855F7'}}>﹁Có lẽ mình nên cẩn thận hơn.﹂</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-300">Màu Điểm Nhấn 『...』</label>
                            <span className="text-xs font-mono text-slate-500">{settings.storyHighlightColor || '#FACC15'}</span>
                          </div>
                          <div className="flex gap-3">
                            <input 
                              type="color" 
                              value={settings.storyHighlightColor || '#FACC15'}
                              onChange={(e) => handleChange('storyHighlightColor', e.target.value)}
                              className="w-8 h-8 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 bg-slate-900/50 rounded p-2 text-sm text-slate-300">
                              Bạn nhận được <span style={{color: settings.storyHighlightColor || '#FACC15'}}>『Thánh Kiếm』</span>!
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-300">Màu Từ Tượng Thanh {"{...}"}</label>
                            <span className="text-xs font-mono text-slate-500">{settings.storyOnomatopoeiaColor || '#EF4444'}</span>
                          </div>
                          <div className="flex gap-3">
                            <input 
                              type="color" 
                              value={settings.storyOnomatopoeiaColor || '#EF4444'}
                              onChange={(e) => handleChange('storyOnomatopoeiaColor', e.target.value)}
                              className="w-8 h-8 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 bg-slate-900/50 rounded p-2 text-sm text-slate-300">
                              Một tiếng nổ lớn vang lên <span style={{color: settings.storyOnomatopoeiaColor || '#EF4444'}}>{"{BÙM!}"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. TRÒ CHƠI */}
                {activeTab === 'game' && (
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Palette className="text-mystic-accent" /> Thông Số Trò Chơi
                      </h3>
                      <p className="text-sm text-slate-400">Các quy tắc tương tác với môi trường mô phỏng.</p>
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <label className="text-sm font-bold text-slate-300">Góc nhìn kể chuyện (POV)</label>
                          <select 
                              value={settings.perspective}
                              onChange={(e) => handleChange('perspective', e.target.value as NarrativePerspective)}
                              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                          >
                              <option value="third">Ngôi thứ 3 (Anh ấy/Cô ấy)</option>
                              <option value="first">Ngôi thứ 1 (Tôi)</option>
                              <option value="second">Ngôi thứ 2 (Bạn/Ngươi)</option>
                          </select>
                        </div>

                        <div className="space-y-3">
                          <label className="text-sm font-bold text-slate-300">Độ Khó Cốt Truyện</label>
                          <select 
                              value={settings.difficulty.id}
                              onChange={(e) => {
                                  const diff = DIFFICULTY_LEVELS.find(d => d.id === e.target.value);
                                  if (diff) handleChange('difficulty', diff);
                              }}
                              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                          >
                              {DIFFICULTY_LEVELS.map(d => (
                                  <option key={d.id} value={d.id}>{d.label}</option>
                              ))}
                          </select>
                        </div>
                        
                        <div className="space-y-3">
                          <label className="text-sm font-bold text-slate-300">Độ Khó Thực Tại</label>
                          <select 
                              value={settings.realityDifficulty}
                              onChange={(e) => handleChange('realityDifficulty', e.target.value)}
                              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                          >
                              <option value="Easy">Dễ</option>
                              <option value="Normal">Bình thường</option>
                              <option value="Hard">Khó</option>
                              <option value="Nightmare">Ác mộng</option>
                          </select>
                        </div>

                        <div className="space-y-3">
                          <label className="text-sm font-bold text-slate-300">Độ dài phản hồi</label>
                          <select 
                              value={settings.outputLength.id}
                              onChange={(e) => {
                                  const len = OUTPUT_LENGTHS.find(o => o.id === e.target.value);
                                  if (len) handleChange('outputLength', len);
                              }}
                              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                          >
                              {OUTPUT_LENGTHS.map(o => (
                                  <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {settings.outputLength.id === 'custom' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: 'auto' }} 
                          className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700/50"
                        >
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-400">Tối thiểu (Min words)</label>
                                <input 
                                    type="number"
                                    value={isNaN(settings.customMinWords) ? '' : settings.customMinWords}
                                    onChange={(e) => handleChange('customMinWords', parseInt(e.target.value))}
                                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-400">Tối đa (Max words)</label>
                                <input 
                                    type="number"
                                    value={isNaN(settings.customMaxWords) ? '' : settings.customMaxWords}
                                    onChange={(e) => handleChange('customMaxWords', parseInt(e.target.value))}
                                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none"
                                />
                            </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. NÂNG CAO & AN TOÀN */}
                {activeTab === 'advanced' && (
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Shield className="text-mystic-accent" /> An Toàn & Lọc Nội Dung
                      </h3>
                      <p className="text-sm text-slate-400">Kiểm soát các giới hạn AI và mã kịch bản thực thi.</p>
                    </div>

                    <SafetySettings settings={settings} onUpdate={handleGlobalUpdate} />

                    <div className="mt-8 space-y-2">
                      <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                        Advanced Rendering
                      </h3>
                      <p className="text-xs text-slate-400">Tính năng nâng cao. Có thể thực thi mã Javascript từ game.</p>
                    </div>
                    
                    <div className="bg-amber-900/10 border border-amber-900/30 rounded-2xl p-6">
                      <div className="space-y-3">
                          <label className="block text-sm font-bold text-amber-300">Chế Độ Hỗ Trợ JavaScript</label>
                          <select 
                              value={settings.javaScriptMode}
                              onChange={(e) => handleChange('javaScriptMode', e.target.value as any)}
                              className="w-full bg-slate-900/80 border border-amber-700/50 rounded-xl p-3 text-sm text-slate-200 focus:border-amber-500 outline-none"
                          >
                              <option value="disabled">Disabled - Vô hiệu hóa (Khuyên dùng)</option>
                              <option value="auto">Auto - Tự động phát hiện</option>
                              <option value="script">Script Mode - Chạy thẻ &lt;script&gt;</option>
                              <option value="code_block">Code Block Mode - Chạy code từ markdown</option>
                          </select>
                      </div>
                    </div>

                    <div className="mt-8 space-y-2">
                        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                            Global Regex Scripts
                        </h3>
                        <p className="text-xs text-slate-400">
                            Các đoạn script xử lý biểu thức chính quy (Regex) được áp dụng trên toàn bộ ứng dụng (áp dụng cho mọi nhân vật).
                        </p>
                    </div>

                    <div className="border border-slate-700/50 rounded-2xl p-0 overflow-hidden bg-slate-900/50">
                        <RegexScriptsManager 
                            presetName="Global Configuration"
                            scripts={settings.regex_scripts || []} 
                            onChange={(scripts) => handleChange('regex_scripts', scripts)} 
                            playerName="Người chơi"
                            charName="Nhân vật"
                        />
                    </div>
                  </div>
                )}

                {/* 5. API & PROXY */}
                {activeTab === 'api' && (
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Globe className="text-mystic-accent" /> Cấu Hình Mạng & API
                      </h3>
                      <p className="text-sm text-slate-400">Cấu hình kết nối đến các nhà cung cấp AI ngoài hệ thống.</p>
                    </div>

                    {/* Gemini Key Config */}
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
                      <div className="p-4 bg-slate-800/80 border-b border-slate-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-200">Google Gemini API Keys</h4>
                            <p className="text-xs text-slate-400">Sử dụng cho hệ thống lõi</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleChange('useGeminiApi', !settings.useGeminiApi)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${settings.useGeminiApi ? 'bg-mystic-accent' : 'bg-slate-700'}`}
                          >
                            <motion.div animate={{ x: settings.useGeminiApi ? 24 : 0 }} className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm" />
                          </button>
                        </div>
                      </div>

                      <div className={`p-6 space-y-6 transition-opacity duration-300 ${!settings.useGeminiApi ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                        <div className="flex flex-wrap gap-2">
                           <button 
                                onClick={async () => {
                                    try {
                                        await window.aistudio.openSelectKey();
                                    } catch (e) {
                                        console.error("Lỗi khi mở hộp thoại:", e);
                                    }
                                }}
                                className="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-lg transition-colors font-bold flex items-center gap-2"
                            >
                                <Sparkles size={14} /> Tích hợp Cloud Key
                            </button>
                            <label className="text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 border border-indigo-500/30 px-3 py-2 rounded-lg transition-colors font-bold flex items-center gap-2 cursor-pointer">
                                Nhập từ File (.txt/.json)
                                <input type="file" accept=".txt,.json" className="hidden" onChange={handleImportTxt} />
                            </label>
                            <button 
                                onClick={handleResetApiTab}
                                className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-3 py-2 rounded-lg transition-colors font-bold"
                            >
                                Reset Cấu Hình API
                            </button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="block text-sm font-bold text-slate-300">Thêm API Key Thủ Công</label>
                            <button 
                                onClick={handleAddManualKeys}
                                className="text-xs bg-mystic-accent hover:bg-mystic-accent/85 text-white border border-mystic-accent/30 px-3 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(56,189,248,0.2)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                disabled={!manualKeyText.trim()}
                            >
                                <Plus size={14} /> Thêm Key
                            </button>
                          </div>
                          <textarea 
                              placeholder="AIzaSy... (Mỗi dòng 1 key, nhập xong nhấn nút Thêm Key hoặc nhấn Ctrl+Enter)"
                              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 focus:border-mystic-accent outline-none font-mono min-h-[100px]"
                              value={manualKeyText}
                              onChange={(e) => setManualKeyText(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter' && e.ctrlKey) {
                                      e.preventDefault();
                                      handleAddManualKeys();
                                  }
                              }}
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="block text-sm font-bold text-slate-300">Danh Sách Tiêm (Luân Phiên)</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                              {settings.geminiApiKey && settings.geminiApiKey.length > 0 ? (
                                  settings.geminiApiKey.map((key, index) => (
                                      <div key={index} className="flex items-center justify-between bg-slate-900/80 border border-slate-700/50 rounded-lg p-3 group">
                                          <div className="flex items-center gap-3 overflow-hidden">
                                              <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded border border-blue-500/30">
                                                  {index + 1}
                                              </span>
                                              <span className="text-sm font-mono text-slate-400 truncate">
                                                  {key.substring(0, 8)}...{key.substring(key.length - 4)}
                                              </span>
                                          </div>
                                          <button 
                                              onClick={() => {
                                                  const updated = settings.geminiApiKey?.filter((_, i) => i !== index);
                                                  handleChange('geminiApiKey', updated || []);
                                              }}
                                              className="text-slate-500 hover:text-red-400 p-1"
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  ))
                              ) : (
                                  <div className="col-span-full text-sm text-slate-500 italic p-6 text-center border border-dashed border-slate-700 rounded-xl">
                                      Chưa có API Key nào được nạp.
                                  </div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Reverse Proxy Config */}
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
                      <div className="p-4 bg-slate-800/80 border-b border-slate-700/50 flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                            <Server className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-200">Reverse Proxy & External API</h4>
                            <p className="text-xs text-slate-400">Dành cho OpenRouter, OpenAI...</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex gap-2">
                              <Button 
                                  variant="ghost"
                                  className="text-[10px] h-8 px-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                                  onClick={addProxy}
                                  disabled={!settings.proxyEnabled}
                              >
                                  <Plus className="w-4 h-4 mr-1" /> Thêm Node
                              </Button>
                              <Button 
                                  variant="ghost"
                                  className="text-[10px] h-8 px-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                                  onClick={handleLoadModels}
                                  disabled={isSaving || !settings.proxyEnabled || !settings.proxies?.length}
                              >
                                  {isSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Globe className="w-4 h-4 mr-1" />}
                                  Fetch
                              </Button>
                          </div>
                          <button
                            onClick={() => handleChange('proxyEnabled', !settings.proxyEnabled)}
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-300 ${settings.proxyEnabled ? 'bg-mystic-accent' : 'bg-slate-700'}`}
                          >
                            <motion.div animate={{ x: settings.proxyEnabled ? 24 : 0 }} className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm" />
                          </button>
                        </div>
                      </div>

                      <div className={`p-6 space-y-6 transition-opacity duration-300 ${!settings.proxyEnabled ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                        {settings.proxies && settings.proxies.length > 0 ? (
                            settings.proxies.map((proxy, index) => (
                                <div key={proxy.id ? `${proxy.id}-${index}` : index} className={`p-5 rounded-xl border transition-all ${settings.activeProxyId === proxy.id ? 'bg-mystic-accent/5 border-mystic-accent shadow-[0_0_15px_rgba(56,189,248,0.1)]' : 'bg-slate-900/50 border-slate-700'}`}>
                                    <div className="flex justify-between items-center mb-6">
                                        <div className="flex items-center gap-4">
                                            <button 
                                                onClick={() => handleChange('activeProxyId', proxy.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${settings.activeProxyId === proxy.id ? 'bg-mystic-accent text-slate-950 shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                            >
                                                {settings.activeProxyId === proxy.id ? <CheckCircle2 className="w-4 h-4" /> : null}
                                                {settings.activeProxyId === proxy.id ? 'HOẠT ĐỘNG' : 'CHỌN DÙNG'}
                                            </button>
                                            <h4 className="text-sm font-bold text-slate-300">NODE {index + 1}</h4>
                                        </div>
                                        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
                                            <button onClick={() => moveProxy(index, 'up')} disabled={index === 0} className="p-1.5 text-slate-400 hover:text-mystic-accent hover:bg-slate-700 rounded disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                                            <button onClick={() => moveProxy(index, 'down')} disabled={index === settings.proxies!.length - 1} className="p-1.5 text-slate-400 hover:text-mystic-accent hover:bg-slate-700 rounded disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                                            <button onClick={() => removeProxy(proxy.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded ml-1"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                                        <div className="lg:col-span-12 space-y-2">
                                            <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                                                URL Endpoint
                                                <select 
                                                    value={proxy.type}
                                                    onChange={(e) => updateProxy(proxy.id, { type: e.target.value as any })}
                                                    className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-slate-300 outline-none"
                                                >
                                                    <option value="google">Google</option>
                                                    <option value="openai">OpenAI</option>
                                                    <option value="openrouter">OpenRouter</option>
                                                </select>
                                            </label>
                                            <input 
                                                type="text" 
                                                placeholder="https://..."
                                                value={proxy.url}
                                                onChange={(e) => updateProxy(proxy.id, { url: e.target.value })}
                                                className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none font-mono"
                                            />
                                        </div>
                                        
                                        <div className="lg:col-span-6 space-y-2">
                                            <label className="text-xs font-bold text-slate-400">Bearer / API Key</label>
                                            <input 
                                                type="password" 
                                                placeholder="sk-..."
                                                value={proxy.key}
                                                onChange={(e) => updateProxy(proxy.id, { key: e.target.value })}
                                                className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none font-mono"
                                            />
                                        </div>

                                        <div className="lg:col-span-6 space-y-2">
                                            <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                                                Target Model
                                                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500">{proxy.models?.length || 0} loaded</span>
                                            </label>
                                            <div className="relative">
                                                <input 
                                                    type="text"
                                                    placeholder="Chỉ định model (VD: gpt-4)"
                                                    value={proxy.model}
                                                    onChange={(e) => updateProxy(proxy.id, { model: e.target.value })}
                                                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-mystic-accent outline-none font-mono pr-12"
                                                />
                                                <select 
                                                    value=""
                                                    onChange={(e) => {
                                                      if(e.target.value) updateProxy(proxy.id, { model: e.target.value });
                                                    }}
                                                    className="absolute inset-y-0 right-0 w-10 opacity-0 cursor-pointer"
                                                >
                                                    <option value="">Lựa chọn đã fetch...</option>
                                                    {proxy.models?.map(m => (
                                                        <option key={m} value={m}>{m}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <Server className="w-16 h-16 text-slate-700 mx-auto mb-4 opacity-50" />
                                <p className="text-sm text-slate-400 font-medium mb-4">Hệ thống mạng mở rộng đang trống.</p>
                                <Button 
                                    variant="primary"
                                    onClick={addProxy}
                                    className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Khởi tạo Node Mới
                                </Button>
                            </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Mobile Bottom Action Bar */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 p-4 bg-slate-950 border-t border-slate-800 flex gap-3 z-50">
            <Button 
                variant="ghost" 
                onClick={handleResetFactory}
                className="flex-1 text-red-400 bg-red-500/10 border border-red-500/20 justify-center rounded-xl h-12 font-bold"
            >
                Reset
            </Button>
            <Button 
                variant="primary" 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[2] bg-mystic-accent text-mystic-950 font-black border-none justify-center rounded-xl h-12 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
            >
                {isSaving ? 'Đang lưu...' : (fromGame ? 'Lưu & Thoát' : 'Lưu')}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsScreen;

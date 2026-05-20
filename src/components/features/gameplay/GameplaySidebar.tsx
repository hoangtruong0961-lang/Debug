import React from 'react';
import { User, Globe, History, ImageIcon, Terminal, Zap, ToggleRight, ToggleLeft, Database, Settings, Save, LogOut, Maximize2, Minimize2, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown, RefreshCw } from 'lucide-react';
import { WorldData, AppSettings, ChatMessage } from '../../../types';
import Button from '../../ui/Button';
import TawaPresetManager from './components/TawaPresetManager';
import WorldInfoSidebar from './components/WorldInfoSidebar';
import StoryBibleSidebar from './components/StoryBibleSidebar';
import { dbService } from '../../../services/db/indexedDB';

interface GameplaySidebarProps {
    activeWorld: WorldData;
    history: ChatMessage[];
    MESSAGES_PER_PAGE: number;
    setShowCharModal: (v: boolean) => void;
    setShowGlobalModal: (v: boolean) => void;
    setShowHistoryModal: (v: boolean) => void;
    setShowImageLibrary: (v: boolean) => void;
    setShowLogConsole: (v: boolean) => void;
    setShowContextModal: (v: boolean) => void;
    setShowRegexModal: (v: boolean) => void;
    isInputCollapsed: boolean;
    setIsInputCollapsed: (v: boolean) => void;
    currentPage: number;
    setCurrentPage: (v: number) => void;
    scrollToTop: () => void;
    scrollToBottom: () => void;
    settings: AppSettings | null;
    toggleStreamResponse: () => void;
    onUpdateWorld?: (updates: Partial<WorldData>) => void;
    handleTawaConfigChange: (config: any) => void;
    isLoading: boolean;
    handleRegenerate: (idx: number) => void;
    handleGoToSettings: () => void;
    handleManualSave: () => void;
    isSaving: boolean;
    handleExit: () => void;
    AIMonitor: React.FC;
}

export const GameplaySidebar: React.FC<GameplaySidebarProps> = ({
    activeWorld, history, MESSAGES_PER_PAGE, setShowCharModal, setShowGlobalModal, setShowHistoryModal, setShowImageLibrary, setShowLogConsole, setShowContextModal, setShowRegexModal,
    isInputCollapsed, setIsInputCollapsed, currentPage, setCurrentPage, scrollToTop, scrollToBottom, settings, toggleStreamResponse, onUpdateWorld, handleTawaConfigChange,
    isLoading, handleRegenerate, handleGoToSettings, handleManualSave, isSaving, handleExit, AIMonitor
}) => {
    const totalPages = history.length <= 11 ? 1 : 1 + Math.ceil((history.length - 11) / MESSAGES_PER_PAGE);
    
    return (
        <div className="h-full flex flex-col bg-stone-300 dark:bg-mystic-900 shadow-xl">
            <div className="p-1 border-b border-stone-400 dark:border-slate-800 bg-stone-400/50 dark:bg-mystic-800/50 shrink-0 space-y-1">
                <button onClick={() => setShowCharModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                    <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-mystic-accent"><User className="text-mystic-accent" size={16}/></div>
                    <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs truncate">{activeWorld.player.name}</h3></div>
                </button>
                <button onClick={() => setShowGlobalModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                    <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-green-400"><Globe className="text-green-600 dark:text-green-400" size={16}/></div>
                    <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Thông tin toàn cục</h3></div>
                </button>
                <button onClick={() => setShowHistoryModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                    <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-blue-400"><History className="text-blue-600 dark:text-blue-400" size={16}/></div>
                    <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Lịch Sử & Load Save</h3></div>
                </button>
                <button onClick={() => setShowImageLibrary(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                    <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-mystic-accent"><ImageIcon className="text-mystic-accent" size={16}/></div>
                    <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Thư Viện Ảnh</h3></div>
                </button>
                <button onClick={() => setShowLogConsole(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                    <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-mystic-accent"><Terminal className="text-mystic-accent" size={16}/></div>
                    <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Log Console</h3></div>
                </button>
                <button onClick={() => setShowRegexModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group mt-1">
                    <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-indigo-400"><Settings className="text-indigo-600 dark:text-indigo-400" size={16}/></div>
                    <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Quản Lý Regex Scripts</h3></div>
                </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-2">
                {/* Mobile Controls Section */}
                <div className="md:hidden p-2 space-y-3 bg-stone-400/20 dark:bg-slate-800/20 rounded-lg border border-stone-400/50 dark:border-slate-700/50 mb-2">
                    <div className="text-[10px] font-bold text-stone-500 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                        <Zap size={12} /> Điều khiển nhanh
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Thử Lại Button */}
                        <Button 
                            variant="ghost" 
                            onClick={() => {
                                const lastModelIdx = [...history].reverse().findIndex(m => m.role === 'model');
                                if (lastModelIdx !== -1) {
                                    const actualIdx = history.length - 1 - lastModelIdx;
                                    handleRegenerate(actualIdx);
                                }
                            }} 
                            disabled={isLoading || !history.some(m => m.role === 'model')} 
                            className="h-10 text-[10px] font-bold uppercase tracking-tighter border border-stone-400 dark:border-slate-700 hover:border-mystic-accent/50 flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                            Thử Lại
                        </Button>

                        {/* Toggle Input Button */}
                        <button 
                            onClick={() => setIsInputCollapsed(!isInputCollapsed)}
                            className={`h-10 rounded border transition-all flex items-center justify-center gap-2 shadow-sm ${
                                isInputCollapsed 
                                ? 'bg-mystic-accent/10 border-mystic-accent/30 text-mystic-accent' 
                                : 'bg-stone-200 dark:bg-slate-800 border-stone-400 dark:border-slate-700 text-stone-500'
                            }`}
                        >
                            {isInputCollapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            <span className="text-[10px] font-bold uppercase">
                                {isInputCollapsed ? 'Mở Rộng' : 'Thu Gọn'}
                            </span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        {/* Pagination Group */}
                        <div className="flex items-center h-10 bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded overflow-hidden flex-1">
                            <button 
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                disabled={currentPage === 1}
                                className="h-full px-3 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-r border-stone-400 dark:border-slate-700"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold text-stone-600 dark:text-slate-400 leading-none">
                                    {currentPage}/{totalPages}
                                </span>
                                <span className="text-[7px] uppercase opacity-50 font-bold">Trang</span>
                            </div>
                            <button 
                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                disabled={currentPage === totalPages}
                                className="h-full px-3 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-l border-stone-400 dark:border-slate-700"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Scroll Controls */}
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={scrollToTop}
                                className="h-10 w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent transition-all"
                            >
                                <ChevronsUp size={18} />
                            </button>
                            <button 
                                onClick={scrollToBottom}
                                className="h-10 w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent transition-all"
                            >
                                <ChevronsDown size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stream Toggle */}
                <button 
                    onClick={toggleStreamResponse}
                    className="w-full p-2 flex justify-between items-center text-left hover:bg-stone-400 dark:hover:bg-slate-700/50 transition-colors bg-stone-200 dark:bg-slate-800/30 rounded border border-stone-400 dark:border-slate-700 mb-2"
                >
                    <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 dark:text-slate-300">
                         <Zap size={14} className={settings?.streamResponse ? "text-yellow-500 dark:text-yellow-400" : "text-stone-400 dark:text-slate-500"} />
                         Streaming
                    </div>
                    <div className={settings?.streamResponse ? "text-green-600 dark:text-green-400" : "text-stone-300 dark:text-slate-600"}>
                         {settings?.streamResponse ? <ToggleRight size={20}/> : <ToggleLeft size={20}/>}
                    </div>
                </button>

                <WorldInfoSidebar 
                   lorebook={activeWorld.lorebook} 
                   onUpdateLorebook={(l) => onUpdateWorld && onUpdateWorld({ lorebook: l })} 
                />
                <StoryBibleSidebar worldData={activeWorld} />
                
                <button 
                  onClick={() => setShowContextModal(true)}
                  className="w-full p-2 flex justify-between items-center text-left hover:bg-mystic-accent/10 dark:hover:bg-mystic-accent/5 transition-all bg-stone-200 dark:bg-slate-800/30 rounded border border-stone-400 dark:border-slate-700 group"
                >
                  <div className="flex items-center gap-2 text-[10px] font-bold text-mystic-accent uppercase">
                    <Database size={14} className="group-hover:scale-110 transition-transform" />
                    Cửa sổ Ngữ cảnh
                  </div>
                  <div className="text-[8px] bg-mystic-accent/20 px-1.5 py-0.5 rounded text-mystic-accent font-bold">Config</div>
                </button>

                <TawaPresetManager 
                  onConfigChange={handleTawaConfigChange} 
                  initialPreset={activeWorld?.config?.tawaPreset}
                  playerName={activeWorld.player?.name || "User"}
                  charName={activeWorld.entities?.[0]?.name || "Character"}
                />
                <AIMonitor />
            </div>
            <div className="p-1 border-t border-stone-400 dark:border-slate-800 bg-stone-200 dark:bg-mystic-900/95 flex flex-row gap-1 mt-auto shrink-0">
                <Button variant="ghost" className="flex-1 text-[12px] h-9 px-1 justify-center border border-stone-400 dark:border-slate-700 hover:bg-stone-400 dark:hover:bg-slate-800 font-mono font-bold leading-[20px]" icon={<Settings size={12}/>} onClick={handleGoToSettings} title="Cài đặt hệ thống">Cài đặt</Button>
                <Button variant="outline" className="flex-1 text-[12px] h-9 px-1 justify-center border border-stone-400 dark:border-slate-700 font-mono font-bold" icon={<Save size={12}/>} onClick={handleManualSave} isLoading={isSaving} disabled={isLoading} title="Lưu thủ công và tải file (.json)">Lưu</Button>
                <Button variant="danger" className="flex-1 text-[12px] h-9 px-1 justify-center border-red-900/30 font-mono font-bold" icon={<LogOut size={12}/>} onClick={handleExit} title="Thoát ra Menu chính">Thoát</Button>
            </div>
        </div>
    );
};

import React from 'react';
import { Search, Plus, Filter, SortDesc, BrainCircuit, Type, ChevronRight } from 'lucide-react';
import { VectorData } from '../../../../../services/db/indexedDB';

export interface EntryListViewProps {
    entries: VectorData[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    
    searchTerm: string;
    onSearchChange: (val: string) => void;
    
    viewMode: 'keyword' | 'semantic' | 'trigger_editor' | 'token_budget';
    onViewModeChange: (val: 'keyword' | 'semantic' | 'trigger_editor' | 'token_budget') => void;
    
    onSemanticSearch: () => void;
    isSearchingSemantic: boolean;
    
    activeCategoryFilter: string | null;
    onCategoryFilterChange: (cat: string | null) => void;
    
    filteredEntries: VectorData[];
    
    CATEGORY_MAP: any;
    
    renderTool?: () => React.ReactNode;
}

export const EntryListView: React.FC<EntryListViewProps> = ({
    entries, selectedId, onSelect, onAdd,
    searchTerm, onSearchChange,
    viewMode, onViewModeChange,
    onSemanticSearch, isSearchingSemantic,
    activeCategoryFilter, onCategoryFilterChange,
    filteredEntries, CATEGORY_MAP,
    renderTool
}) => {
    return (
        <div className="flex flex-col h-full bg-stone-100 dark:bg-slate-900 border-r border-stone-300 dark:border-slate-800">
            {/* Search Top */}
            <div className="p-4 border-b border-stone-300 dark:border-slate-800 shrink-0 space-y-4 bg-stone-50/50 dark:bg-mystic-900/50">
                <div className="flex bg-stone-200 dark:bg-slate-950 rounded-lg p-1 w-full border border-stone-300 dark:border-slate-800 overflow-x-auto custom-scrollbar shrink-0">
                    <button onClick={() => onViewModeChange('keyword')} className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'keyword' ? 'bg-white dark:bg-slate-800 shadow-sm text-amber-600 dark:text-amber-500' : 'text-stone-500 hover:text-stone-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        <Type size={14} className="inline mr-1" /> Keywords
                    </button>
                    <button onClick={() => onViewModeChange('semantic')} className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'semantic' ? 'bg-white dark:bg-slate-800 shadow-sm text-amber-600 dark:text-amber-500' : 'text-stone-500 hover:text-stone-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        <BrainCircuit size={14} className="inline mr-1" /> Semantic View
                    </button>
                    {/* Add Tools to the tab list on smaller screens or conditionally */}
                    <button onClick={() => onViewModeChange('trigger_editor')} className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'trigger_editor' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500' : 'text-stone-500 hover:text-stone-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        Visual Trigger
                    </button>
                    <button onClick={() => onViewModeChange('token_budget')} className={`flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'token_budget' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-500' : 'text-stone-500 hover:text-stone-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        Budget
                    </button>
                </div>

                {(viewMode === 'keyword' || viewMode === 'semantic') && (
                    <>
                        <div className="relative flex gap-2">
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                                <input 
                                type="text" 
                                placeholder={viewMode === 'semantic' ? "Mô tả điều bạn muốn tìm..." : "Tìm kiếm trong Encyclopedia..."}
                                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-800 dark:text-slate-200 outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all font-medium placeholder-stone-400 dark:placeholder-slate-600 shadow-sm"
                                value={searchTerm}
                                onChange={e => onSearchChange(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && viewMode === 'semantic') onSemanticSearch();
                                }}
                                />
                            </div>
                            {viewMode === 'semantic' && (
                                <button 
                                onClick={onSemanticSearch}
                                disabled={isSearchingSemantic || !searchTerm.trim()}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center shrink-0"
                                >
                                    {isSearchingSemantic ? "Đang quét..." : "Tìm"}
                                </button>
                            )}
                        </div>

                        <div className="flex gap-2 pb-1 overflow-x-auto custom-scrollbar no-scrollbar-on-mobile items-center">
                            <button 
                                onClick={() => onCategoryFilterChange(null)}
                                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors border ${activeCategoryFilter === null ? 'bg-stone-800 text-white border-stone-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200' : 'bg-transparent text-stone-500 border-stone-300 dark:border-slate-700 hover:bg-stone-200 dark:hover:bg-slate-800'}`}
                            >
                                Tất cả
                            </button>
                            {Object.entries(CATEGORY_MAP).map(([catValue, catInfo]: any) => (
                                <button 
                                    key={catValue}
                                    onClick={() => onCategoryFilterChange(catValue)}
                                    className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${
                                        activeCategoryFilter === catValue 
                                        ? catInfo.color 
                                        : 'bg-transparent text-stone-500 border-stone-300 dark:border-slate-700 hover:bg-stone-200 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {React.createElement(catInfo.icon, { size: 12 })} {catInfo.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Content area: either the list of entries or the rendered tool */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {(viewMode === 'keyword' || viewMode === 'semantic') ? (
                    <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between px-2 py-1 mb-2">
                            <span className="text-xs font-black text-stone-500 dark:text-slate-400 tracking-widest uppercase">
                                Danh sách ({filteredEntries.length})
                            </span>
                            <button onClick={onAdd} className="text-stone-500 hover:text-amber-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-800 p-1.5 rounded-lg transition-colors" title="Thêm mục mới">
                                <Plus size={16} />
                            </button>
                        </div>

                        {filteredEntries.length === 0 ? (
                            <div className="text-center text-stone-400 dark:text-slate-600 mt-10 text-sm font-medium flex flex-col items-center gap-3">
                                <Search size={32} className="opacity-50" />
                                {searchTerm ? "Không có dữ kiện." : "Chưa có dữ kiện."}
                            </div>
                        ) : (
                            filteredEntries.map(entry => {
                                const isSelected = selectedId === entry.id;
                                const catInfo = CATEGORY_MAP[entry.category || 'world'];
                                return (
                                    <button
                                        key={entry.id}
                                        onClick={() => onSelect(entry.id)}
                                        className={`w-full text-left p-3.5 rounded-xl border transition-all relative overflow-hidden group ${
                                            isSelected 
                                            ? 'bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-700/50 shadow-sm' 
                                            : 'bg-white/50 dark:bg-slate-900/50 border-stone-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>}
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="font-bold text-stone-900 dark:text-white capitalize truncate pr-2 flex items-center gap-2">
                                                {catInfo && <catInfo.icon size={14} className={catInfo.color.split(' ')[0]} />}
                                                <span className={entry.isEnabled === false ? 'opacity-50 line-through' : ''}>{entry.keyword || 'Không tên'}</span>
                                                {entry.triggerMode === 'always' && <span className="px-1 text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 border border-amber-300 dark:border-amber-700/50 rounded font-black uppercase">Auto</span>}
                                                {entry.isSticky && <span className="px-1 text-[9px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-500 border border-sky-300 dark:border-sky-700/50 rounded font-black uppercase">Sticky</span>}
                                            </div>
                                            <ChevronRight size={14} className={`transition-transform shrink-0 ${isSelected ? 'text-amber-500 translate-x-1' : 'text-stone-300 dark:text-slate-600 opacity-0 group-hover:opacity-100'}`} />
                                        </div>
                                        <div className="text-[11px] text-stone-500 dark:text-slate-400 line-clamp-2 leading-relaxed opacity-90 mb-2 font-medium pr-4">
                                            {entry.category === 'character' ? (() => {
                                                try {
                                                    const cData = JSON.parse(entry.text || "{}");
                                                    const previewArr = [];
                                                    if (cData.name) previewArr.push(cData.name);
                                                    if (cData.gender || cData.age) previewArr.push(`${cData.gender || '?'}, ${cData.age || '?'}`);
                                                    if (cData.appearance) previewArr.push(cData.appearance);
                                                    if (cData.narrativeRole) previewArr.push(cData.narrativeRole);
                                                    
                                                    const previewString = previewArr.join(' - ');
                                                    return previewString 
                                                        ? previewString.replace(/[#*`~>]/g, '')
                                                        : "Hồ sơ nhân vật (Trống)";
                                                } catch {
                                                    return (entry.text || '').replace(/[#*`~>]/g, '');
                                                }
                                            })() : (entry.text || '').replace(/[#*`~>]/g, '')}
                                        </div>
                                        <div className="text-[9px] text-stone-400 dark:text-slate-500 font-mono flex items-center gap-2 font-bold uppercase tracking-wider">
                                             {new Date(entry.timestamp).toLocaleDateString()}
                                             <span>•</span>
                                             <span className={isSelected ? 'text-amber-600 dark:text-amber-500' : ''}>~{Math.round((entry.text?.length || 0)/4)} tk</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div className="h-full p-2 relative">
                        {renderTool?.()}
                    </div>
                )}
            </div>
        </div>
    );
};

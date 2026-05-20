import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, X, ChevronDown, Clock } from 'lucide-react';
import { LsrTableDefinition } from '../../../../services/lsr/LsrParser';
import { useResponsive } from '../../../../hooks/useResponsive';

interface LsrDatabaseModalProps {
    show: boolean;
    onClose: () => void;
    lsrTables: LsrTableDefinition[];
    lsrRuntimeData: Record<string, any[]>;
    activeLsrTableId: string | null;
    setActiveLsrTableId: (id: string) => void;
    lsrViewMode: 'table' | 'timeline';
    setLsrViewMode: (mode: 'table' | 'timeline') => void;
}

const LsrDatabaseModal: React.FC<LsrDatabaseModalProps> = ({
    show,
    onClose,
    lsrTables,
    lsrRuntimeData,
    activeLsrTableId,
    setActiveLsrTableId,
    lsrViewMode,
    setLsrViewMode
}) => {
    const { isMobile } = useResponsive();

    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full h-full rounded-none shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="p-2 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-slate-900/50">
                            <h2 className="text-[12px] leading-[22px] font-bold text-green-600 dark:text-green-400 flex items-center gap-2">
                                <Database size={20}/> LSR Database (Trạng thái thế giới)
                            </h2>
                            <button onClick={onClose} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-2 overflow-y-auto custom-scrollbar space-y-2 bg-stone-200 dark:bg-mystic-900">
                            {lsrTables.length === 0 ? (
                                <div className="text-center text-stone-400 dark:text-slate-500 py-10">
                                    Không tìm thấy dữ liệu cấu trúc bảng LSR.
                                </div>
                            ) : (
                                <>
                                    {/* Tab Navigation / Dropdown */}
                                    <div className="mb-4">
                                        {isMobile ? (
                                            <div className="relative">
                                                <select 
                                                    value={activeLsrTableId || ''} 
                                                    onChange={(e) => setActiveLsrTableId(e.target.value)}
                                                    className="w-full p-2 bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded-lg text-sm text-stone-800 dark:text-slate-200 outline-none appearance-none"
                                                >
                                                    {lsrTables.map((table: any) => (
                                                        <option key={table.id} value={table.id}>{table.name}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500">
                                                    <ChevronDown size={16} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-2 border-b border-stone-400 dark:border-slate-800 pb-2">
                                                {lsrTables.map((table: any) => (
                                                    <button
                                                        key={table.id}
                                                        onClick={() => {
                                                            setActiveLsrTableId(table.id);
                                                            if (table.id === '10' || table.id === '4') {
                                                                setLsrViewMode('timeline');
                                                            } else {
                                                                setLsrViewMode('table');
                                                            }
                                                        }}
                                                        className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all ${
                                                            activeLsrTableId === table.id
                                                            ? 'bg-mystic-accent text-mystic-950 shadow-[0_-2px_10px_rgba(56,189,248,0.3)]'
                                                            : 'bg-stone-300 dark:bg-slate-800 text-stone-500 dark:text-slate-400 hover:bg-stone-400 dark:hover:bg-slate-700'
                                                        }`}
                                                    >
                                                        {table.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Active Table Content */}
                                    {lsrTables.filter((t: any) => t.id === activeLsrTableId).map((table: any) => {
                                        const currentRows = lsrRuntimeData[table.id] || [];
                                        return (
                                            <div key={table.id} className="space-y-1 animate-in fade-in duration-300">
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="bg-stone-300 dark:bg-slate-800 text-stone-500 dark:text-slate-400 text-xs font-bold px-1 py-0.5 rounded">#{table.id}</span>
                                                        <h3 className="text-[12px] leading-[18px] font-bold text-stone-800 dark:text-slate-200">{table.name}</h3>
                                                    </div>
                                                    <div className="flex bg-stone-300 dark:bg-slate-800 p-0.5 rounded-lg border border-stone-400 dark:border-slate-700 select-none">
                                                        <button 
                                                            onClick={() => setLsrViewMode('table')}
                                                            className={`px-2 py-1 outline-none text-xs font-medium rounded transition-all ${lsrViewMode === 'table' ? 'bg-mystic-accent text-mystic-950 shadow-sm' : 'text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200'}`}
                                                        >
                                                            Bảng
                                                        </button>
                                                        <button 
                                                            onClick={() => setLsrViewMode('timeline')}
                                                            className={`px-2 py-1 outline-none text-xs font-medium rounded transition-all ${lsrViewMode === 'timeline' ? 'bg-mystic-accent text-mystic-950 shadow-sm' : 'text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200'}`}
                                                        >
                                                            Timeline
                                                        </button>
                                                    </div>
                                                </div>

                                                {lsrViewMode === 'timeline' ? (
                                                    <div className="relative pl-4 border-l-2 border-stone-400 dark:border-slate-700 space-y-4 py-2 mt-2 ml-2">
                                                        {currentRows.length === 0 ? (
                                                            <div className="text-sm italic text-stone-500 dark:text-slate-500">(Chưa có sự kiện)</div>
                                                        ) : (
                                                            currentRows.map((row: any, rIdx: number) => {
                                                                const timeVal = row["0"] || "Unknown Time";
                                                                let secBadgeVal = "";
                                                                let titleVal = "";
                                                                let descVal = "";
                                                                
                                                                if (table.columns.length >= 4) {
                                                                    secBadgeVal = row["1"] || "";
                                                                    titleVal = row["2"] || "";
                                                                    descVal = row["3"] || "";
                                                                    for (let i = 4; i < table.columns.length; i++) {
                                                                        if (row[i.toString()]) {
                                                                            descVal += `\n[${table.columns[i]}]: ${row[i.toString()]}`;
                                                                        }
                                                                    }
                                                                } else if (table.columns.length === 3) {
                                                                    titleVal = row["1"] || "";
                                                                    descVal = row["2"] || "";
                                                                } else {
                                                                    titleVal = row["1"] || "";
                                                                    descVal = "";
                                                                }

                                                                return (
                                                                    <div key={rIdx} className="relative group w-full">
                                                                        <div className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-stone-200 dark:bg-mystic-900 border-2 border-mystic-accent z-10 shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                                                                        <div className="bg-stone-100 dark:bg-slate-800/60 p-3 rounded-lg border border-stone-300 dark:border-slate-700 shadow-sm group-hover:border-mystic-accent/50 group-hover:shadow-[0_4px_10px_rgba(0,0,0,0.1)] dark:group-hover:shadow-[0_4px_10px_rgba(56,189,248,0.05)] transition-all">
                                                                            <div className="flex flex-col sm:flex-row gap-2 mb-2 sm:items-center">
                                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-900 text-xs font-mono font-bold text-mystic-accent border border-slate-300 dark:border-slate-700 w-fit shrink-0">
                                                                                    <Clock size={12}/>
                                                                                    {timeVal}
                                                                                </span>
                                                                                {secBadgeVal && (
                                                                                    <span className="text-xs font-medium text-stone-500 dark:text-slate-400 px-2 py-0.5 rounded-full bg-stone-300/50 dark:bg-slate-800/80 border border-stone-300 dark:border-slate-700 w-fit shrink-0">
                                                                                        {table.columns[1]}: {secBadgeVal}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {titleVal && (
                                                                                <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200 mb-1.5 leading-snug">
                                                                                    {titleVal}
                                                                                </h4>
                                                                            )}
                                                                            {descVal && (
                                                                                <p className="text-[13px] text-stone-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                                                                                    {descVal}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="overflow-x-auto rounded-lg border border-stone-400 dark:border-slate-700 shadow-sm">
                                                        <table className="w-full text-sm text-left text-stone-500 dark:text-slate-400">
                                                            <thead className="text-xs text-stone-700 dark:text-slate-300 uppercase bg-stone-300 dark:bg-slate-800">
                                                                <tr>
                                                                    {table.columns.map((col: string, idx: number) => (
                                                                        <th key={idx} scope="col" className="px-1 py-1 whitespace-nowrap border-r border-stone-400 dark:border-slate-700 last:border-r-0">
                                                                            {col}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {currentRows.length === 0 ? (
                                                                    <tr className="bg-stone-200 dark:bg-slate-900/50 border-b border-stone-400 dark:border-slate-800 hover:bg-stone-300 dark:hover:bg-slate-800/30 transition-colors">
                                                                        <td colSpan={table.columns.length} className="px-1 py-1 border-r border-stone-400 dark:border-slate-800 last:border-r-0 italic text-stone-400 dark:text-slate-600 text-center">
                                                                            (Chưa có dữ liệu)
                                                                        </td>
                                                                    </tr>
                                                                ) : (
                                                                    currentRows.map((row: any, rIdx: number) => (
                                                                        <tr key={rIdx} className="bg-stone-200 dark:bg-slate-900/50 border-b border-stone-400 dark:border-slate-800 hover:bg-stone-300 dark:hover:bg-slate-800/30 transition-colors">
                                                                            {table.columns.map((_: any, cIdx: number) => (
                                                                                <td key={cIdx} className="px-1 py-1 border-r border-stone-400 dark:border-slate-800 last:border-r-0 text-stone-700 dark:text-slate-300">
                                                                                    {row[cIdx.toString()] || "-"}
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default LsrDatabaseModal;

import React from 'react';
import { VectorData } from '../../../../../services/db/indexedDB';
import { Database, Filter, Search, ShieldAlert, Cpu, CheckCircle } from 'lucide-react';

interface ScribeMonitorProps {
  entries: VectorData[];
}

export const ScribeMonitor: React.FC<ScribeMonitorProps> = ({ entries }) => {
  const histories = entries.flatMap(e => (e.updateHistory || []).filter(h => !h.content.startsWith('__METADATA__')).map(h => ({
      ...h,
      keyword: e.keyword,
      category: e.category,
      entryId: e.id,
  }))).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50); // top 50 recent events

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900/50 flex items-center justify-between">
        <h3 className="text-[11px] font-black uppercase text-stone-600 dark:text-slate-400 flex items-center gap-1.5 tracking-widest">
          <Cpu size={14} className="text-amber-500" />
          Scribe Monitor
        </h3>
        <div className="flex gap-2">
            <button className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-500 font-bold rounded transition-colors hidden sm:block">Active</button>
        </div>
      </div>
      <div className="p-3 text-[11px] overflow-y-auto flex-1 font-mono text-stone-600 dark:text-slate-400 space-y-2 custom-scrollbar">
        {histories.length > 0 ? histories.map((h, i) => (
             <div key={i} className="flex items-start gap-2 bg-stone-50 dark:bg-slate-800/30 p-2 rounded border border-stone-100 dark:border-slate-700/50">
             <span className="text-stone-400 dark:text-slate-500 font-bold whitespace-nowrap mt-0.5">[{new Date(h.timestamp).toLocaleTimeString()}]</span>
             <div className="flex flex-col">
                 <span className="text-amber-600 dark:text-amber-500 font-bold">{h.keyword || 'Không tên'}</span>
                 <span className="text-stone-700 dark:text-slate-300 font-medium leading-relaxed line-clamp-2">
                     {h.content}
                 </span>
             </div>
         </div>
        )) : (
            <div className="flex flex-col items-center justify-center h-full opacity-60">
                <CheckCircle size={24} className="mb-2 text-stone-400" />
                <span>Chưa có hoạt động Scribe nào.</span>
            </div>
        )}
      </div>
    </div>
  );
};

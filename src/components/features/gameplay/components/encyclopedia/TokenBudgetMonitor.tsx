import React from 'react';
import { VectorData } from '../../../../../services/db/indexedDB';
import { BarChart3 } from 'lucide-react';
import { useAppStore } from '../../../../../store/appStore';

interface TokenBudgetMonitorProps {
  entries: VectorData[];
}

export const TokenBudgetMonitor: React.FC<TokenBudgetMonitorProps> = ({ entries }) => {
  const { activeWorld } = useAppStore();
  
  // Align with gameplay service (maxContextTokens represents the overall token budget)
  const totalBudget = activeWorld?.config?.contextConfig?.maxContextTokens || 60000;
  
  // Rough token estimation (3.5 chars per token for Latin/Vietnamese to align with service.ts)
  const estimateTokens = (text: string) => Math.ceil((text || '').length / 3.5);

  const characterCardStr = JSON.stringify(activeWorld?.player || {}) + JSON.stringify(activeWorld?.entities || {});
  const characterCard = estimateTokens(characterCardStr);

  const conversationStr = JSON.stringify(activeWorld?.savedState?.history || []);
  const conversation = estimateTokens(conversationStr);

  const alwaysEntries = entries
    .filter(e => e.isEnabled !== false && (e.triggerMode === 'always' || e.isSticky))
    .reduce((acc, e) => acc + estimateTokens(e.text || ''), 0);

  const triggeredPool = entries
    .filter(e => e.isEnabled !== false && e.triggerMode !== 'always' && !e.isSticky)
    .reduce((acc, e) => acc + estimateTokens(e.text || ''), 0);

  // We only count what is currently guaranteed to be injected:
  const totalUsed = characterCard + alwaysEntries + conversation;
  
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900/50 flex items-center justify-between">
        <h3 className="text-[11px] font-black uppercase text-stone-600 dark:text-slate-400 flex items-center gap-1.5 tracking-widest">
          <BarChart3 size={14} className="text-emerald-500" />
          Token Budget (Est)
        </h3>
        <span className="text-[10px] font-mono text-stone-500 dark:text-slate-500 font-bold bg-stone-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">{totalUsed.toLocaleString()} / {totalBudget.toLocaleString()}</span>
      </div>
      <div className="p-4 text-xs flex flex-col justify-center flex-1 gap-4">
        <div className="w-full h-3 bg-stone-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner border border-stone-200 dark:border-slate-700 relative">
            <div style={{ width: `${Math.min((characterCard / totalBudget) * 100, 100)}%` }} className="bg-pink-500 h-full border-r border-pink-600/30" title="Character & Entities" />
            <div style={{ width: `${Math.min((alwaysEntries / totalBudget) * 100, 100)}%` }} className="bg-amber-500 h-full border-r border-amber-600/30" title="Always Entries" />
            <div style={{ width: `${Math.min((conversation / totalBudget) * 100, 100)}%` }} className="bg-blue-500 h-full" title="Conversation" />
        </div>
        <div className="flex flex-col gap-2 text-[10px] font-mono text-stone-600 dark:text-slate-400 font-medium overflow-y-auto pr-1">
            <div className="flex justify-between items-center bg-stone-50 dark:bg-slate-800/50 px-2 py-1.5 rounded"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full min-w-[8px] bg-pink-500"></span> Entities & Player</span> <span className="font-bold">{characterCard.toLocaleString()}</span></div>
            <div className="flex justify-between items-center bg-stone-50 dark:bg-slate-800/50 px-2 py-1.5 rounded"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full min-w-[8px] bg-amber-500"></span> Always Active</span> <span className="font-bold">{alwaysEntries.toLocaleString()}</span></div>
            <div className="flex justify-between items-center bg-stone-50 dark:bg-slate-800/50 px-2 py-1.5 rounded"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full min-w-[8px] bg-blue-500"></span> Chat Context</span> <span className="font-bold">{conversation.toLocaleString()}</span></div>
            <div className="flex justify-between items-center bg-stone-50 dark:bg-slate-800/50 px-2 py-1.5 rounded border border-dashed border-stone-300 dark:border-slate-700" title="This pool is only injected dynamically when triggered.">
               <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full min-w-[8px] bg-stone-300 dark:bg-slate-600"></span> Potential Trigger Pool</span> 
               <span className="font-bold text-stone-500">{triggeredPool.toLocaleString()}</span>
            </div>
        </div>
      </div>
    </div>
  );
};

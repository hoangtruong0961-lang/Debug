import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Play, Info, BookOpen, Settings, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import Button from '../../ui/Button';
import { StoredCharacter } from '../../../types';
import MarkdownRenderer from '../../common/MarkdownRenderer';

interface CharacterDetailPanelProps {
  character: StoredCharacter;
  onClose: () => void;
  onStart: (alternateGreetingIndex?: number) => void;
}

export const CharacterDetailPanel: React.FC<CharacterDetailPanelProps> = ({ character, onClose, onStart }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'lorebook' | 'regex'>('info');
  const [greetingIndex, setGreetingIndex] = useState(-1);

  const dataBlock = (character.spec === 'chara_card_v2') ? character.rawData.data : character.rawData;
  const alternateGreetings = dataBlock.alternate_greetings || [];
  
  const characterBook = character.rawData?.character_book || dataBlock.character_book;
  const lorebookSize = characterBook?.entries?.length || 0;
  
  let regexScripts: any[] = [];
  if (character.rawData?.regex_scripts) regexScripts = character.rawData.regex_scripts;
  else if (dataBlock.extensions?.regex_scripts) regexScripts = dataBlock.extensions.regex_scripts;
  else if (characterBook?.extensions?.regex_scripts) regexScripts = characterBook.extensions.regex_scripts;

  const currentGreeting = greetingIndex === -1 ? dataBlock.first_mes : alternateGreetings[greetingIndex];

  return (
    <div className="flex flex-col h-full">
      {/* Header Image */}
      <div className="relative h-64 flex-none bg-slate-950">
        {character.avatarUrl ? (
          <img src={character.avatarUrl} alt={character.name} className="w-full h-full object-cover opacity-60" />
        ) : (
          <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-700">NO IMAGE</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-slate-900/40" />
        <Button 
          variant="ghost" 
          icon={<X size={20} />} 
          onClick={onClose} 
          className="absolute top-4 left-4 rounded-full w-10 h-10 p-0 flex items-center justify-center bg-black/50 text-white hover:bg-black/80 backdrop-blur-md" 
        />
        <div className="absolute bottom-4 left-4 right-4">
          <h2 className="text-2xl font-black text-white drop-shadow-md leading-tight">{character.name}</h2>
          {character.spec && (
             <div className="flex items-center gap-2 mt-2">
                 <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {character.spec}
                 </span>
                 {character.tags && character.tags.length > 0 && (
                     <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-slate-800 text-slate-400">
                         {character.tags.length} Tags
                     </span>
                 )}
             </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 border-b border-slate-800/60 bg-slate-900/50 flex-none overflow-x-auto no-scrollbar">
        {[
          { id: 'info', icon: <Info size={14} />, label: 'THÔNG TIN' },
          { id: 'lorebook', icon: <BookOpen size={14} />, label: `LOREBOOK (${lorebookSize})` },
          { id: 'regex', icon: <Settings size={14} />, label: `REGEX (${regexScripts.length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold tracking-wider uppercase border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? 'border-indigo-400 text-indigo-400' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900">
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Mô tả</h3>
              <div className="text-sm text-slate-300 leading-relaxed bg-slate-950/30 p-3 rounded-xl border border-slate-800/50">
                <MarkdownRenderer content={character.description || 'Không có mô tả.'} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Greeting Message</h3>
                {alternateGreetings.length > 0 && (
                  <div className="flex items-center gap-2 bg-slate-800/50 rounded-full px-2 py-1">
                    <button 
                      onClick={() => setGreetingIndex(prev => prev > -1 ? prev - 1 : alternateGreetings.length - 1)}
                      className="text-slate-400 hover:text-white p-0.5"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-[10px] font-mono text-slate-300">
                      {greetingIndex === -1 ? 'Main' : `Alt ${greetingIndex + 1}`}
                    </span>
                    <button 
                      onClick={() => setGreetingIndex(prev => prev < alternateGreetings.length - 1 ? prev + 1 : -1)}
                      className="text-slate-400 hover:text-white p-0.5"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="text-sm text-slate-300 leading-relaxed bg-slate-950/30 p-3 rounded-xl border border-slate-800/50 max-h-64 overflow-y-auto custom-scrollbar">
                <MarkdownRenderer content={currentGreeting || 'Trống.'} />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tính cách (Personality)</h3>
              <div className="text-sm text-slate-300 leading-relaxed bg-slate-950/30 p-3 rounded-xl border border-slate-800/50 max-h-40 overflow-y-auto custom-scrollbar">
                 <MarkdownRenderer content={dataBlock.personality || 'Trống.'} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lorebook' && (
           <div className="text-sm text-slate-400 space-y-4">
              {lorebookSize > 0 ? (
                 <>
                   <p className="mb-4">Thẻ này có chứa <strong>{lorebookSize}</strong> mục Lorebook (World Info). Dữ liệu này sẽ tự động được sử dụng trong game.</p>
                   {characterBook.entries.map((entry: any, i: number) => (
                     <div key={i} className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                       <h4 className="font-bold text-slate-200 mb-1">{entry.name || `Entry ${i + 1}`}</h4>
                       <p className="text-[10px] text-indigo-300 font-mono mb-2">Keys: {(entry.keys || []).join(', ')}</p>
                       <div className="text-sm text-slate-400 line-clamp-3">
                         {entry.content}
                       </div>
                     </div>
                   ))}
                 </>
              ) : (
                 <p>Thẻ này không có Lorebook đi kèm.</p>
              )}
           </div>
        )}

        {activeTab === 'regex' && (
           <div className="text-sm text-slate-400 space-y-4">
              {regexScripts.length > 0 ? (
                 <>
                   <p className="mb-4">Thẻ này có chứa <strong>{regexScripts.length}</strong> Regex Scripts. Chúng sẽ được áp dụng ưu tiên trong phiên chơi.</p>
                   {regexScripts.map((script: any, i: number) => (
                     <div key={i} className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 font-mono text-[10px] break-all">
                       <div className="flex justify-between items-center mb-1">
                         <span className="text-amber-400 font-bold">{script.scriptName || `Script ${i + 1}`}</span>
                         <span className={script.disabled ? "text-red-400" : "text-emerald-400"}>
                           {script.disabled ? "Disabled" : "Enabled"}
                         </span>
                       </div>
                       <p className="text-slate-300 mt-1">Regex: <span className="text-indigo-300">{script.regex}</span></p>
                       <p className="text-slate-300 mt-1">Thay thế: <span className="text-emerald-300">{script.replacementString || script.replacementText || ""}</span></p>
                     </div>
                   ))}
                 </>
              ) : (
                 <p>Thẻ này không có Regex Scripts đi kèm.</p>
              )}
           </div>
        )}
      </div>

      {/* Footer / Actions */}
      <div className="flex-none p-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
         {character.lastPlayedAt && (
            <div className="text-[10px] flex items-center justify-center gap-1 text-slate-500 uppercase tracking-widest">
               <Calendar size={12} /> Lần chơi cuối: {new Date(character.lastPlayedAt).toLocaleString('vi-VN')}
            </div>
         )}
         <Button 
            variant="primary" 
            size="lg" 
            icon={<Play size={18} />} 
            onClick={() => onStart(greetingIndex)}
            className="w-full font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20"
         >
            Bắt Đầu Chơi
         </Button>
      </div>
    </div>
  );
};

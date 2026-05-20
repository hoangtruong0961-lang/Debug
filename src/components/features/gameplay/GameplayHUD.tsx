import React from 'react';
import { Menu, Clock } from 'lucide-react';
import { WorldData, GameTime } from '../../../types';
import { formatGameTime } from '../../../utils/timeUtils';
import { DynamicHUD } from './components/DynamicHUD';

interface GameplayHUDProps {
    activeWorld?: WorldData | null;
    turnCount: number;
    gameTime: GameTime;
    setShowMobileSidebar: (v: boolean) => void;
}

export const GameplayHUD: React.FC<GameplayHUDProps> = ({ activeWorld, turnCount, gameTime, setShowMobileSidebar }) => {
    return (
        <>
            <header className="h-14 md:h-16 shrink-0 bg-stone-200 dark:bg-mystic-900 border-b border-stone-400 dark:border-slate-800 flex items-center justify-center relative px-4 z-30 shadow-sm">
                 <button 
                    className="md:hidden absolute left-4 text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white"
                    onClick={() => setShowMobileSidebar(true)}
                 >
                     <Menu size={20} />
                 </button>
                 <div className="flex flex-col items-center">
                     <h1 className="font-bold text-stone-800 dark:text-slate-200 text-xs md:text-sm tracking-wide leading-tight font-mono truncate max-w-[180px] md:max-w-none">
                         {activeWorld?.world?.worldName || "Thế giới vô danh"}
                     </h1>
                     <div className="mt-0.5 flex items-center gap-2">

                        <span className="text-[9px] md:text-[10px] font-mono font-bold text-mystic-accent bg-mystic-accent/10 px-1.5 md:px-2 py-0.5 rounded-full border border-mystic-accent/20 leading-none">
                            Lượt: {turnCount}
                        </span>
                        <span className="text-[9px] md:text-[10px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 md:px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 leading-none">
                            <Clock size={8} className="md:size-2.5" />
                            {formatGameTime(gameTime)}
                        </span>
                     </div>
                 </div>
            </header>

            <DynamicHUD worldData={activeWorld} gameTime={gameTime} turnCount={turnCount} />
        </>
    );
};

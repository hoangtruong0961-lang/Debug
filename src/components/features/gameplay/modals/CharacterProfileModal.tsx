import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, X, Edit2 } from 'lucide-react';
import MarkdownRenderer from '../../../common/MarkdownRenderer';
import { WorldData } from '../../../../types';

interface CharacterProfileModalProps {
    show: boolean;
    onClose: () => void;
    activeWorld: WorldData;
    onSelectAvatar: () => void;
}

const CharacterProfileModal: React.FC<CharacterProfileModalProps> = ({ 
    show, 
    onClose, 
    activeWorld, 
    onSelectAvatar 
}) => {
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
                            <h2 className="text-lg font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2">
                                <User size={20} className="text-mystic-accent"/> Hồ Sơ Nhân Vật
                            </h2>
                            <button onClick={onClose} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-2 overflow-y-auto custom-scrollbar space-y-2 bg-stone-200 dark:bg-mystic-900">
                            <div className="flex items-start gap-2 mb-2">
                                <button 
                                    onClick={onSelectAvatar}
                                    className="w-20 h-20 rounded-full bg-stone-300 dark:bg-slate-800 border-2 border-mystic-accent flex items-center justify-center shrink-0 shadow-lg overflow-hidden group relative"
                                >
                                    {activeWorld.player.avatar ? (
                                        <img src={activeWorld.player.avatar} alt={activeWorld.player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <User size={40} className="text-mystic-accent" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Edit2 size={20} className="text-white" />
                                    </div>
                                </button>
                                <div>
                                    <h3 className="text-2xl font-bold text-stone-900 dark:text-white mb-1 font-mono text-[12px]">{activeWorld.player.name}</h3>
                                    <div className="flex gap-2 text-sm text-stone-500 dark:text-slate-400">
                                        <span className="bg-stone-300 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">{activeWorld.player.gender}</span>
                                        <span className="bg-stone-300 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">{activeWorld.player.age} tuổi</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-1">
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Ngoại hình</h4>
                                    <MarkdownRenderer 
                                        className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                        content={activeWorld.player.appearance || "Chưa có mô tả ngoại hình."}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Tính cách</h4>
                                    <MarkdownRenderer 
                                        className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                        content={activeWorld.player.personality || "Chưa có mô tả tính cách."}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Tiểu sử & Xuất thân</h4>
                                    <MarkdownRenderer 
                                        className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                        content={activeWorld.player.background || "Chưa có tiểu sử."}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Kỹ năng</h4>
                                        <MarkdownRenderer 
                                            className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed h-full"
                                            content={activeWorld.player.skills || "Không có kỹ năng đặc biệt."}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Mục tiêu</h4>
                                        <MarkdownRenderer 
                                            className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed h-full"
                                            content={activeWorld.player.goal || "Chưa xác định mục tiêu."}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default CharacterProfileModal;

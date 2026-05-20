import React, { useMemo, useState } from 'react';
import { WorldData, GameTime } from '../../../../types';
import { 
    MapPin, Heart, User, Sun, Moon, Backpack, Shirt, 
    ChevronDown, ChevronUp, Wind, Target, Users, BookOpen, 
    Shield, Coins, Swords, Zap, Activity
} from 'lucide-react';
import { formatGameTime } from '../../../../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';

interface DynamicHUDProps {
    worldData?: WorldData | null;
    gameTime?: GameTime;
    turnCount: number;
}

export const DynamicHUD: React.FC<DynamicHUDProps> = ({ worldData, gameTime, turnCount }) => {
    const [expanded, setExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'status' | 'inventory' | 'quests' | 'relations'>('status');

    if (!worldData) return null;

    const lsr = worldData.lsrData || {};
    
    // --- Parse LSR Tables ---
    // #0 Thông tin Hiện tại: ["Thời gian", "Địa điểm", "Sự kiện", "Mục tiêu"]
    const t0 = (lsr['0'] || []) as any[][];
    const currentInfo = t0[0] || [];
    const locationString = currentInfo[1] || 'Chưa xác định';
    const currentEvent = currentInfo[2] || '';
    const currentObjective = currentInfo[3] || '';

    // #2 Trạng thái Bản thân: ["Chỉ số/Tên", "Giá trị", "Mô tả"]
    const t2 = (lsr['2'] || []) as any[][];
    const playerStats = t2.map(row => ({ name: row[0], value: row[1], desc: row[2] }));
    const healthStat = playerStats.find(s => s.name?.toLowerCase().includes('máu') || s.name?.toLowerCase().includes('thể lực') || s.name?.toLowerCase().includes('hp'));
    const quickStatus = healthStat ? `${healthStat.value} - ${healthStat.desc}` : 'Bình thường';
    
    // #3 Quan hệ: ["Tên Nhân vật", "Độ thân thiết", "Chi tiết/Đánh giá"]
    const t3 = (lsr['3'] || []) as any[][];
    const relations = t3.map(row => ({ name: row[0], affinity: row[1], desc: row[2] }));
    
    // #4 Nhiệm vụ / Quest: ["Thời gian", "Trạng thái", "Tên Quest", "Tiến độ"]
    const t4 = (lsr['4'] || []) as any[][];
    const quests = t4.map(row => ({ time: row[0], status: row[1], name: row[2], progress: row[3] }));
    const activeQuest = quests.find(q => q.status?.toLowerCase().includes('đang') || q.status?.toLowerCase().includes('active'));

    // #6 Túi đồ: ["Tên vật phẩm", "Số lượng", "Trạng thái/Tác dụng"]
    const t6 = (lsr['6'] || []) as any[][];
    const items = t6.map(row => ({ name: row[0], quantity: row[1], desc: row[2] }));

    // #7 Trang bị đang mặc: ["Vị trí", "Tên trang bị", "Hiệu ứng/Độ bền"]
    const t7 = (lsr['7'] || []) as any[][];
    const equipment = t7.map(row => ({ slot: row[0], name: row[1], desc: row[2] }));

    // #12 Hiệu ứng (Buff/Debuff): ["Tên hiệu ứng", "Thời gian còn lại", "Tác dụng"]
    const t12 = (lsr['12'] || []) as any[][];
    const activeEffects = t12.map(row => ({ name: row[0], duration: row[1], effect: row[2] }));

    // #13 Kinh tế / Tiền tệ: ["Loại tài sản", "Số lượng", "Ghi chú"]
    const t13 = (lsr['13'] || []) as any[][];
    const economy = t13.map(row => ({ type: row[0], amount: row[1], note: row[2] }));

    const timeString = gameTime ? formatGameTime(gameTime) : (currentInfo[0] || '12:00');
    
    // Determine Time of Day
    let timeIcon = <Sun size={14} className="text-amber-500" />;
    let themeClasses = "from-mystic-800/80 to-mystic-900/95";
    let borderClass = "border-mystic-500/30";

    const lcTime = timeString.toLowerCase();
    if (lcTime.includes('đêm') || lcTime.includes('tối')) {
        timeIcon = <Moon size={14} className="text-indigo-400" />;
        themeClasses = "from-indigo-900/80 to-mystic-950/95";
        borderClass = "border-indigo-500/30";
    } else if (lcTime.includes('chiều') || lcTime.includes('hoàng hôn')) {
        timeIcon = <Sun size={14} className="text-rose-400" />;
        themeClasses = "from-orange-900/80 to-mystic-950/95";
        borderClass = "border-orange-500/30";
    }

    return (
        <div className={`relative w-full z-20 backdrop-blur-xl shadow-lg transition-all duration-700 bg-gradient-to-b ${themeClasses} border-b ${borderClass}`}>
            
            {/* Top Bar - Always Visible */}
            <div className={`px-4 py-2.5 flex items-center justify-between gap-4`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Player Info (Click to toggle expand) */}
                    <button 
                        onClick={() => setExpanded(!expanded)} 
                        className="flex items-center gap-3 group cursor-pointer shrink-0 rounded-xl hover:bg-white/5 p-1 -ml-1 transition-colors"
                    >
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-mystic-800 flex items-center justify-center border-2 border-mystic-500/50 group-hover:border-mystic-accent transition-colors overflow-hidden shadow-inner">
                                {worldData.player.avatar ? (
                                    <img src={worldData.player.avatar} alt={worldData.player.name} className="w-full h-full object-cover" />
                                ) : (
                                    <User size={20} className="text-mystic-400" />
                                )}
                            </div>
                            {/* Health indicator dot */}
                            {(healthStat && (healthStat.value?.includes('thấp') || healthStat.value?.includes('yếu'))) && (
                                <div className="absolute top-0 right-  w-3 h-3 bg-rose-500 border-2 border-mystic-900 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                            )}
                        </div>
                        <div className="flex flex-col items-start leading-tight">
                            <span className="text-sm font-bold text-slate-100 group-hover:text-mystic-accent transition-colors tracking-wide">{worldData.player.name}</span>
                            <span className="text-[10px] font-medium text-slate-400 truncate max-w-[120px] md:max-w-[200px] flex items-center gap-1">
                                {healthStat ? <Heart size={10} className="text-rose-400" /> : <Activity size={10} className="text-sky-400"/>}
                                {quickStatus}
                            </span>
                        </div>
                    </button>

                    <div className="h-8 w-px bg-white/10 hidden md:block"></div>

                    {/* Vitals & Environment */}
                    <div className="flex items-center gap-2 lg:gap-3 overflow-x-auto custom-scrollbar flex-1 mask-linear-right pb-1 md:pb-0">
                        {/* Time */}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 border border-white/5 shrink-0 shadow-inner`}>
                            {timeIcon}
                            <span className="text-[11px] font-semibold text-slate-300">{timeString}</span>
                        </div>

                        {/* Location */}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 border border-white/5 shrink-0 shadow-inner`}>
                            <MapPin size={12} className="text-emerald-400" />
                            <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[150px]">{locationString}</span>
                        </div>

                        {/* Objective Quick View */}
                        {(activeQuest || currentObjective) && (
                            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 border border-white/5 shrink-0 shadow-inner`}>
                                <Target size={12} className="text-amber-400" />
                                <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[200px]">
                                    {activeQuest ? activeQuest.name : currentObjective}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side controls */}
                <div className="flex items-center gap-2 shrink-0">
                    <button 
                         onClick={() => setExpanded(!expanded)}
                         className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-colors backdrop-blur border border-white/10 shadow-sm"
                         title="Thông tin chi tiết"
                    >
                        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
                            <ChevronDown size={16} />
                        </motion.div>
                    </button>
                </div>
            </div>

            {/* Expandable Details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur-xl"
                    >
                        <div className="flex flex-col h-full max-h-[60vh] md:max-h-[400px]">
                            {/* Tab Navigation */}
                            <div className="flex px-4 pt-2 gap-2 overflow-x-auto custom-scrollbar border-b border-white/10 hide-scrollbar">
                                {[
                                    { id: 'status', label: 'Trạng thái', icon: <Activity size={14} /> },
                                    { id: 'inventory', label: 'Hành trang', icon: <Backpack size={14} /> },
                                    { id: 'quests', label: 'Nhiệm vụ', icon: <Target size={14} /> },
                                    { id: 'relations', label: 'Quan hệ', icon: <Users size={14} /> }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
                                            activeTab === tab.id 
                                            ? 'text-mystic-accent border-mystic-accent bg-white/5' 
                                            : 'text-slate-400 border-transparent hover:bg-white/5 hover:text-slate-200'
                                        }`}
                                    >
                                        {tab.icon} {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                                
                                {activeTab === 'status' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-2 flex items-center gap-2">
                                                    <Activity size={12}/> Chỉ số cá nhân
                                                </h4>
                                                <div className="bg-black/20 rounded-xl border border-white/5 p-1">
                                                    {playerStats.length > 0 ? playerStats.map((stat, i) => (
                                                        <div key={i} className="flex flex-col sm:flex-row sm:items-center py-2 px-3 hover:bg-white/5 rounded-lg border-b border-white/5 last:border-0 transition-colors gap-1 sm:gap-4">
                                                            <span className="text-[11px] font-bold text-slate-300 w-24 shrink-0">{stat.name}</span>
                                                            <span className="text-[12px] font-mono text-mystic-accent font-semibold">{stat.value}</span>
                                                            <span className="text-[11px] text-slate-400 flex-1 truncate">{stat.desc}</span>
                                                        </div>
                                                    )) : <div className="p-4 text-center text-xs text-slate-500">Chưa có dữ liệu chỉ số</div>}
                                                </div>
                                            </div>

                                            {activeEffects.length > 0 && (
                                                <div>
                                                    <h4 className="text-[10px] uppercase font-bold text-rose-400 tracking-widest mb-2 flex items-center gap-2">
                                                        <Zap size={12}/> Hiệu ứng / Trạng thái
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {activeEffects.map((eff, i) => (
                                                            <div key={i} className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 flex flex-col min-w-[120px]">
                                                                <span className="text-[11px] font-bold text-rose-300">{eff.name}</span>
                                                                <span className="text-[10px] text-rose-200/70">{eff.duration}</span>
                                                                {eff.effect && <span className="text-[10px] text-rose-200 mt-1">{eff.effect}</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            {equipment.length > 0 && (
                                                <div>
                                                    <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-2 flex items-center gap-2">
                                                        <Shield size={12}/> Trang bị đang mặc
                                                    </h4>
                                                    <div className="bg-black/20 rounded-xl border border-white/5 p-1">
                                                        {equipment.map((eq, i) => (
                                                            <div key={i} className="flex flex-col sm:flex-row sm:items-center py-2 px-3 hover:bg-white/5 rounded-lg border-b border-white/5 last:border-0 transition-colors gap-1 sm:gap-3">
                                                                <span className="text-[10px] uppercase text-emerald-400 w-20 shrink-0 opacity-80">{eq.slot}</span>
                                                                <span className="text-[12px] font-bold text-slate-200">{eq.name}</span>
                                                                <span className="text-[11px] text-slate-400 flex-1 truncate text-right">{eq.desc}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {economy.length > 0 && (
                                                <div>
                                                    <h4 className="text-[10px] uppercase font-bold text-amber-500 tracking-widest mb-2 flex items-center gap-2">
                                                        <Coins size={12}/> Tài sản
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {economy.map((eco, i) => (
                                                            <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
                                                                <span className="text-[11px] font-bold text-amber-300">{eco.type}:</span>
                                                                <span className="text-[12px] font-mono text-amber-400">{eco.amount}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'inventory' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {items.length > 0 ? items.map((item, i) => (
                                            <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-3 flex gap-3 hover:bg-white/5 hover:border-mystic-500/50 transition-all group">
                                                <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                                                    <span className="text-xs font-bold text-slate-300">x{item.quantity || 1}</span>
                                                </div>
                                                <div className="flex flex-col overflow-hidden justify-center">
                                                    <span className="text-[12px] font-bold text-mystic-100 truncate group-hover:text-mystic-accent transition-colors">{item.name}</span>
                                                    <span className="text-[10px] text-slate-400 line-clamp-2 leading-snug mt-0.5">{item.desc || 'Không có mô tả'}</span>
                                                </div>
                                            </div>
                                        )) : <div className="col-span-full py-8 text-center text-sm text-slate-500">Túi đồ trống</div>}
                                    </div>
                                )}

                                {activeTab === 'quests' && (
                                    <div className="space-y-3">
                                        {quests.length > 0 ? quests.map((q, i) => (
                                            <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row gap-4 md:items-center justify-between hover:bg-white/5 transition-colors">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${q.status?.toLowerCase().includes('đang') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : q.status?.toLowerCase().includes('hoàn thành') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'}`}>
                                                            {q.status}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500">{q.time}</span>
                                                    </div>
                                                    <span className="text-[14px] font-bold text-slate-100">{q.name}</span>
                                                </div>
                                                <div className="md:text-right flex flex-col gap-1 md:items-end">
                                                    <span className="text-[11px] text-slate-400 uppercase font-semibold">Tiến độ</span>
                                                    <span className="text-[12px] text-mystic-300 line-clamp-2 md:line-clamp-1 max-w-md">{q.progress}</span>
                                                </div>
                                            </div>
                                        )) : <div className="py-8 text-center text-sm text-slate-500">Không có nhiệm vụ nào</div>}
                                    </div>
                                )}

                                {activeTab === 'relations' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {relations.length > 0 ? relations.map((rel, i) => (
                                            <div key={i} className="bg-gradient-to-r from-black/30 to-black/10 border border-white/5 rounded-xl p-3 flex gap-3 hover:border-pink-500/30 transition-colors">
                                                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-white/10 shadow-inner">
                                                    <User size={18} className="text-slate-400" />
                                                </div>
                                                <div className="flex flex-col flex-1 overflow-hidden min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[13px] font-bold text-slate-100 truncate">{rel.name}</span>
                                                        <span className="text-[10px] font-mono px-2 rounded-full bg-pink-500/10 text-pink-300 border border-pink-500/20 whitespace-nowrap">{rel.affinity}</span>
                                                    </div>
                                                    <span className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{rel.desc}</span>
                                                </div>
                                            </div>
                                        )) : <div className="col-span-full py-8 text-center text-sm text-slate-500">Chưa có mối quan hệ nào được ghi nhận</div>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};


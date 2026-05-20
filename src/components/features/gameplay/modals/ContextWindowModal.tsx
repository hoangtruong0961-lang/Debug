import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, X, Code, Zap } from 'lucide-react';
import Button from '../../../ui/Button';
import { ContextDebuggerView } from '../components/ContextDebuggerView';
import { WorldData, ContextWindowConfig, AppSettings, ChatMessage, PresetModelConfig } from '../../../../types';

interface ContextWindowModalProps {
    show: boolean;
    onClose: () => void;
    activeWorld: WorldData;
    handleUpdateContextConfig: (config: ContextWindowConfig) => void;
    settings: AppSettings;
    history: ChatMessage[];
    turnCount: number;
    tawaPresetConfig: PresetModelConfig | null;
    gameTime: number;
    lastAction: string;
}

const ContextWindowModal: React.FC<ContextWindowModalProps> = ({
    show, onClose, activeWorld, handleUpdateContextConfig,
    settings, history, turnCount, tawaPresetConfig, gameTime, lastAction
}) => {
    const [activeContextTab, setActiveContextTab] = useState<'config' | 'debugger'>('config');

    if (!activeWorld) return null;

    const config = activeWorld?.config?.contextConfig || {
        items: {
          playerProfile: true, worldInfo: true, longTermMemory: true, relevantMemories: true, storyBible: true,
          entities: true, npcRegistry: true, timeSystem: true, reinforcement: true
        },
        maxEntities: 10, recentHistoryCount: 100
    };

    const toggleContextItem = (key: keyof ContextWindowConfig['items']) => {
        const newConfig = {
            ...config,
            items: {
                ...config.items,
                [key]: !config.items[key]
            }
        };
        handleUpdateContextConfig(newConfig);
    };

    const updateContextMaxEntities = (val: number) => {
        handleUpdateContextConfig({ ...config, maxEntities: val });
    };

    const updateContextHistoryCount = (val: number) => {
        handleUpdateContextConfig({ ...config, recentHistoryCount: val });
    };

    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-md p-2">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="bg-stone-200 dark:bg-mystic-950 border border-stone-400 dark:border-slate-800 w-[99vw] h-[99vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-mystic-900/80 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-mystic-accent/20 rounded-lg text-mystic-accent">
                                    <Database size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-stone-800 dark:text-slate-100">Cấu hình Cửa sổ Ngữ cảnh</h2>
                                    <p className="text-xs text-stone-500 dark:text-slate-500 uppercase tracking-widest font-bold">Kiểm soát dữ liệu gửi cho AI Tawa</p>
                                </div>
                            </div>

                            <div className="flex bg-stone-400/30 dark:bg-slate-800/50 rounded-lg p-1">
                                <button
                                    onClick={() => setActiveContextTab('config')}
                                    className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                                        activeContextTab === 'config'
                                            ? 'bg-mystic-accent text-mystic-900 shadow-md'
                                            : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
                                    }`}
                                >
                                    Tùy chỉnh
                                </button>
                                <button
                                    onClick={() => setActiveContextTab('debugger')}
                                    className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 ${
                                        activeContextTab === 'debugger'
                                            ? 'bg-mystic-accent text-mystic-900 shadow-md'
                                            : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
                                    }`}
                                >
                                    <Code size={14} /> Debugger
                                </button>
                            </div>

                            <button 
                                onClick={onClose}
                                className="p-2 hover:bg-red-500/20 text-stone-500 hover:text-red-500 rounded-full transition-all"
                            >
                                <X size={32} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-hidden flex flex-col bg-stone-100 dark:bg-mystic-950">
                            {activeContextTab === 'config' ? (
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left Column: Toggles */}
                                    <div className="space-y-6">
                                        <h3 className="text-sm font-black text-mystic-accent uppercase tracking-[0.2em] border-b border-mystic-accent/30 pb-2">Thành phần Ngữ cảnh</h3>
                                        
                                        <div className="space-y-3">
                                            {[
                                                { key: 'playerProfile', label: 'Hồ sơ nhân vật', desc: 'Thông tin chi tiết về nhân vật của bạn' },
                                                { key: 'worldInfo', label: 'Thông tin thế giới', desc: 'Bối cảnh, thể loại và cốt truyện chung' },
                                                { key: 'longTermMemory', label: 'Trí nhớ dài hạn (Summary)', desc: 'Bản tóm tắt các sự kiện đã qua' },
                                                { key: 'relevantMemories', label: 'Ký ức liên quan (RAG)', desc: 'Các đoạn hội thoại cũ được tìm thấy qua Vector Search' },
                                                { key: 'storyBible', label: 'Encyclopedia', desc: 'Dữ kiện sự thật được hệ thống tự trích xuất linh hoạt' },
                                                { key: 'entities', label: 'Thực thể (NPCs/Items)', desc: 'Thông tin về các nhân vật và vật phẩm trong thế giới' },
                                                { key: 'npcRegistry', label: 'Danh sách tổng NPC (Registry)', desc: 'Danh sách rút gọn tất cả NPC để AI tham chiếu ID' },
                                                { key: 'timeSystem', label: 'Hệ thống thời gian', desc: 'Ngày, tháng, năm và lượt chơi hiện tại' },
                                                { key: 'reinforcement', label: 'Chỉ thị củng cố (Reinforcement)', desc: 'Các lệnh ép AI duy trì chất lượng văn phong' },
                                            ].map((item) => (
                                                <div key={item.key} className="flex items-center justify-between p-4 bg-stone-200 dark:bg-slate-900/50 rounded-xl border border-stone-300 dark:border-slate-800 hover:border-mystic-accent/50 transition-all group">
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200">{item.label}</h4>
                                                        <p className="text-[10px] text-stone-500 dark:text-slate-500 mt-0.5">{item.desc}</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => toggleContextItem(item.key as keyof ContextWindowConfig['items'])}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.items[item.key as keyof typeof config.items] ? 'bg-mystic-accent' : 'bg-stone-400 dark:bg-slate-700'}`}
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.items[item.key as keyof typeof config.items] ? 'translate-x-6' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right Column: Numeric Limits */}
                                    <div className="space-y-6">
                                        <h3 className="text-sm font-black text-mystic-accent uppercase tracking-[0.2em] border-b border-mystic-accent/30 pb-2">Giới hạn Số lượng</h3>
                                        
                                        <div className="space-y-6">
                                            {/* Max Entities */}
                                            <div className="p-5 bg-stone-200 dark:bg-slate-900/50 rounded-xl border border-stone-300 dark:border-slate-800">
                                                <div className="flex justify-between items-center mb-4">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200">Số lượng Thực thể tối đa (NPCs)</h4>
                                                        <p className="text-[10px] text-stone-500 dark:text-slate-500 mt-0.5">Giới hạn số lượng NPC/Vật phẩm gửi cho AI mỗi lượt</p>
                                                    </div>
                                                    <div className="text-2xl font-black text-mystic-accent">{config.maxEntities}</div>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="1" 
                                                    max="50" 
                                                    value={config.maxEntities} 
                                                    onChange={(e) => updateContextMaxEntities(parseInt(e.target.value))}
                                                    className="w-full h-2 bg-stone-300 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-mystic-accent"
                                                />
                                                <div className="flex justify-between text-[10px] text-stone-500 mt-2 font-bold">
                                                    <span>1 NPC</span>
                                                    <span>50 NPCs</span>
                                                </div>
                                            </div>

                                            {/* Recent History Count */}
                                            <div className="p-5 bg-stone-200 dark:bg-slate-900/50 rounded-xl border border-stone-300 dark:border-slate-800">
                                                <div className="flex justify-between items-center mb-4">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200">Lịch sử gần đây (Recent History)</h4>
                                                        <p className="text-[10px] text-stone-500 dark:text-slate-500 mt-0.5">Số lượng tin nhắn gần nhất AI sẽ đọc trực tiếp</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="number" 
                                                            min="1" 
                                                            max="500" 
                                                            value={config.recentHistoryCount} 
                                                            onChange={(e) => updateContextHistoryCount(parseInt(e.target.value) || 1)}
                                                            className="w-16 bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded px-2 py-1 text-center font-black text-mystic-accent outline-none focus:border-mystic-accent"
                                                        />
                                                        <span className="text-xs font-bold text-stone-500">tin nhắn</span>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] italic text-amber-600 dark:text-amber-500/70 bg-amber-500/5 p-2 rounded border border-amber-500/20">
                                                    * Mặc định là 100. Số lượng càng cao AI càng nhớ tốt các sự kiện vừa xảy ra, nhưng sẽ tốn nhiều Token hơn.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Info Box */}
                                        <div className="p-6 bg-mystic-accent/5 border border-mystic-accent/20 rounded-2xl space-y-3">
                                            <h4 className="text-xs font-black text-mystic-accent uppercase tracking-widest flex items-center gap-2">
                                                <Zap size={14} /> Tại sao cần cấu hình này?
                                            </h4>
                                            <p className="text-xs text-stone-600 dark:text-slate-400 leading-relaxed">
                                                Cửa sổ ngữ cảnh là "bộ nhớ tạm thời" của AI. Bằng cách tắt các mục không cần thiết hoặc giảm số lượng tin nhắn lịch sử, bạn có thể:
                                            </p>
                                            <ul className="text-xs text-stone-600 dark:text-slate-400 space-y-1 list-disc pl-4">
                                                <li>Tiết kiệm Token (giảm chi phí/tăng tốc độ phản hồi).</li>
                                                <li>Tránh việc AI bị "loãng" thông tin bởi quá nhiều NPC phụ.</li>
                                                <li>Tập trung sự chú ý của AI vào các thành phần quan trọng nhất.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 h-full p-2">
                                    <ContextDebuggerView 
                                        worldData={activeWorld}
                                        settings={settings}
                                        history={history}
                                        turnCount={turnCount}
                                        presetConfig={tawaPresetConfig}
                                        gameTime={gameTime}
                                        lastUserMessage={lastAction}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-mystic-900/80 flex justify-center shrink-0">
                            <Button 
                                onClick={onClose}
                                className="px-12 py-3 bg-mystic-accent text-mystic-900 font-black uppercase tracking-widest hover:bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                            >
                                Xác nhận & Đóng
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ContextWindowModal;

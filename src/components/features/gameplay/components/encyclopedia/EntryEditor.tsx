import React, { useState, useEffect, useMemo } from 'react';
import { VectorData } from '../../../../../services/db/indexedDB';
import { CharacterSheetEditor } from '../../../world-creation/CharacterSheetEditor';
import { CharacterSheet } from '../../../../../types';
import Button from '../../../../ui/Button';
import { Sparkles } from 'lucide-react';
import { worldAiService } from '../../../../../services/ai/world-creation/service';
import { useAppStore } from '../../../../../store/appStore';

export interface EntryEditorProps {
    formData: Partial<VectorData>;
    onChange: (field: keyof VectorData, value: any) => void;
    onSave: () => void;
    onCancel: () => void;
    isSaving: boolean;
    isEditing: boolean;
}

export const EntryEditor: React.FC<EntryEditorProps> = ({
    formData,
    onChange,
    onSave,
    onCancel,
    isSaving,
    isEditing
}) => {
    const [keywordsText, setKeywordsText] = useState('');
    const [isGeneratingTarget, setIsGeneratingTarget] = useState(false);
    const { settings } = useAppStore();

    // Sync formData.keywords to local text when selected entry changes
    useEffect(() => {
        setKeywordsText(formData.keywords?.join(', ') || '');
    }, [formData.keywords]);

    const handleKeywordsChange = (val: string) => {
        setKeywordsText(val); // update local input smoothly
        const parsed = val.split(',').map(s=>s.trim()).filter(Boolean);
        onChange('keywords', parsed); // but still save the parsed array
    };

    // Character Sheet JSON parse
    const characterData = useMemo(() => {
        if (formData.category !== 'character') return null;
        try {
            return JSON.parse(formData.text || '{}') as Partial<CharacterSheet>;
        } catch {
            // Legacy text fallback
            return { narrativeRole: formData.text } as Partial<CharacterSheet>;
        }
    }, [formData.text, formData.category]);

    const handleCharacterSheetChange = (field: keyof CharacterSheet, value: string) => {
        const newData = { ...characterData, [field]: value };
        onChange('text', JSON.stringify(newData, null, 2));
    };

    const handleAiGenKnowledge = async () => {
        if (!characterData?.knowledge_train?.trim()) {
            alert("Vui lòng nhập dữ liệu gốc (Knowledge Base) trước.");
            return;
        }

        setIsGeneratingTarget(true);
        try {
            const generatedSheet = await worldAiService.generateCharacterSheetFromKnowledge(characterData.knowledge_train, 'gemini-3.1-pro-preview', settings);
            const newData = {
                ...characterData,
                ...generatedSheet,
                knowledge_train: characterData.knowledge_train
            };
            onChange('text', JSON.stringify(newData, null, 2));
        } catch (error) {
            console.error(error);
            alert("Lỗi khi tạo hình nhân vật từ Knowledge.");
        } finally {
            setIsGeneratingTarget(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-y-auto">
            <div className="px-6 py-4 border-b border-stone-200 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur z-10">
                <h3 className="font-black text-xl text-stone-800 dark:text-slate-200 tracking-tight">
                    {isEditing ? 'Chỉnh sửa Entry' : 'Tạo Entry Mới'}
                </h3>
                <div className="flex gap-3">
                    <button onClick={onCancel} disabled={isSaving} className="px-5 py-2 bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 text-stone-700 dark:text-slate-300 rounded-lg font-bold text-sm transition-colors">
                        Hủy
                    </button>
                    <button onClick={onSave} disabled={isSaving} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
                        {isSaving ? 'Đang lưu...' : 'Lưu lại'}
                    </button>
                </div>
            </div>

            <div className="p-4 md:p-8 space-y-8 max-w-4xl mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest">Từ khóa chính / Title</label>
                        <input type="text" value={formData.keyword || ''} onChange={e => onChange('keyword', e.target.value)} className="w-full px-4 py-2.5 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 font-bold transition-colors" placeholder="Vd: Hiệp sĩ Galahad..." />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest">Category</label>
                        <select value={formData.category || 'world'} onChange={e => onChange('category', e.target.value)} className="w-full px-4 py-2.5 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 font-medium transition-colors">
                            <option value="character">Nhân vật</option>
                            <option value="location">Địa điểm</option>
                            <option value="faction">Thế lực</option>
                            <option value="item">Vật phẩm</option>
                            <option value="event">Sự kiện</option>
                            <option value="law">Luật lệ / Quy tắc</option>
                            <option value="world">Thế giới / Lore</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest">Trigger Mode</label>
                        <select value={formData.triggerMode || 'hybrid'} onChange={e => onChange('triggerMode', e.target.value)} className="w-full px-4 py-2.5 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 font-medium transition-colors">
                            <option value="hybrid">Hybrid (Keyword + Semantic)</option>
                            <option value="keyword">Keyword (Match từ khóa chính xác)</option>
                            <option value="semantic">Semantic (Tìm theo ngữ nghĩa AI)</option>
                            <option value="always">Always (Luôn kích hoạt)</option>
                        </select>
                    </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest">Từ khóa kích hoạt (cách bằng dấu phẩy)</label>
                        <input type="text" value={keywordsText} onChange={e => handleKeywordsChange(e.target.value)} className="w-full px-4 py-2.5 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 transition-colors" placeholder="Aria, cô gái phép thuật..." />
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest flex justify-between">
                        Nội dung Entry
                        <span className="text-amber-500 font-mono font-normal">~{Math.round((formData.text?.length || 0)/4)} tokens</span>
                    </label>
                    {formData.category === 'character' && characterData ? (
                        <div className="bg-stone-50 dark:bg-slate-950 p-4 border border-stone-300 dark:border-slate-700 rounded-xl overflow-hidden mt-2 relative">
                             <div className="flex justify-between items-center mb-4">
                                <span className="text-xs text-stone-500 italic">Dán lore gốc vào ô Knowledge Base và bấm nút AI GEN.</span>
                                <Button
                                    variant="secondary"
                                    onClick={handleAiGenKnowledge}
                                    disabled={isGeneratingTarget || !characterData.knowledge_train?.trim()}
                                    icon={isGeneratingTarget ? <span className="animate-spin">⏳</span> : <Sparkles size={16} />}
                                    className="py-1 px-3 text-xs bg-green-500 hover:bg-green-600 text-white"
                                >
                                    {isGeneratingTarget ? "Đang xử lý..." : "AI GEN KNOWLEDGE"}
                                </Button>
                             </div>
                             <CharacterSheetEditor 
                                data={characterData} 
                                onChange={handleCharacterSheetChange} 
                             />
                        </div>
                    ) : (
                        <textarea value={formData.text || ''} onChange={e => onChange('text', e.target.value)} className="w-full h-[320px] p-4 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-xl text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 leading-relaxed resize-y font-medium transition-all shadow-inner" placeholder="Khái quát sự kiện, tính cách, đặc điểm vật lý..." />
                    )}
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-stone-200 dark:border-slate-800 pt-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest flex justify-between">
                            Priority (Độ ưu tiên)
                            <span className="text-amber-500 font-mono font-bold">{formData.priority || 50}</span>
                        </label>
                        <input type="range" min="0" max="100" value={formData.priority || 50} onChange={e => onChange('priority', parseInt(e.target.value))} className="w-full accent-amber-500 mt-2" />
                    </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest">Insertion Position</label>
                        <select value={formData.position || 'before_char'} onChange={e => onChange('position', e.target.value)} className="w-full px-4 py-2.5 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 font-medium">
                            <option value="before_char">Before Character Def</option>
                            <option value="after_char">After Character Def</option>
                            <option value="before_history">Before Chat History</option>
                            <option value="after_history">After Chat History (Author's Note)</option>
                            <option value="in_chat">In-Chat Depth</option>
                        </select>
                    </div>
                </div>

                {formData.position === 'in_chat' && (
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-stone-500 dark:text-slate-400 tracking-widest">Depth Level (nếu In-Chat)</label>
                        <input type="number" value={formData.depth || 0} onChange={e => onChange('depth', parseInt(e.target.value) || 0)} className="w-full px-4 py-2.5 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded-lg text-sm text-stone-900 dark:text-white outline-none focus:border-amber-500 font-bold" min="0" max="10" />
                    </div>
                )}
                
                <div className="flex justify-start gap-8 bg-stone-50 dark:bg-slate-900/50 p-4 rounded-xl border border-stone-200 dark:border-slate-800">
                    <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-stone-700 dark:text-slate-300">
                        <input type="checkbox" checked={formData.isEnabled ?? true} onChange={e => onChange('isEnabled', e.target.checked)} className="w-5 h-5 accent-amber-500 rounded" />
                        Enabled
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-stone-700 dark:text-slate-300">
                        <input type="checkbox" checked={formData.isSticky ?? false} onChange={e => onChange('isSticky', e.target.checked)} className="w-5 h-5 accent-amber-500 rounded" />
                        Sticky (Ghim ưu tiên cao)
                    </label>
                </div>
            </div>
        </div>
    );
};

import React, { useEffect } from 'react';
import { CharacterSheet } from '../../../types';
import { useWorldCreationStore } from '../../../store/worldCreationStore';
import { User, Calendar, Smile, BookOpen, Volume2, Sparkles, Check, Heart, HelpCircle } from 'lucide-react';

interface CharacterSheetEditorProps {
    data: Partial<CharacterSheet>;
    onChange: (field: keyof CharacterSheet, value: any) => void;
}

const ARCHETYPES = [
    {
        id: 'Protagonist',
        label: 'Nhân vật chính (Protagonist)',
        desc: 'Trung tâm của câu chuyện, đối mặt với xung đột chủ đạo và trải qua sự trưởng thành lớn qua thử thách.'
    },
    {
        id: 'Antagonist',
        label: 'Nhân vật phản diện (Antagonist)',
        desc: 'Thế lực cản trở tinh vi hoặc trực diện, tạo dựng những chướng ngại vật buộc nhân vật chính bộc lộ tính cách.'
    },
    {
        id: 'Mentor & Ally',
        label: 'Người hướng dẫn & Đồng minh (Mentor & Ally)',
        desc: 'Đồng hành sát cánh, cung cấp tri thức, điểm tựa tinh thần hoặc công cụ quý báu trên hành trình.'
    },
    {
        id: 'Foil',
        label: 'Nhân vật đối lập (Foil)',
        desc: 'Sở hữu tính cách triệt để tương phản nhằm làm nổi bật và tôn vinh những nét đặc sắc của nhân vật chính.'
    }
];

export const CharacterSheetEditor: React.FC<CharacterSheetEditorProps> = ({ data, onChange }) => {
    const gameTime = useWorldCreationStore(state => state.gameTime);
    const startingYear = gameTime?.year || 2024;

    const birthDay = data.birthDay !== undefined ? Number(data.birthDay) : 1;
    const birthMonth = data.birthMonth !== undefined ? Number(data.birthMonth) : 1;
    const birthYear = data.birthYear !== undefined ? Number(data.birthYear) : 2000;

    // Tự động xác định và cập nhật tuổi dựa trên năm khởi đầu thế giới
    const computedAge = startingYear - birthYear;
    const finalAge = computedAge >= 0 ? computedAge : 0;

    useEffect(() => {
        if (String(finalAge) !== data.age) {
            onChange('age', String(finalAge));
        }
    }, [finalAge, data.age, onChange]);

    return (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar pb-6">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-200">
                    <User size={18} className="text-mystic-accent" />
                    <h4 className="font-bold tracking-tight text-sm">Thông tin Định Danh Cốt Lõi</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Tên */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                            <span>Tên Nhân Vật</span>
                        </label>
                        <input 
                            type="text"
                            value={data.name || ''}
                            onChange={(e) => onChange('name', e.target.value)}
                            placeholder="Ví dụ: Lương Thế Vinh"
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3.5 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-mystic-accent text-sm transition-colors shadow-inner"
                        />
                    </div>

                    {/* Giới Tính */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Chọn Giới Tính</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['Nam', 'Nữ', 'Khác'].map(g => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => onChange('gender', g)}
                                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                                        data.gender === g
                                            ? 'bg-mystic-accent/10 border-mystic-accent/50 text-mystic-accent font-bold shadow-sm'
                                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Ngày Tháng Năm Sinh / Tuổi */}
                <div className="mt-5 pt-5 border-t border-slate-150 dark:border-slate-800/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar size={14} className="text-mystic-accent" />
                            <span>Ngày Tháng Năm Sinh</span>
                        </label>
                        <div className="bg-mystic-accent/5 text-mystic-accent border border-mystic-accent/10 px-3 py-1 rounded-lg text-[11px] font-mono font-semibold">
                            Tuổi hiện tại: <span className="text-xs font-bold">{finalAge}</span> tuổi (Khởi đầu năm {startingYear})
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {/* Ngày */}
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Ngày</span>
                            <select
                                value={birthDay}
                                onChange={(e) => onChange('birthDay', Number(e.target.value))}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-2 text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-mystic-accent"
                            >
                                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                    <option key={d} value={d}>Ngày {d}</option>
                                ))}
                            </select>
                        </div>

                        {/* Tháng */}
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Tháng</span>
                            <select
                                value={birthMonth}
                                onChange={(e) => onChange('birthMonth', Number(e.target.value))}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-2 text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-mystic-accent"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>Tháng {m}</option>
                                ))}
                            </select>
                        </div>

                        {/* Năm */}
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Năm Sinh</span>
                            <input
                                type="number"
                                value={birthYear}
                                onChange={(e) => onChange('birthYear', Number(e.target.value))}
                                min={0}
                                max={startingYear}
                                placeholder="Năm"
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-[7px] text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-mystic-accent"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Chi tiết Ngoại hình, Giọng điệu, Tính cách, Tiểu sử */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Ngoại hình */}
                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-5 shadow-sm space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Heart size={14} className="text-rose-500" />
                        <span>Ngoại hình</span>
                    </label>
                    <textarea 
                        value={data.appearance || ''}
                        onChange={(e) => onChange('appearance', e.target.value)}
                        placeholder="Vóc dáng, diện mạo, y phục, nét mặt đặc sắc hay vũ khí đặc trưng..."
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-slate-900 dark:text-slate-100 text-sm h-28 resize-none outline-none focus:border-mystic-accent custom-scrollbar transition-colors"
                    />
                </div>

                {/* Giọng điệu */}
                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-5 shadow-sm space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Volume2 size={14} className="text-mystic-accent" />
                        <span>Giọng điệu</span>
                    </label>
                    <textarea 
                        value={data.voiceAndTone || ''}
                        onChange={(e) => onChange('voiceAndTone', e.target.value)}
                        placeholder="Trầm ấm, sắc sảo, hay châm chọc? Cách nhân vật mở đầu hay cấu trúc lời thoại ví dụ..."
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-slate-900 dark:text-slate-100 text-sm h-28 resize-none outline-none focus:border-mystic-accent custom-scrollbar transition-colors"
                    />
                </div>

                {/* Tính cách */}
                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-5 shadow-sm space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Smile size={14} className="text-amber-500" />
                        <span>Tính cách</span>
                    </label>
                    <textarea 
                        value={data.personality || ''}
                        onChange={(e) => onChange('personality', e.target.value)}
                        placeholder="Ưu nhược điểm tâm lý, hành vi khi giận dữ, quyết liệt hay lạnh lùng..."
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-slate-900 dark:text-slate-100 text-sm h-28 resize-none outline-none focus:border-mystic-accent custom-scrollbar transition-colors"
                    />
                </div>

                {/* Tiểu sử */}
                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-5 shadow-sm space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen size={14} className="text-emerald-500" />
                        <span>Tiểu sử</span>
                    </label>
                    <textarea 
                        value={data.background || ''}
                        onChange={(e) => onChange('background', e.target.value)}
                        placeholder="Nguồn gốc quá khứ, những biến cố lịch sử đã trải qua định hình nên số mệnh hiện tại..."
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-slate-900 dark:text-slate-100 text-sm h-28 resize-none outline-none focus:border-mystic-accent custom-scrollbar transition-colors"
                    />
                </div>
            </div>

            {/* Narrative Role */}
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-1 text-slate-800 dark:text-slate-200">
                    <Sparkles size={18} className="text-mystic-accent" />
                    <h4 className="font-bold tracking-tight text-sm">Vai trò cốt truyện (Narrative Role)</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lựa chọn một gốc rễ vai trò để AI thấu hiểu vai trò của nhân vật trong mạch truyện RPG.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ARCHETYPES.map((role) => {
                        const isSelected = data.narrativeRole === role.id;
                        return (
                            <button
                                key={role.id}
                                type="button"
                                onClick={() => onChange('narrativeRole', role.id)}
                                className={`text-left p-4 rounded-xl border transition-all duration-200 relative flex flex-col justify-between h-28 group ${
                                    isSelected
                                        ? 'bg-mystic-accent/[0.04] border-mystic-accent text-mystic-accent shadow-[0_2px_8px_-3px_rgba(var(--color-mystic-accent),0.3)]'
                                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-850 hover:border-slate-300 dark:hover:border-slate-700/80 text-slate-850 dark:text-slate-300'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between pointer-events-none mb-1">
                                        <span className="font-bold text-xs uppercase tracking-wide group-hover:text-mystic-accent transition-colors">
                                            {role.label}
                                        </span>
                                        {isSelected && (
                                            <span className="p-0.5 rounded-full bg-mystic-accent/15 text-mystic-accent">
                                                <Check size={12} strokeWidth={3} />
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-550 dark:text-slate-400 font-medium">
                                        {role.desc}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

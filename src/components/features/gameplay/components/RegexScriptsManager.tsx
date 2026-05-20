import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RegexScript } from '../../../../types';
import { Settings, X, Plus, Edit2, Trash2, Play, Bug, ToggleRight, ToggleLeft, ArrowUp, ArrowDown, AlertTriangle, Search } from 'lucide-react';
import { runRegexScript, extractFlags } from '../../../../utils/regex';

interface RegexScriptsManagerProps {
    presetName: string;
    scripts: RegexScript[];
    onChange: (scripts: RegexScript[]) => void;
    playerName?: string;
    charName?: string;
}

const renderPreviewHTML = (html: string) => {
    // Basic protection against direct execution in preview
    return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "<div class='text-[10px] text-rose-500 font-bold'>[Script Tag Removed in Preview]</div>")
               .replace(/\bon\w+\s*=\s*(['"])(.*?)\1/gi, "on[Event]='removed'")
               .replace(/\bon\w+\s*=\s*([^>\s]+)/gi, "on[Event]=removed");
};

const RegexScriptsManager: React.FC<RegexScriptsManagerProps> = ({ presetName, scripts, onChange, playerName, charName }) => {
    // UI states
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<RegexScript | null>(null);
    const [testInput, setTestInput] = useState('Dữ liệu mẫu để kiểm tra Regex...');
    const [showTest, setShowTest] = useState(false);
    const [regexError, setRegexError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const handleRegexChange = (val: string) => {
        if (!editingScript) return;
        setEditingScript({...editingScript, findRegex: val});
        try {
            const extracted = extractFlags(val);
            new RegExp(extracted.regex || val, extracted.flags || "g");
            setRegexError(null);
        } catch (e) {
            setRegexError((e as Error).message);
        }
    };

    const handleToggleDisable = (scriptId: string) => {
        const newList = scripts.map(s => s.id === scriptId ? { ...s, disabled: !s.disabled } : s);
        onChange(newList);
    };

    const handleDelete = (scriptId: string) => {
        setDeletingId(scriptId);
    };
    
    const confirmDelete = (scriptId: string) => {
        onChange(scripts.filter(s => s.id !== scriptId));
        setDeletingId(null);
    };

    const handleMove = (index: number, direction: 'up' | 'down') => {
        const list = [...scripts];
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === list.length - 1)) return;
        const temp = list[index];
        if (direction === 'up') {
            list[index] = list[index - 1];
            list[index - 1] = temp;
        } else {
            list[index] = list[index + 1];
            list[index + 1] = temp;
        }
        onChange(list);
    };

    const openEditor = (script: RegexScript | null) => {
        if (script) {
            setEditingScript({ 
                ...script,
                markdownOnly: script.markdownOnly ?? script.alterChatDisplay ?? false,
                promptOnly: script.promptOnly ?? script.alterOutgoingPrompt ?? false
            });
        } else {
            setEditingScript({
                id: crypto.randomUUID(),
                scriptName: 'Script Mới',
                findRegex: '',
                replaceString: '',
                trimStrings: [],
                placement: [1, 2], // Default apply to user + char message
                substituteRegex: 0,
                markdownOnly: false,
                promptOnly: false,
                minDepth: null,
                maxDepth: null,
                disabled: false,
                runOnEdit: false
            });
        }
        setIsEditorOpen(true);
    };

    const saveEditor = () => {
        if (!editingScript) return;
        
        // Ensure ST backward compatibility fields are saved
        const scriptToSave = {
            ...editingScript,
            alterChatDisplay: editingScript.markdownOnly,
            alterOutgoingPrompt: editingScript.promptOnly
        };

        const idx = scripts.findIndex(s => s.id === editingScript.id);
        if (idx >= 0) {
            const newList = [...scripts];
            newList[idx] = scriptToSave;
            onChange(newList);
        } else {
            onChange([...scripts, scriptToSave]);
        }
        setIsEditorOpen(false);
    };

    const filteredScripts = scripts.filter(s => 
        (s.scriptName?.toLowerCase().includes(searchQuery.toLowerCase()) || '') ||
        (s.findRegex?.toLowerCase().includes(searchQuery.toLowerCase()) || '')
    );

    return (
        <div className="flex flex-col h-full relative p-4">
            <div className="flex flex-col gap-3 mb-6 pb-4 border-b border-slate-800">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                            <Settings size={20} className="text-mystic-accent" /> Regex Scripts của {presetName}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {scripts.length} kịch bản đang có trong Preset này.
                        </p>
                    </div>
                    
                    <div className="flex gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer">
                        Nhập JSON
                        <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                    try {
                                        const parsed = JSON.parse(ev.target?.result as string);
                                        if (Array.isArray(parsed)) {
                                            const newScripts = parsed.map(p => ({...p, id: globalThis.crypto.randomUUID()}));
                                            onChange([...scripts, ...newScripts]);
                                        } else if (parsed && typeof parsed === 'object') {
                                            const newScript = {...parsed, id: globalThis.crypto.randomUUID()};
                                            onChange([...scripts, newScript as RegexScript]);
                                        }
                                    } catch (err) {
                                        console.error('Failed to parse JSON', err);
                                    }
                                };
                                reader.readAsText(file);
                                e.target.value = ''; // reset
                            }}
                        />
                    </label>
                    <button 
                        onClick={() => {
                            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scripts, null, 2));
                            const downloadAnchorNode = document.createElement('a');
                            downloadAnchorNode.setAttribute("href", dataStr);
                            downloadAnchorNode.setAttribute("download", `regex_scripts_${presetName.replace(/\s+/g, '_')}.json`);
                            document.body.appendChild(downloadAnchorNode);
                            downloadAnchorNode.click();
                            downloadAnchorNode.remove();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                        Xuất JSON
                    </button>
                    <button 
                        onClick={() => openEditor(null)} 
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all border shadow-sm outline-none hover:opacity-90 bg-mystic-accent/20 border-mystic-accent text-mystic-accent"
                    >
                        <Plus size={16} /> Thêm Mới
                    </button>
                </div>
            </div>
            </div>

            <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-slate-500" />
                </div>
                <input 
                    type="text" 
                    placeholder="Tìm kiếm kịch bản (theo tên hoặc regex)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:border-mystic-accent shadow-inner transition-colors"
                />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-8">
                {filteredScripts.length === 0 ? (
                    <div className="text-center text-slate-500 p-8 text-sm border border-dashed border-slate-700/50 rounded-xl bg-slate-900/30">
                        {scripts.length === 0 ? 'Chưa có kịch bản (script) nào trong Preset này' : 'Không tìm thấy kịch bản phù hợp'}
                    </div>
                ) : filteredScripts.map((script, idx) => (
                    <div key={script.id || idx} className={`rounded-xl border transition-all ${!script.disabled ? 'bg-slate-800/80 border-slate-600 shadow-sm' : 'bg-slate-900/40 border-slate-800 opacity-60'}`}>
                        <div className="p-4 flex justify-between items-center group">
                            <div className="flex items-center flex-1 mr-4 gap-4">
                                <div className="flex flex-col gap-1 opacity-30 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button 
                                        onClick={() => handleMove(idx, 'up')}
                                        disabled={idx === 0}
                                        className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent text-slate-400"
                                    >
                                        <ArrowUp size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleMove(idx, 'down')}
                                        disabled={idx === scripts.length - 1}
                                        className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent text-slate-400"
                                    >
                                        <ArrowDown size={14} />
                                    </button>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className={`text-base font-bold truncate max-w-[200px] sm:max-w-[400px] ${!script.disabled ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                                            {script.scriptName || 'ST Regex Script'}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 bg-slate-700 text-slate-300 rounded shrink-0 shadow-inner">
                                            {script.placement ? script.placement.length : 0} Places
                                        </span>
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-400 mt-1 mb-2 truncate max-w-full bg-slate-900/50 px-2 py-1 rounded inline-block border border-slate-700/50">
                                        {script.findRegex || '(Empty Regex)'}
                                    </div>
                                    <div className="flex items-center gap-4 mt-1">
                                        <button
                                            onClick={() => openEditor(script)}
                                            className="text-xs flex items-center gap-1.5 font-medium transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-700 px-2 py-1 rounded outline-none"
                                        >
                                            <Edit2 size={12} /> Chỉnh sửa
                                        </button>
                                        <button
                                            onClick={() => {
                                                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(script, null, 2));
                                                const downloadAnchorNode = document.createElement('a');
                                                downloadAnchorNode.setAttribute("href", dataStr);
                                                const safeName = (script.scriptName || 'regex_script').replace(/\s+/g, '_').toLowerCase();
                                                downloadAnchorNode.setAttribute("download", `regex_${safeName}.json`);
                                                document.body.appendChild(downloadAnchorNode);
                                                downloadAnchorNode.click();
                                                downloadAnchorNode.remove();
                                            }}
                                            className="text-xs flex items-center gap-1.5 font-medium transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-700 px-2 py-1 rounded outline-none"
                                        >
                                            Xuất
                                        </button>
                                        
                                        {deletingId === script.id ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-red-400 font-bold">Xóa?</span>
                                                <button onClick={() => confirmDelete(script.id!)} className="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded font-bold">Có</button>
                                                <button onClick={() => setDeletingId(null)} className="text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded">Không</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleDelete(script.id!)}
                                                className="text-xs text-red-500/70 hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded flex items-center gap-1.5 transition-colors outline-none"
                                            >
                                                <Trash2 size={12} /> Xóa
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleToggleDisable(script.id!)}
                                className={`${!script.disabled ? 'text-green-500 drop-shadow-md' : 'text-slate-600'} hover:scale-[1.10] transition-transform outline-none`}
                                title={!script.disabled ? "Đang BẬT" : "Đang TẮT"}
                            >
                                {!script.disabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {isEditorOpen && editingScript && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
                        style={{ zIndex: 1010 }}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1a1a24] border border-[#2d2f3d] w-full max-w-5xl max-h-[96vh] flex flex-col rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden"
                        >
                            {/* HEADER */}
                            <div className="flex justify-between items-center p-4 border-b border-[#2d2f3d] bg-[#14151c] shadow-sm relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                                        <Settings size={20} className="text-indigo-400" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-lg text-slate-200">
                                            Regex Script Editor
                                        </h2>
                                        <p className="text-xs text-slate-400">
                                            Preset: <span className="text-indigo-300 font-semibold">{presetName}</span>
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-slate-500 transition-colors">
                                    <X size={20}/>
                                </button>
                            </div>

                            {/* BODY CONTENT */}
                            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-[#111218]">
                                <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[#2d2f3d]">
                                    
                                    {/* LEFT COLUMN - MAIN SETTINGS */}
                                    <div className="flex-1 p-6 space-y-6">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 space-y-1.5">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Tên Kịch Bản (Script Name)</label>
                                                <input 
                                                    className="w-full p-2.5 bg-[#1a1b26] rounded-lg border border-[#3b3d4d] outline-none focus:border-indigo-500 text-slate-200 font-medium transition-colors shadow-inner" 
                                                    value={editingScript.scriptName} 
                                                    onChange={e => setEditingScript({...editingScript, scriptName: e.target.value})} 
                                                />
                                            </div>
                                            <label className="flex flex-col items-center gap-1.5 cursor-pointer pt-6">
                                                <div className="relative inline-block w-12 h-6 rounded-full bg-[#1a1b26] border border-[#3b3d4d] overflow-hidden">
                                                    <input 
                                                        type="checkbox" 
                                                        className="peer sr-only" 
                                                        checked={!editingScript.disabled} 
                                                        onChange={e => setEditingScript({...editingScript, disabled: !e.target.checked})} 
                                                    />
                                                    <div className="absolute inset-0 bg-indigo-500 opacity-0 peer-checked:opacity-100 transition-opacity" />
                                                    <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6 shadow-sm" />
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Trạng Thái</span>
                                            </label>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                                    Regex Pattern (Tìm Kiếm)
                                                    {regexError && (
                                                        <span className="text-[10px] text-red-400 normal-case flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                                                            <AlertTriangle size={12} /> Lỗi cú pháp
                                                        </span>
                                                    )}
                                                </label>
                                                <span className="text-[10px] bg-[#1a1b26] text-amber-500/80 px-2 py-0.5 rounded border border-amber-900/30">Hỗ trợ Regex JS gốc (vd: /pattern/gi)</span>
                                            </div>
                                            <textarea 
                                                className={`w-full p-3 font-mono text-sm bg-[#1a1b26] rounded-lg border min-h-[60px] outline-none transition-colors resize-y custom-scrollbar shadow-inner ${regexError ? 'border-red-500/50 focus:border-red-500 text-red-400' : 'border-[#3b3d4d] focus:border-indigo-500 text-pink-400'}`} 
                                                placeholder="/(nhập mẫu regex ở đây)/gi" 
                                                value={editingScript.findRegex} 
                                                onChange={e => handleRegexChange(e.target.value)} 
                                            />
                                            {regexError && (
                                                <div className="text-[10px] text-red-400/80 font-mono break-all mt-1">{regexError}</div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                                    Chuỗi Thay Thế (Replace With)
                                                </label>
                                                <div className="flex gap-2">
                                                    <span className="text-[10px] bg-emerald-900/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-900/40">Hỗ trợ biến $1, $2, {'{{match}}'}</span>
                                                    <span className="text-[10px] bg-indigo-900/20 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900/40">Macro HTML/CSS/JS</span>
                                                </div>
                                            </div>
                                            <textarea 
                                                className="w-full p-4 font-mono text-sm text-emerald-400 bg-[#1a1b26] rounded-lg border border-[#3b3d4d] min-h-[200px] outline-none focus:border-indigo-500 resize-y custom-scrollbar shadow-inner" 
                                                value={editingScript.replaceString} 
                                                onChange={e => setEditingScript({...editingScript, replaceString: e.target.value})} 
                                                placeholder="HTML/CSS/JS (Widget API) hoặc Text thuần...\nVí dụ:\n```html\n<div class='custom-card'>\n  <script>console.log('Regex JS works!');</script>\n  $1\n</div>\n```" 
                                            />
                                        </div>
                                        
                                        <div className="space-y-1.5 pt-4 border-t border-[#2d2f3d]">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                                    Regex Kích Hoạt Tối Thiểu (Min Activation Regex)
                                                </label>
                                                <span className="text-[10px] bg-[#1a1b26] text-slate-500 px-2 py-0.5 rounded border border-[#3b3d4d]">Tuỳ chọn (SillyTavern ST)</span>
                                            </div>
                                            <input 
                                                className="w-full p-2.5 bg-[#1a1b26] rounded-lg border border-[#3b3d4d] outline-none focus:border-indigo-500 font-mono text-sm text-slate-300 transition-colors shadow-inner" 
                                                placeholder="/(phải có từ này mới chạy)/i" 
                                                value={editingScript.minActivationRegex || ''} 
                                                onChange={e => setEditingScript({...editingScript, minActivationRegex: e.target.value})} 
                                            />
                                        </div>

                                        <div className="space-y-1.5 pt-4 border-t border-[#2d2f3d]">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Trim Substrings (Xóa chuỗi - Mỗi chuỗi 1 dòng)</label>
                                            <textarea 
                                                className="w-full p-3 text-sm bg-[#1a1b26] rounded-lg border border-[#3b3d4d] min-h-[100px] outline-none focus:border-indigo-500 resize-y custom-scrollbar text-slate-300 shadow-inner" 
                                                placeholder="Chuỗi cần xóa sau khi replace...\nVí dụ: <br>"
                                                value={editingScript.trimStrings?.join('\n') || ''} 
                                                onChange={e => setEditingScript({...editingScript, trimStrings: e.target.value.split('\n')})} 
                                            />
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN - ADVANCED & TESTER */}
                                    <div className="flex-1 flex flex-col w-full lg:max-w-md bg-[#161720]">
                                        <div className="p-6 space-y-6">
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2d2f3d] pb-2">Scope (Phạm Vi Áp Dụng)</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        {v: 1, l: 'User Messages'},
                                                        {v: 2, l: 'Character Messages'},
                                                        {v: 3, l: 'Slash Command'},
                                                        {v: 4, l: 'World Info'},
                                                        {v: 5, l: 'Reasoning (Thinking)'}
                                                    ].map(p => (
                                                        <label key={p.v} className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-all ${editingScript.placement?.includes(p.v) ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-[#1a1b26] border-[#3b3d4d] hover:border-slate-500'}`}>
                                                            <input type="checkbox" className="w-3.5 h-3.5 rounded text-indigo-500 bg-[#111218] border-[#3b3d4d]" checked={editingScript.placement?.includes(p.v) || false} onChange={e => {
                                                                const arr = editingScript.placement || [];
                                                                setEditingScript({...editingScript, placement: e.target.checked ? [...arr, p.v] : arr.filter(x => x !== p.v)});
                                                            }}/> 
                                                            <span className={`text-[11px] font-bold ${editingScript.placement?.includes(p.v) ? 'text-indigo-300' : 'text-slate-300'}`}>{p.l}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2d2f3d] pb-2">Execution Timing (Thời Điểm Xử Lý)</h4>
                                                <div className="space-y-2">
                                                    <label className="flex items-start gap-2.5 p-2 hover:bg-[#1a1b26] rounded-lg cursor-pointer transition-colors">
                                                        <input type="checkbox" checked={editingScript.markdownOnly || false} onChange={e => setEditingScript({...editingScript, markdownOnly: e.target.checked})} className="mt-0.5 w-4 h-4 rounded text-indigo-500 bg-[#111218] border-[#3b3d4d]"/> 
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-200">On Display (Ngay khi hiển thị)</p>
                                                        </div>
                                                    </label>
                                                    <label className="flex items-start gap-2.5 p-2 hover:bg-[#1a1b26] rounded-lg cursor-pointer transition-colors">
                                                        <input type="checkbox" checked={editingScript.promptOnly || false} onChange={e => setEditingScript({...editingScript, promptOnly: e.target.checked})} className="mt-0.5 w-4 h-4 rounded text-amber-500 bg-[#111218] border-[#3b3d4d]"/> 
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-200">On Send (Ngay khi gửi prompt)</p>
                                                        </div>
                                                    </label>
                                                    <label className="flex items-start gap-2.5 p-2 hover:bg-[#1a1b26] rounded-lg cursor-pointer transition-colors">
                                                        <input type="checkbox" checked={editingScript.runOnEdit || false} onChange={e => setEditingScript({...editingScript, runOnEdit: e.target.checked})} className="mt-0.5 w-4 h-4 rounded text-emerald-500 bg-[#111218] border-[#3b3d4d]"/> 
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-200">Receive and Edit</p>
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase text-slate-400">Min Depth</label>
                                                    <input type="number" placeholder="0 = Last Message" className="w-full p-2 text-sm bg-[#1a1b26] border border-[#3b3d4d] rounded-lg text-slate-200 outline-none" value={(editingScript.minDepth === null || editingScript.minDepth === undefined || isNaN(editingScript.minDepth as any)) ? '' : editingScript.minDepth} onChange={e => setEditingScript({...editingScript, minDepth: e.target.value === '' ? null : Number(e.target.value)})} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase text-slate-400">Max Depth</label>
                                                    <input type="number" placeholder="Empty = Unlimited" className="w-full p-2 text-sm bg-[#1a1b26] border border-[#3b3d4d] rounded-lg text-slate-200 outline-none" value={(editingScript.maxDepth === null || editingScript.maxDepth === undefined || isNaN(editingScript.maxDepth as any)) ? '' : editingScript.maxDepth} onChange={e => setEditingScript({...editingScript, maxDepth: e.target.value === '' ? null : Number(e.target.value)})} />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase text-slate-400">Macro Template Substitute</label>
                                                <select className="w-full p-2 text-sm bg-[#1a1b26] border border-[#3b3d4d] rounded-lg text-slate-200 outline-none" value={editingScript.substituteRegex || 0} onChange={e => setEditingScript({...editingScript, substituteRegex: Number(e.target.value)})}>
                                                    <option value={0}>0 - No Substitution</option>
                                                    <option value={1}>1 - Raw templates</option>
                                                    <option value={2}>2 - Pattern-escaped templates</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* TESTER MODULE */}
                                        <div className="mt-auto border-t border-[#2d2f3d] bg-[#0c0d12] flex flex-col min-h-[300px]">
                                            <div className="p-3 border-b border-[#2d2f3d] flex justify-between items-center bg-[#14151c]">
                                                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                                    <Bug size={14} className="text-rose-400" /> Live Regex Tester
                                                </h4>
                                                <div className="flex bg-[#1a1b26] rounded p-0.5 border border-[#3b3d4d]">
                                                    <button onClick={() => setShowTest(true)} className={`px-2 py-0.5 text-[10px] font-bold rounded ${showTest ? 'bg-rose-500/20 text-rose-400' : 'text-slate-500'}`}>ON</button>
                                                    <button onClick={() => setShowTest(false)} className={`px-2 py-0.5 text-[10px] font-bold rounded ${!showTest ? 'bg-slate-700 text-slate-200' : 'text-slate-500'}`}>OFF</button>
                                                </div>
                                            </div>

                                            {showTest && (
                                                <div className="p-4 flex flex-col gap-4 flex-1 h-[250px] overflow-auto custom-scrollbar">
                                                    <div className="space-y-1.5 shrink-0">
                                                        <label className="text-[10px] font-bold uppercase text-slate-500">Test Input (Chuỗi cần chạy regex gốc)</label>
                                                        <textarea 
                                                            className="w-full p-2 text-xs bg-[#1a1b26] rounded border border-[#3b3d4d] h-[60px] outline-none resize-none text-slate-300 custom-scrollbar shadow-inner" 
                                                            value={testInput} 
                                                            onChange={e => setTestInput(e.target.value)} 
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5 flex-1 flex flex-col block">
                                                        <label className="text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                                                            <span>Preview Render Output</span>
                                                        </label>
                                                        <iframe 
                                                            className="w-full bg-black/40 rounded border border-[#3b3d4d] flex-1 overflow-auto custom-scrollbar" 
                                                            sandbox=""
                                                            srcDoc={`<html><head><style>body { margin: 0; padding: 12px; font-family: ui-sans-serif, system-ui, sans-serif; color: #e2e8f0; font-size: 14px; word-break: break-word; white-space: pre-wrap; }</style></head><body>${renderPreviewHTML(runRegexScript(editingScript, testInput || ' ', { userName: playerName || 'User', charName: charName || 'Character' }) || testInput)}</body></html>`}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* FOOTER */}
                            <div className="p-4 border-t border-[#2d2f3d] bg-[#14151c] flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] z-10">
                                <button className="px-5 py-2 font-bold rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm" onClick={() => setIsEditorOpen(false)}>Hủy bỏ</button>
                                <button className="px-6 py-2 font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all text-sm flex items-center gap-2" onClick={saveEditor}>
                                    <Play size={14} className="fill-white" /> Lưu Kịch Bản
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RegexScriptsManager;

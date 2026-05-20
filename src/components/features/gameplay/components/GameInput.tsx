
import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Copy, Maximize2, Minimize2 } from 'lucide-react';
import { ChatMessage } from '../../../../types';
import Button from '../../../ui/Button';
import { tavoRegistry } from '../../../../services/api/tavoApi';

interface GameInputProps {
    onSend: (text: string) => void;
    isLoading: boolean;
    lastAction: string;
    isInputCollapsed: boolean;
    onToggleCollapse: () => void;
    activeChoices: string[];
    history: ChatMessage[];
    children?: React.ReactNode;
}

export interface GameInputRef {
    getInputValue: () => string;
    setInputValue: (val: string) => void;
    appendInputValue: (val: string) => void;
    clearInputValue: () => void;
    sendInput: () => void;
}

const GameInput = forwardRef<GameInputRef, GameInputProps>(({
    onSend,
    isLoading,
    lastAction,
    isInputCollapsed,
    onToggleCollapse,
    activeChoices,
    history,
    children
}, ref) => {
    const [inputValue, setInputValue] = useState('');
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [tempInputValue, setTempInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputValueRef = useRef(inputValue);
    
    useEffect(() => {
        inputValueRef.current = inputValue;
    }, [inputValue]);

    const handleSendInternal = useCallback((text?: string) => {
        const textToSend = typeof text === 'string' ? text.trim() : inputValueRef.current.trim();
        if (!textToSend || isLoading) return;
        onSend(textToSend);
        setInputValue('');
        setHistoryIndex(-1);
        setTempInputValue('');
    }, [isLoading, onSend]);

    useImperativeHandle(ref, () => ({
        getInputValue: () => inputValueRef.current,
        setInputValue: (v: string) => setInputValue(v),
        appendInputValue: (v: string) => setInputValue(prev => prev + v),
        clearInputValue: () => setInputValue(''),
        sendInput: () => handleSendInternal()
    }), [handleSendInternal]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendInternal();
        } else if (e.key === 'ArrowUp') {
            const target = e.target as HTMLTextAreaElement;
            if (target.selectionStart === 0) {
                const userMessages = history.filter(m => m.role === 'user').map(m => m.text).reverse();
                if (userMessages.length > 0) {
                    const nextIndex = historyIndex + 1;
                    if (nextIndex < userMessages.length) {
                        e.preventDefault();
                        if (historyIndex === -1) {
                            setTempInputValue(inputValue);
                        }
                        setHistoryIndex(nextIndex);
                        setInputValue(userMessages[nextIndex]);
                    }
                }
            }
        } else if (e.key === 'ArrowDown') {
            const target = e.target as HTMLTextAreaElement;
            if (target.selectionStart === inputValue.length && historyIndex >= 0) {
                const userMessages = history.filter(m => m.role === 'user').map(m => m.text).reverse();
                e.preventDefault();
                const nextIndex = historyIndex - 1;
                setHistoryIndex(nextIndex);
                if (nextIndex === -1) {
                    setInputValue(tempInputValue);
                } else {
                    setInputValue(userMessages[nextIndex]);
                }
            }
        }
    };

    return (
        <div className="w-full flex flex-col gap-2">
            {/* Quick Actions (Choices) */}
            <AnimatePresence>
                {activeChoices.length > 0 && !isLoading && !isInputCollapsed && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="px-2 md:px-4 mb-1"
                    >
                        <div className="flex flex-col gap-1.5 max-h-[30vh] md:max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                            {activeChoices.map((choice, idx) => {
                                // Parse choice for time cost if present (e.g. "Action | 10m")
                                const parts = choice.split('|');
                                const displayAction = parts[0].trim();
                                const displayTime = parts[1] ? parts[1].trim().replace('m', '') : null;

                                return (
                                    <motion.div 
                                        key={idx} 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex gap-1 group"
                                    >
                                        <button 
                                            onClick={() => handleSendInternal(displayAction)}
                                            className="flex-1 text-left text-xs md:text-sm py-2 px-3 rounded-md bg-stone-200/80 dark:bg-slate-800/60 border border-stone-400/50 dark:border-slate-700/50 hover:border-mystic-accent/40 hover:bg-stone-100 dark:hover:bg-slate-800/80 text-stone-700 dark:text-slate-300 hover:text-mystic-accent transition-all flex items-center justify-between gap-3 group/btn"
                                        >
                                            <span className="flex-1 leading-snug">{displayAction}</span>
                                            {displayTime && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className="text-[9px] font-mono font-bold text-mystic-accent/80 bg-mystic-accent/5 px-1.5 py-0.5 rounded border border-mystic-accent/20">
                                                        {displayTime}m
                                                    </span>
                                                </div>
                                            )}
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(displayAction);
                                            }}
                                            className="w-9 rounded-md bg-stone-200/50 dark:bg-slate-800/40 border border-stone-400/30 dark:border-slate-700/30 hover:border-mystic-accent/30 text-stone-400 dark:text-slate-500 hover:text-mystic-accent transition-all flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            title="Sao chép"
                                        >
                                            <Copy size={12} />
                                        </button>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input Bar */}
            <div className="p-1.5 md:p-2 flex flex-col gap-2 border-t border-stone-400 dark:border-slate-800 bg-stone-300/50 dark:bg-slate-900/50 backdrop-blur-sm">
                {/* Top Row: Input Area */}
                <AnimatePresence initial={false}>
                    {!isInputCollapsed && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="w-full overflow-hidden"
                        >
                            <div className="relative w-full group">
                                <textarea 
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Nhập hành động..."
                                    className="w-full bg-stone-200 dark:bg-slate-800/80 border border-stone-400 dark:border-slate-700 rounded-lg p-2.5 pb-12 text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent focus:bg-stone-100 dark:focus:bg-slate-800 transition-all resize-none h-20 md:h-28 custom-scrollbar font-sans text-sm md:text-base shadow-inner"
                                />
                                <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                                    {/* Phục hồi Button (Inside) */}
                                    <button 
                                        onClick={() => {
                                            if (lastAction) {
                                                setInputValue(lastAction);
                                            }
                                        }} 
                                        disabled={isLoading || !lastAction} 
                                        className="h-8 px-3 text-[10px] font-bold uppercase tracking-tighter bg-stone-300/80 dark:bg-slate-700/80 hover:bg-stone-400 dark:hover:bg-slate-600 text-stone-600 dark:text-slate-300 rounded border border-stone-400 dark:border-slate-600 disabled:opacity-30 transition-all"
                                        title="Phục hồi hành động gần nhất"
                                    >
                                        Phục hồi
                                    </button>
                                    {/* Send Button (Inside) */}
                                    <button 
                                        onClick={() => handleSendInternal()} 
                                        disabled={isLoading || !inputValue.trim()} 
                                        className="h-8 w-12 flex items-center justify-center bg-mystic-accent hover:bg-mystic-accent-light text-white rounded shadow-sm disabled:opacity-30 transition-all"
                                        title="Gửi hành động"
                                    >
                                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Bottom Row: Controls */}
                <div className="flex gap-1 items-center w-full overflow-x-auto no-scrollbar pb-0.5">
                    <div className="flex items-center gap-1 flex-1 justify-center">
                        {/* Send Button (Only when collapsed) */}
                        {isInputCollapsed && (
                            <Button 
                                variant="primary" 
                                onClick={() => handleSendInternal()} 
                                disabled={isLoading} 
                                className="h-9 md:h-10 px-4 flex items-center justify-center shrink-0"
                                title="Gửi hành động (Continue)"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </Button>
                        )}
                        
                        {children}
                    </div>

                    {/* Toggle Input Button - Fills remaining space */}
                    <button 
                        onClick={onToggleCollapse}
                        className={`h-9 md:h-10 px-3 rounded border transition-all flex items-center justify-center gap-2 flex-1 shadow-sm min-w-[40px] ${
                            isInputCollapsed 
                            ? 'bg-mystic-accent/10 border-mystic-accent/30 text-mystic-accent' 
                            : 'bg-stone-200 dark:bg-slate-800 border-stone-400 dark:border-slate-700 text-stone-500'
                        }`}
                        title={isInputCollapsed ? "Mở rộng ô nhập" : "Thu gọn ô nhập"}
                    >
                        {isInputCollapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                        <span className="text-[10px] font-bold uppercase whitespace-nowrap">
                            {isInputCollapsed ? 'Mở Rộng' : 'Thu Gọn'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
});

export default React.memo(GameInput);


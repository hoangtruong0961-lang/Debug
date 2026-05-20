
import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, Info, Terminal, Search } from 'lucide-react';
import { logService, LogEntry, LogLevel } from '../../../../services/log/logService';
import { motion, AnimatePresence } from 'framer-motion';

interface LogConsoleProps {
  onClose: () => void;
}

const LogConsole: React.FC<LogConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>(() => logService.getLogs());
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logService.subscribe(newLogs => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filter === 'all' || log.level === filter;
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const clearLogs = () => {
    logService.clearLogs();
  };

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error': return <AlertCircle size={14} className="text-red-500" />;
      case 'warn': return <AlertTriangle size={14} className="text-amber-500" />;
      case 'info': return <Info size={14} className="text-blue-500" />;
      case 'debug': return <Terminal size={14} className="text-stone-500" />;
    }
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'warn': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'info': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'debug': return 'bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20';
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-100 dark:bg-mystic-950 border border-stone-300 dark:border-slate-800 rounded-lg overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-stone-200 dark:bg-mystic-900 border-b border-stone-300 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-mystic-accent" />
          <h2 className="text-sm font-bold text-stone-800 dark:text-slate-200 uppercase tracking-widest">Log Console</h2>
          <span className="px-1.5 py-0.5 bg-stone-300 dark:bg-mystic-800 rounded text-[10px] font-mono text-stone-600 dark:text-slate-400">
            {filteredLogs.length} logs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={clearLogs}
            className="p-1.5 text-stone-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
            title="Clear Logs"
          >
            <Trash2 size={16} />
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-white hover:bg-stone-300 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-2 bg-stone-150 dark:bg-mystic-900/50 border-b border-stone-300 dark:border-slate-800 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[150px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input 
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-mystic-950 border border-stone-300 dark:border-slate-800 rounded text-xs text-stone-800 dark:text-slate-200 focus:border-mystic-accent outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'error', 'warn', 'info'] as const).map(l => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all border ${
                filter === l 
                ? 'bg-mystic-accent text-white border-mystic-accent shadow-sm' 
                : 'bg-stone-200 dark:bg-mystic-800 text-stone-500 border-stone-300 dark:border-slate-700 hover:border-stone-400'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Log List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar font-mono text-[11px]"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 dark:text-slate-600 opacity-50 space-y-2">
            <Terminal size={32} strokeWidth={1} />
            <p className="text-xs italic">No logs found</p>
          </div>
        ) : (
          filteredLogs.map(log => (
            <div 
              key={log.id} 
              className={`border rounded overflow-hidden transition-all ${getLevelColor(log.level)}`}
            >
              <div 
                className="flex items-start gap-2 p-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
              >
                <div className="mt-0.5 shrink-0">{getLevelIcon(log.level)}</div>
                <div className="flex-1 break-all line-clamp-2 leading-tight">
                  <span className="opacity-50 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  {log.message}
                </div>
                <div className="shrink-0 opacity-50">
                  {expandedLogId === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>
              
              <AnimatePresence>
                {expandedLogId === log.id && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 p-2 overflow-x-auto custom-scrollbar"
                  >
                    <pre className="whitespace-pre-wrap break-all text-[10px]">
                      {typeof log.details === 'object' 
                        ? JSON.stringify(log.details, null, 2) 
                        : String(log.details || 'No additional details')}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogConsole;

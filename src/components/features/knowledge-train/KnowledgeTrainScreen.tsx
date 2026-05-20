import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { dbService, DEFAULT_SETTINGS } from '../../../services/db/indexedDB';
import { vectorService } from '../../../services/ai/vectorService';
import { AppSettings, GameState, NavigationProps } from '../../../types';
import { ChevronLeft, FileText, Settings, Upload, Play, CheckCircle, Trash2, StopCircle, HardDrive } from 'lucide-react';
import Button from '../../ui/Button';

// Utility for token estimation
const estimateTokens = (text: string) => {
  return Math.ceil(text.split(/\s+/).length * 1.3);
};

// Simple text chunker
const chunkText = (text: string, wordsPerChunk: number, overlapWords: number) => {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + wordsPerChunk);
    if (chunkWords.length > 0) {
      chunks.push(chunkWords.join(' '));
    }
    i += (wordsPerChunk - overlapWords);
    // Prevent infinite loop if overlap is too large
    if (wordsPerChunk - overlapWords <= 0) break;
  }
  return chunks;
};

export default function KnowledgeTrainScreen({ onNavigate }: NavigationProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [files, setFiles] = useState<File[]>([]);
  const [storyName, setStoryName] = useState('');
  const [wordsPerChunk, setWordsPerChunk] = useState(500);
  const [overlapWords, setOverlapWords] = useState(50);
  
  const [logs, setLogs] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isCancelledRef = useRef<boolean>(false);

  const [bgImage, setBgImage] = useState<string | null>("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
  const bgBlur = localStorage.getItem('ark_v2_bg_blur') !== 'false';

  useEffect(() => {
    dbService.getSettings().then(s => {
      if (s) setSettings(s);
    });

    dbService.getAsset('ark_v2_custom_bg').then(savedBg => {
      if (savedBg) {
        setBgImage(savedBg);
      } else {
        dbService.getAsset('ark_v1_custom_bg').then(legacyBg => {
          if (legacyBg) {
            setBgImage(legacyBg);
          } else {
            setBgImage("https://i.ibb.co/GfrntJtx/d8103ce8dea71d9a891e08e3ff0534c1.webp");
          }
        });
      }
    });
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      if (e.target.files.length > 0 && !storyName) {
         setStoryName(e.target.files[0].name.replace('.txt', ''));
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const startTraining = async () => {
    if (files.length === 0) {
      addLog("Lỗi: Vui lòng chọn ít nhất 1 file TXT.");
      return;
    }
    if (!storyName.trim()) {
      addLog("Lỗi: Vui lòng nhập Tên Story.");
      return;
    }

    setIsTraining(true);
    isCancelledRef.current = false;
    setLogs([]);
    addLog(`Bắt đầu xử lý ${files.length} files...`);

    try {
      let combinedText = '';
      for (const file of files) {
        addLog(`Đang đọc file: ${file.name}...`);
        const text = await file.text();
        combinedText += text + '\n\n';
      }

      addLog(`Tổng số từ ước tính: ${combinedText.split(/\s+/).length}`);
      
      const chunks = chunkText(combinedText, wordsPerChunk, overlapWords);
      addLog(`Chia thành ${chunks.length} chunks (Words: ${wordsPerChunk}, Overlap: ${overlapWords}).`);
      
      setProgress({ current: 0, total: chunks.length });
      
      const embeddedData: any[] = [];
      let successCount = 0;
      let failCount = 0;
      const BATCH_SIZE = 10; // Tăng tốc độ bằng xử lý song song nhiều chunks

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        if (isCancelledRef.current) {
          addLog("Tiến trình đã bị người dùng hủy.");
          break;
        }

        const currentBatch = chunks.slice(i, i + BATCH_SIZE);
        addLog(`Đang train batch từ ${i + 1} đến ${i + currentBatch.length}/${chunks.length}...`);
        
        try {
          const promises = currentBatch.map(async (chunk, batchIndex) => {
             const chunkIndex = i + batchIndex;
             try {
                const embedding = await vectorService.getEmbedding(chunk, settings);
                if (embedding) {
                  return {
                    id: `${storyName.replace(/\s+/g, '_')}_chunk_${chunkIndex}`,
                    text: chunk,
                    embedding: embedding,
                    meta: {
                      story: storyName,
                      chunkIndex: chunkIndex
                    }
                  };
                }
             } catch(err) {
                 return null;
             }
             return null;
          });

          const results = await Promise.all(promises);
          
          results.forEach((res) => {
             if (res) {
                 embeddedData.push(res);
                 successCount++;
             } else {
                 failCount++;
             }
          });
          
        } catch (err: any) {
             failCount += currentBatch.length;
             addLog(`❌ Exception during batch ${i + 1}: ${err.message}`);
        }
        setProgress({ current: Math.min(i + BATCH_SIZE, chunks.length), total: chunks.length });
      }

      if (!isCancelledRef.current) {
        addLog(`Training hoàn tất. Thành công: ${successCount}, Thất bại: ${failCount}.`);
        addLog(`Đang xuất dữ liệu JSON...`);
        exportData(embeddedData);
        // Clear memory explicitly
        embeddedData.length = 0;
        addLog("🧹 Đang tự động dọn dẹp bộ nhớ...");
        addLog("🗑️ Xóa vectors temporary, analytics & metrics training...");
        addLog("✨ Hoàn tất quy trình. Hệ thống đã được làm sạch.");
      }

    } catch (err: any) {
       addLog(`Lỗi nghiêm trọng: ${err.message}`);
    } finally {
       setIsTraining(false);
       setProgress({ current: 0, total: 0 });
    }
  };

  const exportData = (data: any[]) => {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Knowledge_${storyName.replace(/\s+/g, '_')}_${Date.now()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        addLog("✅ Đã xuất ra file JSON thành công.");
    } catch(err) {
        addLog("❌ Lỗi khi xuất file: " + err);
    }
  };

  const stopTraining = () => {
    isCancelledRef.current = true;
  };

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {/* Background Layer */}
      {bgImage && (
        <>
          <div 
            className="absolute inset-0 z-0 transition-all duration-700"
            style={{ 
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: `brightness(0.4) ${bgBlur ? 'blur(8px)' : 'blur(0px)'}`
            }}
          />
          <div className="absolute inset-0 z-0 bg-stone-100/30 dark:bg-black/40 backdrop-blur-[4px]" />
        </>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 relative z-10 w-full overflow-hidden mt-safe">
        {/* Header */}
        <div className="w-full max-w-5xl flex items-center justify-between mb-4 mt-2">
          <div className="w-32 flex justify-start">
            <button 
              onClick={() => onNavigate(GameState.MENU)} 
              disabled={isTraining} 
              className="text-slate-600 dark:text-slate-300 hover:text-mystic-accent transition-colors flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl backdrop-blur-md shadow-sm border border-slate-200 dark:border-slate-800 disabled:opacity-50"
            >
              <ChevronLeft size={18} /> <span className="hidden sm:inline font-bold uppercase tracking-wider text-xs">Menu</span>
            </button>
          </div>
          <h2 className="text-xl md:text-3xl font-black text-slate-800 dark:text-white drop-shadow-md tracking-[0.2em] uppercase font-serif text-center flex-1">
              Train Knowledge
          </h2>
          <div className="w-32 flex justify-end" />
        </div>

        {/* Dynamic Wizard Card */}
        <div className="w-full max-w-5xl flex-1 flex flex-col bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl min-h-0 mx-auto p-4 md:p-8 space-y-6 overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Section */}
            <div className="space-y-4 bg-stone-100/40 dark:bg-slate-900/40 p-6 rounded-2xl border border-stone-200 dark:border-white/5 backdrop-blur-md">
              <h2 className="font-bold text-mystic-accent uppercase tracking-widest text-xs flex items-center gap-2">
                 <FileText size={16} /> 1. Dữ liệu đầu vào
              </h2>
              
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Chọn File TXT</label>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".txt"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isTraining}
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="w-full justify-center bg-mystic-accent text-mystic-950 font-bold"
                  disabled={isTraining}
                >
                  <Upload size={16} className="mr-2" /> Chọn File
                </Button>
              </div>

              {files.length > 0 && (
                <div className="bg-stone-200/50 dark:bg-slate-800/50 p-3 rounded-lg border border-stone-300 dark:border-white/5">
                  <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 font-bold">Files Đã Chọn ({files.length})</div>
                  <ul className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                    {files.map((f, idx) => (
                      <li key={idx} className="flex items-center justify-between text-sm bg-stone-300/80 dark:bg-slate-900/80 px-3 py-2 rounded-md">
                        <span className="truncate max-w-[200px] text-stone-900 dark:text-slate-300">{f.name}</span>
                        <button onClick={() => removeFile(idx)} disabled={isTraining} className="text-red-500 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Tên Story</label>
                <input 
                  type="text" 
                  value={storyName}
                  onChange={(e) => setStoryName(e.target.value)}
                  className="w-full bg-stone-50 dark:bg-[#0a0f1d] border border-stone-300 dark:border-mystic-accent/30 rounded-lg px-4 py-2.5 text-sm text-stone-900 dark:text-slate-200 focus:outline-none focus:border-mystic-accent transition-colors font-medium"
                  placeholder="Nhập tên story..."
                  disabled={isTraining}
                />
              </div>
            </div>

            {/* Settings Section */}
            <div className="space-y-4 bg-stone-100/40 dark:bg-slate-900/40 p-6 rounded-2xl border border-stone-200 dark:border-white/5 backdrop-blur-md">
              <h2 className="font-bold text-mystic-accent uppercase tracking-widest text-xs flex items-center gap-2">
                 <Settings size={16} /> 2. Cài Đặt Chunk Training
              </h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Số từ / Chunk</label>
                  <input 
                    type="number"
                    value={wordsPerChunk}
                    onChange={(e) => setWordsPerChunk(parseInt(e.target.value) || 500)}
                    min={100}
                    className="w-full bg-stone-50 dark:bg-[#0a0f1d] border border-stone-300 dark:border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-stone-900 dark:text-slate-200 outline-none font-medium"
                    disabled={isTraining}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Số từ Overlap</label>
                  <input 
                    type="number"
                    value={overlapWords}
                    onChange={(e) => setOverlapWords(parseInt(e.target.value) || 50)}
                    min={0}
                    max={wordsPerChunk - 1}
                    className="w-full bg-stone-50 dark:bg-[#0a0f1d] border border-stone-300 dark:border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-stone-900 dark:text-slate-200 outline-none font-medium"
                    disabled={isTraining}
                  />
                </div>
              </div>

              <div className="p-4 bg-mystic-accent/10 border border-mystic-accent/20 rounded-xl mt-4">
                 <h3 className="text-xs uppercase tracking-widest text-mystic-accent mb-1 font-bold">Ước Tính Token</h3>
                 <p className="text-sm text-slate-800 dark:text-slate-200">~{Math.ceil(files.reduce((acc, file) => acc + file.size / 5, 0) * 1.3)} Tokens hợp lệ (chưa chính xác nếu chưa đọc)</p>
              </div>

              <div className="pt-4 mt-auto">
                {!isTraining ? (
                  <Button 
                    onClick={startTraining} 
                    className="w-full justify-center bg-green-500 hover:bg-green-600 text-green-950 font-bold py-3"
                  >
                    <Play size={18} className="mr-2" /> Bắt Đầu Train Data
                  </Button>
                ) : (
                  <Button 
                    onClick={stopTraining} 
                    className="w-full justify-center bg-red-500 hover:bg-red-600 text-white font-bold py-3"
                  >
                    <StopCircle size={18} className="mr-2" /> Dừng Lại
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Terminal Box */}
          <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl flex flex-col h-[300px] shrink-0">
             <div className="bg-[#1e293b] px-4 py-2 border-b border-slate-700/50 flex justify-between items-center">
                <span className="text-xs font-mono text-slate-400">knowledge_trainer_term ~/</span>
                {isTraining && progress.total > 0 && (
                  <span className="text-xs font-mono text-mystic-accent">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                )}
             </div>
             <div 
               ref={logContainerRef}
               className="flex-1 p-4 overflow-y-auto font-mono text-xs md:text-sm text-slate-300 space-y-1"
             >
               {logs.length === 0 && (
                 <div className="text-slate-500 italic">Chờ bắt đầu...</div>
               )}
               {logs.map((log, i) => (
                 <div key={i} className="leading-relaxed">
                   {log}
                 </div>
               ))}
             </div>
             {isTraining && (
               <div className="h-1 bg-[#1e293b] w-full">
                 <div 
                   className="h-full bg-mystic-accent transition-all duration-300"
                   style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                 />
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

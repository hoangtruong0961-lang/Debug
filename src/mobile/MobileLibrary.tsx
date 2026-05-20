
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Clock, FileText, Settings, DownloadCloud, Users } from 'lucide-react';
import Button from '../components/ui/Button';
import { GameState } from '../types';
import { ArkLogo } from '../components/ui/ArkLogo';

/**
 * MobileLibrary: Thư viện quản lý các thành phần giao diện dành riêng cho di động.
 * Mọi thay đổi về cấu trúc di động nên được thực hiện tại đây để đảm bảo tính tập trung.
 */

interface MobileMenuProps {
  onNavigate: (state: GameState) => void;
  onContinue: () => void;
  onLoadGame: () => void;
  onShowCharacterLibrary: () => void;
  hasSaves: boolean;
  isIntroing?: boolean;
  isInstallable?: boolean;
  onInstall?: () => void;
}

export const MobileMainMenu: React.FC<MobileMenuProps> = ({ 
  onNavigate, 
  onContinue, 
  onLoadGame, 
  onShowCharacterLibrary,
  hasSaves,
  isIntroing = false,
  isInstallable = false,
  onInstall
}) => {
  return (
    <div className={`flex flex-col items-center justify-center h-full px-4 py-8 space-y-8 overflow-y-auto custom-scrollbar transition-opacity duration-1000 ${isIntroing ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Cài đặt App (Mobile) - Hiển thị phía trên */}
      {isInstallable && onInstall && !isIntroing && (
         <motion.button 
           initial={{ opacity: 0, y: -10 }}
           animate={{ opacity: 1, y: 0 }}
           onClick={onInstall}
           className="w-full max-w-[320px] flex items-center justify-center gap-2 px-4 py-3 bg-mystic-accent/20 hover:bg-mystic-accent/30 rounded-xl text-mystic-accent shadow-lg backdrop-blur-md border border-mystic-accent/50 transition-all active:scale-95"
         >
           <DownloadCloud size={18} />
           <span className="text-xs font-bold uppercase tracking-wider">Cài Đặt App (PWA)</span>
         </motion.button>
      )}

      {/* Logo di động */}
      <motion.div 
        initial={isIntroing ? { opacity: 0 } : { opacity: 0, y: -20, filter: 'blur(10px)' }}
        animate={isIntroing ? { opacity: 0 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: "easeOut", delay: isIntroing ? 0 : 0.2 }}
        className="text-center flex flex-col items-center"
      >
        <div className="flex items-center justify-center gap-3 mb-2 font-serif text-5xl font-black tracking-tighter">
          {!isIntroing && (
            <motion.div layoutId="ark-main-logo" className="text-mystic-accent">
              <ArkLogo size={64} className="w-[64px] h-[64px]" />
            </motion.div>
          )}
          <h1 className="text-transparent bg-clip-text bg-gradient-to-br from-slate-100 via-white to-slate-400 drop-shadow-xl mt-2">
            ARK V5
          </h1>
        </div>
        <div className="h-[2px] w-12 mx-auto bg-gradient-to-r from-transparent via-mystic-accent to-transparent mt-3 mb-2" />
        <p className="text-[9px] text-mystic-accent tracking-[0.3em] uppercase font-bold drop-shadow-[0_0_5px_rgba(56,189,248,0.5)]">
          DEV: Bạch Phát Dược Thiên Tôn
        </p>
      </motion.div>

      {/* Danh sách nút bấm dạng lưới đối xứng */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-[320px]">
        
        {/* Khởi Tạo - To nhất */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onNavigate(GameState.WORLD_CREATION)}
          className="col-span-2 flex flex-col items-center justify-center p-6 rounded-2xl bg-mystic-accent/15 border border-mystic-accent/40 text-mystic-accent hover:bg-mystic-accent/25 transition-all shadow-[0_0_20px_rgba(56,189,248,0.15)] relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-mystic-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="p-3 bg-mystic-accent text-mystic-900 rounded-full mb-3 group-hover:scale-110 transition-transform">
            <Play size={24} fill="currentColor" />
          </div>
          <span className="font-bold text-sm tracking-widest uppercase">Khởi Tạo</span>
          <span className="text-[9px] mt-1 opacity-70 tracking-wider">Hành trình mới</span>
        </motion.button>

        {/* Tiếp tục */}
        <motion.button 
          whileHover={hasSaves ? { scale: 1.02 } : {}}
          whileTap={hasSaves ? { scale: 0.95 } : {}}
          onClick={onContinue}
          disabled={!hasSaves}
          className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${
            hasSaves 
            ? 'bg-slate-900/60 border-slate-700/50 hover:bg-slate-800 hover:border-slate-500 text-slate-200' 
            : 'bg-slate-900/20 border-slate-800/50 text-slate-600 opacity-50 cursor-not-allowed'
          }`}
        >
          <div className="p-2.5 bg-slate-800 rounded-full mb-2 text-slate-300">
            <Clock size={20} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Tiếp Tục</span>
        </motion.button>

        {/* Dữ liệu */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={onLoadGame}
          className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-900/60 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-500 text-slate-200 transition-all"
        >
          <div className="p-2.5 bg-slate-800 rounded-full mb-2 text-slate-300">
            <FileText size={20} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Dữ Liệu</span>
        </motion.button>

        {/* Đồng Nhân */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onNavigate(GameState.FANFIC)}
          className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-900/60 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-500 text-slate-200 transition-all"
        >
          <div className="p-2.5 bg-slate-800 rounded-full mb-2 text-slate-300">
            <FileText size={20} className="text-amber-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Đồng Nhân</span>
        </motion.button>

        {/* Train Knowledge */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onNavigate(GameState.KNOWLEDGE_TRAIN)}
          className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-900/60 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-500 text-slate-200 transition-all"
        >
          <div className="p-2.5 bg-slate-800 rounded-full mb-2 text-slate-300">
            <FileText size={20} className="text-emerald-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Train Data</span>
        </motion.button>

        {/* Thư Viện ST */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={onShowCharacterLibrary}
          className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-900/60 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-500 text-slate-200 transition-all col-span-2"
        >
          <div className="p-2.5 bg-slate-800 rounded-full mb-2 text-slate-300">
            <Users size={20} className="text-indigo-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Thư Viện Nhân Vật</span>
        </motion.button>

        {/* Cấu Hình - Căn giữa ở dưới */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onNavigate(GameState.SETTINGS)}
          className="col-span-2 flex flex-row items-center justify-center gap-3 p-4 rounded-2xl bg-slate-900/40 border border-slate-800/50 hover:bg-slate-800 hover:border-slate-600 text-slate-400 transition-all"
        >
          <Settings size={18} />
          <span className="text-xs font-bold uppercase tracking-widest">Cấu Hình Hệ Thống</span>
        </motion.button>
      </div>
    </div>
  );
};

// Bạn có thể thêm các thành phần Mobile khác vào đây (MobileSettings, MobileGameplay, v.v.)

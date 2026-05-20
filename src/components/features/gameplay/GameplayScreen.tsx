import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp } from 'lucide-react';
import { NavigationProps, GameState } from '../../../types';
import Button from '../../ui/Button';
import GameInput from './components/GameInput';
import { GameplaySidebar } from './GameplaySidebar';
import { GameplayChatArea } from './GameplayChatArea';
import { GameplayHUD } from './GameplayHUD';
import { GameplayModals } from './GameplayModals';
import { useGameplayCore } from './hooks/useGameplayCore';

const GameplayScreen: React.FC<NavigationProps> = ({ onNavigate, activeWorld, onUpdateWorld }) => {
  const core = useGameplayCore({ onNavigate, activeWorld, onUpdateWorld });
  const MESSAGES_PER_PAGE = 10;

  const {
      isLoading, history, lastAction, turnCount, settings, gameTime,
      isDead, setIsDead,
      showCharModal, showGlobalModal, showHistoryModal, showContextModal,
      showImageLibrary, showLogConsole, showRegexModal,
      setShowCharModal, setShowGlobalModal, setShowHistoryModal, setShowContextModal,
      setShowImageLibrary, setShowLogConsole, setShowRegexModal, showMobileSidebar, setShowMobileSidebar,
      isInputCollapsed, setIsInputCollapsed, currentPage, setCurrentPage,
      isSaving, scrollViewportRef, chatEndRef, handleScroll, scrollToTop, scrollToBottom,
      totalPages, displayedMessages, startIndex, handleSend, handleRegenerate,
      handleSwipe, handleMessageUpdate, handleToggleHideMessage, handleEntityClick, handleManualSave,
      handleGoToSettings, handleExit, toggleStreamResponse, handleTawaConfigChange,
      isMobile, AIMonitor, combinedRegexScripts,
      selectingAvatarFor, setSelectingAvatarFor, handleAvatarSelect,
      showTokenDetails, showStatsDetails, setShowTokenDetails, setShowStatsDetails,
      activeContextTab, setActiveContextTab, selectedEntity, setSelectedEntity,
      autosaveList, manualSaveList, initialSaveList, activeSaveTab, setActiveSaveTab,
      loadSaveLists, handleDeleteSave, handleLoadSave, handleUpdateContextConfig,
      tokenHistory, totalTokens, lastTurnTotalTime, currentProcessingTime,
      lsrTables, lsrRuntimeData, activeLsrTableId, setActiveLsrTableId, lsrViewMode, setLsrViewMode,
      tavoSelectState, setTavoSelectState, tawaPresetConfig, gameInputRef
  } = core;

  const renderSidebarContent = () => {
    return (
        <GameplaySidebar 
            activeWorld={activeWorld}
            history={history}
            MESSAGES_PER_PAGE={MESSAGES_PER_PAGE}
            setShowCharModal={setShowCharModal}
            setShowGlobalModal={setShowGlobalModal}
            setShowHistoryModal={setShowHistoryModal}
            setShowImageLibrary={setShowImageLibrary}
            setShowLogConsole={setShowLogConsole}
            setShowContextModal={setShowContextModal}
            setShowRegexModal={setShowRegexModal}
            isInputCollapsed={isInputCollapsed}
            setIsInputCollapsed={setIsInputCollapsed}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            scrollToTop={scrollToTop}
            scrollToBottom={scrollToBottom}
            settings={settings}
            toggleStreamResponse={toggleStreamResponse}
            onUpdateWorld={onUpdateWorld}
            handleTawaConfigChange={handleTawaConfigChange}
            isLoading={isLoading}
            handleRegenerate={handleRegenerate}
            handleGoToSettings={handleGoToSettings}
            handleManualSave={handleManualSave}
            isSaving={isSaving}
            handleExit={handleExit}
            AIMonitor={AIMonitor}
        />
    );
  };

  // --- RENDER ---
  if (!activeWorld) return null;

  const lastMessage = history[history.length - 1];
  const activeChoices = (lastMessage?.role === 'model' && lastMessage.choices) ? lastMessage.choices : [];

  return (
    <div className="flex h-full w-full bg-stone-300 dark:bg-mystic-900 font-sans overflow-hidden">
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
            <GameplayHUD 
                activeWorld={activeWorld} 
                turnCount={turnCount} 
                gameTime={gameTime} 
                setShowMobileSidebar={setShowMobileSidebar} 
            />

            <GameplayChatArea
                scrollViewportRef={scrollViewportRef}
                chatEndRef={chatEndRef}
                handleScroll={handleScroll}
                displayedMessages={displayedMessages}
                startIndex={startIndex}
                history={history}
                isLoading={isLoading}
                combinedRegexScripts={combinedRegexScripts}
                activeWorld={activeWorld}
                settings={settings}
                currentPage={currentPage}
                handleMessageUpdate={handleMessageUpdate}
                handleToggleHideMessage={handleToggleHideMessage}
                handleEntityClick={handleEntityClick}
                handleSwipe={handleSwipe}
                totalCount={history.length}
            />

            {/* Input Area ... (Same as before) */}
            <div className="bg-stone-300 dark:bg-mystic-900 border-t border-stone-400 dark:border-slate-800 z-20 shrink-0 flex flex-col shadow-[0_-5px_15px_rgba(0,0,0,0.05)] dark:shadow-[0_-5px_15px_rgba(0,0,0,0.2)]">
                {/* Game Input Component */}
                <GameInput 
                    ref={gameInputRef}
                    onSend={handleSend}
                    isLoading={isLoading}
                    lastAction={lastAction}
                    isInputCollapsed={isInputCollapsed}
                    onToggleCollapse={() => setIsInputCollapsed(!isInputCollapsed)}
                    activeChoices={activeChoices}
                    history={history}
                    isMobile={isMobile}
                >
                    {/* Thử Lại Button */}
                    <Button 
                        variant="ghost" 
                        onClick={() => {
                            const lastModelIdx = [...history].reverse().findIndex(m => m.role === 'model');
                            if (lastModelIdx !== -1) {
                                const actualIdx = history.length - 1 - lastModelIdx;
                                handleRegenerate(actualIdx);
                            }
                        }} 
                        disabled={isLoading || !history.some(m => m.role === 'model')} 
                        className="h-9 md:h-10 px-3 text-[10px] font-bold uppercase tracking-tighter border border-stone-400 dark:border-slate-700 hover:border-mystic-accent/50 whitespace-nowrap flex items-center justify-center gap-1 shrink-0"
                        title="Tạo lại phản hồi cuối cùng của AI"
                    >
                        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">Thử Lại</span>
                    </Button>

                    {/* Pagination Group */}
                    <div className="flex items-center h-9 md:h-10 bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded overflow-hidden shrink-0">
                        <button 
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="h-full px-2 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-r border-stone-400 dark:border-slate-700"
                            title="Trang trước"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <div className="px-2 flex flex-col items-center justify-center min-w-[40px]">
                            <span className="text-[10px] font-bold text-stone-600 dark:text-slate-400 leading-none">
                                {currentPage}/{totalPages}
                            </span>
                            <span className="text-[7px] uppercase opacity-50 font-bold">Trang</span>
                        </div>
                        <button 
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="h-full px-2 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-l border-stone-400 dark:border-slate-700"
                            title="Trang sau"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>

                    {/* Scroll Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                            onClick={scrollToTop}
                            className="h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent hover:border-mystic-accent transition-all shadow-sm"
                            title="Lên đầu lượt"
                        >
                            <ChevronsUp size={16} />
                        </button>
                        <button 
                            onClick={scrollToBottom}
                            className="h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent hover:border-mystic-accent transition-all shadow-sm"
                            title="Về cuối lượt"
                        >
                            <ChevronsDown size={16} />
                        </button>
                    </div>
                </GameInput>
            </div>
        </div>

        {/* SIDEBAR - DESKTOP */}
        <div className="hidden md:block w-80 shrink-0 h-full relative z-20 border-l border-stone-400 dark:border-slate-800">
            {renderSidebarContent()}
        </div>

        {/* SIDEBAR - MOBILE OVERLAY */}
        <AnimatePresence>
            {showMobileSidebar && (
                <>
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm"
                        onClick={() => setShowMobileSidebar(false)}
                    />
                    <motion.div
                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-4/5 max-w-sm bg-stone-300 dark:bg-mystic-900 z-50 border-l border-stone-400 dark:border-slate-700 md:hidden"
                    >
                        {renderSidebarContent()}
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        {/* MODALS */}
        <GameplayModals 
            showHistoryModal={showHistoryModal}
            setShowHistoryModal={setShowHistoryModal}
            activeSaveTab={activeSaveTab}
            setActiveSaveTab={setActiveSaveTab}
            isMobile={isMobile}
            history={history}
            manualSaveList={manualSaveList}
            autosaveList={autosaveList}
            initialSaveList={initialSaveList}
            handleLoadSave={handleLoadSave}
            handleDeleteSave={handleDeleteSave}

            showCharModal={showCharModal}
            setShowCharModal={setShowCharModal}
            activeWorld={activeWorld}
            setSelectingAvatarFor={setSelectingAvatarFor}
            setShowImageLibrary={setShowImageLibrary}

            showGlobalModal={showGlobalModal}
            setShowGlobalModal={setShowGlobalModal}
            lsrTables={lsrTables}
            lsrRuntimeData={lsrRuntimeData}
            activeLsrTableId={activeLsrTableId}
            setActiveLsrTableId={setActiveLsrTableId}
            lsrViewMode={lsrViewMode}
            setLsrViewMode={setLsrViewMode}

            showContextModal={showContextModal}
            setShowContextModal={setShowContextModal}
            handleUpdateContextConfig={handleUpdateContextConfig}
            settings={settings!}
            turnCount={turnCount}
            tawaPresetConfig={tawaPresetConfig}
            gameTime={gameTime}
            lastAction={lastAction}

            tavoSelectState={tavoSelectState}
            setTavoSelectState={setTavoSelectState}

            selectedEntity={selectedEntity}
            setSelectedEntity={setSelectedEntity}

            showImageLibrary={showImageLibrary}
            handleAvatarSelect={handleAvatarSelect}
            selectingAvatarFor={selectingAvatarFor}

            showLogConsole={showLogConsole}
            setShowLogConsole={setShowLogConsole}
            showRegexModal={showRegexModal}
            setShowRegexModal={setShowRegexModal}
            combinedRegexScripts={combinedRegexScripts}
            onUpdateWorld={onUpdateWorld}
        />

        {/* DEATH SCREEN OVERLAY */}
        <AnimatePresence>
          {isDead && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 text-center select-none"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                className="max-w-md w-full p-8 rounded-3xl border border-red-500/30 bg-stone-900/95 shadow-[0_0_50px_rgba(239,68,68,0.25)] text-slate-150 flex flex-col items-center gap-6"
              >
                {/* Skull / Death Icon */}
                <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500 flex items-center justify-center text-4xl text-red-500 animate-pulse">
                  💀
                </div>
                
                <div className="space-y-1">
                  <h1 className="text-3xl font-black tracking-wider text-red-500 uppercase font-mono">
                    NHÂN VẬT ĐÃ CHẾT
                  </h1>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-extrabold">
                    GAME OVER • CHẾ ĐỘ ĐỊA NGỤC
                  </p>
                </div>
                
                <p className="text-xs text-slate-450 leading-relaxed max-w-sm">
                  Dòng chảy sinh mệnh của <strong>{activeWorld.player?.name || "nhân vật"}</strong> đã chấm dứt vĩnh viễn trong chương này. 
                  Dưới áp lực của độ khó <strong>Địa Ngục</strong>, thất bại đồng nghĩa với kết thúc tuyệt đối: mọi dữ liệu lưu trữ (Save files) của thế giới này đã bị <strong>xóa sạch hoàn toàn</strong>.
                </p>

                <div className="w-full h-[1px] bg-slate-800" />

                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={() => {
                      setIsDead(false);
                      onNavigate(GameState.WORLD_CREATION);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase bg-red-650 hover:bg-red-700 active:scale-95 text-white transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-md"
                  >
                    Tạo Thế Giới Mới
                  </button>
                  <button
                    onClick={() => {
                      setIsDead(false);
                      onNavigate(GameState.MENU);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
                  >
                    Về Menu
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
};

export default GameplayScreen;


import React from 'react';
import { Toaster } from 'sonner';
import MainLayout from './src/components/layout/MainLayout';
import MainMenuScreen from './src/components/features/main-menu/MainMenuScreen';
import SettingsScreen from './src/components/features/settings/SettingsScreen';
import WorldCreationScreen from './src/components/features/world-creation/WorldCreationScreen';
import GameplayScreen from './src/components/features/gameplay/GameplayScreen';
import FanficScreen from './src/components/features/fanfic/FanficScreen';
import KnowledgeTrainScreen from './src/components/features/knowledge-train/KnowledgeTrainScreen';
import ErrorBoundary from './src/components/ui/ErrorBoundary';
import { GameState } from './src/types';
import { useAppStore } from './src/store/appStore';

function App() {
  const gameState = useAppStore(state => state.gameState);
  const activeWorld = useAppStore(state => state.activeWorld);
  const importedSetup = useAppStore(state => state.importedSetup);
  const isSettingsFromGame = useAppStore(state => state.isSettingsFromGame);
  const bgMusicEnabled = useAppStore(state => state.bgMusicEnabled);
  
  const handleNavigate = useAppStore(state => state.navigate);
  const handleGameStart = useAppStore(state => state.startGame);
  const handleImportSetup = useAppStore(state => state.importSetup);
  const handleUpdateWorld = useAppStore(state => state.updateWorld);

  const audioRef = React.useRef<HTMLAudioElement>(null);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const tryPlay = () => {
      if (bgMusicEnabled) {
        audio.play()
          .then(() => {
            // Once successfully playing, clean up the interaction listeners for this cycle
            cleanup();
          })
          .catch(err => {
            console.warn("Audio interaction play failed:", err);
          });
      }
    };

    const cleanup = () => {
      window.removeEventListener('click', tryPlay, true);
      window.removeEventListener('touchstart', tryPlay, true);
      window.removeEventListener('mousedown', tryPlay, true);
      window.removeEventListener('keydown', tryPlay, true);
    };

    if (bgMusicEnabled) {
      // 1. Try to play immediately (if autoplay is already unlocked or permitted)
      audio.play()
        .then(() => {
          // Met with instant success, no need for interaction listeners
        })
        .catch(() => {
          // Autoplay blocked by browser policy. Register capture-phase interaction triggers.
          window.addEventListener('click', tryPlay, true);
          window.addEventListener('touchstart', tryPlay, true);
          window.addEventListener('mousedown', tryPlay, true);
          window.addEventListener('keydown', tryPlay, true);
        });
    } else {
      audio.pause();
      cleanup();
    }

    return () => {
      cleanup();
    };
  }, [bgMusicEnabled]);

  return (
    <MainLayout>
      <ErrorBoundary>
        <Toaster position="top-center" theme="dark" richColors />
        <audio 
          ref={audioRef} 
          src="/tiktok_audio.mp3" 
          loop 
          preload="auto" 
        />
        {/* Main Game State Switcher */}
      {gameState === GameState.MENU && (
        <MainMenuScreen 
            onNavigate={handleNavigate} 
            onGameStart={handleGameStart}
            onImportSetup={handleImportSetup}
        />
      )}

      {gameState === GameState.WORLD_CREATION && (
        <WorldCreationScreen 
            onNavigate={handleNavigate} 
            onGameStart={handleGameStart}
            initialData={importedSetup}
        />
      )}

      {gameState === GameState.PLAYING && (
        <GameplayScreen 
            onNavigate={handleNavigate}
            activeWorld={activeWorld}
            onUpdateWorld={handleUpdateWorld}
        />
      )}

      {gameState === GameState.SETTINGS && (
        <SettingsScreen 
            onNavigate={handleNavigate} 
            fromGame={isSettingsFromGame} 
        />
      )}

      {gameState === GameState.FANFIC && (
        <FanficScreen 
            onNavigate={handleNavigate} 
            onGameStart={handleGameStart}
        />
      )}

      {gameState === GameState.KNOWLEDGE_TRAIN && (
        <KnowledgeTrainScreen 
            onNavigate={handleNavigate} 
        />
      )}
      </ErrorBoundary>
    </MainLayout>
  );
}

export default App;

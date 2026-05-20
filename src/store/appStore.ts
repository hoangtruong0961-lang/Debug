import { create } from 'zustand';
import { GameState, WorldData } from '../types';

interface AppState {
  gameState: GameState;
  activeWorld: WorldData | null;
  importedSetup: WorldData | null;
  isSettingsFromGame: boolean;
  bgMusicEnabled: boolean;

  setGameState: (state: GameState) => void;
  setActiveWorld: (world: WorldData | null) => void;
  setImportedSetup: (setup: WorldData | null) => void;
  setIsSettingsFromGame: (isFromGame: boolean) => void;
  setBgMusicEnabled: (enabled: boolean) => void;

  // Compound actions
  navigate: (newState: GameState) => void;
  startGame: (worldData: WorldData) => void;
  importSetup: (worldData: WorldData) => void;
  updateWorld: (data: Partial<WorldData>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  gameState: GameState.MENU,
  activeWorld: null,
  importedSetup: null,
  isSettingsFromGame: false,
  bgMusicEnabled: localStorage.getItem('ark_bg_music_enabled') !== 'false',

  setGameState: (state) => set({ gameState: state }),
  setActiveWorld: (world) => set({ activeWorld: world }),
  setImportedSetup: (setup) => set({ importedSetup: setup }),
  setIsSettingsFromGame: (isFromGame) => set({ isSettingsFromGame: isFromGame }),
  setBgMusicEnabled: (enabled) => {
    localStorage.setItem('ark_bg_music_enabled', enabled ? 'true' : 'false');
    set({ bgMusicEnabled: enabled });
  },

  navigate: (newState) => {
    const { gameState, importedSetup } = get();
    let nextSettingsFromGame = get().isSettingsFromGame;
    
    if (newState === GameState.SETTINGS) {
      nextSettingsFromGame = (gameState === GameState.PLAYING);
    }
    
    set({
      gameState: newState,
      isSettingsFromGame: nextSettingsFromGame,
      importedSetup: null, // Reset imported setup on normal navigation
      ...(newState === GameState.MENU ? { activeWorld: null } : {})
    });
  },

// Create a UUID or random string for sessionId
  startGame: (worldData) => set({
    activeWorld: { ...worldData, sessionId: crypto.randomUUID() },
    gameState: GameState.PLAYING
  }),

  importSetup: (worldData) => set({
    importedSetup: worldData,
    gameState: GameState.WORLD_CREATION
  }),

  updateWorld: (data) => set((state) => ({
    activeWorld: state.activeWorld ? { ...state.activeWorld, ...data } : null
  }))
}));

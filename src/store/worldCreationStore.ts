import { create } from 'zustand';
import { Entity, GameConfig, PlayerProfile, WorldData, WorldSettingConfig } from "../types";
import { GameTime, INITIAL_GAME_TIME } from "../utils/timeUtils";
import { Lorebook } from "../services/ai/lorebook/types";

export interface WorldCreationState {
  currentTab: number;
  player: PlayerProfile;
  world: WorldSettingConfig;
  config: GameConfig;
  entities: Entity[];
  gameTime: GameTime;
  lorebook?: Lorebook;
  isGenerating: boolean;
  generatingField: string | null;

  // Actions
  setTab: (tab: number) => void;
  updatePlayer: (field: keyof PlayerProfile, value: string) => void;
  updateWorld: (field: keyof WorldSettingConfig, value: string) => void;
  updateConfig: (field: keyof GameConfig, value: string[] | number | boolean) => void;
  updateCustomWords: (min: number, max: number) => void;
  addRule: (rule: string) => void;
  removeRule: (index: number) => void;
  addEntity: (entity: Omit<Entity, 'id'>) => void;
  updateEntity: (id: string, entity: Partial<Entity>) => void;
  removeEntity: (id: string) => void;
  updateGameTime: (field: keyof GameTime, value: number) => void;
  setGenerating: (isGenerating: boolean, field?: string | null) => void;
  autoFillAll: (payload: Partial<WorldData>) => void;
  importData: (payload: WorldData) => void;
  updateLorebook: (payload: Lorebook) => void;
  setEntities: (entities: Entity[]) => void;
  reset: () => void;
}

const simpleId = () => crypto.randomUUID();

const initialState = {
  currentTab: 0,
  player: {
    name: '',
    gender: 'Nam',
    age: '',
    birthDay: 1,
    birthMonth: 1,
    birthYear: 2000,
    personality: '',
    background: '',
    appearance: '',
    voiceAndTone: '',
    narrativeRole: 'Protagonist',
    skills: '',
    goal: ''
  },
  world: {
    worldName: '',
    genre: '',
    context: '',
    startingScenario: '',
    corePremise: '',
    cosmology: '',
    timeline: '',
    geography: '',
    factionsPower: '',
    economyResources: '',
    culturalIdentity: '',
    adventureHooks: ''
  },
  config: {
    rules: [],
  },
  entities: [],
  gameTime: INITIAL_GAME_TIME,
  isGenerating: false,
  generatingField: null
};

export const useWorldCreationStore = create<WorldCreationState>((set) => ({
  ...initialState,

  setTab: (tab) => set({ currentTab: tab }),
  updatePlayer: (field, value) => set((state) => ({ player: { ...state.player, [field]: value } })),
  updateWorld: (field, value) => set((state) => ({ world: { ...state.world, [field]: value } })),
  updateConfig: (field, value) => set((state) => ({ config: { ...state.config, [field]: value } })),
  updateCustomWords: (min, max) => set((state) => ({ config: { ...state.config, customMinWords: min, customMaxWords: max } })),
  addRule: (rule) => set((state) => ({ config: { ...state.config, rules: [...state.config.rules, rule] } })),
  removeRule: (index) => set((state) => ({ config: { ...state.config, rules: state.config.rules.filter((_, i) => i !== index) } })),
  addEntity: (entity) => set((state) => {
    const current = Array.isArray(state.entities) ? state.entities : [];
    return { entities: [...current, { ...entity, id: simpleId() }] as Entity[] };
  }),
  updateEntity: (id, entityUpdate) => set((state) => {
    const current = Array.isArray(state.entities) ? state.entities : [];
    return { entities: current.map(e => e.id === id ? { ...e, ...entityUpdate } : e) as Entity[] };
  }),
  removeEntity: (id) => set((state) => {
    const current = Array.isArray(state.entities) ? state.entities : [];
    return { entities: current.filter(e => e.id !== id) };
  }),
  updateGameTime: (field, value) => set((state) => ({ gameTime: { ...state.gameTime, [field]: value } })),
  setGenerating: (isGenerating, field) => set({ isGenerating, generatingField: field || null }),
  
  autoFillAll: (payload) => set((state) => {
    const mergeIfEmpty = (current: any, incoming: any) => {
      const result = { ...current };
      if (incoming) {
          Object.keys(incoming).forEach(key => {
            if (!current[key] || (typeof current[key] === 'string' && current[key].trim() === '')) {
              result[key] = incoming[key];
            }
          });
      }
      return result;
    };

    const currentEntities = Array.isArray(state.entities) ? state.entities : [];
    const incomingEntities = Array.isArray(payload.entities) ? payload.entities : [];

    return {
      player: mergeIfEmpty(state.player, payload.player),
      world: mergeIfEmpty(state.world, payload.world),
      entities: (incomingEntities.length >= currentEntities.length) ? incomingEntities : currentEntities,
      gameTime: (payload.gameTime && state.gameTime.year === 2024) ? payload.gameTime : state.gameTime,
      config: { ...state.config, rules: payload.config?.rules || state.config.rules }
    };
  }),
  
  importData: (payload) => set((state) => ({
    player: payload.player || state.player,
    world: payload.world || state.world,
    config: payload.config || state.config,
    entities: Array.isArray(payload.entities) ? payload.entities : [],
    gameTime: payload.gameTime || state.gameTime,
    lorebook: payload.lorebook || state.lorebook,
    isGenerating: false,
    generatingField: null
  })),

  updateLorebook: (payload) => set({ lorebook: payload }),
  setEntities: (entities) => set({ entities: Array.isArray(entities) ? entities : [] }),
  reset: () => set(initialState)
}));

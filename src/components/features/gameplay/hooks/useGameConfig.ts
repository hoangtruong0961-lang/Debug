import { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, WorldData, TawaPresetConfig, RegexScript, GameTime } from '../../../../types';
import { INITIAL_GAME_TIME } from '../../../../utils/timeUtils';
import { tavoRegistry } from '../../../../services/api/tavoApi';
import { dbService } from '../../../../services/db/indexedDB';

export function useGameConfig(activeWorld: WorldData | null) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tawaPresetConfig, setTawaPresetConfig] = useState<TawaPresetConfig>({ modules: [] });
  const [dynamicRules, setDynamicRules] = useState<string[]>(activeWorld?.config?.rules || []);
  const [combinedRegexScripts, setCombinedRegexScripts] = useState<RegexScript[]>([]);
  const [gameTime, setGameTime] = useState<GameTime>(activeWorld?.gameTime || INITIAL_GAME_TIME);

  const dynamicRulesRef = useRef<string[]>(activeWorld?.config?.rules || []);
  const tawaPresetConfigRef = useRef<TawaPresetConfig>(tawaPresetConfig);
  const gameTimeRef = useRef<GameTime>(activeWorld?.gameTime || INITIAL_GAME_TIME);

  useEffect(() => {
    dynamicRulesRef.current = dynamicRules;
  }, [dynamicRules]);

  useEffect(() => {
    tawaPresetConfigRef.current = tawaPresetConfig;
  }, [tawaPresetConfig]);

  useEffect(() => {
    gameTimeRef.current = gameTime;
  }, [gameTime]);

  const activeWorldRef = useRef<WorldData | null>(activeWorld);
  useEffect(() => { activeWorldRef.current = activeWorld; }, [activeWorld]);

  const reloadRegexScripts = useCallback(async () => {
    try {
        const s = await dbService.getSettings() as AppSettings;
        setSettings(s);
        const globals = s?.regex_scripts || [];
        const scopeds = activeWorldRef.current?.extensions?.regex_scripts || [];
        const presets = tawaPresetConfigRef.current?.regexScripts || activeWorldRef.current?.config?.regexScripts || [];
        setCombinedRegexScripts([...globals, ...scopeds, ...presets]);
    } catch (e) {
        console.error("Failed to load regex scripts", e);
    }
  }, []);

  const loadInitialSettings = useCallback((appSettings: AppSettings) => {
    setSettings(appSettings);
  }, []);

  const syncConfigFromSave = useCallback((worldDataWithState: WorldData) => {
      if (worldDataWithState.config?.rules) setDynamicRules(worldDataWithState.config.rules);
      if (worldDataWithState.config?.tawaPreset) {
          setTawaPresetConfig(worldDataWithState.config.tawaPreset);
      }
      setGameTime(worldDataWithState.gameTime || INITIAL_GAME_TIME);
  }, []);

  return {
    settings,
    setSettings,
    tawaPresetConfig,
    setTawaPresetConfig,
    dynamicRules,
    setDynamicRules,
    combinedRegexScripts,
    setCombinedRegexScripts,
    gameTime,
    setGameTime,
    dynamicRulesRef,
    tawaPresetConfigRef,
    gameTimeRef,
    loadInitialSettings,
    syncConfigFromSave,
    reloadRegexScripts
  };
}

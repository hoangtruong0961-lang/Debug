import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  NavigationProps,
  GameState,
  ChatMessage,
  AppSettings,
  SaveFile,
  WorldData,
  TawaPresetConfig,
  GameTime,
  Entity,
  ImageMetadata,
} from "../../../../types";
import { gameplayAiService } from "../../../../services/ai/gameplay/service";
import { dbService } from "../../../../services/db/indexedDB";
import {
  INITIAL_GAME_TIME,
  formatGameTime,
  advanceTime,
} from "../../../../utils/timeUtils";
import { useResponsive } from "../../../../hooks/useResponsive";
import { tavoRegistry } from "../../../../services/api/tavoApi";
import { useModalState } from "./useModalState";
import { useAiMonitor } from "./useAiMonitor";
import { LsrParser } from "../../../../services/lsr/LsrParser";
import { getRegexedString, extractTagContent, parseChoices } from "../../../../utils/regex";
import { storyBibleService } from "../../../../services/ai/storyBibleService";
import { useSaveSystem } from "./useSaveSystem";
import { useLsr } from "./useLsr";
import { useGameConfig } from "./useGameConfig";
import { useGameEngine } from "./useGameEngine";

const MESSAGES_PER_PAGE = 10;

export const useGameplayCore = ({
  onNavigate,
  activeWorld,
  onUpdateWorld,
}: NavigationProps) => {
  // Game Engine
  const {
    isLoading,
    setIsLoading,
    history,
    setHistory,
    lastAction,
    setLastAction,
    turnCount,
    setTurnCount,
    historyRef,
    turnCountRef,
    lastActionRef,
    syncEngineFromSave,
  } = useGameEngine(activeWorld);
  // Game Config
  const {
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
    reloadRegexScripts,
  } = useGameConfig(activeWorld);

  // Save System
  const {
    autosaveList,
    manualSaveList,
    initialSaveList,
    activeSaveTab,
    setActiveSaveTab,
    isSaving,
    setIsSaving,
    loadSaveLists,
    handleDeleteSave,
  } = useSaveSystem();

  const {
    tokenHistory,
    totalTokens,
    lastTurnTotalTime,
    currentProcessingTime,
    setCurrentProcessingTime,
    processingStartTimeRef,
    tokenHistoryRef,
    totalTokensRef,
    lastTurnTotalTimeRef,
    startProcessing,
    endProcessing,
    updateTokenHistoryItem: updateTokenHistory,
    syncFromSave: syncAiMonitorFromSave,
  } = useAiMonitor(activeWorld);

  // UI States
  const {
    showCharModal,
    setShowCharModal,
    showGlobalModal,
    setShowGlobalModal,
    showHistoryModal,
    setShowHistoryModal,
    showContextModal,
    setShowContextModal,
    showImageLibrary,
    setShowImageLibrary,
    showLogConsole,
    setShowLogConsole,
    showRegexModal,
    setShowRegexModal,
    showMobileSidebar,
    setShowMobileSidebar,
  } = useModalState();
  const [selectingAvatarFor, setSelectingAvatarFor] = useState<{
    type: "player" | "entity";
    id?: string;
  } | null>(null);

  const [showTokenDetails, setShowTokenDetails] = useState(true);
  const [showStatsDetails, setShowStatsDetails] = useState(true);
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [activeContextTab, setActiveContextTab] = useState<
    "config" | "debugger"
  >("config");
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [lastNavigatedTurn, setLastNavigatedTurn] = useState<number | null>(
    null,
  );
  const pendingScrollTurnRef = useRef<number | null>(null);

  const combinedRegexScriptsRef = useRef<
    import("../../../../types").RegexScript[]
  >([]);
  useEffect(() => {
    combinedRegexScriptsRef.current = combinedRegexScripts;
  }, [combinedRegexScripts]);

  useEffect(() => {
    const handleReload = () => reloadRegexScripts();
    window.addEventListener("reload_regex_scripts", handleReload);
    return () =>
      window.removeEventListener("reload_regex_scripts", handleReload);
  }, [reloadRegexScripts]);

  // Listener for dynamic core memory summary & Persona drift updates
  useEffect(() => {
    const handleSummaryUpdate = (e: any) => {
      const newSummary = e.detail;
      if (newSummary && onUpdateWorld) {
        // Update the ref so current state captures it immediately
        activeWorldSummaryRef.current = newSummary;
        // Trigger world update to save to IndexedDB
        onUpdateWorld({ summary: newSummary });
      }
    };

    const handlePersonaDrift = (e: any) => {
      const driftResult = e.detail;
      if (driftResult && driftResult.hasDrift) {
        toast.warning(
          <div className="flex flex-col gap-1">
            <b>Cảnh báo AI đi lạc (OOC):</b>
            <span>{driftResult.reason}</span>
            <span className="text-xs opacity-70">
              StoryBible đã tự động theo dõi để nắn chỉnh ở lượt tới.
            </span>
          </div>,
          { duration: 8000 },
        );
      }
    };

    window.addEventListener("tavo_summary_update", handleSummaryUpdate);
    window.addEventListener("tavo_persona_drift", handlePersonaDrift);

    return () => {
      window.removeEventListener("tavo_summary_update", handleSummaryUpdate);
      window.removeEventListener("tavo_persona_drift", handlePersonaDrift);
    };
  }, [onUpdateWorld]);

  const gameInputRef = useRef<any>(null);

  useEffect(() => {
    tavoRegistry.getInputValue = () => gameInputRef.current?.getInputValue?.() || '';
    tavoRegistry.setInputValue = (v: string) => gameInputRef.current?.setInputValue?.(v);
    tavoRegistry.appendInputValue = (v: string) => gameInputRef.current?.appendInputValue?.(v);
    tavoRegistry.clearInputValue = () => gameInputRef.current?.clearInputValue?.();
    tavoRegistry.sendInput = () => gameInputRef.current?.sendInput?.();
  }, []);

  const handleSendRef = useRef<((text: string) => Promise<void>) | null>(null);

  useEffect(() => {
    const handleWidgetAction = (e: any) => {
      const { action, payload } = e.detail;
      if (!action) return;

      switch (action) {
        case "UPDATE_LSR":
          // Assume payload is a parsed LSR object { "tableName": [ rowData ] } or partial
          if (payload && typeof payload === "object") {
            setLsrRuntimeData((prev) => {
              // simple merge
              const nextData = { ...prev };
              for (const key in payload) {
                if (Array.isArray(payload[key])) {
                  nextData[key] = payload[key];
                }
              }
              return nextData;
            });
          }
          break;
        case "OVERWRITE_LSR":
          if (payload && typeof payload === "object") {
            setLsrRuntimeData(payload);
          }
          break;
        case "SEND_MESSAGE":
          if (
            typeof payload === "string" &&
            payload.trim() &&
            handleSendRef.current
          ) {
            handleSendRef.current(payload);
          } else if (
            payload &&
            typeof payload.text === "string" &&
            payload.text.trim() &&
            handleSendRef.current
          ) {
            handleSendRef.current(payload.text);
          }
          break;
        case "NAVIGATE":
          if (payload && typeof payload === "string") {
             onNavigate(payload as any);
          }
          break;
        case "SHOW_MODAL":
          if (payload === "character") setShowCharModal(true);
          else if (payload === "history") setShowHistoryModal(true);
          else if (payload === "regex") setShowRegexModal(true);
          else if (payload === "context") setShowContextModal(true);
          else if (payload === "library") setShowImageLibrary(true);
          else if (payload === "console") setShowLogConsole(true);
          break;
        case "UPDATE_PERSONA":
          if (payload && onUpdateWorld && activeWorldRef.current) {
             onUpdateWorld({ player: { ...activeWorldRef.current.player, ...payload } });
          }
          break;
        case "TOAST":
          toast(payload?.message || payload);
          break;
      }
    };
    window.addEventListener("tawa_widget_action", handleWidgetAction);
    return () =>
      window.removeEventListener("tawa_widget_action", handleWidgetAction);
  }, []);

  const handleTawaConfigChange = useCallback(
    (config: TawaPresetConfig) => {
      setTawaPresetConfig(config);
      tawaPresetConfigRef.current = config;
      reloadRegexScripts();
    },
    [reloadRegexScripts],
  );

  const handleAvatarSelect = async (image: ImageMetadata) => {
    if (!selectingAvatarFor) return;

    if (selectingAvatarFor.type === "player") {
      const updatedWorld = {
        ...activeWorld,
        player: { ...activeWorld.player, avatar: image.data },
      };
      onUpdateWorld(updatedWorld);
    } else if (selectingAvatarFor.type === "entity" && selectingAvatarFor.id) {
      const updatedEntities = activeWorld.entities.map((e) =>
        e.id === selectingAvatarFor.id ? { ...e, avatar: image.data } : e,
      );
      const updatedWorld = {
        ...activeWorld,
        entities: updatedEntities,
      };
      onUpdateWorld(updatedWorld);
    }

    setSelectingAvatarFor(null);
    setShowImageLibrary(false);
  };

  // LSR State
  const {
    lsrTables,
    setLsrTables,
    lsrRuntimeData,
    setLsrRuntimeData,
    activeLsrTableId,
    setActiveLsrTableId,
    lsrViewMode,
    setLsrViewMode,
    lsrRuntimeDataRef,
  } = useLsr(activeWorld);
  const { isMobile } = useResponsive();

  const [isDead, setIsDead] = useState(false);

  const checkDeathStatus = useCallback((historyList: ChatMessage[], lsrData?: Record<string, unknown[]>) => {
    const isTormentDifficulty = activeWorldRef.current?.config?.difficulty?.id === 'torment' || settings?.difficulty?.id === 'torment';
    if (!isTormentDifficulty) return false;

    // 1. Scan last AI responses (e.g. last 1 or 2 messages in reverse order)
    const modelMessages = historyList.filter(m => m.role === 'model');
    if (modelMessages.length === 0) return false;
    
    // We can check the latest model response
    const lastModelMsg = modelMessages[modelMessages.length - 1];
    const textToSearch = lastModelMsg.text.toLowerCase();
    
    const deathKeywords = [
      "bạn đã chết",
      "bạn đã tử vong",
      "ngươi đã chết",
      "ngươi đã tử vong",
      "trò chơi kết thúc",
      "game over",
      "you died",
      "you have died",
      "nhân vật đã chết",
      "bị giết chết",
      "hồn phi phách tán",
      "tử vong"
    ];
    
    if (deathKeywords.some(keyword => textToSearch.includes(keyword))) {
      return true;
    }
    
    // 2. Scan LSR stats
    if (lsrData && lsrData['2']) {
      const t2 = lsrData['2'] as any[][];
      const playerStats = t2.map(row => ({ name: row[0], value: row[1], desc: row[2] }));
      const healthStat = playerStats.find(s => 
        s.name?.toLowerCase().includes('máu') || 
        s.name?.toLowerCase().includes('thể lực') || 
        s.name?.toLowerCase().includes('hp')
      );
      if (healthStat) {
        const valStr = String(healthStat.value).toLowerCase().trim();
        if (valStr === '0' || valStr === '0%' || valStr === 'cạn kiệt' || valStr === 'chết' || valStr === 'tử vong') {
          return true;
        }
      }
    }
    
    return false;
  }, [settings]);

  const triggerPermadeath = useCallback(async () => {
    setIsDead(true);
    // Delete save files
    const worldName = activeWorldRef.current?.world?.worldName;
    const worldId = activeWorldRef.current?.id;
    if (worldName || worldId) {
      try {
        const saves = await dbService.getAllSaves();
        for (const save of saves) {
          const sData = save.data as WorldData;
          if ((worldId && sData?.id === worldId) || (worldName && sData?.world?.worldName === worldName)) {
            await dbService.deleteSave(save.id);
          }
        }
        toast.error("Chế độ Địa Ngục: Nhân vật đã tử vong. Toàn bộ file lưu của thế giới này đã bị xóa sạch vĩnh viễn!");
      } catch (err) {
        console.error("Permadeath save deletion failed:", err);
      }
    }
  }, []);

  const [isReadyRef_flag, setIsReadyRef_flag] = useState(false); // Just a dummy to prevent unused
  const [tavoSelectState, setTavoSelectState] = useState<{
    options: any[];
    title?: string;
    defaultValue?: any;
    resolve: (val: any) => void;
  } | null>(null);

  useEffect(() => {
    tavoRegistry.activeWorld = activeWorld || null;
    tavoRegistry.updateWorld = onUpdateWorld || null;
    tavoRegistry.getHistory = () => historyRef.current;
    tavoRegistry.updateHistory = (h: ChatMessage[]) => {
      setHistory(h);
      historyRef.current = h;
    };
    tavoRegistry.showSelect = (
      options: any[],
      title?: string,
      defaultValue?: any,
    ) => {
      return new Promise<any>((resolve) => {
        setTavoSelectState({ options, title, defaultValue, resolve });
      });
    };
    tavoRegistry.generateText = async (promptText: string, options: any) => {
      // Implement tavo.generate
      const { dbService } = await import("../../../../services/db/indexedDB");
      const settings = (await dbService.getSettings()) as any; // We need current settings
      const { getAiClient } = await import("../../../../services/ai/client");
      const { getAiModel } =
        await import("../../../../services/ai/gameplay/service");
      const { buildPromptFromHistory } =
        await import("../../../../services/ai/gameplay/prompts");
      const client = getAiClient(settings);
      const modelName = getAiModel(settings);

      let finalPrompt = promptText;
      if (options?.context) {
        // Build context
        const ctxText = buildPromptFromHistory(
          options.preset
            ? { ...activeWorld?.config?.tawaPreset, ...options.preset }
            : (activeWorld?.config?.tawaPreset as any),
          historyRef.current,
          activeWorld!,
          gameTimeRef.current,
          promptText, // Append to the end as userInput
          settings,
        );
        finalPrompt = ctxText.prompt;
      }

      const modelOpts: any = {
        model: modelName,
        contents: finalPrompt,
        config: {
          temperature: options?.settings?.temperature ?? 0.7,
          topP: options?.settings?.topP ?? 0.9,
        },
      };

      if (
        options?.settings?.maxOutputTokens ||
        options?.settings?.maxCompletionTokens
      ) {
        modelOpts.config.maxOutputTokens =
          options.settings.maxOutputTokens ||
          options.settings.maxCompletionTokens;
      }

      const response = await client.models.generateContent(modelOpts);
      return response.text() || "";
    };

    return () => {
      tavoRegistry.generateText = null;
      tavoRegistry.showSelect = null;
    };
  }, [activeWorld, onUpdateWorld, setHistory]);

  // --- DERIVED STATE (MUST BE BEFORE HOOKS THAT USE THEM) ---
  const totalPages =
    history.length <= 11
      ? 1
      : 1 + Math.ceil((history.length - 11) / MESSAGES_PER_PAGE);
  const startIndex =
    currentPage === 1 ? 0 : 11 + (currentPage - 2) * MESSAGES_PER_PAGE;
  const endIndex = currentPage === 1 ? 11 : startIndex + MESSAGES_PER_PAGE;
  const displayedMessages = history.slice(startIndex, endIndex);

  const initializedRef = useRef(false);
  const isReadyRef = useRef(false); // Guard for syncing state - ALWAYS false initially
  const lastWorldRef = useRef<WorldData | null>(null);
  const initialStartedRef = useRef(false); // Guard for initial generation
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for state data to ensure up-to-date values in callbacks without triggering re-renders or loops

  const activeWorldSummaryRef = useRef<string | undefined>(
    activeWorld?.summary,
  );

  const activeWorldRef = useRef<WorldData | null>(activeWorld);

  // Helper to sync state back to App.tsx
  const syncWorldState = useCallback(
    (
      currentHistory?: ChatMessage[],
      currentTurn?: number,
      currentTime?: GameTime,
      currentLsrData?: Record<string, unknown[]>,
      currentSummary?: string,
    ) => {
      if (!isReadyRef.current) return; // Guard against stale sync during init
      // console.log(`GameplayScreen: Syncing state to App.tsx (Turn ${currentTurn !== undefined ? currentTurn : turnCountRef.current})...`);
      if (onUpdateWorld) {
        // Wrap in setTimeout to avoid "Cannot update a component while rendering" error
        setTimeout(() => {
          onUpdateWorld({
            summary: currentSummary || activeWorldSummaryRef.current,
            lsrData: currentLsrData || lsrRuntimeDataRef.current,
            config: {
              ...activeWorldRef.current?.config,
              rules: dynamicRulesRef.current,
              tawaPreset: tawaPresetConfigRef.current,
            },
            savedState: {
              history: currentHistory || historyRef.current,
              turnCount:
                currentTurn !== undefined ? currentTurn : turnCountRef.current,
              gameTime: currentTime || gameTimeRef.current,
              aiMonitor: {
                tokenHistory: tokenHistoryRef.current,
                totalTokens: totalTokensRef.current,
                lastTurnTotalTime: lastTurnTotalTimeRef.current,
              },
            },
          });
        }, 0);
      }
    },
    [onUpdateWorld],
  );

  // Sync refs with state
  useEffect(() => {
    tokenHistoryRef.current = tokenHistory;
  }, [tokenHistory]);
  useEffect(() => {
    totalTokensRef.current = totalTokens;
  }, [totalTokens]);
  useEffect(() => {
    lastTurnTotalTimeRef.current = lastTurnTotalTime;
  }, [lastTurnTotalTime]);

  useEffect(() => {
    activeWorldRef.current = activeWorld;
  }, [activeWorld]);
  useEffect(() => {
    combinedRegexScriptsRef.current = combinedRegexScripts;
  }, [combinedRegexScripts]);

  // CẢI TIẾN: Đồng bộ dữ liệu LSR sang danh sách thực thể (entities) để có thể tương tác
  useEffect(() => {
    if (!isReadyRef.current || !lsrRuntimeData || !activeWorld) return;

    const currentEntities = activeWorld.entities || [];
    const newEntities: Entity[] = [...currentEntities];
    let hasChanges = false;

    // Helper to add entity if not exists
    const addEntityIfNew = (
      name: string,
      type: Entity["type"],
      description?: string,
    ) => {
      if (!name || name.trim() === "" || name.length < 2) return;

      // CẢI TIẾN: Không thêm người chơi (PC) vào danh sách thực thể NPC
      const playerName = activeWorld.player.name;
      if (
        playerName &&
        (name.toLowerCase() === playerName.toLowerCase() ||
          name.toLowerCase() === "user" ||
          name.toLowerCase() === "player")
      )
        return;

      // Tránh trùng lặp (không phân biệt hoa thường)
      const exists = newEntities.some(
        (e) => e.name.toLowerCase() === name.toLowerCase(),
      );
      if (!exists) {
        newEntities.push({
          id: crypto.randomUUID(),
          name: name.trim(),
          type,
          description:
            description || `Thực thể được phát hiện qua hệ thống LSR.`,
          personality: "",
          avatar: "",
        });
        hasChanges = true;
      }
    };

    // Table #1 & #2: Characters
    ["1", "2"].forEach((tableId) => {
      const rows = (lsrRuntimeData[tableId] as any[]) || [];
      rows.forEach((row) => {
        const name = row["0"];
        if (name) addEntityIfNew(name, "NPC", row["3"] || row["6"]);
      });
    });

    // Table #6: Items
    const itemRows = (lsrRuntimeData["6"] as any[]) || [];
    itemRows.forEach((row) => {
      const name = row["0"];
      if (name) addEntityIfNew(name, "ITEM", row["5"]);
    });

    // Table #8: Locations
    const locRows = (lsrRuntimeData["8"] as any[]) || [];
    locRows.forEach((row) => {
      const name = row["0"];
      if (name) addEntityIfNew(name, "LOCATION", row["2"]);
    });

    if (hasChanges && onUpdateWorld) {
      // console.log("GameplayScreen: Syncing new entities from LSR data...", newEntities.length);
      onUpdateWorld({ entities: newEntities });
    }
  }, [lsrRuntimeData, activeWorld, onUpdateWorld]);

  // Sync dynamic rules and tawa preset back to world state when they change
  useEffect(() => {
    if (
      isReadyRef.current &&
      (dynamicRules.length > 0 || combinedRegexScripts.length > 0)
    ) {
      syncWorldState();
    }
  }, [dynamicRules, combinedRegexScripts, syncWorldState]);

  useEffect(() => {
    if (isReadyRef.current) {
      syncWorldState();
    }
  }, [tawaPresetConfig, syncWorldState]);

  // Task: Scheduled Vectorization (Every 10 turns)
  const lastVectorizedTurnRef = useRef<number>(-1);

  useEffect(() => {
    if (!activeWorld || !settings?.enableVectorMemory || !isReadyRef.current)
      return;

    const currentTurn = turnCount;
    const shouldVectorize =
      currentTurn > 0 &&
      currentTurn % 50 === 0 &&
      currentTurn !== lastVectorizedTurnRef.current;

    if (shouldVectorize) {
      lastVectorizedTurnRef.current = currentTurn;
      // Small delay to ensure state is settled
      setTimeout(() => {
        vectorService.vectorizeAllHistory(historyRef.current, settings);
      }, 2000);
    }
  }, [turnCount, activeWorld, settings, isReadyRef]);

  // Timer Logic
  useEffect(() => {
    if (isLoading) {
      startProcessing();
      timerRef.current = setInterval(() => {
        setCurrentProcessingTime((prev) => prev + 100);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      endProcessing();
      // Sync one last time to capture the final processing time
      syncWorldState();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [
    isLoading,
    syncWorldState,
    startProcessing,
    endProcessing,
    setCurrentProcessingTime,
  ]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds}`;
  };

  // Sync AI Monitor data whenever it changes to persist across navigation
  // REMOVED to prevent infinite loop. Syncing is now handled manually after AI responses.

  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const AIMonitor = () => {
    // Determine effective proxy and model
    let activeProxy = settings?.proxies?.find(
      (p) => p.id === settings.activeProxyId,
    );
    if (!activeProxy && (settings?.proxyEnabled || settings?.proxyUrl)) {
      activeProxy = {
        id: "legacy",
        name: settings?.proxyName || "Legacy Proxy",
        url: settings?.proxyUrl || "",
        key: settings?.proxyKey || "",
        model: settings?.proxyModel || "",
        models: settings?.proxyModels || [],
        isActive: true,
        type:
          settings?.proxyUrl?.includes("moonshot") ||
          settings?.proxyUrl?.includes("kimi")
            ? "openai"
            : settings?.proxyEnabled
              ? "openai"
              : "google",
      } as any;
    }

    const isProxy = !!activeProxy?.url && !!activeProxy?.key;
    const activeModel =
      activeProxy && activeProxy.model ? activeProxy.model : settings?.aiModel;

    return (
      <div className="p-3 bg-stone-300 dark:bg-slate-900/80 rounded-lg border border-stone-400 dark:border-slate-700 space-y-2 font-mono text-[10px] mt-2">
        <div className="flex justify-between items-center border-b border-stone-400 dark:border-slate-800 pb-1.5">
          <span className="text-stone-500 dark:text-slate-500 uppercase font-bold">
            AI Monitor
          </span>
          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="w-1.5 h-1.5 rounded-full bg-mystic-accent animate-pulse" />
            )}
            <span
              className={
                isLoading
                  ? "text-mystic-accent"
                  : "text-stone-400 dark:text-slate-600"
              }
            >
              {isLoading ? "PROCESSING" : "IDLE"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col">
            <span className="text-stone-500 dark:text-slate-500 uppercase">
              Connection
            </span>
            <span className={isProxy ? "text-sky-500" : "text-emerald-500"}>
              {isProxy
                ? `REVERSE PROXY (${activeProxy?.name || "Unknown"})`
                : "DIRECT API"}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-stone-500 dark:text-slate-500 uppercase">
              Active Model
            </span>
            <span
              className="text-stone-700 dark:text-slate-300 truncate"
              title={activeModel}
            >
              {activeModel}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-stone-500 dark:text-slate-500 uppercase">
              Timer
            </span>
            <span className="text-amber-500 font-bold">
              {formatTime(
                isLoading ? currentProcessingTime : lastTurnTotalTime,
              )}
            </span>
          </div>

          <div className="flex flex-col">
            <div
              className="flex justify-between items-center cursor-pointer hover:text-mystic-accent transition-colors"
              onClick={() => setShowTokenDetails(!showTokenDetails)}
            >
              <span className="text-stone-500 dark:text-slate-500 uppercase">
                Tokens (Last 5)
              </span>
              <span className="text-[8px] opacity-50">
                {showTokenDetails ? "Ẩn" : "Hiện"} chi tiết
              </span>
            </div>
            <div className="flex gap-1 items-end h-4 mt-1">
              {tokenHistory.length > 0 ? (
                tokenHistory.map((entry, i) => (
                  <div
                    key={i}
                    className="bg-mystic-accent/30 border-t border-mystic-accent w-2"
                    style={{
                      height: `${Math.min(100, (entry.tokens / 4000) * 100)}%`,
                    }}
                    title={`${entry.tokens} tokens, ${entry.words} words`}
                  />
                ))
              ) : (
                <span className="text-stone-400">No data</span>
              )}
            </div>

            {showTokenDetails && tokenHistory.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-stone-400/30 dark:border-slate-800/50 pt-1">
                {tokenHistory.map((entry, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-[9px] text-stone-600 dark:text-slate-400"
                  >
                    <span>#{tokenHistory.length - i}</span>
                    <span>{formatNumber(entry.tokens)} tkn</span>
                    <span>{formatNumber(entry.words)} chữ</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col border-t border-stone-400 dark:border-slate-800 pt-1">
            <div
              className="flex justify-between items-center cursor-pointer hover:text-mystic-accent transition-colors"
              onClick={() => setShowStatsDetails(!showStatsDetails)}
            >
              <span className="text-stone-500 dark:text-slate-500 uppercase">
                Thống kê
              </span>
              <span className="text-[8px] opacity-50">
                {showStatsDetails ? "Ẩn" : "Hiện"} chi tiết
              </span>
            </div>

            {showStatsDetails && (
              <div className="flex flex-col gap-0.5 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex justify-between">
                  <span>Gần nhất:</span>
                  <span className="text-stone-700 dark:text-slate-300">
                    {tokenHistory.length > 0
                      ? formatNumber(tokenHistory[0].tokens)
                      : 0}{" "}
                    tkn
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Số chữ:</span>
                  <span className="text-stone-700 dark:text-slate-300">
                    {tokenHistory.length > 0
                      ? formatNumber(tokenHistory[0].words)
                      : 0}{" "}
                    chữ
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tổng cộng:</span>
                  <span className="text-mystic-accent font-bold">
                    {formatNumber(totalTokens)} tkn
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Trung bình:</span>
                  <span className="text-stone-700 dark:text-slate-300">
                    {tokenHistory.length > 0
                      ? formatNumber(
                          Math.round(
                            tokenHistory.reduce((a, b) => a + b.tokens, 0) /
                              tokenHistory.length,
                          ),
                        )
                      : 0}{" "}
                    tkn
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  // Refs for auto-scrolling
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // --- Handlers (Defined as functions to avoid ReferenceError) ---

  // --- Auto-Scroll & Pagination Logic ---
  useEffect(() => {
    const totalPages =
      history.length <= 11
        ? 1
        : 1 + Math.ceil((history.length - 11) / MESSAGES_PER_PAGE);
    // Auto switch to last page when new message arrives
    if (history.length > 0) {
      setCurrentPage(totalPages);
    }
  }, [history.length]);

  // Scroll handler to detect if user is at the bottom
  const handleScroll = () => {
    if (scrollViewportRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollViewportRef.current;
      // Check if user is near bottom (e.g. 50px tolerance)
      const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 50;
      shouldAutoScrollRef.current = isAtBottom;
    }
  };

  useEffect(() => {
    if (pendingScrollTurnRef.current !== null) {
      const turnNumber = pendingScrollTurnRef.current;
      // Đợi một chút để DOM cập nhật sau khi chuyển trang
      const timer = setTimeout(() => {
        const element = document.getElementById(`turn-${turnNumber}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
          pendingScrollTurnRef.current = null;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentPage, displayedMessages]);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      // Khi AI vừa kết thúc lượt, ưu tiên cuộn đến đầu dòng "Lượt" mới nhất
      if (!isLoading && history.length > 0) {
        const lastMsg = history[history.length - 1];
        if (lastMsg.role === "model" && lastMsg.turnNumber !== undefined) {
          // Đợi DOM render xong ID
          const scrollTimeout = setTimeout(() => {
            const element = document.getElementById(
              `turn-${lastMsg.turnNumber}`,
            );
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
              setLastNavigatedTurn(lastMsg.turnNumber);
            } else if (chatEndRef.current) {
              chatEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
          }, 150);
          return () => clearTimeout(scrollTimeout);
        }
      }

      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [history, isLoading]);

  // Force scroll when page changes (navigating history)
  useEffect(() => {
    if (chatEndRef.current && pendingScrollTurnRef.current === null) {
      chatEndRef.current.scrollIntoView({ behavior: "auto" });
      shouldAutoScrollRef.current = true;
    }
  }, [currentPage]);

  // --- Handlers ---
  const triggerInitialSave = useCallback(
    async (world: WorldData, time: GameTime) => {
      if (!isReadyRef.current) return;
      try {
        // console.log("GameplayScreen: Triggering Initial Save (Bản lưu lượt 0)...");
        const worldData: WorldData = {
          ...world,
          lsrData: lsrRuntimeDataRef.current,
          config: {
            ...(world.config || { rules: [], regex_scripts: [] }),
            rules: dynamicRulesRef.current,
            tawaPreset: tawaPresetConfigRef.current,
            regexScripts: combinedRegexScriptsRef.current,
          },
          savedState: {
            history: [],
            turnCount: 0,
            gameTime: time,
            aiMonitor: {
              tokenHistory: tokenHistoryRef.current,
              totalTokens: totalTokensRef.current,
              lastTurnTotalTime: lastTurnTotalTimeRef.current,
            },
          },
        };
        const worldName = world.world?.worldName || "Unknown_World";
        const slotId = `initial-${worldName.replace(/\s+/g, "_")}-start`;

        await dbService.saveAutosave({
          id: slotId,
          name: `${worldName} - Bản lưu lượt 0`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          data: worldData,
        });
      } catch (err) {
        console.error("Initial save failed", err);
      }
    },
    [],
  );

  const triggerAutosave = useCallback(
    async (
      currentHistory: ChatMessage[],
      currentTurn: number,
      currentTime: GameTime,
      currentLsrData?: Record<string, unknown[]>,
    ) => {
      if (!activeWorldRef.current || !isReadyRef.current) return;
      try {
        // console.log(`GameplayScreen: Triggering Autosave for Turn ${currentTurn}...`);
        const worldData: WorldData = {
          ...activeWorldRef.current,
          lsrData: currentLsrData || lsrRuntimeDataRef.current, // Use provided data or ref
          config: {
            ...(activeWorldRef.current.config || { rules: [], regex_scripts: [] }),
            rules: dynamicRulesRef.current,
            tawaPreset: tawaPresetConfigRef.current,
            regexScripts: combinedRegexScriptsRef.current,
          },
          savedState: {
            history: currentHistory,
            turnCount: currentTurn,
            gameTime: currentTime,
            aiMonitor: {
              tokenHistory: tokenHistoryRef.current,
              totalTokens: totalTokensRef.current,
              lastTurnTotalTime: lastTurnTotalTimeRef.current,
            },
          },
        };

        const worldName =
          activeWorldRef.current.world?.worldName || "Unknown_World";
        const slotId = `autosave-${worldName.replace(/\s+/g, "_")}-${currentTurn}`;

        await dbService.saveAutosave({
          id: slotId,
          name: `${worldName} - Lượt ${currentTurn} (Tự động)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          data: worldData,
        });
      } catch (err) {
        console.error("Autosave failed", err);
      }
    },
    [],
  );

  const handleSend = async (textToSend: string) => {
    if (!textToSend || isLoading || !activeWorld || !settings) return;

    // Handle internal Regex Slash Commands
    const trimText = textToSend.trim();
    if (trimText === '/regex-state' || trimText.startsWith('/regex-off ') || trimText.startsWith('/regex-on ')) {
        const isState = trimText === '/regex-state';
        const isOff = trimText.startsWith('/regex-off ');
        const isOn = trimText.startsWith('/regex-on ');
        const targetName = isOff ? trimText.replace('/regex-off ', '').trim() : (isOn ? trimText.replace('/regex-on ', '').trim() : '');

        let statusMessage = "";

        if (isState) {
            statusMessage = "**Regex Scripts State:**\n\n";
            if (!combinedRegexScripts || combinedRegexScripts.length === 0) {
                 statusMessage += "No regex scripts found.";
            } else {
                 combinedRegexScripts.forEach(script => {
                     statusMessage += `- **${script.scriptName}**: ${script.disabled ? '🔴 OFF' : '🟢 ON'} *(Placement: ${script.placement.join(', ')})*\n`;
                 });
            }
        } else if (targetName && combinedRegexScripts) {
            let found = false;
            
            // We need to mutate the actual sources to persist
            // 1. Settings (Global)
            const globals = [...(settings.regex_scripts || [])];
            let modifiedGlobals = false;
            globals.forEach(s => {
                if (s.scriptName === targetName) {
                    s.disabled = isOff;
                    modifiedGlobals = true;
                    found = true;
                }
            });
            if (modifiedGlobals) {
                const newSettings = { ...settings, regex_scripts: globals };
                setSettings(newSettings);
                dbService.saveSettings(newSettings);
            }

            // 2. ActiveWorld (Scoped)
            const scopeds = [...(activeWorld.extensions?.regex_scripts || [])];
            let modifiedScopeds = false;
            scopeds.forEach(s => {
                if (s.scriptName === targetName) {
                    s.disabled = isOff;
                    modifiedScopeds = true;
                    found = true;
                }
            });
            if (modifiedScopeds && onUpdateWorld) {
                onUpdateWorld({
                    extensions: {
                        ...(activeWorld.extensions || {}),
                        regex_scripts: scopeds
                    }
                });
            }

            // 3. Current combined (for immediate UI reflection without full reload)
            const updatedCombined = combinedRegexScripts.map(s => {
                if (s.scriptName === targetName) return { ...s, disabled: isOff };
                return s;
            });
            setCombinedRegexScripts(updatedCombined);

            // Trigger reload from DB basically
            setTimeout(() => reloadRegexScripts(), 100);

            if (found) {
                statusMessage = `Regex script \`${targetName}\` has been turned **${isOff ? 'OFF' : 'ON'}**.`;
            } else {
                statusMessage = `Regex script \`${targetName}\` not found in current scope.`;
            }
        }

        // Add to history as a system message
        const sysMsg: ChatMessage = {
            role: "system",
            text: statusMessage,
            timestamp: Date.now(),
            gameTime: gameTime,
            turnNumber: turnCount,
        };
        const newHistory = [...history, sysMsg];
        setHistory(newHistory);
        syncWorldState(newHistory, turnCount, gameTime);
        setTimeout(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, 50);
        return;
    }

    // Apply Format User Input regex (Placement 1) - Destructive only
    let finalUserText = textToSend;
    const isDebug =
      typeof window !== "undefined" &&
      (window as any).__TAWA_REGEX_DEBUG__ === true;
    const currentPlayerName = activeWorld.player?.name || "User";
    const currentCharName = activeWorld.entities?.[0]?.name || "Character";

    if (combinedRegexScripts) {
      if (finalUserText.startsWith("/")) {
        // Apply placement 3 (Slash Command) if it looks like a slash command
        finalUserText = getRegexedString(finalUserText, 3, combinedRegexScripts, {
          userName: currentPlayerName,
          charName: currentCharName,
          depth: 0,
          isDebug,
          isPrompt: false,
          isMarkdown: false,
        });
      }

      // Then apply standard user input mapping
      finalUserText = getRegexedString(finalUserText, 1, combinedRegexScripts, {
        userName: currentPlayerName,
        charName: currentCharName,
        depth: 0,
        isDebug,
        isPrompt: false,
        isMarkdown: false,
      });
    }

    setLastAction(textToSend); // Giữ text nguyên bản cho input box history? Tốt hơn là giữ raw
    setLastNavigatedTurn(null);

    // Thời gian sẽ được AI quyết định trong phản hồi tiếp theo
    const userMsg: ChatMessage = {
      role: "user",
      text: finalUserText,
      timestamp: Date.now(),
      gameTime: gameTime, // Giữ nguyên thời gian hiện tại cho tin nhắn người dùng
      turnNumber: turnCount + 1, // User action starts the new turn
    };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    syncWorldState(newHistory, turnCount, gameTime);

    // Force auto-scroll on send
    shouldAutoScrollRef.current = true;

    if (settings.streamResponse) {
      await runStreamGeneration(
        userMsg.text,
        newHistory,
        settings,
        undefined,
        activeWorld,
        gameTime,
      );
    } else {
      setIsLoading(true);
      try {
        const effectiveWorldData: WorldData = {
          ...activeWorld,
          lsrData: lsrRuntimeDataRef.current, // Sử dụng dữ liệu LSR hiện tại từ Ref để tránh stale
          gameTime: gameTime,
          savedState: {
            history: newHistory,
            turnCount: turnCount,
            gameTime: gameTime,
          },
          config: {
            ...(activeWorld.config || { rules: [], regex_scripts: [] }),
            rules: dynamicRules,
            tawaPreset: tawaPresetConfig,
            regexScripts: combinedRegexScripts,
          },
        };

        const result = await gameplayAiService.generateStoryTurn(
          userMsg.text,
          newHistory,
          effectiveWorldData,
          settings,
          tawaPresetConfig,
          gameTime,
        );
        if (result.usage?.totalTokenCount) {
          updateTokenHistory(result.usage.totalTokenCount, result.text);
        } else if (result.text) {
          // Fallback: Ước tính token nếu không có dữ liệu (thường do dùng Proxy)
          const estimatedTokens = Math.ceil(result.text.length / 4);
          updateTokenHistory(estimatedTokens, result.text);
        }
        processAIResponse(result.text, false, gameTime);
      } catch (error) {
        console.error("AI Generation failed:", error);
        setIsLoading(false);
        processAIResponse(
          "*(Hệ thống: Có lỗi xảy ra trong quá trình tạo phản hồi. Vui lòng thử lại!)*",
          false,
          gameTime,
        );
      }

      // Trigger Memory Archiving check
    }
  };

  // Fetch saves when history modal opens
  useEffect(() => {
    if (showHistoryModal) {
      loadSaveLists();
    }
  }, [showHistoryModal, loadSaveLists]);

  const handleLoadSave = (save: SaveFile) => {
    if (!save.data) return;
    const worldData = save.data as WorldData;
    if (!worldData.savedState) {
      return;
    }

    // Check for permadeath
    const dead = checkDeathStatus(worldData.savedState.history, worldData.lsrData);
    if (dead) {
      triggerPermadeath();
      setShowHistoryModal(false);
      return;
    }

    // Restore state
    const time = worldData.savedState.gameTime || INITIAL_GAME_TIME;
    setGameTime(time);
    gameTimeRef.current = time;

    setTurnCount(worldData.savedState.turnCount);
    turnCountRef.current = worldData.savedState.turnCount;

    setHistory(worldData.savedState.history);
    historyRef.current = worldData.savedState.history;

    setLsrRuntimeData(worldData.lsrData || {});
    lsrRuntimeDataRef.current = worldData.lsrData || {};

    // Mark as ready
    isReadyRef.current = true;

    // Update activeWorld in parent
    if (onUpdateWorld) {
      onUpdateWorld(worldData);
    }

    setShowHistoryModal(false);
  };

  const handleRegenerate = async (msgIndex: number) => {
    if (isLoading || !activeWorld || !settings) return;

    // Determine context: history up to msgIndex - 1 (the user message triggering this)
    const prevHistory = history.slice(0, msgIndex);
    const userTriggerMsg = history[msgIndex - 1];

    // CRITICAL FIX: Use the gameTime from the user message as the starting point for regeneration
    // This prevents time from "stacking" or advancing incorrectly when retrying.
    const startTime = userTriggerMsg?.gameTime || gameTime;

    // Handle Turn 0 correctly: if msgIndex is 0, it's the opening narrative
    const userInput =
      msgIndex === 0
        ? "Hãy bắt đầu câu chuyện."
        : userTriggerMsg?.text || "Continue";

    // Force auto-scroll on regenerate
    shouldAutoScrollRef.current = true;

    if (settings.streamResponse) {
      // Pass the correct startTime to runStreamGeneration
      await runStreamGeneration(
        userInput,
        history,
        settings,
        msgIndex,
        activeWorld,
        startTime,
      );
    } else {
      setIsLoading(true);
      try {
        const effectiveWorldData: WorldData = {
          ...activeWorld,
          lsrData: lsrRuntimeDataRef.current,
          config: {
            ...(activeWorld.config || { rules: [], regex_scripts: [] }),
            rules: dynamicRules,
            tawaPreset: tawaPresetConfig,
            regexScripts: combinedRegexScripts,
          },
        };

        const result = await gameplayAiService.generateStoryTurn(
          userInput,
          prevHistory,
          effectiveWorldData,
          settings,
          tawaPresetConfig,
          startTime, // Use startTime here too
        );

        if (result.usage?.totalTokenCount) {
          updateTokenHistory(result.usage.totalTokenCount, result.text);
        } else if (result.text) {
          // Fallback: Ước tính token nếu không có dữ liệu (thường do dùng Proxy)
          const estimatedTokens = Math.ceil(result.text.length / 4);
          updateTokenHistory(estimatedTokens, result.text);
        }

        // Apply Format AI Output regex (Placement 2) - Permanently (Destructive only)
        let finalRegenText = result.text;
        const isDebugRegen =
          typeof window !== "undefined" &&
          (window as any).__TAWA_REGEX_DEBUG__ === true;
        const playerNameToUseRegen = activeWorld.player?.name || "User";
        if (combinedRegexScripts) {
          finalRegenText = getRegexedString(
            finalRegenText,
            2,
            combinedRegexScripts,
            {
              userName: playerNameToUseRegen,
              charName: "Character",
              depth: 0,
              isDebug: isDebugRegen,
              isPrompt: false,
              isMarkdown: false,
            },
          );
        }

        // updateMessageSwipes needs to handle time sync correctly
        updateMessageSwipes(msgIndex, finalRegenText, startTime);
        setIsLoading(false);
      } catch (error) {
        console.error("AI Regeneration failed:", error);
        setIsLoading(false);
        // Can't replace message inline if it failed completely, so we just stop loading
        alert("Có lỗi xảy ra: " + (error as Error).message);
      }
    }
  };

  const runStreamGeneration = useCallback(
    async (
      userInput: string,
      currentHistory: ChatMessage[],
      currentSettings: AppSettings,
      regenerateIndex?: number,
      world?: WorldData,
      time?: GameTime,
    ) => {
      setIsLoading(true);
      try {
        const effectiveWorldData: WorldData = {
          ...(world || activeWorldRef.current!),
          lsrData: lsrRuntimeDataRef.current, // Sử dụng dữ liệu LSR hiện tại từ state
          gameTime: time || gameTimeRef.current,
          savedState: {
            history: currentHistory,
            turnCount: turnCountRef.current,
            gameTime: time || gameTimeRef.current,
          },
          config: {
            ...(world || activeWorldRef.current!).config,
            rules: dynamicRulesRef.current,
            tawaPreset: tawaPresetConfigRef.current,
            regexScripts: combinedRegexScriptsRef.current,
          },
        };

        const workingHistory =
          regenerateIndex !== undefined
            ? [...currentHistory.slice(0, regenerateIndex + 1)]
            : [...currentHistory];
        let targetIndex = regenerateIndex;

        let presetName = "Mặc định";
        try {
          const activeId =
            localStorage.getItem("tawa_active_preset_id_v4") || "default";
          const presetsRaw = localStorage.getItem("tawa_presets_list_v4");
          if (presetsRaw) {
            const presets = JSON.parse(presetsRaw);
            const active = presets.find((p: any) => p.id === activeId);
            if (active) presetName = active.name;
          }
        } catch (e) {
          // Ignored empty catch block
        }
        const currentPreset = tawaPresetConfigRef.current;
        const cotModuleName = currentPreset?.cot?.moduleId
          ? currentPreset.modules.find(
              (m) => m.identifier === currentPreset.cot!.moduleId,
            )?.name
          : undefined;

        const defaultMetadata = {
          presetUsed: presetName,
          cotUsed: cotModuleName || "Không dùng",
          worldInfoConfig: `${activeWorldRef.current?.entities?.length || 0} Entities`,
        };

        // If NOT regenerating, create a placeholder message first
        if (targetIndex === undefined) {
          const placeholderMsg: ChatMessage = {
            role: "model",
            text: "",
            timestamp: Date.now(),
            gameTime: time || gameTimeRef.current,
            swipes: [""],
            swipeIndex: 0,
            choices: [],
            turnNumber:
              currentHistory.length === 0 ? 0 : turnCountRef.current + 1,
            userAction: currentHistory.length === 0 ? undefined : userInput,
            metadata: defaultMetadata,
          };
          workingHistory.push(placeholderMsg);
          targetIndex = workingHistory.length - 1;

          // Update state with placeholder
          setHistory([...workingHistory]);
        } else {
          // If regenerating, prepare the new swipe slot
          // workingHistory[targetIndex] should now exist because we passed the full history
          const msg = { ...(workingHistory[targetIndex] || {}) } as ChatMessage;

          // Ensure role and basic properties are present
          if (!msg.role) msg.role = "model";
          msg.metadata = defaultMetadata;

          const newSwipes = [...(msg.swipes || [msg.text || ""]), ""]; // Add empty slot
          msg.swipes = newSwipes;
          msg.swipeIndex = newSwipes.length - 1;
          msg.text = ""; // Clear current text for streaming visual

          // Ensure turn info is present even for legacy messages being regenerated
          if (msg.turnNumber === undefined) {
            msg.turnNumber = targetIndex === 0 ? 0 : turnCountRef.current;
          }
          if (msg.userAction === undefined && targetIndex > 0) {
            msg.userAction = userInput;
          }

          workingHistory[targetIndex] = msg;
          // Update state for visual feedback
          setHistory([...workingHistory]);
        }

        // Small delay to ensure state update (optional but safe)
        await new Promise((r) => setTimeout(r, 0));

        const stream = gameplayAiService.generateStoryTurnStream(
          userInput,
          regenerateIndex !== undefined
            ? currentHistory.slice(0, regenerateIndex)
            : currentHistory,
          effectiveWorldData,
          currentSettings,
          tawaPresetConfigRef.current,
          time || gameTimeRef.current,
        );

        let accumulatedText = "";
        let lastTokenCount = 0;
        let lastUIUpdateTime = 0;
        const UI_UPDATE_INTERVAL = 150; // Tần suất cập nhật UI (ms) - Giúp ổn định khi chuyển tab

        for await (const chunk of stream) {
          if (typeof chunk === "string") {
            accumulatedText += chunk;
          } else {
            if (chunk.text) accumulatedText += chunk.text;
            if (chunk.usageMetadata?.totalTokenCount) {
              lastTokenCount = chunk.usageMetadata.totalTokenCount;
            }
          }

          const now = Date.now();
          // Chỉ cập nhật UI nếu đã qua khoảng thời gian chỉ định hoặc là chunk cuối (thông qua việc kết thúc loop)
          if (now - lastUIUpdateTime > UI_UPDATE_INTERVAL) {
            if (targetIndex !== undefined && workingHistory[targetIndex]) {
              const msg = { ...workingHistory[targetIndex] };

              const swipes = [...(msg.swipes || [""])];
              const currentSwipeIdx = msg.swipeIndex || 0;

              // FILTER: Remove thinking blocks from UI display during streaming
              let displayContent = accumulatedText;
              const thinkingPatterns = [
                /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*?<\/(?:thinking|think|thinhking|thought|thoughts)>/gi,
                /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*$/gi, // Handle unclosed thinking tag while streaming
              ];
              thinkingPatterns.forEach((pattern) => {
                displayContent = displayContent.replace(pattern, "");
              });

              swipes[currentSwipeIdx] = displayContent;

              const branchesContent =
                extractTagContent(accumulatedText, "branches") ||
                extractTagContent(accumulatedText, "choices") ||
                extractTagContent(accumulatedText, "actions");
              const choicesList = parseChoices(branchesContent);

              msg.swipes = swipes;
              msg.text = accumulatedText;
              msg.choices = choicesList;

              workingHistory[targetIndex] = msg;
              setHistory([...workingHistory]);
              lastUIUpdateTime = now;
            }
          }
        }

        // ĐẢM BẢO CẬP NHẬT LẦN CUỐI CÙNG KHI KẾT THÚC LUỒNG
        if (targetIndex !== undefined && workingHistory[targetIndex]) {
          const msg = { ...workingHistory[targetIndex] };
          const swipes = [...(msg.swipes || [""])];
          const currentSwipeIdx = msg.swipeIndex || 0;

          // FILTER: Remove thinking blocks from UI display
          let displayContent = accumulatedText;
          const thinkingPatterns = [
            /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*?<\/(?:thinking|think|thinhking|thought|thoughts)>/gi,
            /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*$/gi,
          ];
          thinkingPatterns.forEach((pattern) => {
            displayContent = displayContent.replace(pattern, "");
          });

          swipes[currentSwipeIdx] = displayContent;

          const branchesContent =
            extractTagContent(accumulatedText, "branches") ||
            extractTagContent(accumulatedText, "choices") ||
            extractTagContent(accumulatedText, "actions");
          const choicesList = parseChoices(branchesContent);

          msg.swipes = swipes;
          msg.text = accumulatedText;
          msg.choices = choicesList;

          workingHistory[targetIndex] = msg;
          setHistory([...workingHistory]);
        }

        // Update token history once after stream completes
        if (lastTokenCount > 0) {
          updateTokenHistory(lastTokenCount, accumulatedText);
        } else if (accumulatedText.length > 0) {
          // Fallback: Ước tính token nếu không có dữ liệu (thường do dùng Proxy)
          const estimatedTokens = Math.ceil(accumulatedText.length / 4);
          updateTokenHistory(estimatedTokens, accumulatedText);
        }

        // Finalize parsing (Branches/Choices and Time)
        let finalTime = time || gameTimeRef.current;

        // Trích xuất thời gian tiêu tốn hoặc thiết lập lại thời gian từ AI
        const setTimeStr = extractTagContent(accumulatedText, "set_time");
        if (setTimeStr) {
          const parts = setTimeStr
            .split("|")
            .map((p) => parseInt(p.trim(), 10));
          if (parts.length === 5 && !parts.some(isNaN)) {
            finalTime = {
              year: parts[0],
              month: parts[1],
              day: parts[2],
              hour: parts[3],
              minute: parts[4],
            };
          }
        } else {
          const timeCostStr = extractTagContent(accumulatedText, "time_cost");
          let timeCost = parseInt(timeCostStr || "1", 10); // Mặc định 1 phút nếu không có thẻ
          if (isNaN(timeCost) || timeCost < 1) timeCost = 1; // Đảm bảo tối thiểu 1 phút
          finalTime = advanceTime(finalTime, timeCost);
        }

        setGameTime(finalTime);

        // Extract incrementalSummary
        const incrementalSummary = extractTagContent(
          accumulatedText,
          "incrementalSummary",
        );

        // Task: Parse LSR Data for immediate sync after stream
        const tableStored = extractTagContent(accumulatedText, "table_stored");
        let nextLsrData = lsrRuntimeDataRef.current;
        if (tableStored) {
          // console.log("GameplayScreen: Detected <table_stored> tag. Parsing...");
          const parsedData = LsrParser.parseLsrString(tableStored);
          // Guard: Only overwrite if we actually found some data in the tag
          if (Object.keys(parsedData).length > 0) {
            nextLsrData = parsedData;
            // console.log("GameplayScreen: Parsed LSR Data from <table_stored>:", nextLsrData);
            setLsrRuntimeData(nextLsrData);
          } else {
            console.warn(
              "GameplayScreen: <table_stored> was present but empty or unparseable. Keeping current data.",
            );
          }
        } else {
          const tableEdit = extractTagContent(accumulatedText, "tableEdit");
          if (tableEdit) {
            // console.log("GameplayScreen: Detected <tableEdit> tag. Merging edits...");
            const parsedEdits = LsrParser.parseLsrString(tableEdit);
            if (Object.keys(parsedEdits).length > 0) {
              // console.log("GameplayScreen: Parsed LSR Edits:", parsedEdits);
              nextLsrData = LsrParser.mergeLsrData(
                lsrRuntimeDataRef.current,
                parsedEdits,
              );
              setLsrRuntimeData(nextLsrData);
            }
          }
        }

        // CRITICAL: Calculate finalHistory EXPLICITLY from workingHistory
        if (targetIndex !== undefined && workingHistory[targetIndex]) {
          const msg = { ...workingHistory[targetIndex] };

          const branchesContent =
            extractTagContent(accumulatedText, "branches") ||
            extractTagContent(accumulatedText, "choices") ||
            extractTagContent(accumulatedText, "actions");
          const choicesList = parseChoices(branchesContent);

          const finalAccumulatedText = accumulatedText;

          msg.choices = choicesList;
          msg.gameTime = finalTime;
          msg.incrementalSummary = incrementalSummary;
          msg.text = finalAccumulatedText; // Ensure text is fully captured and formatted

          let presetName = "Mặc định";
          try {
            const activeId =
              localStorage.getItem("tawa_active_preset_id_v4") || "default";
            const presetsRaw = localStorage.getItem("tawa_presets_list_v4");
            if (presetsRaw) {
              const presets = JSON.parse(presetsRaw);
              const active = presets.find((p: any) => p.id === activeId);
              if (active) presetName = active.name;
            }
          } catch (e: any) {
            console.warn("GameplayScreen: Failed to parse presets:", e);
          }
          const currentPreset = tawaPresetConfigRef.current;
          const cotModuleName = currentPreset?.cot?.moduleId
            ? currentPreset.modules.find(
                (m) => m.identifier === currentPreset.cot!.moduleId,
              )?.name
            : undefined;

          msg.metadata = {
            presetUsed: presetName,
            cotUsed: cotModuleName || "Không dùng",
            worldInfoConfig: `${activeWorldRef.current?.entities?.length || 0} Entities`,
          };

          // Also update the current swipe if regenerating
          if (msg.swipes && msg.swipeIndex !== undefined) {
            msg.swipes[msg.swipeIndex] = finalAccumulatedText;
          }

          workingHistory[targetIndex] = msg;
        }

        const finalHistory = [...workingHistory];
        setHistory(finalHistory);

        if (targetIndex !== undefined && regenerateIndex === undefined) {
          // Only increment turnCount if it's NOT the initial message (Turn 0)
          const isInitial = currentHistory.length === 0;
          const newTurnCount = isInitial
            ? turnCountRef.current
            : turnCountRef.current + 1;

          if (!isInitial) {
            setTurnCount(newTurnCount);
          }

          // console.log(`GameplayScreen: Finalizing Turn ${newTurnCount}. History length: ${finalHistory.length}`);

          // Trigger Autosave after stream completes
          triggerAutosave(finalHistory, newTurnCount, finalTime, nextLsrData);
          // Sync state after stream completes
          syncWorldState(
            finalHistory,
            newTurnCount,
            finalTime,
            nextLsrData,
            incrementalSummary,
          );
        } else {
          // If regenerating or no target, just sync current state
          syncWorldState(
            finalHistory,
            turnCountRef.current,
            finalTime,
            nextLsrData,
            incrementalSummary,
          );
        }
        setIsLoading(false);

        // Trigger Memory Archiving check after stream
      } catch (err: any) {
        console.error("Lỗi trong quá trình stream:", err);
        setIsLoading(false);
        if (targetIndex !== undefined) {
          setHistory((prev) => {
            const newH = [...prev];
            if (newH[targetIndex]) {
              newH[targetIndex].text +=
                "\n\n**[LỖI HỆ THỐNG: Quá trình tạo phản hồi bị ngắt quãng. Nguyên nhân có thể do hạn mức, cấu hình hoặc mạng.]**\nChi tiết: " +
                err.message;
            }
            return newH;
          });
        }
      }
    },
    [syncWorldState, triggerAutosave],
  );

  const processAIResponse = useCallback(
    (responseText: string, initial = false, time?: GameTime, alternateGreetings?: string[]) => {
      const branchesContent =
        extractTagContent(responseText, "branches") ||
        extractTagContent(responseText, "choices") ||
        extractTagContent(responseText, "actions");
      const choicesList = parseChoices(branchesContent);

      // Trích xuất thời gian tiêu tốn hoặc thiết lập lại thời gian từ AI
      const setTimeStr = extractTagContent(responseText, "set_time");
      let updatedTime = time || gameTimeRef.current;

      if (setTimeStr) {
        const parts = setTimeStr.split("|").map((p) => parseInt(p.trim(), 10));
        if (parts.length === 5 && !parts.some(isNaN)) {
          updatedTime = {
            year: parts[0],
            month: parts[1],
            day: parts[2],
            hour: parts[3],
            minute: parts[4],
          };
        }
      } else {
        const timeCostStr = extractTagContent(responseText, "time_cost");
        let timeCost = parseInt(timeCostStr || (initial ? "0" : "1"), 10);
        if (!initial && (isNaN(timeCost) || timeCost < 1)) timeCost = 1; // Đảm bảo tối thiểu 1 phút cho hành động (trừ mở đầu)

        if (timeCost > 0 || initial) {
          updatedTime = advanceTime(updatedTime, timeCost);
        }
      }

      setGameTime(updatedTime);

      // Extract incrementalSummary
      const incrementalSummary = extractTagContent(
        responseText,
        "incrementalSummary",
      );

      let finalResponseText = responseText;
      const isDebugAI =
        typeof window !== "undefined" &&
        (window as any).__TAWA_REGEX_DEBUG__ === true;
      const playerNameToUse = activeWorldRef.current?.player?.name || "User";
      
      const applyRegex = (text: string) => {
        if (combinedRegexScriptsRef.current) {
          return getRegexedString(
            text,
            2,
            combinedRegexScriptsRef.current,
            {
              userName: playerNameToUse,
              charName: "Character",
              depth: 0,
              isDebug: isDebugAI,
              isPrompt: false,
              isMarkdown: false,
            },
          );
        }
        return text;
      };

      finalResponseText = applyRegex(finalResponseText);
      
      let finalSwipes = [finalResponseText];
      if (alternateGreetings && alternateGreetings.length > 0) {
        finalSwipes = [finalResponseText, ...alternateGreetings.map(applyRegex)];
      }

      let presetName = "Mặc định";
      try {
        const activeId =
          localStorage.getItem("tawa_active_preset_id_v4") || "default";
        const presetsRaw = localStorage.getItem("tawa_presets_list_v4");
        if (presetsRaw) {
          const presets = JSON.parse(presetsRaw);
          const active = presets.find((p: any) => p.id === activeId);
          if (active) presetName = active.name;
        }
      } catch (e: any) {
        console.warn("GameplayScreen: Failed to parse presets:", e);
      }

      const currentPresetForMeta = tawaPresetConfigRef.current;
      const metaCotModuleName = currentPresetForMeta?.cot?.moduleId
        ? currentPresetForMeta.modules.find(
            (m) => m.identifier === currentPresetForMeta.cot!.moduleId,
          )?.name
        : undefined;

      const metadata = {
        presetUsed: presetName,
        cotUsed: metaCotModuleName || "Không dùng",
        worldInfoConfig: `${activeWorldRef.current?.entities?.length || 0} Entities`,
      };

      const modelMsg: ChatMessage = {
        role: "model",
        text: finalResponseText,
        timestamp: Date.now(),
        gameTime: updatedTime,
        choices: choicesList,
        swipes: finalSwipes,
        swipeIndex: 0,
        turnNumber: initial ? 0 : turnCountRef.current + 1,
        userAction: initial ? undefined : lastActionRef.current,
        incrementalSummary: incrementalSummary,
        metadata: metadata,
      };

      const newHistory = [...historyRef.current, modelMsg];
      // Task: Parse LSR Data for immediate sync
      const tableStored = extractTagContent(responseText, "table_stored");
      let nextLsrData = lsrRuntimeDataRef.current;
      if (tableStored) {
        // console.log("GameplayScreen (processAIResponse): Detected <table_stored>. Parsing...");
        const parsedData = LsrParser.parseLsrString(tableStored);
        if (Object.keys(parsedData).length > 0) {
          nextLsrData = parsedData;
          // console.log("GameplayScreen (processAIResponse): Parsed LSR Data:", nextLsrData);
          setLsrRuntimeData(nextLsrData);
        } else {
          console.warn(
            "GameplayScreen (processAIResponse): <table_stored> was empty or unparseable.",
          );
        }
      } else {
        const tableEdit = extractTagContent(responseText, "tableEdit");
        if (tableEdit) {
          // console.log("GameplayScreen (processAIResponse): Detected <tableEdit>. Merging edits...");
          const parsedEdits = LsrParser.parseLsrString(tableEdit);
          if (Object.keys(parsedEdits).length > 0) {
            // console.log("GameplayScreen (processAIResponse): Parsed LSR Edits:", parsedEdits);
            nextLsrData = LsrParser.mergeLsrData(
              lsrRuntimeDataRef.current,
              parsedEdits,
            );
            setLsrRuntimeData(nextLsrData);
          }
        }
      }

      setHistory(newHistory);

      const dead = checkDeathStatus(newHistory, nextLsrData);
      if (dead) {
        triggerPermadeath();
      }

      if (!initial) {
        const newTurnCount = turnCountRef.current + 1;
        setTurnCount(newTurnCount);
        // Sync & Autosave
        syncWorldState(
          newHistory,
          newTurnCount,
          updatedTime,
          nextLsrData,
          incrementalSummary,
        );
        triggerAutosave(newHistory, newTurnCount, updatedTime, nextLsrData);
      } else {
        // Initial message (Opening)
        syncWorldState(
          newHistory,
          turnCountRef.current,
          updatedTime,
          nextLsrData,
          incrementalSummary,
        );
        triggerAutosave(
          newHistory,
          turnCountRef.current,
          updatedTime,
          nextLsrData,
        );
      }
      setIsLoading(false);
    },
    [syncWorldState, triggerAutosave],
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleSendInitial = useCallback(
    async (currentSettings: AppSettings, world: WorldData, time: GameTime) => {
      setIsLoading(true);
      // Enable auto scroll for initial load
      shouldAutoScrollRef.current = true;

      try {
        const campaignId =
          world.id ||
          `campaign-${world.world?.worldName?.replace(/\s+/g, "")}-${world.player?.name?.replace(/\s+/g, "")}`;
        storyBibleService
          .initialize(world, currentSettings, campaignId)
          .catch((err) => {
            console.error("Background StoryBible init failed", err);
          });
      } catch (e) {
        console.error("Failed to start StoryBible init", e);
      }

      // Nếu có firstMessage từ thẻ SillyTavern, sử dụng trực tiếp làm initial message
      if (
        world.world?.firstMessage &&
        world.world?.firstMessage.trim().length > 0
      ) {
        let rawFirstMsg = world.world?.firstMessage.trim();

        // CẢI TIẾN: Thay thế macro cơ bản của ST để lời chào đầu tự nhiên hơn
        const playerName = world.player?.name || "User";
        const charName = world.entities?.[0]?.name || "Character";
        
        const replaceMacros = (text: string) => {
          const res = text.replace(/\{\{\s*user\s*\}\}/gi, playerName);
          return res.replace(/\{\{\s*char\s*\}\}/gi, charName);
        };
        
        rawFirstMsg = replaceMacros(rawFirstMsg);
        
        const alternateGreetings = world.entities?.[0]?.alternate_greetings?.map(replaceMacros) || [];

        processAIResponse(rawFirstMsg, true, time, alternateGreetings);
        return;
      }

      // CẢI TIẾN: Tạo prompt mở đầu chi tiết hơn dựa trên kịch bản khởi đầu (nếu có)
      const startingScenario = world.world.startingScenario || "";
      const initialPrompt = startingScenario
        ? `Hãy bắt đầu câu chuyện dựa trên kịch bản khởi đầu này: "${startingScenario}". Hãy viết một mở đầu cực kỳ ấn tượng, sống động và lôi cuốn.`
        : "Hãy bắt đầu câu chuyện một cách tự nhiên và lôi cuốn nhất dựa trên bối cảnh thế giới và nhân vật đã thiết lập. Hãy thiết lập bối cảnh hiện tại một cách sống động.";

      if (currentSettings.streamResponse) {
        await runStreamGeneration(
          initialPrompt,
          [],
          currentSettings,
          undefined,
          world,
          time,
        );
      } else {
        const opening = await gameplayAiService.generateStoryTurn(
          initialPrompt,
          [],
          world,
          currentSettings,
          tawaPresetConfig,
          time,
        );
        if (opening.usage?.totalTokenCount) {
          updateTokenHistory(opening.usage.totalTokenCount, opening.text);
        } else if (opening.text) {
          const estimatedTokens = Math.ceil(opening.text.length / 4);
          updateTokenHistory(estimatedTokens, opening.text);
        }
        processAIResponse(opening.text, true, time);
      }
    },
    [runStreamGeneration, processAIResponse, tawaPresetConfig],
  );

  // --- Initial Load ---
  useEffect(() => {
    // If world session changes (e.g. from Menu), allow re-initialization
    if (
      activeWorld &&
      (!lastWorldRef.current ||
        activeWorld.sessionId !== lastWorldRef.current.sessionId)
    ) {
      // console.log("GameplayScreen: New world detected, resetting initialization.");
      initializedRef.current = false;
      lastWorldRef.current = activeWorld;
      initialStartedRef.current = false;
      isReadyRef.current = false; // Reset ready state for new world
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // console.log("GameplayScreen: Starting initialization...");
      const s = await dbService.getSettings();
      setSettings(s);

      // Load LSR Definitions
      setLsrTables(LsrParser.parseDefinitions());

      if (activeWorld) {
        // Sync initial rules from world config
        setDynamicRules(activeWorld.config?.rules || []);

        reloadRegexScripts();

        // Sync Tawa Preset from world config
        if (activeWorld.config?.tawaPreset) {
          setTawaPresetConfig(activeWorld.config.tawaPreset);
        }

        // Load LSR Data
        if (activeWorld.lsrData) {
          setLsrRuntimeData(activeWorld.lsrData);
        }

        const worldDataWithState = activeWorld as WorldData;
        if (
          worldDataWithState.savedState &&
          worldDataWithState.savedState.history.length > 0
        ) {
          // console.log("GameplayScreen: Loading saved state, history length:", worldDataWithState.savedState.history.length);
          setHistory(worldDataWithState.savedState.history);
          historyRef.current = worldDataWithState.savedState.history;

          const dead = checkDeathStatus(worldDataWithState.savedState.history, worldDataWithState.lsrData);
          if (dead) {
            triggerPermadeath();
          }

          setTurnCount(worldDataWithState.savedState.turnCount);
          turnCountRef.current = worldDataWithState.savedState.turnCount;

          if (worldDataWithState.savedState.gameTime) {
            setGameTime(worldDataWithState.savedState.gameTime);
            gameTimeRef.current = worldDataWithState.savedState.gameTime;
          }

          // Restore AI Monitor state
          syncAiMonitorFromSave(worldDataWithState.savedState.aiMonitor);

          // Mark as ready AFTER state is set
          isReadyRef.current = true;
          // console.log("GameplayScreen: Initialization complete (Loaded Save).");
        } else {
          // console.log("GameplayScreen: No saved state found, starting new game.");
          // New world or empty history: Reset AI Monitor
          syncAiMonitorFromSave(null);

          if (s && !initialStartedRef.current) {
            // Initial Start: Generate opening
            initialStartedRef.current = true;
            const initialTime =
              worldDataWithState.gameTime || INITIAL_GAME_TIME;
            setGameTime(initialTime);

            // Mark as ready BEFORE initial generation so it can sync
            isReadyRef.current = true;

            // Trigger Initial Save (Bản lưu lượt 0) BEFORE opening generation
            await triggerInitialSave(worldDataWithState, initialTime);

            handleSendInitial(s, worldDataWithState, initialTime);
            // console.log("GameplayScreen: Initialization complete (New Game).");
          }
        }
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorld, handleSendInitial, triggerInitialSave]);

  const updateMessageSwipes = (
    index: number,
    newText: string,
    overrideTime?: GameTime,
  ) => {
    // Task: Parse LSR Data for immediate sync during swipe/regen
    const tableStored = extractTagContent(newText, "table_stored");
    let nextLsrData = lsrRuntimeDataRef.current;
    if (tableStored) {
      // console.log("GameplayScreen (updateMessageSwipes): Detected <table_stored>. Parsing...");
      nextLsrData = LsrParser.parseLsrString(tableStored);
      // console.log("GameplayScreen (updateMessageSwipes): Parsed LSR Data:", nextLsrData);
      setLsrRuntimeData(nextLsrData);
    } else {
      const tableEdit = extractTagContent(newText, "tableEdit");
      if (tableEdit) {
        // console.log("GameplayScreen (updateMessageSwipes): Detected <tableEdit>. Parsing edits...");
        const parsedEdits = LsrParser.parseLsrString(tableEdit);
        // console.log("GameplayScreen (updateMessageSwipes): Parsed LSR Edits:", parsedEdits);
        nextLsrData = LsrParser.mergeLsrData(
          lsrRuntimeDataRef.current,
          parsedEdits,
        );
        setLsrRuntimeData(nextLsrData);
      }
    }

    setHistory((prev) => {
      // Truncate history to the current index to ensure story divergence
      const updated = prev.slice(0, index + 1);
      const msg = { ...(updated[index] || {}) } as ChatMessage;

      // Ensure role is present
      if (!msg.role) msg.role = "model";

      const branchesContent =
        extractTagContent(newText, "branches") ||
        extractTagContent(newText, "choices") ||
        extractTagContent(newText, "actions");
      const choicesList = parseChoices(branchesContent);

      const currentSwipes = msg.swipes || [msg.text];
      const newSwipes = [...currentSwipes, newText];

      msg.swipes = newSwipes;
      msg.swipeIndex = newSwipes.length - 1;
      msg.text = newText;
      msg.choices = choicesList; // Update choices to latest generation

      // Calculate final time for this swipe
      let finalTime = overrideTime || gameTime;
      const setTimeStr = extractTagContent(newText, "set_time");
      if (setTimeStr) {
        const parts = setTimeStr.split("|").map((p) => parseInt(p.trim(), 10));
        if (parts.length === 5 && !parts.some(isNaN)) {
          finalTime = {
            year: parts[0],
            month: parts[1],
            day: parts[2],
            hour: parts[3],
            minute: parts[4],
          };
        }
      } else {
        const timeCostStr = extractTagContent(newText, "time_cost");
        let timeCost = parseInt(timeCostStr || "1", 10);
        if (isNaN(timeCost) || timeCost < 1) timeCost = 1;
        finalTime = advanceTime(finalTime, timeCost);
      }

      msg.gameTime = finalTime;
      setGameTime(finalTime);

      // Extract incrementalSummary
      const incrementalSummary = extractTagContent(
        newText,
        "incrementalSummary",
      );
      msg.incrementalSummary = incrementalSummary;

      // Ensure turn info is present even for legacy messages being regenerated
      if (msg.turnNumber === undefined) {
        msg.turnNumber = index === 0 ? 0 : turnCount;
      }
      if (msg.userAction === undefined && index > 0) {
        msg.userAction = updated[index - 1].text;
      }

      updated[index] = msg;

      // Sync state back to parent
      syncWorldState(
        updated,
        turnCount,
        finalTime,
        nextLsrData,
        incrementalSummary,
      );
      return updated;
    });
  };

  const handleToggleHideMessage = useCallback(
    (index: number) => {
      setHistory((prev) => {
        const newHistory = [...prev];
        if (newHistory[index]) {
          newHistory[index] = {
            ...newHistory[index],
            isHidden: !newHistory[index].isHidden,
          };
          setTimeout(() => syncWorldState(newHistory), 0);
        }
        return newHistory;
      });
    },
    [syncWorldState],
  );

  const handleMessageUpdate = useCallback((index: number, newText: string) => {
    setHistory((prev) => {
      const newHistory = [...prev];
      if (newHistory[index]) {
        const msgToEdit = newHistory[index];
        const currentPlayerName =
          activeWorldRef.current?.player?.name || "User";
        // Apply only regex scripts that have runOnEdit = true
        let finalText = newText;
        const isDebug =
          typeof window !== "undefined" &&
          (window as any).__TAWA_REGEX_DEBUG__ === true;
        let scriptsToRunOnEdit: any[] = [];
        if (combinedRegexScriptsRef.current) {
          scriptsToRunOnEdit = [
            ...combinedRegexScriptsRef.current.filter((s: any) => s.runOnEdit),
          ];
        }
        if (scriptsToRunOnEdit.length > 0) {
          const messageDepth =
            newHistory.length > 0 ? newHistory.length - 1 - index : -1;
          const placement = msgToEdit.role === "user" ? 1 : 2;
          finalText = getRegexedString(
            finalText,
            placement,
            scriptsToRunOnEdit,
            {
              userName: currentPlayerName,
              charName: "Character",
              depth: messageDepth,
              isDebug,
              isEdit: true,
              isPrompt: false,
              isMarkdown: false,
            },
          );
        }

        // Update raw text
        const msg = { ...newHistory[index] };
        msg.text = finalText;

        // Also update the specific swipe if it exists
        if (msg.swipes && msg.swipeIndex !== undefined) {
          const newSwipes = [...msg.swipes];
          newSwipes[msg.swipeIndex] = finalText;
          msg.swipes = newSwipes;
        }

        if (msg.role === "model") {
          const branchesContent =
            extractTagContent(finalText, "branches") ||
            extractTagContent(finalText, "choices") ||
            extractTagContent(finalText, "actions");
          msg.choices = parseChoices(branchesContent);
        }
        newHistory[index] = msg;
        setTimeout(() => syncWorldState(newHistory), 0);
      }
      return newHistory;
    });
  }, [syncWorldState]);

  const handleEntityClick = useCallback(
    (id: string) => {
      const entity = activeWorld?.entities.find((e) => e.id === id);
      if (entity) setSelectedEntity(entity);
    },
    [activeWorld?.entities],
  );

  // Handle messages from HTML widget iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // In a real app we'd want to check event.origin, but here widgets are dynamically generated
      const data = event.data;
      if (data && typeof data === "object") {
        const type = data.type;
        const text = data.text;

        switch (type) {
          case "sendReply":
          case "send_input":
          case "sendInput":
            if (text && typeof text === "string" && !isLoading) {
              handleSend(text, false); // false = not an implicit action usually
            }
            break;
          case "edit_last_message":
          case "editLastMessage":
            if (text && typeof text === "string" && history.length > 0) {
              const lastUserMsgIndex = [...history]
                .reverse()
                .findIndex((m) => m.role === "user");
              if (lastUserMsgIndex !== -1) {
                const realIndex = history.length - 1 - lastUserMsgIndex;
                handleMessageUpdate(realIndex, text);
              }
            }
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, history]);

  const handleSwipe = (msgIndex: number, direction: "prev" | "next") => {
    const msg = history[msgIndex];
    if (!msg.swipes || msg.swipes.length === 0) return;

    const currentIndex = msg.swipeIndex || 0;
    let newIndex = currentIndex;

    if (direction === "prev") {
      if (currentIndex > 0) newIndex--;
    } else {
      if (currentIndex < msg.swipes.length - 1) {
        newIndex++;
      } else {
        // Trigger Regenerate if at the end
        handleRegenerate(msgIndex);
        return;
      }
    }

    const newText = msg.swipes[newIndex];

    // Task: Parse LSR Data for immediate sync during swipe
    const tableStored = extractTagContent(newText, "table_stored");
    let nextLsrData = lsrRuntimeDataRef.current;
    if (tableStored) {
      // console.log("GameplayScreen (handleSwipe): Detected <table_stored>. Parsing...");
      const parsedData = LsrParser.parseLsrString(tableStored);
      if (Object.keys(parsedData).length > 0) {
        nextLsrData = parsedData;
        setLsrRuntimeData(nextLsrData);
      }
    } else {
      const tableEdit = extractTagContent(newText, "tableEdit");
      if (tableEdit) {
        // console.log("GameplayScreen (handleSwipe): Detected <tableEdit>. Merging edits...");
        const parsedEdits = LsrParser.parseLsrString(tableEdit);
        if (Object.keys(parsedEdits).length > 0) {
          nextLsrData = LsrParser.mergeLsrData(
            lsrRuntimeDataRef.current,
            parsedEdits,
          );
          setLsrRuntimeData(nextLsrData);
        }
      }
    }

    // Extract incrementalSummary
    const incrementalSummary = extractTagContent(newText, "incrementalSummary");

    setHistory((prev) => {
      const updated = [...prev];
      const updatedMsg = { ...updated[msgIndex] };

      updatedMsg.swipeIndex = newIndex;
      updatedMsg.text = newText;

      // Re-parse choices for this specific swipe version
      const branchesContent =
        extractTagContent(newText, "branches") ||
        extractTagContent(newText, "choices") ||
        extractTagContent(newText, "actions");
      updatedMsg.choices = parseChoices(branchesContent);
      updatedMsg.incrementalSummary = incrementalSummary;

      updated[msgIndex] = updatedMsg;

      // Sync state back to parent
      syncWorldState(
        updated,
        turnCount,
        gameTime,
        nextLsrData,
        incrementalSummary,
      );

      return updated;
    });
  };

  const handleExit = () => {
    onNavigate(GameState.MENU);
  };

  const scrollToTurn = (turnNumber: number) => {
    // Tìm index của tin nhắn đầu tiên thuộc lượt này
    const msgIndex = history.findIndex((m) => m.turnNumber === turnNumber);
    if (msgIndex === -1) return;

    // Tính toán trang chứa tin nhắn này
    const targetPage =
      msgIndex < 11 ? 1 : 1 + Math.ceil((msgIndex - 11) / MESSAGES_PER_PAGE);

    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
      pendingScrollTurnRef.current = turnNumber;
    } else {
      const element = document.getElementById(`turn-${turnNumber}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
    setLastNavigatedTurn(turnNumber);
    shouldAutoScrollRef.current = false;
  };

  const findCurrentTurnInView = () => {
    if (!scrollViewportRef.current) return null;
    const viewport = scrollViewportRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    const midPoint = viewportRect.top + viewportRect.height / 3; // Check top third

    // Find all turn elements in the current viewport
    const turnElements = Array.from(viewport.querySelectorAll('[id^="turn-"]'));
    let closestTurn = null;
    let minDistance = Infinity;

    for (const el of turnElements) {
      const rect = el.getBoundingClientRect();
      // If the element is visible in the viewport
      if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
        const distance = Math.abs(rect.top - midPoint);
        if (distance < minDistance) {
          minDistance = distance;
          const turnId = el.id.replace("turn-", "");
          closestTurn = parseInt(turnId, 10);
        }
      }
    }
    return closestTurn;
  };

  const scrollToTop = () => {
    // Lấy danh sách tất cả các số lượt hiện có, sắp xếp tăng dần
    const allTurns = Array.from(
      new Set(
        history
          .filter((m) => m.turnNumber !== undefined)
          .map((m) => m.turnNumber as number),
      ),
    ).sort((a, b) => a - b);

    if (allTurns.length === 0) {
      if (scrollViewportRef.current) {
        scrollViewportRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    // Ưu tiên sử dụng lượt đang hiển thị nếu có
    const currentTurn = findCurrentTurnInView() ?? lastNavigatedTurn;

    let targetTurn: number;
    if (currentTurn === null) {
      // Nếu không xác định được, nhảy đến lượt cuối cùng
      targetTurn = allTurns[allTurns.length - 1];
    } else {
      const currentIndex = allTurns.indexOf(currentTurn);
      if (currentIndex > 0) {
        targetTurn = allTurns[currentIndex - 1];
      } else {
        // Nếu đã ở lượt đầu, quay lại lượt cuối
        targetTurn = allTurns[allTurns.length - 1];
      }
    }

    scrollToTurn(targetTurn);
  };

  const scrollToBottom = () => {
    // Lấy danh sách tất cả các số lượt hiện có, sắp xếp tăng dần
    const allTurns = Array.from(
      new Set(
        history
          .filter((m) => m.turnNumber !== undefined)
          .map((m) => m.turnNumber as number),
      ),
    ).sort((a, b) => a - b);

    if (allTurns.length === 0) {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }

    // Ưu tiên sử dụng lượt đang hiển thị nếu có
    const currentTurn = findCurrentTurnInView() ?? lastNavigatedTurn;

    let targetTurn: number;
    if (currentTurn === null) {
      // Nếu không xác định được, nhảy đến lượt đầu tiên
      targetTurn = allTurns[0];
    } else {
      const currentIndex = allTurns.indexOf(currentTurn);
      if (currentIndex !== -1 && currentIndex < allTurns.length - 1) {
        targetTurn = allTurns[currentIndex + 1];
      } else {
        // Nếu đã ở lượt cuối, cuộn xuống cuối hẳn
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
        setLastNavigatedTurn(null);
        shouldAutoScrollRef.current = true;
        return;
      }
    }

    scrollToTurn(targetTurn);
  };

  const handleManualSave = async () => {
    if (!activeWorld) return;
    setIsSaving(true);

    const worldName = activeWorld?.world?.worldName || "Unknown_World";
    const playerName = activeWorld?.player?.name || "Unknown_Hero";
    const turnCountValue = history.filter((m) => m.role === "user").length;

    // 1. Prepare Save Data
    const saveData: WorldData = {
      ...activeWorld,
      lsrData: lsrRuntimeData, // CRITICAL: Include latest LSR data
      savedState: {
        history: history,
        turnCount: turnCountValue,
        gameTime: gameTime,
        aiMonitor: {
          tokenHistory: tokenHistoryRef.current,
          totalTokens: totalTokensRef.current,
          lastTurnTotalTime: lastTurnTotalTimeRef.current,
        },
      },
      config: {
        ...(activeWorld.config || { rules: [], regex_scripts: [] }),
        rules: dynamicRules,
        tawaPreset: tawaPresetConfig,
        regexScripts: combinedRegexScripts,
      },
    };

    // 2. Save to Database (Internal)
    // Use deterministic ID for manual save: manual-[worldName]-[turnCount]
    const saveId = `manual-${worldName.replace(/\s+/g, "_")}-${turnCount}`;
    const saveFile: SaveFile = {
      id: saveId,
      name: `${worldName} - Turn ${turnCount} (Manual)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: saveData,
    };

    try {
      await dbService.saveGameState(saveFile);

      // 3. Download to Computer
      // Format: ARK_save_[world_name]_[player_name]_[turn_number].json
      const fileName = `ARK_save_${worldName.replace(/\s+/g, "_")}_${playerName.replace(/\s+/g, "_")}_${turnCountValue}.json`;

      const blob = new Blob([JSON.stringify(saveData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to save game:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStreamResponse = async () => {
    if (!settings) return;
    const newSetting = !settings.streamResponse;
    setSettings({ ...settings, streamResponse: newSetting });
    await dbService.saveSettings({ ...settings, streamResponse: newSetting });
  };

  const handleGoToSettings = () => {
    syncWorldState();
    onNavigate(GameState.SETTINGS);
  };

  const handleUpdateContextConfig = (newConfig: ContextWindowConfig) => {
    if (onUpdateWorld && activeWorld) {
      onUpdateWorld({
        config: {
          ...(activeWorld.config || { rules: [], regex_scripts: [] }),
          contextConfig: newConfig,
        },
      });
    }
  };

  return {
    // Engine & State
    isLoading,
    setIsLoading,
    isDead,
    setIsDead,
    history,
    setHistory,
    lastAction,
    setLastAction,
    turnCount,
    setTurnCount,
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

    // Modal States
    showCharModal,
    setShowCharModal,
    showGlobalModal,
    setShowGlobalModal,
    showHistoryModal,
    setShowHistoryModal,
    showContextModal,
    setShowContextModal,
    showImageLibrary,
    setShowImageLibrary,
    showLogConsole,
    setShowLogConsole,
    showRegexModal,
    setShowRegexModal,
    showMobileSidebar,
    setShowMobileSidebar,
    selectingAvatarFor,
    setSelectingAvatarFor,

    // UI States
    showTokenDetails,
    setShowTokenDetails,
    showStatsDetails,
    setShowStatsDetails,
    isInputCollapsed,
    setIsInputCollapsed,
    activeContextTab,
    setActiveContextTab,
    selectedEntity,
    setSelectedEntity,
    currentPage,
    setCurrentPage,

    // Save System
    autosaveList,
    manualSaveList,
    initialSaveList,
    activeSaveTab,
    setActiveSaveTab,
    isSaving,
    setIsSaving,
    loadSaveLists,
    handleDeleteSave,

    // AI Monitor
    tokenHistory,
    totalTokens,
    lastTurnTotalTime,
    currentProcessingTime,

    // Core Refs & Scroll
    scrollViewportRef,
    chatEndRef,
    handleScroll,
    scrollToTop,
    scrollToBottom,

    // Derived UI
    totalPages,
    displayedMessages,
    startIndex,

    // Functions
    handleSend,
    handleRegenerate,
    processAIResponse,
    handleSwipe,
    handleMessageUpdate,
    handleToggleHideMessage,
    handleEntityClick,
    handleAvatarSelect,
    handleManualSave,
    handleLoadSave,
    handleGoToSettings,
    handleExit,
    toggleStreamResponse,
    handleUpdateContextConfig,
    handleTawaConfigChange,

    // Extra
    isMobile,
    AIMonitor,
    lsrTables,
    lsrRuntimeData,
    activeLsrTableId,
    setActiveLsrTableId,
    lsrViewMode,
    setLsrViewMode,
    tavoSelectState,
    setTavoSelectState,
    gameInputRef,
  };
};

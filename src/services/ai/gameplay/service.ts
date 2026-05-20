import {
  AppSettings,
  ChatMessage,
  WorldData,
  TawaPresetConfig,
  GameTime,
} from "../../../types";
import {
  buildGameplaySystemPrompt,
  getReinforcementInstruction,
} from "./prompts";
// Removed DEFAULT_PRESET_CONFIG import
import { getAiClient } from "../client";
import { GenerateContentResponse } from "@google/genai";
import { vectorService } from "../vectorService";
import { storyBibleService } from "../storyBibleService";
import { GraphRAGService } from "../graph/GraphRAGService";
import { LsrParser } from "../../lsr/LsrParser";
import { ContextCompressor } from "../../../utils/compression";
import { getRegexedString } from "../../../utils/regex";
import { DynamicMemoryService } from "../memory/DynamicMemoryService";

// Task 3.3 Step 2: History Slicing Constant
// Default to 100 as requested by user
const MAX_HISTORY_CONTEXT = 100;
const EMBEDDING_SCHEDULE_INTERVAL = 50;

export const gameplayAiService = {
  // --- GAMEPLAY STORY GENERATION (With Tawa Protocol) ---

  async generateStoryTurn(
    input: string,
    history: ChatMessage[],
    worldData: WorldData,
    settings: AppSettings,
    presetConfig?: TawaPresetConfig,
    gameTime?: GameTime,
  ): Promise<{ text: string; usage?: Record<string, unknown> }> {
    try {
      const currentTurn = Math.floor(history.length / 2);

      const combinedRegexScripts = [
        ...(settings.regex_scripts || []),
        ...(worldData.extensions?.regex_scripts || []),
        ...(worldData.config?.regexScripts || []),
      ];

      const applyRegex = (text: string, placement: number, depth: number) => {
        return getRegexedString(text, placement, combinedRegexScripts, {
          userName: worldData.player?.name || "User",
          charName: worldData.entities?.[0]?.name || "Character",
          isPrompt: true,
          depth,
          isDebug: false,
        });
      };

      // --- COMPRESSION: Clean user input, then apply regex ---
      let cleanedInput = ContextCompressor.cleanText(input);
      cleanedInput = applyRegex(cleanedInput, 1, 0);

      // Campaign ID for StoryBible
      const campaignId =
        worldData.id ||
        `campaign-${worldData.world?.worldName?.replace(/\s+/g, "")}-${worldData.player?.name?.replace(/\s+/g, "")}`;

      // Task 3.3 Step 1: Vector Search (RAG)
      // Find relevant memories from the distant past - ONLY EVERY X TURNS to save API quota
      // OPTIMIZATION: Only search if history is longer than context window, otherwise it's redundant
      const shouldCallEmbedding =
        settings.enableVectorMemory &&
        currentTurn > 0 &&
        currentTurn % EMBEDDING_SCHEDULE_INTERVAL === 0;
      const shouldSearchEmbedding =
        shouldCallEmbedding && history.length >= MAX_HISTORY_CONTEXT;

      // Dynamic StoryBible Facts Retrieval
      const shouldQueryStoryBible =
        settings.enableVectorMemory &&
        worldData.config.contextConfig?.items?.storyBible !== false;

      // Prepare parallel tasks for optimal latency
      const similarVectorsPromise = shouldSearchEmbedding
        ? vectorService.searchSimilarVectors(cleanedInput, settings, 5).catch(err => {
            console.warn("Vector RAG failed:", err);
            return [];
          })
        : Promise.resolve([]);

      const sbVectorsPromise = shouldQueryStoryBible
        ? storyBibleService.queryContext(
            cleanedInput,
            history,
            campaignId,
            settings,
          ).catch(err => {
            console.warn("StoryBible context failed:", err);
            return [];
          })
        : Promise.resolve([]);

      const graphRAGPromise = settings.enableVectorMemory
        ? GraphRAGService.retrieveContext(
            cleanedInput,
            history,
            campaignId,
            settings,
          ).catch(err => {
            console.warn("GraphRAG context failed:", err);
            return "";
          })
        : Promise.resolve("");

      let backgroundInsightsPromise = Promise.resolve<string | undefined>(undefined);
      if (settings.aiMode === "hybrid" && settings.backgroundAiModel) {
        const recentHist = history.slice(-5).map(m => `${m.role === 'user' ? 'Góc nhìn người chơi' : 'Góc nhìn hệ thống/NPC'}: ${m.text}`).join('\n');
        const prompt = `Bạn là Background Agent phân tích bối cảnh cốt truyện tương tác.\nNgười dùng vừa nhập: "${cleanedInput}"\n\nDựa vào lịch sử gần nhất:\n${recentHist}\n\nHãy phân tích nhanh ý định của người dùng và các tình tiết quan trọng cần chú ý cho Primary Agent trong lượt tới. Trình bày dạng gạch đầu dòng ngắn gọn (dưới 150 chữ).`;
        
        let activeProxy = settings.proxies?.find((p) => p.id === settings.activeProxyId);
        if (!activeProxy && (settings.proxyEnabled || settings.proxyUrl)) {
          activeProxy = {
            id: "legacy",
            name: settings.proxyName || "Legacy Proxy",
            url: settings.proxyUrl || "",
            key: settings.proxyKey || "",
            model: settings.proxyModel || "",
            models: settings.proxyModels || [],
            isActive: true,
            type: (settings.proxyUrl?.includes('moonshot') || settings.proxyUrl?.includes('kimi')) ? 'openai' : (settings.proxyEnabled ? 'openai' : 'google')
          };
        }

        backgroundInsightsPromise = aiClient.models.generateContent({
          model: settings.backgroundAiModel,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature: 0.2,
            maxOutputTokens: 300,
          }
        }, settings, activeProxy).then(res => res.text).catch(err => {
          console.warn("Background Agent failed:", err);
          return undefined;
        });
      }

      // Execute RAG and Hybrid Pre-analysis concurrently
      const [similarVectors, sbVectors, backgroundInsights, graphRAGContext] = await Promise.all([
        similarVectorsPromise,
        sbVectorsPromise,
        backgroundInsightsPromise,
        graphRAGPromise
      ]);

      const relevantMemories = similarVectors
        .map(
          (v) =>
            `[${new Date(v.timestamp).toLocaleString()}] ${v.role === "user" ? "User" : "AI"}: ${v.text}`,
        )
        .join("\n\n");

      // Rough token estimation function (approx 3.5 chars per token for Latin/Vietnamese)
      const estimateTokens = (text: string) => Math.ceil((text || '').length / 3.5);

      // Task 3.3 Step 2: History Slicing & Context Builder (Tầng 3)
      // ST Context Builder: calculate budget and subtract system tokens to find how many history turns can fit
      const contextBudgetTokens = worldData.config.contextConfig?.maxContextTokens || 60000;
      
      // Calculate tokens used by current components (rough estimation before assembly)
      const inputTokens = estimateTokens(cleanedInput);
      const ragTokens = estimateTokens(relevantMemories) + estimateTokens(graphRAGContext);
      const lsrTokens = estimateTokens(worldData.lsrData ? JSON.stringify(worldData.lsrData) : ""); 
      const presetTokens = estimateTokens(JSON.stringify(presetConfig?.modules || {}));
      
      const reservedTokens = inputTokens + ragTokens + lsrTokens + presetTokens + 5000; // 5000 buffer for fixed system tags and entities calculation
      
      const availableTokensForHistory = Math.max(1000, contextBudgetTokens - reservedTokens);
      
      let finalHistoryStartIndex = history.length;
      let currentHistoryTokens = 0;

      // Scan backwards from most recent, adding tokens until budget is met
      for (let i = history.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(history[i].text);
        if (currentHistoryTokens + msgTokens > availableTokensForHistory) {
           break;
        }
        currentHistoryTokens += msgTokens;
        finalHistoryStartIndex = i;
      }
      
      // Still respect the max history count limit mostly
      const maxHistoryCount = worldData.config.contextConfig?.recentHistoryCount || MAX_HISTORY_CONTEXT;
      finalHistoryStartIndex = Math.max(finalHistoryStartIndex, history.length - maxHistoryCount);

      const slicedHistory = history.slice(finalHistoryStartIndex);

      // --- DYNAMIC AI COMPRESSION ---
      let contextualSummary = undefined;
      if (finalHistoryStartIndex > 0) {
        for (let i = finalHistoryStartIndex - 1; i >= 0; i--) {
          if (history[i].incrementalSummary) {
            contextualSummary = history[i].incrementalSummary;
            break;
          }
        }
      }
      if (!contextualSummary) contextualSummary = worldData.summary;

      // --- COMPRESSION: Clean History (Safe compression only) ---
      const compressedHistory = slicedHistory.map((msg, index) => {
        const depth = slicedHistory.length - index; // depth relative to current message
        const placementVal =
          msg.role === "model" || msg.role === "system" ? 2 : 1;
        let processedText = ContextCompressor.cleanText(msg.text);
        processedText = applyRegex(processedText, placementVal, depth);

        return {
          ...msg,
          text: processedText,
        };
      });

      // Task: Relevance-based Entity Sorting (Prioritizing Female NPCs)
      const maxEntities = worldData.config.contextConfig?.maxEntities || 20;

      // Simple relevance scoring: Check if entity name appears in recent history or current input
      const recentText = [...compressedHistory.map((m) => m.text), cleanedInput]
        .join(" ")
        .toLowerCase();

      const sortedEntities = [...worldData.entities].sort((a, b) => {
        // Calculate mention frequency in recent text
        const countA = (recentText.match(new RegExp(a.name.toLowerCase(), "g")) || []).length;
        const countB = (recentText.match(new RegExp(b.name.toLowerCase(), "g")) || []).length;

        // Priority 1: Mention count in recent context
        if (countA !== countB) return countB - countA;

        // Priority 2: NPCs over Items/Locations if mention count is equal
        if (a.type !== b.type) {
          if (a.type === "NPC") return -1;
          if (b.type === "NPC") return 1;
        }

        // Priority 3: Tie breaker using description length (more detailed entities get priority)
        const aDescLength = a.description?.length || 0;
        const bDescLength = b.description?.length || 0;
        
        return bDescLength - aDescLength;
      });

      const limitedEntities = sortedEntities.slice(0, maxEntities);

      const processedEntities = limitedEntities.map((e) => {
        if (!e.description) return e;
        return {
          ...e,
          description: applyRegex(e.description, 4, 0),
        };
      });

      // Task: Stringify LSR Data for AI
      const lsrTables = LsrParser.parseDefinitions();
      let tableDataString = worldData.lsrData
        ? LsrParser.stringifyLsrData(worldData.lsrData, lsrTables)
        : "";

      // --- COMPRESSION: Minify LSR Data ---
      tableDataString = ContextCompressor.minifyLsr(tableDataString);
      tableDataString = applyRegex(tableDataString, 4, 0);

      // Use provided config or fallback to default
      const _config = presetConfig || { modules: [] };
      const activeConfig = {
        ..._config,
        aiConfigOverrides: {
          ..._config.aiConfigOverrides,
          temperature: _config.temperature ?? _config.aiConfigOverrides?.temperature,
          topK: _config.top_k ?? _config.aiConfigOverrides?.topK,
          topP: _config.top_p ?? _config.aiConfigOverrides?.topP,
          frequencyPenalty: _config.frequency_penalty ?? _config.aiConfigOverrides?.frequencyPenalty,
          presencePenalty: _config.presence_penalty ?? _config.aiConfigOverrides?.presencePenalty,
          repetitionPenalty: _config.repetition_penalty ?? _config.aiConfigOverrides?.repetitionPenalty,
          minP: _config.min_p ?? _config.aiConfigOverrides?.minP,
          topA: _config.top_a ?? _config.aiConfigOverrides?.topA,
          maxOutputTokens: _config.openai_max_tokens ?? _config.aiConfigOverrides?.maxOutputTokens ?? 65000,
        }
      };

      let processedLorebook = undefined;
      if (worldData.lorebook) {
        processedLorebook = {
          ...worldData.lorebook,
          entries: { ...worldData.lorebook.entries },
        };
        // Apply placement 5 (World Book) to custom lorebook
        Object.keys(processedLorebook.entries).forEach((key) => {
          processedLorebook.entries[key] = {
            ...processedLorebook.entries[key],
            content: applyRegex(processedLorebook.entries[key].content, 4, 0),
          };
        });
      }

      const { systemPrompt, postHistoryUser, prefillAssistant, fewShotBlock } =
        buildGameplaySystemPrompt(
          worldData.world,
          worldData.player,
          processedEntities, // Detailed list (limited & regex processed)
          worldData.entities, // Full list (minimalist)
          relevantMemories + (graphRAGContext ? `\n\n${graphRAGContext}` : ""), // Task 3.3 Step 3: Inject Memories + GraphRAG
          currentTurn,
          activeConfig,
          worldData.config,
          settings, // NEW: Pass settings
          gameTime,
          cleanedInput,
          contextualSummary
            ? applyRegex(ContextCompressor.cleanText(contextualSummary), 4, 0)
            : undefined, // Apply placement 5 to summary
          tableDataString, // NEW: Pass LSR data
          processedLorebook, // Pass Regexed Lorebook
          history, // NEW: Pass Recent Chat History
          worldData.tavoVars || {}, // Tavo Vars
          sbVectors, // NEW: StoryBible facts
        );

      // 2. Prepare Config
      // Determine effective proxy and model
      let activeProxy = settings.proxies?.find(
        (p) => p.id === settings.activeProxyId,
      );
      if (!activeProxy && (settings.proxyEnabled || settings.proxyUrl)) {
        activeProxy = {
          id: "legacy",
          name: settings.proxyName || "Legacy Proxy",
          url: settings.proxyUrl || "",
          key: settings.proxyKey || "",
          model: settings.proxyModel || "",
          models: settings.proxyModels || [],
          isActive: true,
          type:
            settings.proxyUrl?.includes("moonshot") ||
            settings.proxyUrl?.includes("kimi")
              ? "openai"
              : settings.proxyEnabled
                ? "openai"
                : "google",
        };
      }

      const modelToUse =
        activeProxy && activeProxy.model ? activeProxy.model : settings.aiModel;

      const generationConfig: Record<string, unknown> = {};
      if (activeConfig.aiConfigOverrides?.temperature !== undefined)
        generationConfig.temperature =
          activeConfig.aiConfigOverrides.temperature;
      if (activeConfig.aiConfigOverrides?.topK !== undefined)
        generationConfig.topK = activeConfig.aiConfigOverrides.topK;
      if (activeConfig.aiConfigOverrides?.topP !== undefined)
        generationConfig.topP = activeConfig.aiConfigOverrides.topP;
      if (activeConfig.aiConfigOverrides?.frequencyPenalty !== undefined)
        generationConfig.frequencyPenalty =
          activeConfig.aiConfigOverrides.frequencyPenalty;
      if (activeConfig.aiConfigOverrides?.presencePenalty !== undefined)
        generationConfig.presencePenalty =
          activeConfig.aiConfigOverrides.presencePenalty;
      generationConfig.maxOutputTokens =
        activeConfig.aiConfigOverrides?.maxOutputTokens ?? 65000;

      // Pass OpenAI-specific params using non-enumerable properties so native Google GenAI SDK ignores them during JSON serialization
      Object.defineProperty(generationConfig, "repetitionPenalty", {
        value: activeConfig.aiConfigOverrides?.repetitionPenalty,
        enumerable: false,
      });
      Object.defineProperty(generationConfig, "minP", {
        value: activeConfig.aiConfigOverrides?.minP,
        enumerable: false,
      });
      Object.defineProperty(generationConfig, "topA", {
        value: activeConfig.aiConfigOverrides?.topA,
        enumerable: false,
      });

      // Apply Thinking Config from Preset
      const thinkingBudget =
        activeConfig.aiConfigOverrides?.thinkingBudget ?? 0;
      const lowerModel = modelToUse.toLowerCase();

      const isGeminiThinkingModel = lowerModel.includes("thinking") || lowerModel.includes("gemini-2.0-pro") || lowerModel.includes("gemini-3.1-pro");
      const isOtherThinkingModel =
        lowerModel.includes("kimi") ||
        lowerModel.includes("moonshot") ||
        lowerModel.includes("o1") ||
        lowerModel.includes("o3");

      // IMPORTANT: Gemini Thinking models STRICTLY forbid temperature, topP, topK, etc.
      if (isGeminiThinkingModel) {
        delete generationConfig.temperature;
        delete generationConfig.topP;
        delete generationConfig.topK;
        delete generationConfig.frequencyPenalty;
        delete generationConfig.presencePenalty;
      }

      if (thinkingBudget >= 1024 && isGeminiThinkingModel) {
        generationConfig.thinkingConfig = {
          thinkingBudgetTokens: thinkingBudget,
        };
      } else if (thinkingBudget > 0 && isOtherThinkingModel) {
        Object.defineProperty(generationConfig, "thinkingConfig", {
          value: { thinkingBudgetTokens: thinkingBudget },
          enumerable: false,
        });
      }

      // 3. Prepare Contents (Using compressed history)
      const contents: any[] = [];
      if (fewShotBlock) {
        contents.push({ role: "user", parts: [{ text: "[MẪU HỘI THOẠI]\n" + fewShotBlock }] });
        contents.push({ role: "model", parts: [{ text: "Đã ghi nhận." }] });
      }
      
      const mappedHistory = compressedHistory
        .filter((msg) => !msg.isHidden)
        .map((msg) => {
        let text = msg.text;
        if (msg.role === "user" && !text.includes("<user_input>")) {
          text = `<user_input>${text}</user_input>`;
        }
        return {
          role: msg.role,
          parts: [{ text: text }],
        };
      });
      contents.push(...mappedHistory);

      // INJECT REINFORCEMENT INSTRUCTION HERE (CONTEXT DRIFT FIX)
      const reinforcement = getReinforcementInstruction(currentTurn);
      let fullInput = `<user_input>${cleanedInput}</user_input>${reinforcement}`;

      // Append postHistoryUser injects correctly
      if (postHistoryUser && postHistoryUser.length > 0) {
        fullInput += `\n\n${postHistoryUser}`;
      }

      contents.push({
        role: "user",
        parts: [{ text: fullInput }],
      });

      // 4. Assistant Prefill Logic
      let prefillContent = prefillAssistant || "";

      // Backwards compatibility with sys_prefill_trigger if it exists but wasn't assigned properly
      const legacyPrefillModule = activeConfig.modules.find(
        (m) => m.identifier === "sys_prefill_trigger",
      );
      if (
        legacyPrefillModule &&
        legacyPrefillModule.enabled &&
        !prefillAssistant.includes(legacyPrefillModule.content)
      ) {
        prefillContent +=
          (prefillContent ? "\n\n" : "") + legacyPrefillModule.content;
      }

      if (prefillContent) {
        contents.push({
          role: "model",
          parts: [{ text: prefillContent }],
        });
      }

      // 5. Call AI
      const aiClient = getAiClient(settings);

      const response = await aiClient.models.generateContent({
        model: modelToUse,
        contents: contents,
        config: {
          ...generationConfig,
          systemInstruction: systemPrompt,
        },
      });

      let fullResponse = (prefillContent ? prefillContent : "");
      let hasNativeThought = false;
      let nativeThought = "";
      let nativeText = "";
      
      if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
             if ((part as any).thought) { 
                 hasNativeThought = true; 
                 nativeThought += (part as any).thought; 
             }
             else if (part.text) { 
                 nativeText += part.text; 
             }
          }
      }
      
      if (hasNativeThought) {
          fullResponse += "<thinking>\n" + nativeThought + "\n</thinking>\n\n" + nativeText;
      } else {
          fullResponse += (response.text || "");
      }

      // --- FILTERING LOGIC: Remove system artifacts and leaked thinking blocks ---
      const orchestrationPatterns = [
        /Core Activation: <COGNITIVE_ORCHESTRATION_SEQUENCE[\s\S]*?Plan for Stage 1:.*?\n/gi,
        /<COGNITIVE_ORCHESTRATION_SEQUENCE[\s\S]*?<\/COGNITIVE_ORCHESTRATION_SEQUENCE>/gi,
        /\[DATA SYNC\][\s\S]*?\[SYNCHRONIZATION\]/gi,
        /\[Loading Constitution\][\s\S]*?\[Checked\]/gi,
        /\[Loading Variables\][\s\S]*?\[Done\]/gi,
        /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi,
      ];

      orchestrationPatterns.forEach((pattern) => {
        fullResponse = fullResponse.replace(pattern, "");
      });

      fullResponse = fullResponse.trim();

      // LAST RESORT: Nếu phản hồi trống sau khi lọc, nhưng AI thực sự có trả về gì đó
      if (!fullResponse && response.text && response.text.trim().length > 0) {
        // Thử lấy lại văn bản gốc nhưng bỏ qua các thẻ kỹ thuật rõ ràng nhất
        fullResponse = response.text
          .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
          .trim();
      }

      if (prefillContent && !fullResponse.startsWith(prefillContent)) {
        fullResponse = prefillContent + fullResponse;
      }

      // Task 3.3 Step 4: Save Vectors Async (Fire and forget)
      if (shouldCallEmbedding || settings.enableVectorMemory) {
        (async () => {
          if (shouldCallEmbedding) {
            const userMsgId = `msg-${Date.now()}-user`;
            const aiMsgId = `msg-${Date.now() + 1}-model`;
            await vectorService.saveVector(
              userMsgId,
              cleanedInput,
              "user",
              settings,
            );
            if (fullResponse) {
              await vectorService.saveVector(
                aiMsgId,
                fullResponse,
                "model",
                settings,
              );
            }
          }

          // Process StoryBible Turn (Extract + Consolidate)
          if (settings.enableVectorMemory) {
            // Get recent history including the current input and AI response
            const recentForBible = [
              ...slicedHistory.slice(-4),
              {
                role: "user" as const,
                text: cleanedInput,
                timestamp: Date.now(),
              },
              {
                role: "model" as const,
                text: fullResponse,
                timestamp: Date.now() + 1,
              },
            ];
            await storyBibleService.processTurn(
              recentForBible,
              campaignId,
              settings,
              currentTurn,
            );

            if (currentTurn > 0 && currentTurn % 3 === 0) {
               await GraphRAGService.extractAndIntegrate(
                 recentForBible,
                 campaignId,
                 settings
               );
            }

            // DYNAMIC MEMORY SUMMARIZATION (EVERY 15 TURNS)
            if (currentTurn > 0 && currentTurn % 15 === 0) {
               // Summarize the last 30 messages (approx 15 turns)
               const sliceLength = Math.min(slicedHistory.length, 30);
               const historyToSummarize = slicedHistory.slice(-sliceLength);
               const newSummary = await DynamicMemoryService.processCoreMemories(
                 historyToSummarize,
                 worldData,
                 settings,
                 campaignId
               );
               if (newSummary && typeof window !== 'undefined') {
                 window.dispatchEvent(new CustomEvent('tavo_summary_update', { detail: newSummary }));
               }
            }

            // PERSONA DRIFT CHECK (EVERY 5 TURNS)
            if (currentTurn > 0 && currentTurn % 5 === 0) {
               const sliceLength = Math.min(slicedHistory.length, 10);
               const historyToCheck = slicedHistory.slice(-sliceLength);
               const driftResult = await DynamicMemoryService.checkPersonaDrift(
                 historyToCheck,
                 worldData,
                 settings,
                 campaignId
               );
               if (driftResult?.hasDrift && typeof window !== 'undefined') {
                 window.dispatchEvent(new CustomEvent('tavo_persona_drift', { detail: driftResult }));
               }
            }
          }
        })();
      }

      return {
        text: fullResponse || "Hệ thống không phản hồi. Vui lòng thử lại.",
        usage: response.usageMetadata,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      let userFriendlyMessage = `[LỖI HỆ THỐNG: Không thể nhận phản hồi từ AI. Chi tiết: ${errorMessage}]`;

      if (
        errorMessage.toLowerCase().includes("safety") ||
        errorMessage.toLowerCase().includes("blocked")
      ) {
        userFriendlyMessage = `[CẢNH BÁO AN TOÀN: Phản hồi của AI đã bị chặn bởi bộ lọc nội dung của Google. Điều này thường xảy ra khi nội dung truyện quá nhạy cảm hoặc vi phạm chính sách. Bạn có thể thử 'Regenerate' với hành động khác hoặc điều chỉnh 'Safety Settings' trong phần Cài đặt.]`;
      } else if (
        errorMessage.includes("PAYMENT_REQUIRED") ||
        errorMessage.includes("402")
      ) {
        userFriendlyMessage = `[LỖI THANH TOÁN (402): Model này yêu cầu API Key có trả phí (Paid Tier) hoặc đã hết hạn mức miễn phí. Vui lòng vào Cài đặt > API & Proxy để chọn API Key mới bằng nút 'Chọn API Key (Paid)'.]`;
      } else if (
        errorMessage.toLowerCase().includes("quota") ||
        errorMessage.toLowerCase().includes("rate limit")
      ) {
        userFriendlyMessage = `[GIỚI HẠN LƯU LƯỢNG: Bạn đã đạt giới hạn yêu cầu của AI. Vui lòng đợi một lát rồi thử lại.]`;
      } else if (
        errorMessage.includes("404") ||
        errorMessage.toLowerCase().includes("not found")
      ) {
        userFriendlyMessage = `[LỖI MODEL (404): Không tìm thấy Model AI yêu cầu. Vui lòng kiểm tra lại tên Model trong phần Cài đặt AI & Proxy. Nếu dùng Proxy, hãy thử 'Tải danh sách Model' lại.]`;
      }

      return {
        text: `<span style="color: #ef4444; font-style: italic; font-size: 0.875rem;">${userFriendlyMessage}</span>`,
        usage: null,
      };
    }
  },

  // --- STREAMING STORY GENERATION ---
  async *generateStoryTurnStream(
    input: string,
    history: ChatMessage[],
    worldData: WorldData,
    settings: AppSettings,
    presetConfig?: TawaPresetConfig,
    gameTime?: GameTime,
  ): AsyncGenerator<GenerateContentResponse | string, void, unknown> {
    try {
      const currentTurn = Math.floor(history.length / 2);
      const _config = presetConfig || { modules: [] };
      const activeConfig = {
        ..._config,
        aiConfigOverrides: {
          ..._config.aiConfigOverrides,
          temperature: _config.temperature ?? _config.aiConfigOverrides?.temperature,
          topK: _config.top_k ?? _config.aiConfigOverrides?.topK,
          topP: _config.top_p ?? _config.aiConfigOverrides?.topP,
          frequencyPenalty: _config.frequency_penalty ?? _config.aiConfigOverrides?.frequencyPenalty,
          presencePenalty: _config.presence_penalty ?? _config.aiConfigOverrides?.presencePenalty,
          repetitionPenalty: _config.repetition_penalty ?? _config.aiConfigOverrides?.repetitionPenalty,
          minP: _config.min_p ?? _config.aiConfigOverrides?.minP,
          topA: _config.top_a ?? _config.aiConfigOverrides?.topA,
          maxOutputTokens: _config.openai_max_tokens ?? _config.aiConfigOverrides?.maxOutputTokens ?? 65000,
        }
      };

      const combinedRegexScripts = [
        ...(settings.regex_scripts || []),
        ...(worldData.extensions?.regex_scripts || []),
        ...(worldData.config?.regexScripts || []),
      ];

      const applyRegex = (text: string, placement: number, depth: number) => {
        return getRegexedString(text, placement, combinedRegexScripts, {
          userName: worldData.player?.name || "User",
          charName: worldData.entities?.[0]?.name || "Character",
          isPrompt: true,
          depth,
          isDebug: false,
        });
      };

      // --- COMPRESSION: Clean user input ---
      let cleanedInput = ContextCompressor.cleanText(input);
      cleanedInput = applyRegex(cleanedInput, 1, 0);

      // Campaign ID for StoryBible
      const campaignId =
        worldData.id ||
        `campaign-${worldData.world?.worldName?.replace(/\s+/g, "")}-${worldData.player?.name?.replace(/\s+/g, "")}`;

      // Task 3.3 Step 1: Vector Search (RAG) - ONLY EVERY X TURNS
      // OPTIMIZATION: Only search if history is longer than context window, otherwise it's redundant
      const shouldCallEmbeddingStream =
        settings.enableVectorMemory &&
        currentTurn > 0 &&
        currentTurn % EMBEDDING_SCHEDULE_INTERVAL === 0;
      const shouldSearchEmbeddingStream =
        shouldCallEmbeddingStream && history.length >= MAX_HISTORY_CONTEXT;

      const similarVectors = shouldSearchEmbeddingStream
        ? await vectorService.searchSimilarVectors(cleanedInput, settings, 5)
        : [];

      const relevantMemories = similarVectors
        .map(
          (v) =>
            `[${new Date(v.timestamp).toLocaleString()}] ${v.role === "user" ? "User" : "AI"}: ${v.text}`,
        )
        .join("\n\n");

      let graphRAGContext = "";
      if (settings.enableVectorMemory) {
        try {
            graphRAGContext = await GraphRAGService.retrieveContext(
                cleanedInput,
                history,
                campaignId,
                settings
            );
        } catch (e) {
            console.warn("GraphRAG fetch stream failed", e);
        }
      }

      // Dynamic StoryBible Facts Retrieval
      const shouldQueryStoryBibleStream =
        settings.enableVectorMemory &&
        worldData.config.contextConfig?.items?.storyBible !== false;
      const sbVectors = shouldQueryStoryBibleStream
        ? await storyBibleService.queryContext(
            cleanedInput,
            history,
            campaignId,
            settings,
          )
        : [];
      const storyBibleFacts = sbVectors
        .map((v) => `- [${v.title?.toUpperCase()}]: ${v.content}`)
        .join("\n");

      // Rough token estimation function (approx 3.5 chars per token for Latin/Vietnamese)
      const estimateTokens = (text: string) => Math.ceil((text || '').length / 3.5);

      // Task 3.3 Step 2: History Slicing & Context Builder (Tầng 3)
      // ST Context Builder: calculate budget and subtract system tokens to find how many history turns can fit
      const contextBudgetTokens = worldData.config.contextConfig?.maxContextTokens || 60000;
      
      // Calculate tokens used by current components (rough estimation before assembly)
      const inputTokens = estimateTokens(cleanedInput);
      const ragTokens = estimateTokens(relevantMemories) + estimateTokens(storyBibleFacts) + estimateTokens(graphRAGContext);
      const lsrTokens = estimateTokens(worldData.lsrData ? JSON.stringify(worldData.lsrData) : ""); 
      const presetTokens = estimateTokens(JSON.stringify(presetConfig?.modules || {}));
      
      const reservedTokens = inputTokens + ragTokens + lsrTokens + presetTokens + 5000; // 5000 buffer for fixed system tags and entities calculation
      
      const availableTokensForHistory = Math.max(1000, contextBudgetTokens - reservedTokens);
      
      let finalHistoryStartIndex = history.length;
      let currentHistoryTokens = 0;

      // Scan backwards from most recent, adding tokens until budget is met
      for (let i = history.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(history[i].text);
        if (currentHistoryTokens + msgTokens > availableTokensForHistory) {
           break;
        }
        currentHistoryTokens += msgTokens;
        finalHistoryStartIndex = i;
      }
      
      // Still respect the max history count limit mostly
      const maxHistoryCount = worldData.config.contextConfig?.recentHistoryCount || MAX_HISTORY_CONTEXT;
      finalHistoryStartIndex = Math.max(finalHistoryStartIndex, history.length - maxHistoryCount);

      const slicedHistory = history.slice(finalHistoryStartIndex);

      // --- DYNAMIC AI COMPRESSION ---
      let contextualSummaryStream = undefined;
      if (finalHistoryStartIndex > 0) {
        for (let i = finalHistoryStartIndex - 1; i >= 0; i--) {
          if (history[i].incrementalSummary) {
            contextualSummaryStream = history[i].incrementalSummary;
            break;
          }
        }
      }
      if (!contextualSummaryStream) contextualSummaryStream = worldData.summary;

      // --- COMPRESSION: Clean History (Safe compression only) ---
      const compressedHistory = slicedHistory.map((msg, index) => {
        const depth = slicedHistory.length - index; // depth relative to current message
        const placementVal =
          msg.role === "model" || msg.role === "system" ? 2 : 1;
        let processedText = ContextCompressor.cleanText(msg.text);
        processedText = applyRegex(processedText, placementVal, depth);

        return {
          ...msg,
          text: processedText,
        };
      });

      // Task: Relevance-based Entity Sorting (Prioritizing Female NPCs)
      const maxEntities = worldData.config.contextConfig?.maxEntities || 20;

      // Simple relevance scoring: Check if entity name appears in recent history or current input
      const recentText = [...compressedHistory.map((m) => m.text), cleanedInput]
        .join(" ")
        .toLowerCase();

      const sortedEntities = [...worldData.entities].sort((a, b) => {
        // Calculate mention frequency in recent text
        const countA = (recentText.match(new RegExp(a.name.toLowerCase(), "g")) || []).length;
        const countB = (recentText.match(new RegExp(b.name.toLowerCase(), "g")) || []).length;

        // Priority 1: Mention count in recent context
        if (countA !== countB) return countB - countA;

        // Priority 2: NPCs over Items/Locations if mention count is equal
        if (a.type !== b.type) {
          if (a.type === "NPC") return -1;
          if (b.type === "NPC") return 1;
        }

        // Priority 3: Tie breaker using description length (more detailed entities get priority)
        const aDescLength = a.description?.length || 0;
        const bDescLength = b.description?.length || 0;
        
        return bDescLength - aDescLength;
      });

      const limitedEntities = sortedEntities.slice(0, maxEntities);

      // Task: Stringify LSR Data for AI
      const lsrTables = LsrParser.parseDefinitions();
      let tableDataString = worldData.lsrData
        ? LsrParser.stringifyLsrData(worldData.lsrData, lsrTables)
        : "";

      // --- COMPRESSION: Minify LSR Data ---
      tableDataString = ContextCompressor.minifyLsr(tableDataString);

      let processedLorebook = undefined;
      if (worldData.lorebook) {
        processedLorebook = {
          ...worldData.lorebook,
          entries: { ...worldData.lorebook.entries },
        };
        Object.keys(processedLorebook.entries).forEach((key) => {
          processedLorebook.entries[key] = {
            ...processedLorebook.entries[key],
            content: applyRegex(processedLorebook.entries[key].content, 4, 0),
          };
        });
      }

      const { systemPrompt, postHistoryUser, prefillAssistant, fewShotBlock } =
        buildGameplaySystemPrompt(
          worldData.world,
          worldData.player,
          limitedEntities, // Inject Memories
          worldData.entities, // Full list (minimalist)
          relevantMemories + (graphRAGContext ? `\n\n${graphRAGContext}` : ""), // Inject Memories + GraphRAG
          currentTurn,
          activeConfig,
          worldData.config,
          settings, // NEW: Pass settings
          gameTime,
          cleanedInput,
          contextualSummaryStream
            ? ContextCompressor.cleanText(contextualSummaryStream)
            : undefined, // CLEANED: Safe compression
          tableDataString, // NEW: Pass LSR data
          processedLorebook, // NEW: Pass Regexed Lorebook
          history, // Pass history for dryRun
          worldData.tavoVars || {}, // Pass tavoVars
          storyBibleFacts, // NEW: StoryBible facts
        );

      // Determine effective proxy and model
      let activeProxy = settings.proxies?.find(
        (p) => p.id === settings.activeProxyId,
      );
      if (!activeProxy && (settings.proxyEnabled || settings.proxyUrl)) {
        activeProxy = {
          id: "legacy",
          name: settings.proxyName || "Legacy Proxy",
          url: settings.proxyUrl || "",
          key: settings.proxyKey || "",
          model: settings.proxyModel || "",
          models: settings.proxyModels || [],
          isActive: true,
          type:
            settings.proxyUrl?.includes("moonshot") ||
            settings.proxyUrl?.includes("kimi")
              ? "openai"
              : settings.proxyEnabled
                ? "openai"
                : "google",
        };
      }

      const modelToUse =
        activeProxy && activeProxy.model ? activeProxy.model : settings.aiModel;

      const generationConfig: Record<string, unknown> = {};
      if (activeConfig.aiConfigOverrides?.temperature !== undefined)
        generationConfig.temperature =
          activeConfig.aiConfigOverrides.temperature;
      if (activeConfig.aiConfigOverrides?.topK !== undefined)
        generationConfig.topK = activeConfig.aiConfigOverrides.topK;
      if (activeConfig.aiConfigOverrides?.topP !== undefined)
        generationConfig.topP = activeConfig.aiConfigOverrides.topP;
      if (activeConfig.aiConfigOverrides?.frequencyPenalty !== undefined)
        generationConfig.frequencyPenalty =
          activeConfig.aiConfigOverrides.frequencyPenalty;
      if (activeConfig.aiConfigOverrides?.presencePenalty !== undefined)
        generationConfig.presencePenalty =
          activeConfig.aiConfigOverrides.presencePenalty;
      generationConfig.maxOutputTokens =
        activeConfig.aiConfigOverrides?.maxOutputTokens ?? 65000;

      // Pass OpenAI-specific params using non-enumerable properties so native Google GenAI SDK ignores them during JSON serialization
      Object.defineProperty(generationConfig, "repetitionPenalty", {
        value: activeConfig.aiConfigOverrides?.repetitionPenalty,
        enumerable: false,
      });
      Object.defineProperty(generationConfig, "minP", {
        value: activeConfig.aiConfigOverrides?.minP,
        enumerable: false,
      });
      Object.defineProperty(generationConfig, "topA", {
        value: activeConfig.aiConfigOverrides?.topA,
        enumerable: false,
      });

      // Apply Thinking Config from Preset
      const thinkingBudget =
        activeConfig.aiConfigOverrides?.thinkingBudget ?? 0;
      const lowerModel = modelToUse.toLowerCase();

      const isGeminiThinkingModel = lowerModel.includes("thinking") || lowerModel.includes("gemini-2.0-pro") || lowerModel.includes("gemini-3.1-pro");
      const isOtherThinkingModel =
        lowerModel.includes("kimi") ||
        lowerModel.includes("moonshot") ||
        lowerModel.includes("o1") ||
        lowerModel.includes("o3");

      // IMPORTANT: Gemini Thinking models STRICTLY forbid temperature, topP, topK, etc.
      if (isGeminiThinkingModel) {
        delete generationConfig.temperature;
        delete generationConfig.topP;
        delete generationConfig.topK;
        delete generationConfig.frequencyPenalty;
        delete generationConfig.presencePenalty;
      }

      if (thinkingBudget >= 1024 && isGeminiThinkingModel) {
        generationConfig.thinkingConfig = {
          thinkingBudgetTokens: thinkingBudget,
        };
      } else if (thinkingBudget > 0 && isOtherThinkingModel) {
        Object.defineProperty(generationConfig, "thinkingConfig", {
          value: { thinkingBudgetTokens: thinkingBudget },
          enumerable: false,
        });
      }

      const contents: any[] = [];
      if (fewShotBlock) {
        contents.push({ role: "user", parts: [{ text: "[MẪU HỘI THOẠI]\n" + fewShotBlock }] });
        contents.push({ role: "model", parts: [{ text: "Đã ghi nhận." }] });
      }

      const mappedHistory = compressedHistory
        .filter((msg) => !msg.isHidden)
        .map((msg) => {
        let text = msg.text;
        if (msg.role === "user" && !text.includes("<user_input>")) {
          text = `<user_input>${text}</user_input>`;
        }
        return {
          role: msg.role,
          parts: [{ text: text }],
        };
      });
      contents.push(...mappedHistory);

      // INJECT REINFORCEMENT INSTRUCTION HERE (CONTEXT DRIFT FIX)
      const reinforcement = getReinforcementInstruction(currentTurn);
      let fullInput = `<user_input>${cleanedInput}</user_input>${reinforcement}`;

      // Append postHistoryUser injects correctly
      if (postHistoryUser && postHistoryUser.length > 0) {
        fullInput += `\n\n${postHistoryUser}`;
      }

      contents.push({
        role: "user",
        parts: [{ text: fullInput }],
      });

      // Handle Prefill - FORCE THINKING
      let prefillContent = prefillAssistant || "";

      // Backwards compatibility
      const legacyPrefillModule = activeConfig.modules.find(
        (m) => m.identifier === "sys_prefill_trigger",
      );
      if (
        legacyPrefillModule &&
        legacyPrefillModule.enabled &&
        !prefillAssistant.includes(legacyPrefillModule.content)
      ) {
        prefillContent +=
          (prefillContent ? "\n\n" : "") + legacyPrefillModule.content;
      }

      if (prefillContent) {
        yield prefillContent;
        contents.push({
          role: "model",
          parts: [{ text: prefillContent }],
        });
      }

      const aiClient = getAiClient(settings);

      const streamResponse = await aiClient.models.generateContentStream({
        model: modelToUse,
        contents: contents,
        config: {
          ...generationConfig,
          systemInstruction: systemPrompt,
        },
      });

      let accumulatedFullText = prefillContent;

      let isInsideNativeThought = false;

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;

        let chunkStr = "";
        let hasNativePart = false;
        
        if (c.candidates?.[0]?.content?.parts) {
            for (const part of c.candidates[0].content.parts) {
                if ((part as any).thought) {
                   hasNativePart = true;
                   if (!isInsideNativeThought) {
                       chunkStr += "<thinking>\n";
                       isInsideNativeThought = true;
                   }
                   chunkStr += (part as any).thought;
                } else if (part.text) {
                   hasNativePart = true;
                   if (isInsideNativeThought) {
                       chunkStr += "\n</thinking>\n\n";
                       isInsideNativeThought = false;
                   }
                   chunkStr += part.text;
                }
            }
        }

        if (!hasNativePart && c.text) {
            if (isInsideNativeThought) {
                chunkStr += "\n</thinking>\n\n";
                isInsideNativeThought = false;
            }
            chunkStr += c.text; 
        }

        if (hasNativePart || chunkStr) {
             Object.defineProperty(c, 'text', { value: chunkStr, configurable: true });
        }

        // Yield the full chunk object so the UI can capture usageMetadata
        yield c;

        if (c.text) {
          accumulatedFullText += c.text;
        }
      }

      if (isInsideNativeThought) {
          accumulatedFullText += "\n</thinking>";
      }

      if (!accumulatedFullText) {
        const fallback = "Hệ thống không phản hồi. Vui lòng thử lại.";
        accumulatedFullText = fallback;
        yield fallback;
      }

      // Task 3.3 Step 4: Save Vectors Async after stream completes
      if (shouldCallEmbeddingStream || settings.enableVectorMemory) {
        (async () => {
          if (shouldCallEmbeddingStream) {
            const userMsgId = `msg-${Date.now()}-user`;
            const aiMsgId = `msg-${Date.now() + 1}-model`;
            await vectorService.saveVector(
              userMsgId,
              cleanedInput,
              "user",
              settings,
            );
            if (accumulatedFullText) {
              await vectorService.saveVector(
                aiMsgId,
                accumulatedFullText,
                "model",
                settings,
              );
            }
          }

            // Process StoryBible Turn
            if (settings.enableVectorMemory) {
              const recentForBible = [
                ...slicedHistory.slice(-4),
                {
                  role: "user" as const,
                  text: cleanedInput,
                  timestamp: Date.now(),
                },
                {
                  role: "model" as const,
                  text: accumulatedFullText,
                  timestamp: Date.now() + 1,
                },
              ];
              await storyBibleService.processTurn(
                recentForBible,
                campaignId,
                settings,
                currentTurn,
              );
              
              if (currentTurn > 0 && currentTurn % 3 === 0) {
                 await GraphRAGService.extractAndIntegrate(
                   recentForBible,
                   campaignId,
                   settings
                 );
              }

              // DYNAMIC MEMORY SUMMARIZATION (EVERY 15 TURNS)
              if (currentTurn > 0 && currentTurn % 15 === 0) {
                 // Summarize the last 30 messages (approx 15 turns)
                 const sliceLength = Math.min(slicedHistory.length, 30);
                 const historyToSummarize = slicedHistory.slice(-sliceLength);
                 const newSummary = await DynamicMemoryService.processCoreMemories(
                   historyToSummarize,
                   worldData,
                   settings,
                   campaignId
                 );
                 if (newSummary && typeof window !== 'undefined') {
                   window.dispatchEvent(new CustomEvent('tavo_summary_update', { detail: newSummary }));
                 }
              }

              // PERSONA DRIFT CHECK (EVERY 5 TURNS)
              if (currentTurn > 0 && currentTurn % 5 === 0) {
                 const sliceLength = Math.min(slicedHistory.length, 10);
                 const historyToCheck = slicedHistory.slice(-sliceLength);
                 const driftResult = await DynamicMemoryService.checkPersonaDrift(
                   historyToCheck,
                   worldData,
                   settings,
                   campaignId
                 );
                 if (driftResult?.hasDrift && typeof window !== 'undefined') {
                   window.dispatchEvent(new CustomEvent('tavo_persona_drift', { detail: driftResult }));
                 }
              }
            }
          })();
        }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("PAYMENT_REQUIRED") ||
        errorMessage.includes("402")
      ) {
        yield `<span style="color: #ef4444;">[LỖI THANH TOÁN (402): Model này yêu cầu API Key có trả phí (Paid Tier) hoặc đã hết hạn mức miễn phí. Vui lòng vào Cài đặt > API & Proxy để chọn API Key mới bằng nút 'Chọn API Key (Paid)'.]</span>`;
      } else if (
        errorMessage.includes("404") ||
        errorMessage.toLowerCase().includes("not found")
      ) {
        yield `<span style="color: #ef4444;">[LỖI MODEL (404): Không tìm thấy Model AI. Vui lòng kiểm tra lại Cài đặt AI & Proxy.]</span>`;
      } else if (
        errorMessage.toLowerCase().includes("safety") ||
        errorMessage.toLowerCase().includes("blocked")
      ) {
        yield `<span style="color: #ef4444;">[CẢNH BÁO AN TOÀN: Phản hồi của AI đã bị chặn bởi bộ lọc nội dung. Bạn có thể thử 'Regenerate' hoặc điều chỉnh 'Safety Settings' trong Cài đặt.]</span>`;
      } else {
        yield `<span style="color: #ef4444;">[LỖI HỆ THỐNG: ${errorMessage}]</span>`;
      }
    }
  },
};

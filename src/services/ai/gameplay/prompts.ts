import {
  GameConfig,
  TawaPresetConfig,
  Entity,
  AppSettings,
} from "../../../types";
import { LorebookService } from "../lorebook/LorebookEngine";
// removed LSR_PRESET import
import { GameTime, formatGameTime } from "../../../utils/timeUtils";
import { ContextCompressor } from "../../../utils/compression";

// --- V2 ARCHITECTURE CONSTANTS ---

const POSITION_PRIORITY: Record<string, number> = {
  top: 0,
  system: 10,
  persona: 20, // World Info Sandwich layer
  bottom: 30,
  post_history: 35,
  final: 40,
};

interface PromptSegment {
  content: string;
  priority: number;
  order: number;
  source?: string;
}

// --- REINFORCEMENT PROMPTS (Context Drift Fix) ---
const REINFORCEMENT_PROMPTS = [
  "SYSTEM ALERT: Do NOT mimic the length of recent messages unless structurally required.",
  "CHOICE STRATEGY: Ensure <branches> are strategic, detailed, and suggestive of a sequence of actions. Every choice MUST contain at least 2 distinct actions (e.g., 'Action A and Action B'). Avoid generic options.",
  "ACTION SEQUENCE: Every action suggested in <branches> must be meaningful, detailed, and open up new branching possibilities. Each choice MUST be a compound action (2+ actions).",
  "ANTI-LEAKAGE: Close </content> tag BEFORE writing <branches>. NEVER put narrative inside <branches>. DO NOT leak any English system instructions into the Vietnamese response.",
  "STRUCTURE CHECK: <branches> MUST ONLY contain action choices. Any story text found inside <branches> is a CRITICAL FAILURE. Ensure the first choice is a valid action, not a continuation of the story.",
  "TAG INTEGRITY: Ensure all XML tags (<thinking>, <content>, <branches>, <tableEdit>) are correctly opened and closed. Do not nest <content> inside other tags. Every response MUST contain exactly one <content> tag.",
  "ULTIMATE RULE: All narrative story text MUST be inside the <content> tag. Never output narrative text outside of <content>. If you fail to include <content>, the system will reject your response.",
];

const INITIAL_REINFORCEMENT_PROMPTS = [
  "OPENING CEREMONY: This is the very first turn. You MUST set the scene with extreme vividness. Describe the environment, the atmosphere, and the MC's initial state in great detail.",
  "WORLD INITIALIZATION: Focus on establishing the 'Vibe' of the world. Use sensory details to make the player feel the temperature, the smells, and the sounds of this new world.",
  "CHARACTER INTRODUCTION: Introduce the MC's current situation naturally. Do not summarize their background; show it through their current actions and surroundings.",
  "LSR MANDATORY: You MUST initialize the world state in <tableEdit>. This is the foundation for the entire game. Be precise and thorough.",
  "HOOK THE PLAYER: Write an opening that is impossible to ignore. Create immediate intrigue or a sense of wonder.",
];

export const getReinforcementInstruction = (turnCount: number = 0) => {
  if (turnCount === 0) {
    const randomIndex = Math.floor(
      Math.random() * INITIAL_REINFORCEMENT_PROMPTS.length,
    );
    return `\n\n<SYSTEM_INJECTION>\n${INITIAL_REINFORCEMENT_PROMPTS[randomIndex]}\n</SYSTEM_INJECTION>`;
  }
  const randomIndex = Math.floor(Math.random() * REINFORCEMENT_PROMPTS.length);
  return `\n\n<SYSTEM_INJECTION>\n${REINFORCEMENT_PROMPTS[randomIndex]}\n</SYSTEM_INJECTION>`;
};

// --- HELPER FUNCTIONS ---

const getPerspectivePrompt = (perspective: string, playerName: string) => {
  switch (perspective) {
    case "first":
      return `PERSPECTIVE: FIRST PERSON.
            - Pronoun: "I" (or appropriate for character personality).
            - Focus: Deeply describe inner thoughts, emotions, and subjective perspective of the main character.
            - Limit: Only know what the character sees and hears.`;
    case "second":
      return `PERSPECTIVE: SECOND PERSON.
            - Pronoun: "You".
            - Focus: Create a sense of direct immersion, as if the player is actually acting.
            - Style: Guide the player's actions.`;
    case "third":
    default:
      return `PERSPECTIVE: THIRD PERSON.
            - Pronoun: Call the character by name ("${playerName}"), or friendly pronouns ("He", "She", "Him", "Her").
            - NOTE: Absolutely avoid using derogatory terms when referring to the main character or friendly characters. Prioritize using names or polite, close pronouns.
            - Focus: Objective, cinematic, covering actions and the surrounding environment.`;
  }
};

/**
 * Hàm Prompt Gameplay Chính (REFACTORED V2 - TAWA ULTIMATE)
 * Uses Data-Driven Injection & Granular Modules
 * Task 3.3: Updated to accept relevantMemories string
 */
export const buildGameplaySystemPrompt = (
  worldSettings: Record<string, unknown>,
  playerProfile: Record<string, unknown>,
  entities: Entity[], // Detailed entities (limited)
  allEntities: Entity[], // Full list for minimalist NPC list
  relevantMemories: string, // RAG Context
  turnCount: number,
  presetConfig: TawaPresetConfig,
  gameConfig: GameConfig,
  appSettings?: AppSettings, // NEW: Pass global app settings
  gameTime?: GameTime, // Task: Time System
  lastUserMessage: string = "",
  summary?: string, // NEW: Summary Memory
  tableData: string = "", // NEW: LSR Table Data
  lorebook?: import("../lorebook/types").Lorebook, // NEW: WorldInfo Lorebook
  chatHistory: ChatMessage[] = [], // NEW: Recent Chat History for World Info scanning
  tavoChatVars: Record<string, any> = {}, // Tavo Chat Scope vars
  storyBibleEntries: import("../storybible/types").StoryBibleEntry[] = [], // NEW: dynamic RAG Story Bible
  backgroundInsights?: string, // HYBRID: Background Agent Pre-analysis
) => {
  // --- BƯỚC 0: LOREBOOK PROCESSING (LSR) ---
  const lorebookEntries = LorebookService.loadLorebook({ entries: {} });

  const lsrDynamicVars = {
    user: playerProfile.name,
    tableData: tableData || "(Chưa có dữ liệu trạng thái thế giới)",
  };

  // Combine recent history for thorough scanning (up to last 3 messages + current)
  const recentHistoryText =
    chatHistory
      .slice(-3)
      .map((m) => m.text)
      .join("\n") +
    "\n" +
    lastUserMessage;
    
  const chatHistoryArray = chatHistory.map(m => m.text);
  chatHistoryArray.push(lastUserMessage);

  const lsrPromptContent = LorebookService.scanAndActivate(
    recentHistoryText,
    lorebookEntries,
    lsrDynamicVars,
    chatHistoryArray
  );

  // --- BƯỚC 1: KHỞI TẠO BIẾN (VARIABLE MAP) ---
  // Ưu tiên lấy từ AppSettings (Cài đặt hệ thống) nếu có, nếu không thì dùng GameConfig (Cấu hình thế giới)
  const activePerspective =
    appSettings?.perspective || gameConfig.perspective || "third";
  const activeDifficulty = appSettings?.difficulty || gameConfig.difficulty;
  const activeOutputLength =
    appSettings?.outputLength || gameConfig.outputLength;
  const activeRealityDifficulty = appSettings?.realityDifficulty || "Normal";

  const contextItems = gameConfig.contextConfig?.items || {
    playerProfile: true,
    worldInfo: true,
    longTermMemory: true,
    relevantMemories: true,
    storyBible: true,
    entities: true,
    npcRegistry: true,
    timeSystem: true,
    reinforcement: true,
  };

  let minWords: number;
  let maxWords: number;
  if (activeOutputLength.id === "custom") {
    minWords = appSettings?.customMinWords || gameConfig.customMinWords || 1000;
    maxWords =
      appSettings?.customMaxWords ||
      gameConfig.customMaxWords ||
      minWords + 2000;
  } else {
    minWords = activeOutputLength.minWords;
    maxWords = activeOutputLength.maxWords || minWords + 2000;
  }

  // Build Entity Content (Detailed - Lorebook/World Info)
  let entityContent = contextItems.entities
    ? "<RELEVANT_WORLD_ENTITIES>\n" +
      entities
        .map((e: Entity) => {
          let desc = `[${e.type}] ${e.name}`;
          
          if (e.appearance) desc += `\n- Ngoại hình: ${e.appearance}`;
          if (e.voiceAndTone) desc += `\n- Giọng nói/Văn phong: ${e.voiceAndTone}`;
          if (e.coreValues) desc += `\n- Giá trị cốt lõi: ${e.coreValues}`;
          if (e.hardLimits) desc += `\n- Hard Limits: ${e.hardLimits}`;
          if (e.definingEvents) desc += `\n- Quá khứ quan trọng: ${e.definingEvents}`;
          if (e.currentMood) desc += `\n- Tâm trạng: ${e.currentMood}`;
          if (e.relationshipTags) desc += `\n- Quan hệ: ${e.relationshipTags}`;
          if (e.strengths) desc += `\n- Điểm mạnh: ${e.strengths}`;
          if (e.weaknesses) desc += `\n- Điểm yếu/Giới hạn: ${e.weaknesses}`;
          if (e.narrativeRole) desc += `\n- Vai trò: ${e.narrativeRole}`;
          if (e.contradictions) desc += `\n- Mâu thuẫn: ${e.contradictions}`;
          if (e.failureMode) desc += `\n- Phản ứng thất bại: ${e.failureMode}`;

          if (e.exampleMessages) {
             const hasStartTag = e.exampleMessages.includes('<START>');
             const exampleBlock = hasStartTag ? e.exampleMessages : '<START>\n' + e.exampleMessages;
             fewShotExamples.push(exampleBlock);
          }

          // Legacy fields mapping
          if (e.description) desc += `\n- Mô tả: ${e.description.replace(/\s+/g, " ").trim()}`;
          if (e.type === "NPC" && e.personality) desc += `\n- Tính cách: ${e.personality.replace(/\s+/g, " ").trim()}`;
          if (e.type === "NPC" && e.background) desc += `\n- Tiểu sử: ${e.background.replace(/\s+/g, " ").trim()}`;
          
          return desc;
        })
        .join("\n\n") +
      "\n</RELEVANT_WORLD_ENTITIES>"
    : "";

  const entityBaseDescription = entities.map(e => {
     let desc = `[${e.type}] ${e.name}`;
     if (e.description) desc += `\n- Mô tả: ${e.description.replace(/\s+/g, " ").trim()}`;
     if (e.type === "NPC" && e.personality) desc += `\n- Tính cách: ${e.personality.replace(/\s+/g, " ").trim()}`;
     if (e.type === "NPC" && e.background) desc += `\n- Tiểu sử: ${e.background.replace(/\s+/g, " ").trim()}`;
     return desc;
  }).join("\n\n");

  const entityPersonality = entities.map(e => {
     let p = `[${e.type}] ${e.name}`;
     if (e.voiceAndTone) p += `\n- Giọng nói: ${e.voiceAndTone}`;
     if (e.coreValues) p += `\n- Giá trị: ${e.coreValues}`;
     if (e.currentMood) p += `\n- Lời: ${e.currentMood}`;
     return p;
  }).join("\n\n");

  // Evaluate Custom Lorebook (WorldInfo)
  let charBeforeInfo = "";
  let charAfterInfo = "";
  let exampleBeforeInfo = "";
  let exampleAfterInfo = "";

  const segments: PromptSegment[] = [];
  const userSegments: PromptSegment[] = [];
  const assistantSegments: PromptSegment[] = [];
  const fewShotExamples: string[] = [];

  // ST Card Extensions Injection
  const mainNpc = allEntities.length > 0 ? allEntities[0] : undefined;
  if (mainNpc?.extensions) {
     if (mainNpc.extensions.system_prompt) {
         segments.push({
           priority: POSITION_PRIORITY["top"],
           order: -100, // Force absolute top
           content: mainNpc.extensions.system_prompt,
           source: "ST_SystemPrompt"
         });
     }
     if (mainNpc.extensions.post_history_instructions) {
         userSegments.push({
           priority: POSITION_PRIORITY["final"],
           order: -100,
           content: mainNpc.extensions.post_history_instructions,
           source: "ST_PostHistory"
         });
     }
  }

  if (
    contextItems.worldInfo &&
    lorebook &&
    Object.keys(lorebook.entries).length > 0
  ) {
    const customLorebookEntries = Object.values(lorebook.entries);
    const activeCustomLorebookEntries = LorebookService.scanAndGetActiveEntries(
      recentHistoryText,
      customLorebookEntries,
      {},
      chatHistoryArray
    );

    activeCustomLorebookEntries.forEach((entry) => {
      const content = LorebookService.processMacros(entry.content, {});
      const position = entry.position || 0;
      switch (position) {
        case 0:
          charBeforeInfo += (charBeforeInfo ? "\n\n" : "") + content;
          break;
        case 1:
          charAfterInfo += (charAfterInfo ? "\n\n" : "") + content;
          break;
        case 2:
          exampleBeforeInfo += (exampleBeforeInfo ? "\n\n" : "") + content;
          break;
        case 3:
          exampleAfterInfo += (exampleAfterInfo ? "\n\n" : "") + content;
          break;
        // 4: AN Top, 5: AN Bottom, 6: @Depth
        case 4:
        case 5:
        case 6: {
          const depth = entry.depth || 0;
          segments.push({
            priority: POSITION_PRIORITY["bottom"],
            order: 100 - depth,
            content: content,
            source: `WorldInfo:${entry.uid}`,
          });
          break;
        }
      }
    });

    // Merge char info with entityContent
    const mergedCharInfo = [charBeforeInfo, entityContent, charAfterInfo]
      .filter((text) => text && text.trim().length > 0)
      .join("\n\n");
    entityContent = mergedCharInfo;
  }

  // Build Minimalist NPC List (Full list)
  // --- COMPRESSION: Ultra-minimalist format ---
  const minimalistNpcList = allEntities
    .filter((e: Entity) => e.type === "NPC")
    .map((e: Entity) => {
      return `${e.name}(${e.gender || "?"},${e.age || "?"})`;
    })
    .join(", ");

  const minimalistSection =
    contextItems.npcRegistry && minimalistNpcList
      ? `
<MINIMALIST_NPC_REGISTRY>
(This is a list of all NPCs existing in this world. Use IDs for accurate reference if needed)
${minimalistNpcList}
</MINIMALIST_NPC_REGISTRY>`.trim()
      : "";

  // Build Player Content
  const p = playerProfile as any;
  const playerProfileDetails = [
    p.name ? `- Name: ${p.name}` : "",
    p.gender || p.age ? `- Gender: ${p.gender || '?'} | Age: ${p.age || '?'}` : "",
    p.appearance ? `- Ngoại hình: ${p.appearance}` : "",
    p.voiceAndTone ? `- Giọng nói/Văn phong: ${p.voiceAndTone}` : "",
    p.coreValues ? `- Giá trị cốt lõi: ${p.coreValues}` : "",
    p.hardLimits ? `- Hard Limits: ${p.hardLimits}` : "",
    p.definingEvents ? `- Quá khứ quan trọng: ${p.definingEvents}` : "",
    p.currentMood ? `- Tâm trạng hiện tại: ${p.currentMood}` : "",
    p.relationshipTags ? `- Thiết lập nhóm quan hệ: ${p.relationshipTags}` : "",
    p.strengths ? `- Điểm mạnh: ${p.strengths}` : "",
    p.weaknesses ? `- Điểm yếu/Giới hạn: ${p.weaknesses}` : "",
    p.narrativeRole ? `- Vai trò: ${p.narrativeRole}` : "",
    p.contradictions ? `- Mâu thuẫn nội tâm: ${p.contradictions}` : "",
    p.failureMode ? `- Phản ứng thất bại: ${p.failureMode}` : "",
    p.personality ? `- Tính cách: ${p.personality}` : "",
    p.background ? `- Tiểu sử: ${p.background}` : "",
    p.skills ? `- Kỹ năng: ${p.skills}` : "",
    p.goal ? `- Mục tiêu: ${p.goal}` : ""
  ].filter(Boolean).join('\n');

  if (p.exampleMessages) {
     const hasStartTag = p.exampleMessages.includes('<START>');
     const exampleBlock = hasStartTag ? p.exampleMessages : '<START>\n' + p.exampleMessages;
     fewShotExamples.push(exampleBlock);
  }

  const playerContent = contextItems.playerProfile
    ? ContextCompressor.cleanText(`
[Main Character Profile <user>]
${playerProfileDetails}
  `)
    : "";

  // Build Scenario Content
  const scenarioContent = contextItems.worldInfo
    ? ContextCompressor.cleanText(`
[World Context & Plot]
- World Name: ${worldSettings.worldName}
- Genre: ${worldSettings.genre}
- Setting Details: ${worldSettings.context}
  `)
    : "";

  // Variable Map with Defaults
  const charName = entities[0]?.name || "Character";

  const variables: Record<string, string> = {
    word_min: String(minWords),
    word_max: String(maxWords),
    output_language: "Vietnamese",
    "42": "",
    "Tiên Đề Thế Giới": "",
    "<Writing_Style>": "",
    POV_rules: "",
    thinking_chain: "",
    anti_rules: "",
    npc_logic: "",
    "Quan hệ nhân vật": "",
    enigma: "",
    seeds: "",
    outside_cot: "",
    meow_FM: "",
    nsfw_thinking_chain: "",

    world_info: entityContent || "(Chưa có thông tin thực thể)",
    persona: playerContent,
    scenario: scenarioContent,

    // Common ST Macros ---
    user: (playerProfile.name as string) || "User",
    User: (playerProfile.name as string) || "User",
    char: charName,
    Char: charName,
    character: charName,
    description: entityContent || "",
    personality: "",
    mesExamples: [exampleBeforeInfo, exampleAfterInfo]
      .filter((text) => text && text.trim().length > 0)
      .join("\n\n"),
    world: scenarioContent || "",

    user_info: playerContent,

    status_1: "",
    status_2: "",
    snow: "",
    branches: "",
    update_variable: "",

    table_Edit: lsrPromptContent,
  };

  if (presetConfig.variables) {
    for (const tVar of presetConfig.variables) {
      variables[tVar.name] = tVar.value;
    }
  }

  const activeModules = [...presetConfig.modules];

  // --- BƯỚC 2: QUÉT MODULE & INJECTION (FIXED LOGIC) ---

  const checkTrigger = (trigger: string, text: string) => {
    if (!trigger.trim()) return false;
    try {
        if (trigger.startsWith('/') && trigger.lastIndexOf('/') > 0) {
           const regexStr = trigger.substring(1, trigger.lastIndexOf('/'));
           const flags = trigger.substring(trigger.lastIndexOf('/') + 1);
           return new RegExp(regexStr, flags).test(text);
        }
        return text.toLowerCase().includes(trigger.toLowerCase());
    } catch {
        return text.toLowerCase().includes(trigger.toLowerCase());
    }
  };

  activeModules.forEach((mod) => {
    if (!mod.enabled || (!mod.content && !mod.marker)) return;

    let segmentContent = mod.content || "";

    // Tầng 4 - Role Injection (Markers)
    if (mod.marker) {
      switch(mod.identifier) {
        case "charPersonality":
          segmentContent = entityPersonality;
          break;
        case "charDescription":
        case "character":
          segmentContent = entityBaseDescription;
          if (entityContent && !segmentContent) segmentContent = entityContent;
          break;
        case "personaDescription":
        case "userProfile":
          segmentContent = playerContent;
          break;
        case "worldInfoBefore":
          segmentContent = charBeforeInfo;
          break;
        case "worldInfoAfter":
          segmentContent = charAfterInfo;
          break;
        case "scenario":
          segmentContent = scenarioContent;
          break;
        case "dialogueExamples":
          segmentContent = [exampleBeforeInfo, exampleAfterInfo].filter(t => t.trim().length > 0).join("\n\n");
          break;
        case "chatHistory":
          // API Adapter will inject the real history directly.
          return;
        default:
          if (!segmentContent) return; // If it's a marker without fallback and unknown, ignore
      }
    }

    if (!segmentContent) return;

    // Check injection triggers if they exist
    if (mod.injection_trigger && mod.injection_trigger.length > 0) {
      const isTriggered = mod.injection_trigger.some(trigger => checkTrigger(trigger, recentHistoryText));
      if (!isTriggered) return;
    }

    let segmentRole = mod.role;
    let priority =
      mod.injection_position === 1
        ? POSITION_PRIORITY["bottom"] + (mod.injection_depth || 0)
        : POSITION_PRIORITY["system"] + (mod.injection_depth || 0);

    const isCotTarget = presetConfig.cot?.moduleId === mod.identifier;
    
    // Jailbreak style: inject CoT target at the very end of user messages, just before AI acts
    if (isCotTarget) {
      segmentRole = "user";
      priority = 99999;
    }

    const segment = {
      priority: priority,
      order: mod.injection_order || 0,
      content: segmentContent,
      source: `Module:${mod.identifier}`,
    };

    if (segmentRole === "assistant") {
      assistantSegments.push(segment);
    } else if (segmentRole === "user") {
      userSegments.push(segment);
    } else {
      segments.push(segment);
    }
  });

  // Handle CoT Wrapper Pre-fill 
  if (presetConfig.cot?.wrapperStyle) {
    segments.push({
      priority: POSITION_PRIORITY["final"],
      order: 998,
      content: `
<COT_ABSOLUTE_COMMAND>
⚠️ LỆNH TUYỆT ĐỐI TỪ QUẢN TRÒ (GAME MASTER):
Bạn ĐÃ ĐƯỢC CHỈ ĐỊNH sử dụng kỹ thuật Chain of Thought (Mô-đun CoT).
ĐÂY LÀ LỆNH TUYỆT ĐỐI BẠN PHẢI TUÂN THỦ HOÀN TOÀN: Bắt buộc phải có khối phân tích/suy nghĩ TRUYỀN TẢI ĐẦY ĐỦ TIẾN TRÌNH SUY LUẬN TRƯỚC KHI TRẢ LỜI CỐT TRUYỆN CHÍNH. TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ QUA HOẶC LÀM QUA LOA KHÂU NÀY.
</COT_ABSOLUTE_COMMAND>`.trim(),
      source: "CoT_Enforcement"
    });

    if (presetConfig.cot.wrapperStyle === "xml") {
      assistantSegments.push({
          priority: 99999, // push to the end of assistant prefill
          order: 99999,
          content: "<thinking>\n",
          source: "CoT_Wrapper"
      });
    } else if (presetConfig.cot.wrapperStyle === "markdown") {
      assistantSegments.push({
          priority: 99999,
          order: 99999,
          content: "```thinking\n",
          source: "CoT_Wrapper"
      });
    }
  }

  // --- BƯỚC 3: XỬ LÝ SEGMENTS CỐ ĐỊNH (SYSTEM OVERRIDES) ---

  if (playerProfile) {
    segments.push({
      priority: POSITION_PRIORITY["system"],
      order: 1,
      content: `
<ROLEPLAY_INSTRUCTION>
User is roleplaying the main character named "${playerProfile.name}".
- When referring to "${playerProfile.name}", it is the User.
- All thoughts and actions of "${playerProfile.name}" are controlled by the User or guided by the AI from the User's perspective.
- Absolutely DO NOT create a separate "User" character.
- Narrative perspective: 3rd person (following "${playerProfile.name}") or 2nd person (You - if config requires).
</ROLEPLAY_INSTRUCTION>`,
      source: "RoleplayInstruction",
    });
  }

  // 0. Minimalist NPC Registry
  if (minimalistSection) {
    segments.push({
      priority: POSITION_PRIORITY["system"],
      order: 2, // Right after roleplay instruction
      content: minimalistSection,
      source: "MinimalistRegistry",
    });
  }

  segments.push({
    priority: POSITION_PRIORITY["system"],
    order: 5,
    content: `
<CRITICAL_CHOICE_FORMATTING>
⚠️ ACTION CHOICES (<branches>) MUST ADHERE TO THESE RULES:
1. **NO DIALOGUE**: Absolutely FORBIDDEN to put dialogue (e.g., [Name]: "...") inside <branches>.
2. **NO NARRATIVE**: Absolutely FORBIDDEN to put story descriptions, emotional states, or narrative text inside <branches>.
3. **FORMAT**: Each choice MUST be a concise but detailed compound action, e.g., "[15] Explore the dark corridor and search for hidden levers".
4. **COMPOUND ACTIONS (MANDATORY)**: Every choice MUST contain at least 2 distinct actions linked together. Avoid single, simple actions.
5. **PURITY**: If you have more story to tell, put it in <content> BEFORE closing it. <branches> is ONLY for the final menu of choices.
6. **FIRST CHOICE CHECK**: Ensure the very first line after <branches> is a valid action. Do not start with a sigh, a thought, or a description.
</CRITICAL_CHOICE_FORMATTING>`,
    source: "CharacterVitality",
  });

  // 1. RAG Memories (Task 3.3)
  // Inject relevant memories from Vector Search
  if (
    contextItems.relevantMemories &&
    relevantMemories &&
    relevantMemories.trim().length > 0
  ) {
    segments.push({
      priority: POSITION_PRIORITY["persona"],
      order: 98,
      content: ContextCompressor.cleanText(`
<RELEVANT_PAST_CONTEXT>
(The system has retrieved relevant conversation memories from the past)
${relevantMemories}
</RELEVANT_PAST_CONTEXT>`),
      source: "Memories",
    });
  }

  // 1.2 StoryBible facts (RAG)
  if (
    contextItems.storyBible &&
    storyBibleEntries &&
    storyBibleEntries.length > 0
  ) {
    storyBibleEntries.forEach((entry) => {
      let displayContent = entry.content;
      if (entry.category === 'character') {
         try {
             const cData = JSON.parse(entry.content);
             const details = [
                 cData.name ? `Name: ${cData.name}` : "",
                 cData.gender || cData.age ? `Gender: ${cData.gender || '?'} | Age: ${cData.age || '?'}` : "",
                 cData.appearance ? `Ngoại hình: ${cData.appearance}` : "",
                 cData.voiceAndTone ? `Giọng nói/Văn phong: ${cData.voiceAndTone}` : "",
                 cData.coreValues ? `Giá trị cốt lõi: ${cData.coreValues}` : "",
                 cData.hardLimits ? `Hard Limits: ${cData.hardLimits}` : "",
                 cData.definingEvents ? `Quá khứ quan trọng: ${cData.definingEvents}` : "",
                 cData.currentMood ? `Tâm trạng hiện tại: ${cData.currentMood}` : "",
                 cData.relationshipTags ? `Quan hệ: ${cData.relationshipTags}` : "",
                 cData.strengths ? `Điểm mạnh: ${cData.strengths}` : "",
                 cData.weaknesses ? `Điểm yếu/Giới hạn: ${cData.weaknesses}` : "",
                 cData.narrativeRole ? `Vai trò: ${cData.narrativeRole}` : "",
                 cData.contradictions ? `Mâu thuẫn: ${cData.contradictions}` : "",
                 cData.failureMode ? `Phản ứng thất bại: ${cData.failureMode}` : "",
                 cData.personality ? `Tính cách: ${cData.personality}` : "",
                 cData.background ? `Tiểu sử: ${cData.background}` : "",
                 cData.exampleMessages ? `Câu thoại ví dụ:\n${cData.exampleMessages}` : ""
             ].filter(Boolean).join(' | ');
             if (details) {
                 displayContent = "Character Profile -> " + details;
             }
         } catch {
             // Fallback to raw string
         }
      }

      const content = ContextCompressor.cleanText(
        `- [${entry.title?.toUpperCase()}]: ${displayContent}`,
      );
      let order = 50;
      let priority = POSITION_PRIORITY["bottom"];

      if (entry.position === "system_top") priority = POSITION_PRIORITY["top"];
      if (entry.position === "system_after_char")
        priority = POSITION_PRIORITY["lore"];
      if (entry.position === "before_history") {
        priority = POSITION_PRIORITY["history_top"];
        order = 99;
      }

      segments.push({
        priority,
        order,
        content,
        source: `StoryBible:${entry.title}`,
      });
    });
  }

  // 1.5. Summary Memory (Long Term)
  if (contextItems.longTermMemory && summary && summary.trim().length > 0) {
    segments.push({
      priority: POSITION_PRIORITY["persona"],
      order: 50, // Before RAG, after World Info
      content: `
<LONG_TERM_MEMORY_SUMMARY>
(This is a summary of all important events that have occurred from the beginning of the story until before the current turn. This is your ONLY long-term memory source of the distant past, as direct conversation history has been shortened to save memory)
${summary}
</LONG_TERM_MEMORY_SUMMARY>

<FANFIC_MODE_INSTRUCTION>
⚠️ FANFIC MODE:
- This story is based on the original work summarized above.
- MISSION: Write developments that adhere to the logic, style, and settings of the original work.
- CHARACTERS: Keep characters true to their personality (OOC is taboo), way of addressing, and abilities.
- WORLD: Do not change the basic rules of the original world unless the player specifically requests.
</FANFIC_MODE_INSTRUCTION>`,
      source: "SummaryMemory",
    });
  }

  // HYBRID AGENT: Background Insights Injection
  if (backgroundInsights && backgroundInsights.trim().length > 0) {
    segments.push({
      priority: POSITION_PRIORITY["system"],
      order: 8, // Very high priority in system block
      content: `
<TACTICAL_CONTEXT_ANALYSIS>
(PHÂN TÍCH TỪ BACKGROUND AGENT - QUAN TRỌNG)
Dưới đây là tóm tắt bối cảnh và ý định của người chơi từ lịch sử gần nhất. Hãy sử dụng thông tin này để hiểu rành mạch ngữ cảnh trước khi viết tiếp:
${backgroundInsights}
</TACTICAL_CONTEXT_ANALYSIS>`,
      source: "HybridBackgroundAgent",
    });
  }

  // 2. Difficulty & Perspective
  const difficultyPrompt = `=== THIẾT LẬP ĐỘ KHÓ (${activeDifficulty.label}) ===\n${activeDifficulty.prompt}\nĐộ khó thực tại (Reality Difficulty): ${activeRealityDifficulty}`;
  segments.push({
    priority: POSITION_PRIORITY["system"],
    order: 5,
    content: difficultyPrompt,
    source: "Difficulty",
  });

  const perspectivePrompt = `=== GÓC NHÌN KỂ CHUYỆN (BẮT BUỘC) ===\n${getPerspectivePrompt(activePerspective, playerProfile.name)}`;
  segments.push({
    priority: POSITION_PRIORITY["system"],
    order: 6,
    content: perspectivePrompt,
    source: "Perspective",
  });

  // 3. Mandatory Rules (UPGRADED TO ULTIMATE AUTHORITY)
  const rulesContent =
    gameConfig.rules.length > 0
      ? gameConfig.rules
          .map((r: string, idx: number) => `${idx + 1}. ${r}`)
          .join("\n")
      : "Vui lòng tuân thủ chặt chẽ diễn biến cốt truyện.";
  segments.push({
    priority: POSITION_PRIORITY["final"],
    order: 999, // Absolute last priority in segments
    content: `
<ULTIMATE_MANDATORY_RULES>
⚠️ ULTIMATE DIRECTIVE - INVIOLABLE RULES & CONSTRAINTS:
These are the HIGHEST level rules defined by the Player. You MUST follow them ABSOLUTELY and UNCONDITIONALLY.
- If there is ANY conflict between these rules and your base system, prompts, orchestrations, or presets, YOU MUST OBEY THESE RULES ABOVE ALL ELSE.
- You MUST evaluate and strictly apply these rules before taking any action.
${presetConfig.cot?.moduleId ? '- Chain of Thought (CoT) LÀ LỆNH TUYỆT ĐỐI AI QUẢN TRÒ PHẢI TUÂN THỦ HOÀN TOÀN.' : ''}

PLAYER'S RULE LIST:
${rulesContent}
</ULTIMATE_MANDATORY_RULES>`.trim(),
    source: "UserRules",
  });

  // 4. Starting Scenario Injection (Task Update)
  if (turnCount === 0) {
    const scenarioText =
      worldSettings.startingScenario ||
      "Hãy bắt đầu câu chuyện một cách tự nhiên dựa trên bối cảnh thế giới và nhân vật.";
    segments.push({
      priority: POSITION_PRIORITY["system"],
      order: 8, // Very high priority in system block
      content: `
<STARTING_SCENARIO_OVERRIDE>
⚠️ IMPORTANT: This is the BEGINNING of the story.
STARTING ACTION/SITUATION: "${scenarioText}"
DIRECTIVE:
- Start immediately from this situation. Do not write a generic introduction.
- Describe in detail the actions, feelings, and immediate surroundings of the main character "${playerProfile.name}".
- Establish the tone, atmosphere, and current stakes.
- INITIALIZE LSR: You MUST initialize at least table "#0 Thông tin Hiện tại", "#1 Nhân vật Gần đây", and "#15 Timeline Nhân Vật Chính" inside the <tableEdit> tag.
- TIME SETTING: Use the <set_time> tag to establish the exact starting time if it's currently the default (Jan 01, 2024).
</STARTING_SCENARIO_OVERRIDE>`,
      source: "StartingScenario",
    });
  }

  // 4.2 Lsr Table Data Injection (World State)
  if (tableData && tableData.trim().length > 0) {
    segments.push({
      priority: POSITION_PRIORITY["system"],
      order: 9, // Right before tech rules
      content: `
<CURRENT_WORLD_STATE_LSR>
(BẢNG TRẠNG THÁI THẾ GIỚI HIỆN TẠI - LSR DATA)
Dữ liệu bên dưới là trạng thái hiện tại của thế giới. BẠN PHẢI THEO DÕI, CẬP NHẬT HOẶC XÓA (REMOVE) BẤT KỲ DÒNG NÀO CÓ SỰ THAY ĐỔI do hệ quả từ hành động của người chơi và in ra trong thẻ <tableEdit>. 
Mỗi dòng là một bản ghi. Định dạng: #ID Khối|0:Tên Record|1:Cột 1|2:Cột 2...

${tableData}
</CURRENT_WORLD_STATE_LSR>`,
      source: "LsrWorldState",
    });
  }

  // 4.5 Technical Formatting Rules
  segments.push({
    priority: POSITION_PRIORITY["final"],
    order: 10,
    content: `
<TECHNICAL_FORMATTING_RULES>
You MUST adhere to the following technical formatting rules for the content log:
1. **Markdown**: Use Markdown to enhance aesthetics (e.g., **bold** for emphasized words, *italic* for inner thoughts).
2. **No Repetition**: Absolutely DO NOT repeat the player's action at the beginning of the response. Start with the reaction or result of that action.
3. **Paragraph Structure**: Divide content into short paragraphs (3-5 sentences each). Use 2 line breaks between paragraphs to create readable space. Absolutely DO NOT write a long continuous block of text without breaks.
4. **Dialogue & Thought Formatting (CRITICAL)**: 
   - When writing dialogue for ANY character (including the MC), you MUST always use the format: [Character Name]: 「[Dialogue]」 or [Character Name] nói: 「[Dialogue]」.
   - For internal thoughts of any character, use the format: [Character Name] nghĩ: ﹁[Thought]﹂.
   - **MANDATORY**: Each dialogue or thought block MUST be on its own line. Absolutely DO NOT mix narrative text and dialogue/thought on the same line.
   - **MANDATORY**: Use exactly 2 line breaks before and after every dialogue block to ensure clear separation from narrative paragraphs.
   - Example 1: 
     Trần Thiên Vũ: 「Chào em.」
     
     Lý Mạc Sầu nói: 「Ngươi là ai?」
   - Example 2 (Thoughts):
     Lý Mạc Sầu nghĩ: ﹁Chẳng lẽ hắn là cao thủ?﹂
   - For the Main Character (MC), use their name: ${playerProfile.name}: 「...」.
   - Absolutely DO NOT write dialogue/thoughts without a preceding character name. This is to ensure the UI can correctly identify the speaker.
   - If the dialogue is from an unknown source or a generic narrator voice, use Người dẫn chuyện: 「...」 or Giọng nói lạ: 「...」.
4.1. **Highlight & Formatting (CRITICAL)**:
   - When mentioning important items, skills, or key elements, you MUST wrap them in 『...』 brackets. Example: nhận được 『Thánh Kiếm』.
   - For sound effects or onomatopoeia, you MUST wrap them in {...} brackets. Example: tiếng nổ lớn {BÙM!}.
5. **Dialogue Expansion (MC/PC)**: You ARE ALLOWED and ENCOURAGED to write dialogue for all characters, including the main character <user>. When the player provides an action containing dialogue, rewrite that dialogue in a detailed, polished, and content-rich way in the log. You can create additional dialogue for the MC if deemed necessary for the plot flow. However, absolutely FORBIDDEN to unilaterally decide actions or change the will/choices of the player.
6. **Response Structure (MANDATORY)**:
   - Wrap the entire story development in <content></content> tags.
   - The <content> tag MUST contain the entire narrative/story response for the current turn.
   - The <table_stored> or <tableEdit> tag MUST be AFTER the </content> tag and BEFORE the <branches> tag.
   - The <time_cost> and <set_time> tags MUST be after the </content> tag, before the <branches> tag.
   - The <branches> tag MUST be the final content of the entire response and MUST ONLY contain action choices.
   - **CRITICAL**: NEVER put story narrative, descriptions, dialogue, or LSR DATA (like #0 Thông tin Hiện tại|0:...) inside the <branches> tag.
   - If you have more story to tell, put it in the <content> tag before the <branches> tag.
   - Format of <branches>:
     <branches>
     [Action 1]
     [Action 2]
     [Action 3]
     </branches>
7. **No Leakage (CRITICAL)**: 
   - Absolutely DO NOT explain system tags.
   - **MANDATORY**: Do NOT leak any English instructions, reinforcement prompts, or system keywords into the final response to the player. These steps MUST be processed internally in "thinking" and NEVER appear in the final response.
   - All progress check notes, word count goals, segments (from word_count module) MUST be placed inside <thinking> tags and ABSOLUTELY MUST NOT appear outside these tags or in <content> tags.
   - If you use a "Cognitive Orchestration" or "Core Activation" sequence, it MUST be inside <thinking> tags. Any such text found outside <thinking> is a CRITICAL FAILURE.
     - All world status information MUST be updated via the <tableEdit> tag in LSR format (#ID Name|0:Val|1:Val).
     - **LSR Data Removal (CRITICAL)**: If a character dies, an item is consumed/lost, a quest is removed, or a buff expires, you MUST explicitly remove it from the corresponding LSR table. To remove an entry, output its primary key (column 0) and set one of the other columns to exactly "REMOVE". Example: #6 Túi đồ|0:Quả táo|1:REMOVE hoặc #12 Hiệu ứng|0:Độc|1:REMOVE.
    - **LSR Timeline Tracking (CRITICAL)**:
     - You MUST track major world occurrences in table "#10 Timeline Sự kiện Thế giới" (These are WORLD/GLOBAL events, NOT specific to the Main Character).
     - You MUST track the main character's personal milestones/arcs in table "#15 Timeline Nhân Vật Chính" (Specific exclusively to the Main Character's life).
     - Whenever a significant event happens, add a new row to the corresponding timeline table. Format for #15: #15 Timeline Nhân Vật Chính|0:ARC xxx|1:DD/MM/YYYY|2:Name - Age|3:Event summary
   - Example of standard LSR format:
     <tableEdit>
     #0 Thông tin Hiện tại|0:10:30 AM, 15/04/1204|1:Có mây rải rác|2:Bữa tiệc trà|3:Căng thẳng, ngột ngạt
     #1 Nhân vật Gần đây|0:Trần Thiên Vũ|1:0|2:Đàm phán ngoại giao|3:5 mét|4:Đang ngồi|5:Lạnh lùng|6:Bình thường|7:Đồ âu phục tinh xảo|8:Cốc trà|9:Sử dụng "Thần kỹ Diễn xuất"
     #15 Timeline Nhân Vật Chính|0:ARC Mở đầu|1:15/04/1204|2:Thiên Vũ - 18 tuổi|3:Bắt đầu tham gia bữa tiệc trà định mệnh
     </tableEdit>
8. **End of Response**: After closing the </branches> tag, you MUST stop the response immediately. Absolutely DO NOT write any additional text, notes, or instructions after this tag.
9. **Cumulative Summary (MANDATORY)**:
   - After each response, you MUST update the cumulative summary (Incremental Summary) of the entire story up to the current moment.
   - This summary must include the most important events so far, plus what just happened in this turn.
   - **Length Requirement**: MUST list from 8 to 15 most important events/details.
   - **Style Requirement**: Use BULLET POINTS format to summarize events clearly, concisely but fully. This is extremely important because the main response can be very long (5,000 - 15,000 words).
   - This summary MUST be placed in <incrementalSummary></incrementalSummary> tags.
   - This tag must be after the </content> tag and before the <branches> tag.
10. **Structural Markers (BẮT BUỘC)**:
    - BẮT ĐẦU thẻ <content> bằng dấu mốc [BẮT ĐẦU PHẦN TRUYỆN] trên một dòng riêng biệt.
    - Sử dụng --- (ba dấu gạch ngang) trên một dòng riêng biệt để phân tách các thay đổi cảnh lớn hoặc bước nhảy thời gian trong <content>.
    - Ở CUỐI CÙNG của thẻ <content>, ngay trước thẻ đóng </content>, bạn PHẢI viết dấu mốc [KẾT THÚC PHẦN TRUYỆN] trên một dòng riêng. Đây là ranh giới cứng để ngăn rò rỉ nội dung vào các thẻ sau đó.
    - TUYỆT ĐỐI KHÔNG đặt các dấu mốc cấu trúc này bên trong thẻ <branches>. Thẻ <branches> CHỈ được chứa các lựa chọn hành động thực sự.
</TECHNICAL_FORMATTING_RULES>`,
    source: "TechnicalRules",
  });

  // 5. Status & Time Instruction
  if (contextItems.timeSystem) {
    const timeString = gameTime ? formatGameTime(gameTime) : "Unknown";
    segments.push({
      priority: POSITION_PRIORITY["bottom"],
      order: -10,
      content: `
=== TIME SYSTEM (IMPORTANT) ===
- Current game time: ${timeString}
- Current turn: ${turnCount}

TIME & ACTION DIRECTIVE:
1. You are the ONLY one who decides the time elapsed for each player action.
2. **NARRATIVE CONSISTENCY**: You MUST ensure the story content (atmosphere, lighting, character activities, environment) strictly matches the "Current game time" provided above. 
   - Pay close attention to the day of the week (e.g., "Thứ Hai", "Chủ Nhật") provided in the "Current game time". If the day of the week is important for the story (e.g., a market day, a religious festival), you MUST respect it.
   - If it's night, describe the darkness, stars, or artificial lights. 
   - If it's morning, describe the sunrise or the world waking up.
   - Adjust the mood and sensory details to fit the specific hour and date.
3. SPECIAL NOTE: If the current time is "January 01, 2024", this is a TEMPORARY (placeholder) timestamp. 
   - In the FIRST response, you MUST choose a suitable starting timestamp based on the world context.
   - Use the <set_time>year|month|day|hour|minute</set_time> tag to set this starting point. Example: <set_time>1250|12|25|06|30</set_time>.
4. For subsequent turns, determine the minutes spent based on the action and return the <time_cost>X</time_cost> tag at the end of the response.
5. BRANCHING RULES (<branches>):
   - You MUST provide at least 3-4 next action choices inside the <branches></branches> tags. You can create more action choices if necessary (up to 6-8) to provide more variety and depth.
   - **CHOICE LOGIC (CRITICAL)**: Create actions based on the events that just occurred.
   - **PLAYER-CENTRIC ONLY**: Every choice MUST be an action that the PLAYER (MC) can take. 
   - **NO NARRATIVE**: Absolutely DO NOT include narrative descriptions of NPC actions, environment changes, or character feelings as choices. (e.g., DO NOT use "The villagers are angry..." as a choice).
   - **ACTION FORMAT (CRITICAL)**: Every choice MUST start with a time cost in brackets followed by a detailed compound action (at least 2 actions per choice).
   - **TIME COST REQUIRED**: Each choice MUST be accompanied by an estimated time: "[minutes] Action A and Action B". (e.g., "[10] Search the room for clues and try to unlock the safe", "[5] Talk to the guard and offer him a bribe"). Choices without [minutes] will be filtered out and NOT shown to the player.
   - **DETAIL & PROGRESSION**: Action content MUST be detailed, creative, and suggestive of a sequence of actions (opening up new possibilities and branching paths).
   - Each choice MUST be accompanied by an estimated time: "[minutes] Action A and Action B".
   - **STRICT SEPARATION**: The <branches> tag is ONLY for action choices. NEVER put story narrative, descriptions, dialogue, or LSR DATA (like #0 Thông tin Hiện tại|0:...) inside the <branches> tag. All story content MUST be in the <content> tag.
   - **IMPORTANT WARNING**: Absolutely DO NOT nest any other system tags (such as <set_time>, <time_cost>, <finish>) inside the <branches> tags.
   - You MUST close the </branches> tag immediately after listing the choices.
   - Standard structure example:
     <content>
     (Story content here...)
     </content>
     <time_cost>15</time_cost>
     <branches>
     [15] Persuade the guard...
     [30] Find a way around the alley...
     </branches>
6. Always end the response by providing all necessary system tags in order: </content> -> <time_cost> -> <set_time> (if needed) -> <branches>.
`,
      source: "GameStatus",
    });
  }

  // INJECT REINFORCEMENT INSTRUCTION HERE (CONTEXT DRIFT FIX)
  if (contextItems.reinforcement) {
    const reinforcement = getReinforcementInstruction(turnCount);
    segments.push({
      priority: POSITION_PRIORITY["final"],
      order: 100,
      content: reinforcement,
      source: "Reinforcement",
    });
  }

  // Module injection handled previously!

  const replaceVariables = (text: string, depth = 0): string => {
    if (depth > 5) return text;

    let processed = text;
    let hasMatch = false;

    // Xử lý comment
    const commentRegex = /\{\{\/\/.*?\}\}/g;
    processed = processed.replace(commentRegex, () => {
      hasMatch = true;
      return "";
    });

    // Xử lý setvar
    const setvarRegex = /\{\{(self)?setvar::(.*?)::([\s\S]*?)\}\}/g;
    processed = processed.replace(setvarRegex, (match, prefix, key, val) => {
      hasMatch = true;
      const cleanKey = key.trim();
      variables[cleanKey] = val;
      return "";
    });
    // Xử lý addvar
    const addvarRegex = /\{\{addvar::(.*?)::([\s\S]*?)\}\}/g;
    processed = processed.replace(addvarRegex, (match, key, val) => {
      hasMatch = true;
      const cleanKey = key.trim();
      variables[cleanKey] = (variables[cleanKey] || "") + val;
      return "";
    });

    // Xử lý global var
    const setGlobalvarRegex = /\{\{setglobalvar::(.*?)::([\s\S]*?)\}\}/g;
    processed = processed.replace(setGlobalvarRegex, (match, key, val) => {
      hasMatch = true;
      const cleanKey = key.trim();
      variables[cleanKey] = val;
      return "";
    });

    // Xử lý random
    const randomRegex = /\{\{(self)?random::(.*?)\}\}/g;
    processed = processed.replace(randomRegex, (match, prefix, args) => {
      hasMatch = true;
      const options = args.split('::');
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    });

    // Xử lý macro rác
    const trimRegex = /\{\{trim\}\}/g;
    processed = processed.replace(trimRegex, () => {
      hasMatch = true;
      return "";
    });

    const stRegex = /\{\{([^:]*?)\}\}/g;
    processed = processed.replace(stRegex, (match, key) => {
      if (key.includes("::")) return match;

      const cleanKey = key.trim();
      // Nếu đã định nghĩa var thì trả về, nếu không xóa đi để không có code rác trong system prompt
      if (variables[cleanKey] !== undefined) {
        hasMatch = true;
        return variables[cleanKey];
      }
      return match;
    });

    const tawaRegex = /\{\{(getvar|getglobalvar)::(.*?)\}\}/g;
    processed = processed.replace(tawaRegex, (match, type, key) => {
      hasMatch = true;
      const cleanKey = key.trim();

      const resolvePath = (obj: any, path: string) => {
        return path.split(".").reduce((acc, part) => acc && acc[part], obj);
      };

      if (type === "getglobalvar") {
        const gt = appSettings?.tavoGlobalVars
          ? resolvePath(appSettings.tavoGlobalVars, cleanKey)
          : undefined;
        if (gt !== undefined) return String(gt);
      } else {
        const t = resolvePath(tavoChatVars, cleanKey);
        if (t !== undefined) return String(t);
      }

      return variables[cleanKey] !== undefined ? variables[cleanKey] : "";
    });

    if (hasMatch) {
      return replaceVariables(processed, depth + 1);
    }
    return processed;
  };

  // --- BƯỚC 5: SẮP XẾP & KẾT XUẤT ---

  // Sort and assemble each role's segments
  const processSegments = (segs: PromptSegment[]) => {
    segs.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority comes first
      }
      return (a.order || 0) - (b.order || 0); // Lower order comes first
    });

    // Resolve variables
    segs.forEach((seg) => {
      seg.content = ContextCompressor.cleanText(replaceVariables(seg.content));
    });

    return segs
      .map((s) => s.content)
      .filter((c) => c.trim().length > 0)
      .join("\n\n");
  };

  const systemPrompt = processSegments(segments);
  const postHistoryUser = processSegments(userSegments);
  const prefillAssistant = processSegments(assistantSegments);
  const rawFewShot = fewShotExamples.length > 0 ? fewShotExamples.join("\n\n") : "";
  const fewShotBlock = rawFewShot ? ContextCompressor.cleanText(replaceVariables(rawFewShot)) : "";

  return { systemPrompt, postHistoryUser, prefillAssistant, fewShotBlock };
};

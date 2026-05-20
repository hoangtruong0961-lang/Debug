
import { GoogleGenAI } from "@google/genai";
import { AppSettings } from "../../types";

// SAFELY override fetch using defineProperty to handle "only a getter" environments
const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => async (...args: [RequestInfo | URL, RequestInit?]) => {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : (resource as Request).url;
      
      const RETRYABLE_STATUS_CODES = [401, 429, 502, 503, 504];
      const MAX_RETRIES = 3;
      
      const performFetch = async (targetUrl: string, targetConfig: RequestInit | undefined, attempt: number = 0): Promise<Response> => {
        try {
          const response = await originalFetch(targetUrl, targetConfig);
          
          if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES) {
            const delay = response.status === 401 ? 2000 : Math.pow(2, attempt + 1) * 1000;
            // console.log(`%c[Fetch Guard] 🔄 Thử lại lần ${attempt + 1}/${MAX_RETRIES} (Status: ${response.status}) sau ${delay}ms...`, "color: #f59e0b; font-weight: bold;");
            await new Promise(resolve => setTimeout(resolve, delay));
            return performFetch(targetUrl, targetConfig, attempt + 1);
          }
          
          return response;
        } catch (error) {
          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt + 1) * 1000;
            // console.log(`%c[Fetch Guard] 🌐 Lỗi mạng, thử lại lần ${attempt + 1}/${MAX_RETRIES} sau ${delay}ms...`, "color: #ef4444; font-weight: bold;");
            await new Promise(resolve => setTimeout(resolve, delay));
            return performFetch(targetUrl, targetConfig, attempt + 1);
          }
          throw error;
        }
      };

      // Check if this is a Google AI request
      if (url.includes('generativelanguage.googleapis.com')) {
        const proxyUrl = (window as Window & { __GEMINI_PROXY_URL__?: string | null }).__GEMINI_PROXY_URL__;
        
        if (proxyUrl) {
          // Strip /v1 or /v1beta from the end of proxyUrl if present
          const cleanProxy = proxyUrl.trim().replace(/\/+$/, '').replace(/\/v1beta$|\/v1$/, '');
          const newUrl = url.replace('https://generativelanguage.googleapis.com', cleanProxy);
          
          // console.log(`%c[Fetch Guard] 🛡️ Redirecting to Proxy: ${newUrl.substring(0, 80)}...`, "color: #f59e0b; font-weight: bold;");
          
          // Ensure headers are set correctly for the proxy
          const newConfig = { ...config };
          if (newConfig.headers) {
            const headers = new Headers(newConfig.headers);
            // Some proxies need the key in Authorization header
            const apiKey = headers.get('x-goog-api-key');
            if (apiKey && !headers.has('Authorization')) {
              headers.set('Authorization', `Bearer ${apiKey}`);
            }
            newConfig.headers = headers;
          }
          
          return performFetch(newUrl, newConfig);
        }
      }

      return performFetch(url, config);
    }
  });
} catch (e) {
  console.error("[AI Client] Không thể ghi đè fetch toàn cục, đang sử dụng fallback SDK.", e);
}

// Global counter for sequential API key rotation
let currentKeyIndex = 0;

// Helper to get configured AI instance
export const getAiClient = (settings?: AppSettings, forceDirect: boolean = false) => {
  // Get active proxy from the new system
  let activeProxy = settings?.proxies?.find(p => p.id === settings.activeProxyId);
  
  // If no active proxy found in the new system OR legacy proxyEnabled is true with legacy fields populated,
  // we might want to use legacy. But let's prioritize the new system if a proxy is explicitly selected.
  if (!activeProxy && (settings?.proxyEnabled || settings?.proxyUrl)) {
    activeProxy = {
      id: 'legacy',
      name: settings?.proxyName || 'Legacy Proxy',
      url: settings?.proxyUrl || '',
      key: settings?.proxyKey || '',
      model: settings?.proxyModel || '',
      models: settings?.proxyModels || [],
      isActive: true,
      type: (settings?.proxyUrl?.includes('moonshot') || settings?.proxyUrl?.includes('kimi')) ? 'openai' : (settings?.proxyEnabled ? 'openai' : 'google')
    };
  }

  // FIX: useProxy should be true if we have a valid activeProxy with URL and Key, regardless of legacy proxyEnabled toggle
  const useProxy = !!activeProxy?.url && !!activeProxy?.key && !forceDirect;

  // Set global proxy URL for the fetch override (only for Google AI)
  if (useProxy && activeProxy && (activeProxy.type === 'google' || !activeProxy.type)) {
    (window as Window & { __GEMINI_PROXY_URL__?: string | null }).__GEMINI_PROXY_URL__ = activeProxy.url;
  } else {
    (window as Window & { __GEMINI_PROXY_URL__?: string | null }).__GEMINI_PROXY_URL__ = null;
  }

  // Priority: Proxy Key > Personal API Key > System API Key
  let apiKey: string = "";
  let source = "SYSTEM";
  
  if (useProxy && activeProxy) {
    apiKey = activeProxy.key;
    source = `PROXY (${activeProxy.name})`;
  } else if (settings?.useGeminiApi !== false && settings?.geminiApiKey && Array.isArray(settings.geminiApiKey)) {
    const keys = settings.geminiApiKey.filter(k => k && k.trim() !== "" && k !== "YOUR_API_KEY");
    if (keys.length > 0) {
        const index = currentKeyIndex % keys.length;
        apiKey = keys[index];
        source = `PERSONAL_LIST (Key #${index + 1})`;
        currentKeyIndex = (index + 1) % keys.length;
    }
  }

  if (!apiKey) {
    apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
    source = process.env.API_KEY ? "AISTUDIO_SELECTED" : "SYSTEM_ENV";
  }

  // --- OPENAI COMPATIBILITY WRAPPER ---
  // Auto-detect OpenAI type if model name looks like one, even if type is 'google'
  const modelToTest = (activeProxy?.model || settings?.aiModel || "").toLowerCase();
  const isGeminiModel = modelToTest.includes('gemini') || modelToTest.includes('learnlm');
  
  // If we have a proxy URL and it's NOT a Gemini model, we should almost always use the OpenAI wrapper
  // because most third-party proxies for non-Gemini models use OpenAI format.
  const isKimi = activeProxy?.url?.includes('moonshot') || activeProxy?.url?.includes('kimi') || modelToTest.includes('kimi');
  const isOpenAIModel = modelToTest.includes('gpt') || modelToTest.includes('claude') || modelToTest.includes('kimi') || modelToTest.includes('moonshot') || modelToTest.includes('deepseek') || modelToTest.includes('qwen') || modelToTest.includes('grok');
  
  const effectiveType = (useProxy && activeProxy) 
    ? (activeProxy.type || ((isOpenAIModel || isKimi || !isGeminiModel) ? 'openai' : 'google')) 
    : 'google';

  if (useProxy && activeProxy && (effectiveType === 'openai' || effectiveType === 'openrouter')) {
    const baseUrl = activeProxy.url.trim().replace(/\/+$/, '');
    
    return {
      models: {
        generateContent: async (params: any) => {
          const { model, contents, config } = params;
          const systemInstruction = config?.systemInstruction;
          
          // Convert Gemini contents to OpenAI messages
          const messages: any[] = [];
          if (systemInstruction) {
            messages.push({ role: 'system', content: typeof systemInstruction === 'string' ? systemInstruction : (systemInstruction.parts?.[0]?.text || '') });
          }
          
          let contentsArray: any[] = [];
          if (typeof contents === 'string') {
            contentsArray = [{ role: 'user', parts: [{ text: contents }] }];
          } else if (Array.isArray(contents)) {
            contentsArray = contents;
          } else if (contents && typeof contents === 'object') {
            contentsArray = [contents];
          }

          const rawMessages = contentsArray.map((c: any) => {
            if (typeof c === 'string') {
              return { role: 'user', content: c };
            }
            if (c && typeof c === 'object' && c.text) {
              return { role: 'user', content: c.text };
            }
            return {
              role: c?.role === 'model' || c?.role === 'assistant' ? 'assistant' : 'user',
              content: c?.parts?.[0]?.text || c?.text || ''
            };
          });

          // OpenAI CRITICAL: The last message MUST be 'user' for most proxies/models.
          if (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === 'assistant') {
            const lastAssistantMsg = rawMessages.pop();
            if (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === 'user') {
              rawMessages[rawMessages.length - 1].content += `\n\n[IMPORTANT: START your response exactly with: ${lastAssistantMsg.content}]`;
            } else {
              rawMessages.push(lastAssistantMsg);
            }
          }

          rawMessages.forEach((msg: any) => messages.push(msg));

          const body: any = {
            model: model || activeProxy?.model || settings?.aiModel || "gemini-3.1-pro-preview",
            messages: messages,
            temperature: config?.temperature ?? settings?.temperature ?? 1.0,
            max_tokens: config?.maxOutputTokens || 4096,
            top_p: config?.topP,
            frequency_penalty: config?.frequencyPenalty,
            presence_penalty: config?.presencePenalty,
            repetition_penalty: config?.repetitionPenalty,
            min_p: config?.minP,
            top_a: config?.topA,
            stream: false
          };

          const lowerModel = body.model.toLowerCase();
          const isThinkingModel = lowerModel.includes('kimi') || lowerModel.includes('thinking') || lowerModel.includes('o1') || lowerModel.includes('o3');
          if (isThinkingModel && (!body.max_tokens || body.max_tokens < 8192)) {
            body.max_tokens = 16384; 
          }

          if (config?.responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };

          if (effectiveType === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'Tawa SillyTavern';
          }

          const response = await fetch('/api/ai/proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ark-client': 'ark-v2-client'
            },
            body: JSON.stringify({
              url: `${baseUrl}/chat/completions`,
              method: 'POST',
              headers: headers,
              body: body
            })
          });

          if (!response.ok) {
            const err = await response.text();
            if (response.status === 402) {
              throw new Error("PAYMENT_REQUIRED: Model này yêu cầu API Key có trả phí (Paid Tier) hoặc đã hết hạn mức miễn phí. Vui lòng chọn API Key khác trong Cài đặt.");
            }
            throw new Error(`Proxy Error (${response.status}): ${err || response.statusText}`);
          }

          const data = await response.json();
          const text = data.choices?.[0]?.message?.content || "";
          
          return {
            text: text,
            usageMetadata: data.usage ? {
              promptTokenCount: data.usage.prompt_tokens,
              candidatesTokenCount: data.usage.completion_tokens,
              totalTokenCount: data.usage.total_tokens
            } : undefined
          };
        },
        generateContentStream: async function* (params: any) {
          const { model, contents, config } = params;
          const systemInstruction = config?.systemInstruction;
          
          const messages: any[] = [];
          if (systemInstruction) {
            messages.push({ role: 'system', content: typeof systemInstruction === 'string' ? systemInstruction : (systemInstruction.parts?.[0]?.text || '') });
          }
          
          let contentsArray: any[] = [];
          if (typeof contents === 'string') {
            contentsArray = [{ role: 'user', parts: [{ text: contents }] }];
          } else if (Array.isArray(contents)) {
            contentsArray = contents;
          } else if (contents && typeof contents === 'object') {
            contentsArray = [contents];
          }

          const rawMessages = contentsArray.map((c: any) => {
            if (typeof c === 'string') {
              return { role: 'user', content: c };
            }
            if (c && typeof c === 'object' && c.text) {
              return { role: 'user', content: c.text };
            }
            return {
              role: c?.role === 'model' || c?.role === 'assistant' ? 'assistant' : 'user',
              content: c?.parts?.[0]?.text || c?.text || ''
            };
          });

          if (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === 'assistant') {
            const lastAssistantMsg = rawMessages.pop();
            if (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === 'user') {
              rawMessages[rawMessages.length - 1].content += `\n\n[IMPORTANT: START your response exactly with: ${lastAssistantMsg.content}]`;
            } else {
              rawMessages.push(lastAssistantMsg);
            }
          }

          rawMessages.forEach((msg: any) => messages.push(msg));

          const body: any = {
            model: model || activeProxy?.model || settings?.aiModel || "gemini-3.1-pro-preview",
            messages: messages,
            temperature: config?.temperature ?? settings?.temperature ?? 0.7,
            max_tokens: config?.maxOutputTokens || 4096,
            top_p: config?.topP,
            frequency_penalty: config?.frequencyPenalty,
            presence_penalty: config?.presencePenalty,
            repetition_penalty: config?.repetitionPenalty,
            min_p: config?.minP,
            top_a: config?.topA,
            stream: true,
            stream_options: { include_usage: true }
          };

          const lowerModel = body.model.toLowerCase();
          const isThinkingModel = lowerModel.includes('kimi') || lowerModel.includes('thinking') || lowerModel.includes('o1') || lowerModel.includes('o3');
          if (isThinkingModel && (!body.max_tokens || body.max_tokens < 8192)) {
            body.max_tokens = 16384; 
          }

          if (config?.responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };

          if (effectiveType === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'Tawa SillyTavern';
          }

          const response = await fetch('/api/ai/proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ark-client': 'ark-v2-client'
            },
            body: JSON.stringify({
              url: `${baseUrl}/chat/completions`,
              method: 'POST',
              headers: headers,
              body: body
            })
          });

          if (!response.ok) {
            const err = await response.text();
            if (response.status === 402) {
              throw new Error("PAYMENT_REQUIRED: Model này yêu cầu API Key có trả phí (Paid Tier) hoặc đã hết hạn mức miễn phí. Vui lòng chọn API Key khác trong Cài đặt.");
            }
            throw new Error(`OpenAI Stream Proxy Error (${response.status}): ${err}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("Không thể khởi tạo stream reader");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
              const cleanLine = line.trim();
              if (!cleanLine || cleanLine === 'data: [DONE]') continue;
              if (cleanLine.startsWith('data: ')) {
                try {
                  const json = JSON.parse(cleanLine.substring(6));
                  const content = json.choices?.[0]?.delta?.content || "";
                  const usage = json.usage;
                  
                  if (content) {
                    yield { text: content };
                  }
                  
                  if (usage) {
                    yield { 
                      usageMetadata: {
                        promptTokenCount: usage.prompt_tokens,
                        candidatesTokenCount: usage.completion_tokens,
                        totalTokenCount: usage.total_tokens
                      }
                    };
                  }
                } catch (e) {
                  // Ignore parse errors for partial chunks
                }
              }
            }
          }
        }
      }
    } as any;
  }

  const requestOptions: { headers?: Record<string, string> } = {};
  let baseUrl: string | undefined = undefined;
  
  if (useProxy && activeProxy) {
    // Sanitize proxy URL (remove trailing slash and common version suffixes)
    baseUrl = activeProxy.url.trim().replace(/\/+$/, '');
    
    // SDK appends version (e.g. /v1beta) automatically. 
    // If user provided it, remove it to avoid double versioning (e.g. /v1beta/v1beta)
    if (baseUrl.endsWith('/v1beta')) {
      baseUrl = baseUrl.slice(0, -7);
    } else if (baseUrl.endsWith('/v1')) {
      baseUrl = baseUrl.slice(0, -3);
    }
    
    // Some proxies require Authorization header instead of x-goog-api-key
    requestOptions.headers = {
      'Authorization': `Bearer ${apiKey}`,
      // Keep x-goog-api-key for standard Gemini proxies
      'x-goog-api-key': apiKey
    };
  }

  // CRITICAL: baseUrl/baseURL must be at the top level of the config object for @google/genai SDK
  // We provide both to be safe across different SDK versions
  const genAIConfig: Record<string, unknown> = {
    apiKey: apiKey,
  };

  if (!apiKey && !baseUrl) {
    console.error(`%c[AI Client] ❌ KHÔNG TÌM THẤY API KEY! (Source: ${source})`, "color: #ef4444; font-weight: bold;");
  } else {
    // const maskedKey = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "NONE";
    // console.log(`%c[AI Client] 🔑 Sử dụng key từ: ${source} (${maskedKey})`, "color: #10b981; font-weight: bold;");
  }

  if (baseUrl) {
    // console.log(`%c[AI Client] 🌐 Đang cấu hình PROXY: ${baseUrl}`, "color: #38bdf8; font-weight: bold;");
    
    // Set at top level - @google/genai uses baseURL (uppercase URL)
    genAIConfig.baseURL = baseUrl;
    genAIConfig.baseUrl = baseUrl;
    genAIConfig.apiEndpoint = baseUrl;
    
    // Set inside requestOptions as well for redundancy
    genAIConfig.requestOptions = {
      ...requestOptions,
      baseURL: baseUrl,
      baseUrl: baseUrl,
      apiEndpoint: baseUrl,
      customHeaders: requestOptions.headers,
      fetch: (url: string, options: RequestInit) => {
        // If it's a relative URL or already contains the proxy, let it be
        if (url.startsWith('/api/')) return fetch(url, options);
        
        let targetUrl = url;
        const googleBase = 'https://generativelanguage.googleapis.com';
        if (url.startsWith(googleBase)) {
          targetUrl = url.replace(googleBase, baseUrl!);
        }

        // Use local backend proxy to bypass CORS
        return fetch('/api/ai/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ark-client': 'ark-v2-client'
          },
          body: JSON.stringify({
            url: targetUrl,
            method: options.method || 'POST',
            headers: options.headers,
            body: options.body ? JSON.parse(options.body as string) : undefined
          })
        });
      }
    };

    // Task: Force fetch to use the proxy URL by overriding the global fetch if necessary
    // but for now we rely on the SDK's apiEndpoint property which is most reliable
  } else {
    // console.log("%c[AI Client] 🔑 Đang sử dụng API KEY TRỰC TIẾP", "color: #10b981; font-weight: bold;");
    if (Object.keys(requestOptions).length > 0) {
      genAIConfig.requestOptions = requestOptions;
    }
  }

  const googleAi = new GoogleGenAI(genAIConfig);

  // Mẹo: Bọc lại method generateContent để xóa các thông số không tương thích với Gemini Native
  // nếu dùng preset có chứa repetitionPenalty, minP, topA... sẽ làm API báo lỗi INVALID_ARGUMENT
  const cleanGoogleParams = (params: any) => {
    const newParams = { ...params };
    
    // 0. Handle model trailing prefill logic for Gemini SDK to prevent Validation Error
    if (newParams.contents && Array.isArray(newParams.contents)) {
       const contents = [...newParams.contents];
       if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
           const lastModelContent = contents.pop();
           
           if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
               const prefillText = lastModelContent?.parts?.[0]?.text;
               if (prefillText) {
                 const lastUserContent = { ...contents[contents.length - 1] };
                 const lastUserParts = [...lastUserContent.parts];
                 const currentText = lastUserParts[0].text;
                 lastUserParts[0] = { text: currentText + `\n\n[IMPORTANT: START your response exactly with: ${prefillText}]` };
                 lastUserContent.parts = lastUserParts;
                 contents[contents.length - 1] = lastUserContent;
               }
           } else {
               contents.push(lastModelContent);
           }
       }
       newParams.contents = contents;
    }

    if (!newParams?.config) return newParams;
    const newConfig = { ...newParams.config };
    
    // 1. Xóa các trường của OpenAI/OpenRouter không được Gemini API Native hỗ trợ
    delete newConfig.repetitionPenalty;
    delete newConfig.minP;
    delete newConfig.topA;
    delete newConfig.frequencyPenalty;
    delete newConfig.presencePenalty;
    
    // Tránh gửi undefined keys (Gemini API serialize JSON đôi khi nhạy cảm)
    Object.keys(newConfig).forEach(key => {
        if (newConfig[key] === undefined) {
            delete newConfig[key];
        }
    });

    // 2. Xử lý model Gemini Thinking
    const lowerModel = (params.model || '').toLowerCase();
    const isThinkingModel = lowerModel.includes('thinking') || lowerModel.includes('gemini-2.0-pro') || lowerModel.includes('gemini-3.1-pro');
    
    if (isThinkingModel) {
        // Models như gemini-2.0-flash-thinking-exp-01-21 CẤM cấu hình temperature, topP, topK, etc...
        delete newConfig.temperature;
        delete newConfig.topP;
        delete newConfig.topK;
        delete newConfig.presencePenalty;
        delete newConfig.frequencyPenalty;
        
        // thinkingBudgetTokens phải >= 1024
        if (newConfig.thinkingConfig?.thinkingBudgetTokens && newConfig.thinkingConfig.thinkingBudgetTokens < 1024) {
             delete newConfig.thinkingConfig; // Hủy cấu hình nếu budget < 1024 để tránh lỗi API
        }
    } else {
        // Nếu không phải thinking model của Google thì xóa trường thinkingConfig
        delete newConfig.thinkingConfig;
    }

    return { ...params, config: newConfig };
  };

  const wrapMethod = (originalMethod: Function) => {
     return async function(params: any) {
         return originalMethod.call(googleAi.models, cleanGoogleParams(params));
     };
  };

  const wrapStreamMethod = (originalMethod: Function) => {
     return async function*(params: any) {
         yield* await originalMethod.call(googleAi.models, cleanGoogleParams(params));
     };
  };

  return {
    ...googleAi,
    models: {
        ...googleAi.models,
        generateContent: wrapMethod(googleAi.models.generateContent),
        generateContentStream: wrapStreamMethod(googleAi.models.generateContentStream)
    }
  } as GoogleGenAI;
};

// Default instance for backward compatibility (uses env key)
const defaultKey = process.env.GEMINI_API_KEY || "no-key";
export const ai = new GoogleGenAI({ apiKey: defaultKey });

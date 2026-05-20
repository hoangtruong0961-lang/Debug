import express from "express";
import cors from "cors";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // AI Proxy Endpoint to bypass CORS
  app.post("/api/ai/proxy", async (req, res) => {
    // Basic auth check to prevent random abuse
    const authHeader = req.headers['x-ark-client'] || req.query?.client;
    if (authHeader !== 'ark-v2-client' && process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Thường dân không thể gọi trực tiếp API này." });
    }

    const { url, method, headers, body } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Missing URL for proxy" });
    }

    try {
      // console.log(`[Backend Proxy] 🚀 Forwarding request to: ${url}`);
      
      const response = await axios({
        url,
        method: method || 'POST',
        headers: {
          ...headers,
          // Remove host header to avoid issues with some proxies
          'host': undefined,
          'referer': undefined,
          'origin': undefined
        },
        data: body,
        responseType: body?.stream ? 'stream' : 'json',
        validateStatus: () => true // Don't throw on error status codes
      });

      // Forward headers from the target response
      Object.entries(response.headers).forEach(([key, value]) => {
        if (value) res.setHeader(key, value);
      });

      res.status(response.status);

      if (body?.stream) {
        response.data.pipe(res);
      } else {
        res.json(response.data);
      }
    } catch (error: any) {
      console.error("[Backend Proxy] ❌ Error:", error.message);
      res.status(500).json({ 
        error: "Proxy request failed", 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // AI Debug Assistant Endpoint
  app.post("/api/ai/debug", async (req, res) => {
    const { rawCode, compiledCode, logs, prompt, chatHistory } = req.body;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ 
          error: "Chưa cấu hình API Key cho Gemini (GEMINI_API_KEY). Người chơi cần cài đặt API Key trong cài đặt AI Studio hoặc file cấu hình để kích hoạt trợ lý AI." 
        });
      }

      // Lazy initialize the GoogleGenAI SDK safely
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = `Bạn là một chuyên gia lập trình và trợ lý gỡ lỗi (AI Debugging Agent) hoạt động trong môi trường HTML/JS Sandbox (Iframe).
Nhiệm vụ của bạn là đọc mã nguồn của widget (bao gồm mã thô dạng RAW WIDGET và mã HTML hoàn chỉnh biên dịch trong COMPILED IFRAME) cùng với lịch sử lỗi/Console Log hiện có để phân tích lỗi và đưa ra lời khuyên hoặc sửa đổi code chính xác.

Quy tắc phản hồi:
1. Hãy giao tiếp bằng tiếng Việt thân thiện, rõ ràng, ngắn gọn và tập trung giải quyết lỗi kỹ thuật.
2. Nếu phát hiện lỗi cụ thể trong mã nguồn:
   - Hãy chỉ rõ dòng bị lỗi trong chế độ xem mã nguồn (nếu có thông tin dòng line number từ log).
   - Giải thích ngắn gọn nguyên nhân gây ra lỗi JavaScript, HTML, CSS hoặc thư viện (ví dụ: thiếu thư viện, lỗi cú pháp, binding sai sự kiện, xung đột biến toàn cục).
   - Đưa ra phần mã nguồn đã được sửa lỗi hoàn chỉnh (khoanh trong khối markdown \`\`\`html) để người dùng có thể dễ dàng sao chép và cập nhật lại widget của họ.
3. Khi phân tích Console Logs, bỏ qua các lỗi liên quan tới kết nối WebSocket hay Hot Module Replacement (HMR) mỏ neo, vì đó là lỗi môi trường dev sandbox không ảnh hưởng tới gameplay của widget.
4. Trả lời nhiệt tình các thắc mắc cụ thể khác của người dùng về mã nguồn này.`;

      // Build context and query
      const formattedHistory: any[] = [];
      if (chatHistory && Array.isArray(chatHistory)) {
        chatHistory.forEach((msg: any) => {
          formattedHistory.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        });
      }

      const currentPromptText = `
[MÃ NGUỒN WIDGET GỐC (RAW WIDGET)]
\`\`\`html
${rawCode || ''}
\`\`\`

[HTML HOÀN CHỈNH BÊN TRONG IFRAME (COMPILED IFRAME)]
\`\`\`html
${compiledCode || ''}
\`\`\`

[DANH SÁCH CONSOLE LOG / LỖI GHI NHẬN ĐƯỢC TỪ RUNTIME]
${JSON.stringify(logs || [], null, 2)}

---
Yêu cầu gỡ lỗi hoặc câu hỏi hiện tại từ người chơi:
${prompt || 'Hãy phân tích mã này và gỡ lỗi giúp tôi nếu có bất kỳ vấn đề gì.'}
`;

      formattedHistory.push({
        role: 'user',
        parts: [{ text: currentPromptText }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedHistory,
        config: {
          systemInstruction,
          temperature: 0.3, // lower temperature for more accurate & factual debug suggestions
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("[AI Debug API] Error:", error);
      res.status(500).json({ 
        error: "Có lỗi xảy ra khi kết nối với máy chủ AI gỡ lỗi.", 
        details: error.message 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AI Proxy available at /api/ai/proxy`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

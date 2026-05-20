import express from "express";
import cors from "cors";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

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

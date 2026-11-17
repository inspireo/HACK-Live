import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import OpenAI from "openai";
import identityRoutes, { identityDb } from './server/identity';
import { createInvitationRouters } from './server/invitation-routes';

let openaiClient: OpenAI | null = null;

function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set in environment variables.");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use('/invite', (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next();
  });

  app.use('/api/identity/save-profile', express.json({ limit: '3mb' }));
  app.use(express.json());
  const invitations = createInvitationRouters(identityDb);
  identityRoutes.use(invitations.memberRouter);
  app.use('/api/invitations', invitations.publicRouter);
  app.use('/api/identity', identityRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Photo upload is too large. Choose a photo up to 2 MB.' }); return; }
    if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid profile request.' }); return; }
    next(error);
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ai/generate-teams", async (req, res) => {
    try {
      const { prompt } = req.body;
      const openai = getOpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      res.json(JSON.parse(response.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('OpenAI Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/generate-content", async (req, res) => {
    try {
      const { prompt } = req.body;
      const openai = getOpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      });
      res.json({ text: response.choices[0].message.content });
    } catch (error: any) {
      console.error('OpenAI Error:', error);
      res.status(500).json({ error: error.message });
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
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

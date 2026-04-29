import express from "express";

export function createHybridMcpApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      service: "hybrid-mcp",
      status: "ok",
      coreUrl: process.env.CORE_URL ?? "http://hybrid-core:4111"
    });
  });

  app.get("/core-health", async (_req, res) => {
    const coreUrl = process.env.CORE_URL ?? "http://hybrid-core:4111";
    try {
      const response = await fetch(`${coreUrl}/health`);
      const payload = await response.json();
      res.json({ ok: true, core: payload });
    } catch (error) {
      res.status(502).json({
        ok: false,
        coreUrl,
        error: error instanceof Error ? error.message : "unknown error"
      });
    }
  });

  return app;
}

export async function startHybridMcp() {
  const app = createHybridMcpApp();
  const port = Number(process.env.PORT ?? 4120);
  await new Promise<void>((resolve) => {
    app.listen(port, "0.0.0.0", () => resolve());
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startHybridMcp();
}

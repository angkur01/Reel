import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { createExpressApp } from './src/server/app.js';
import { loadDb } from './src/server/db.js';
import { startTelegramBotPolling } from './src/server/telegram.js';
import { initializeScheduler, getNextScheduledTime } from './src/server/scheduler.js';

async function startServer() {
  const app = createExpressApp();
  const PORT = 3000;

  // Initialize DB & Scheduler & Telegram Polling
  loadDb();
  
  initializeScheduler();
  startTelegramBotPolling();

  // ----------------------------------------------------
  // VITE & STATIC FILES
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Instagram Reel Tracker running on http://0.0.0.0:${PORT}`);
    console.log(`🕒 Next scheduled automatic fetch: ${getNextScheduledTime().toISOString()}`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});

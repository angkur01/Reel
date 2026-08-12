import { createExpressApp } from '../src/server/app.js';
import { loadDb } from '../src/server/db.js';

// Ensure DB loaded on serverless cold start
loadDb();

const app = createExpressApp();

export default app;

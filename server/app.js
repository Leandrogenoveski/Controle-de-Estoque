// Builds the Express app (routes + middleware only -- no app.listen(), no
// static file serving). Used by both entrypoints:
//   - server/index.js  (local dev: adds static serving + app.listen)
//   - api/index.js      (Vercel: static files are served by Vercel itself;
//                          this app only ever receives /api/* requests there)
const express = require('express');
const cookieParser = require('cookie-parser');
const { readSession } = require('./auth');
const apiRouter = require('./routes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(readSession);
  app.use('/api', apiRouter);

  // Centralized error handler: any route that rejects its promise (see
  // asyncRoute in routes.js) lands here instead of crashing the process.
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };

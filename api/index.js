// Vercel serverless entrypoint. Every request under /api/* is routed here
// by vercel.json's rewrite; this file never handles static assets (those
// live in /public and are served directly by Vercel).
const { createApp } = require('../server/app');

module.exports = createApp();

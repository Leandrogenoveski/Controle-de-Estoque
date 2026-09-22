const path = require('path');
const express = require('express');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = createApp();

// Local development / self-hosting only. On Vercel this "public" folder is
// served directly by the platform (zero-config convention), and this file
// isn't used at all there (see api/index.js).
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

app.listen(PORT, () => {
  console.log('Controle de Estoque - Wap rodando em http://localhost:' + PORT);
});

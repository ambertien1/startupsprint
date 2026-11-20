import express from 'express';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import pino from 'pino';
import { createClassroom } from './server/classroom.mjs';
import { mountVoice } from './server/voice.mjs';

const logger = pino();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1) {
  throw new Error('A valid PORT environment variable is required.');
}
const base = `${(process.env.BASE_PATH || '/').replace(/\/$/, '')}/`;
const app = express();
app.disable('x-powered-by');
const server = createServer(app);
const io = new Server(server, {
  path: `${base}socket.io`,
  maxHttpBufferSize: 16_384,
  serveClient: false,
});

// Lesson transcript and steps (lesson:chunk, task:spoken, steps:new).
createClassroom(io, logger, { base });
mountVoice(app, base);

// Restarting clears all state.
let sentence = { text: '', sentAt: null };

io.on('connection', (socket) => {
  socket.emit('sentence:updated', sentence);
  socket.on('sentence:send', (text, acknowledge) => {
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
      reply({ ok: false, error: 'Enter a sentence between 1 and 2,000 characters.' });
      return;
    }
    sentence = { text: text.trim(), sentAt: new Date().toISOString() };
    io.emit('sentence:updated', sentence);
    reply({ ok: true });
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(base, express.static(path.join(root, 'dist/public'), { index: false }));
  app.get([base, `${base}teacher`, `${base}student`], (_req, res) => {
    res.sendFile(path.join(root, 'dist/public/index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.get([base, `${base}teacher`, `${base}student`], async (req, res, next) => {
    try {
      const template = await readFile(path.join(root, 'index.html'), 'utf8');
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).type('html').send(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

app.use((_req, res) => res.status(404).type('text').send('Page not found'));
app.use((error, _req, res, _next) => {
  logger.error({ err: error }, 'Request failed');
  res.status(500).type('text').send('Something went wrong loading the page.');
});
server.listen(port, '0.0.0.0', () => logger.info({ port }, 'Classroom Link ready'));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    io.close();
    server.close(() => process.exit(0));
  });
}

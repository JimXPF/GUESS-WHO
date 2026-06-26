import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { gameRouter } from './routes/game';
import { leaderboardRouter } from './routes/leaderboard';
import { initDatabase, registerDbShutdownHooks } from './db';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/game', gameRouter);
app.use('/api/leaderboard', leaderboardRouter);

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

async function start() {
  await initDatabase();
  registerDbShutdownHooks();
  console.log('Database initialized');

  app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIp();
    console.log(`API server running at http://0.0.0.0:${PORT}`);
    console.log(`LAN access: http://${ip}:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;

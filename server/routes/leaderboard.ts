import { Router } from 'express';
import { getLeaderboard } from '../services/gameService';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', (_req, res) => {
  try {
    const limit = Number(_req.query.limit) || 20;
    const entries = getLeaderboard(limit);
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

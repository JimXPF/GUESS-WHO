import { Router } from 'express';
import { getDailyLeaderboard, getDailyTodayInfo, getLeaderboard } from '../services/gameService';
import { GameMode, Theme } from '../types';
import { getClientKey } from '../utils/clientKey';

export const leaderboardRouter = Router();

const VALID_THEMES: Theme[] = ['csgo', 'football', 'nba', 'anime', 'pokemon'];
const VALID_MODES: GameMode[] = ['classic-six', 'daily-one'];

leaderboardRouter.get('/', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const gameMode = (req.query.gameMode as GameMode) || 'classic-six';
    const theme = req.query.theme as Theme | undefined;

    if (!VALID_MODES.includes(gameMode)) {
      return res.status(400).json({ error: '无效模式' });
    }
    if (theme && !VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: '无效主题' });
    }

    if (gameMode === 'daily-one') {
      if (!theme) {
        return res.status(400).json({ error: '每日榜需指定主题' });
      }
      const entries = getDailyLeaderboard(theme, limit);
      return res.json(entries);
    }

    const entries = getLeaderboard(limit, gameMode, theme);
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

leaderboardRouter.get('/daily/today', (req, res) => {
  try {
    const theme = req.query.theme as Theme;
    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: '无效主题' });
    }
    res.json(getDailyTodayInfo(theme, getClientKey(req)));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

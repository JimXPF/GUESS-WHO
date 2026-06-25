import { Router } from 'express';
import {
  getGameSession,
  nextQuestion,
  quitGame,
  startGame,
  submitGuess,
} from '../services/gameService';
import { searchCharacters } from '../services/dataLoader';
import { Theme } from '../types';

export const gameRouter = Router();

const VALID_THEMES: Theme[] = ['csgo', 'football', 'nba', 'anime'];

gameRouter.post('/start', (req, res) => {
  try {
    const { playerName, theme } = req.body as {
      playerName?: string;
      theme?: Theme;
    };
    if (!playerName?.trim()) {
      return res.status(400).json({ error: '请输入昵称' });
    }
    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: '请选择有效主题' });
    }
    const session = startGame(playerName, theme);
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

gameRouter.get('/suggest', (req, res) => {
  try {
    const theme = req.query.theme as Theme;
    const q = String(req.query.q || '');
    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: '无效主题' });
    }
    const results = searchCharacters(theme, q, 8);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

gameRouter.post('/guess', (req, res) => {
  try {
    const { sessionId, guessText, characterId } = req.body as {
      sessionId?: string;
      guessText?: string;
      characterId?: string;
    };
    if (!sessionId || !guessText?.trim()) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const result = submitGuess(sessionId, guessText, characterId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

gameRouter.post('/next', (req, res) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId' });
    const session = nextQuestion(sessionId);
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

gameRouter.post('/quit', (req, res) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId' });
    const session = quitGame(sessionId);
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

gameRouter.get('/:sessionId', (req, res) => {
  try {
    const session = getGameSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: '会话不存在' });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

import { Router } from 'express';
import {
  getGameSession,
  getReverseFieldsForSession,
  getReverseValuesForSession,
  nextQuestion,
  quitGame,
  startGame,
  submitGuess,
  submitReverseQuery,
} from '../services/gameService';
import { searchCharacters } from '../services/dataLoader';
import { DailyAlreadyPlayedError, GameMode, ReverseCondition, Theme } from '../types';
import { getClientKey } from '../utils/clientKey';

export const gameRouter = Router();

const VALID_THEMES: Theme[] = ['csgo', 'football', 'nba', 'anime', 'pokemon'];
const VALID_MODES: GameMode[] = [
  'classic-six',
  'daily-one',
  'progressive-hint',
  'reverse-bomb',
];

gameRouter.post('/start', (req, res) => {
  try {
    const { playerName, theme, gameMode } = req.body as {
      playerName?: string;
      theme?: Theme;
      gameMode?: GameMode;
    };
    if (!playerName?.trim()) {
      return res.status(400).json({ error: '请输入昵称' });
    }
    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: '请选择有效主题' });
    }
    const mode =
      gameMode && VALID_MODES.includes(gameMode) ? gameMode : 'classic-six';
    const session = startGame(playerName, theme, mode, getClientKey(req));
    res.json(session);
  } catch (e) {
    if (e instanceof DailyAlreadyPlayedError) {
      return res.status(409).json({
        error: e.message,
        code: e.code,
        sessionId: e.sessionId,
      });
    }
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

gameRouter.get('/reverse-fields', (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || '');
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId' });
    const fields = getReverseFieldsForSession(sessionId);
    res.json({ fields });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'Session not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

gameRouter.get('/reverse-values', (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || '');
    const field = String(req.query.field || '');
    if (!sessionId || !field) {
      return res.status(400).json({ error: '缺少 sessionId 或 field' });
    }
    const values = getReverseValuesForSession(sessionId, field);
    res.json(values);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'Session not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

gameRouter.post('/reverse-query', (req, res) => {
  try {
    const { sessionId, condition } = req.body as {
      sessionId?: string;
      condition?: ReverseCondition;
    };
    if (!sessionId || !condition?.field || !condition?.operator) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const result = submitReverseQuery(sessionId, condition);
    res.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'Session not found') return res.status(404).json({ error: msg });
    if (msg === '提问机会已用完') return res.status(409).json({ error: msg });
    res.status(400).json({ error: msg });
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

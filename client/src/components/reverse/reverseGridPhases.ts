export type ReverseGridPhase = 'idle' | 'bomb' | 'move' | 'resize';

/** 超过此数量时使用更大波次、更短间隔（仍逐波轰炸） */
export const ELIM_BULK_THRESHOLD = 28;

export const ELIM_WAVE_SIZE = 16;
export const ELIM_BULK_WAVE_SIZE = 24;
export const ELIM_WAVE_GAP_MS = 70;
export const ELIM_BULK_WAVE_GAP_MS = 50;
export const ELIM_BOMB_MS = 320;
export const ELIM_BULK_BOMB_MS = 280;
export const ELIM_MOVE_MS = 280;
export const ELIM_RESIZE_MS = 380;

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function isBulkElimination(count: number): boolean {
  return count > ELIM_BULK_THRESHOLD;
}

export function eliminationWaveConfig(count: number) {
  if (isBulkElimination(count)) {
    return {
      waveSize: ELIM_BULK_WAVE_SIZE,
      bombMs: ELIM_BULK_BOMB_MS,
      gapMs: ELIM_BULK_WAVE_GAP_MS,
    };
  }
  return {
    waveSize: ELIM_WAVE_SIZE,
    bombMs: ELIM_BOMB_MS,
    gapMs: ELIM_WAVE_GAP_MS,
  };
}

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlayableCardSummary } from '../../types';
import type { ReverseGridPhase } from './reverseGridPhases';

const COMPACT_MIN_W = 76;
const COMPACT_MIN_H = 44;
const COMFORT_MAX_W = 112;
const COMFORT_MAX_H = 56;

type GridMode = 'compact' | 'fit';

interface GridMetrics {
  mode: GridMode;
  cols: number;
  minW: number;
  minH: number;
  textClass: string;
  gap: number;
}

const COMPACT_METRICS = (gap: number): GridMetrics => ({
  mode: 'compact',
  cols: 0,
  minW: COMPACT_MIN_W,
  minH: COMPACT_MIN_H,
  textClass: 'text-[11px]',
  gap,
});

function metricsEqual(a: GridMetrics, b: GridMetrics): boolean {
  return (
    a.mode === b.mode &&
    a.cols === b.cols &&
    a.minW === b.minW &&
    a.minH === b.minH &&
    a.textClass === b.textClass &&
    a.gap === b.gap
  );
}

function colsForMinWidth(width: number, minW: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (minW + gap)));
}

function gridContentHeight(count: number, cols: number, cellH: number, gap: number): number {
  if (count === 0) return 0;
  const rows = Math.ceil(count / cols);
  return rows * cellH + Math.max(0, rows - 1) * gap;
}

function getMinCols(count: number, isDesktop: boolean): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 3) return isDesktop ? 3 : Math.min(3, count);
  return isDesktop ? Math.min(4, count) : Math.min(3, count);
}

function textClassForCell(cellW: number, cellH: number, mode: GridMode): string {
  if (mode === 'fit' && cellH >= 52 && cellW >= 100) return 'text-sm';
  if (cellW >= 96 || cellH >= 50) return 'text-xs';
  return 'text-[11px]';
}

function computeAdaptiveGridMetrics(
  count: number,
  width: number,
  availHeight: number,
  gap: number,
  isDesktop: boolean
): GridMetrics {
  const compact = COMPACT_METRICS(gap);
  if (count === 0 || width <= 0 || availHeight <= 0) return compact;

  const compactCols = colsForMinWidth(width, COMPACT_MIN_W, gap);
  const compactHeight = gridContentHeight(count, compactCols, COMPACT_MIN_H, gap);
  if (compactHeight > availHeight) return compact;

  const minCols = getMinCols(count, isDesktop);
  const maxCols = Math.min(
    count,
    Math.max(minCols, colsForMinWidth(width, COMPACT_MIN_W, gap))
  );

  let best: GridMetrics | null = null;
  let bestScore = -1;

  for (let cols = maxCols; cols >= minCols; cols--) {
    const rawW = (width - gap * (cols - 1)) / cols;
    const cellW = Math.min(COMFORT_MAX_W, Math.max(COMPACT_MIN_W, rawW));
    const rows = Math.ceil(count / cols);
    const rawH = (availHeight - gap * Math.max(0, rows - 1)) / rows;
    const cellH = Math.min(COMFORT_MAX_H, Math.max(COMPACT_MIN_H, rawH));
    const totalH = gridContentHeight(count, cols, cellH, gap);
    if (totalH > availHeight + 0.5) continue;

    const score = cellW * cellH + cols * 4;
    if (score > bestScore) {
      bestScore = score;
      best = {
        mode: 'fit',
        cols,
        minW: Math.round(cellW),
        minH: Math.round(cellH),
        textClass: textClassForCell(cellW, cellH, 'fit'),
        gap,
      };
    }
  }

  return best ?? compact;
}

function useAdaptiveGridMetrics(count: number, gridPhase: ReverseGridPhase, layoutEpoch: number) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<GridMetrics>(() => COMPACT_METRICS(8));

  useLayoutEffect(() => {
    const root = rootRef.current;
    const scrollEl = root?.parentElement;
    if (!root || !scrollEl) return;

    const smQuery = window.matchMedia('(min-width: 640px)');
    let rafId = 0;
    let pending = false;

    const measure = () => {
      pending = false;
      const gap = smQuery.matches ? 8 : 6;

      if (gridPhase === 'bomb' || gridPhase === 'move') {
        setMetrics((prev) => (metricsEqual(prev, COMPACT_METRICS(gap)) ? prev : COMPACT_METRICS(gap)));
        return;
      }

      const width = root.clientWidth;
      const headerH = headerRef.current?.offsetHeight ?? 32;
      const availHeight = scrollEl.clientHeight - headerH - 8;
      const next = computeAdaptiveGridMetrics(
        count,
        width,
        availHeight,
        gap,
        smQuery.matches
      );
      setMetrics((prev) => (metricsEqual(prev, next) ? prev : next));
    };

    const scheduleMeasure = () => {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(measure);
    };

    measure();
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(scrollEl);
    ro.observe(root);
    if (headerRef.current) ro.observe(headerRef.current);
    smQuery.addEventListener('change', scheduleMeasure);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      smQuery.removeEventListener('change', scheduleMeasure);
    };
  }, [count, gridPhase, layoutEpoch]);

  return { rootRef, headerRef, metrics };
}

interface CardProps {
  card: PlayableCardSummary;
  isEliminated: boolean;
  isAnimating: boolean;
  isDoomed: boolean;
  onClick: (card: PlayableCardSummary) => void;
  minH: number;
  maxW?: number;
  textClass: string;
}

const ReverseCard = memo(function ReverseCard({
  card,
  isEliminated,
  isAnimating,
  isDoomed,
  onClick,
  minH,
  maxW,
  textClass,
}: CardProps) {
  const handleClick = useCallback(() => {
    if (!isEliminated && !isAnimating && !isDoomed) onClick(card);
  }, [card, isAnimating, isEliminated, isDoomed, onClick]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isEliminated || isAnimating || isDoomed}
      title={card.name}
      style={{
        minHeight: minH,
        maxWidth: maxW,
        transition: 'min-height 0.4s ease, max-width 0.4s ease',
      }}
      className={`relative w-full flex items-center justify-center rounded-lg text-center border px-1.5 py-2 ${
        isAnimating
          ? 'reverse-card-bomb border-red-300 pointer-events-none z-10'
          : isDoomed
            ? 'reverse-card-doomed'
            : isEliminated
              ? 'opacity-[0.12] border-gray-200/60 bg-gray-100 text-gray-400 pointer-events-none line-through decoration-gray-400/50'
              : 'border-gray-200/90 bg-white text-gray-800 shadow-sm hover:border-apple-blue/35 hover:bg-apple-blue/[0.03] active:scale-[0.98] cursor-pointer'
      }`}
    >
      {isAnimating && (
        <span className="absolute inset-0 rounded-lg ring-2 ring-red-500/60 animate-pulse pointer-events-none" />
      )}
      <span className={`${textClass} font-semibold leading-snug line-clamp-3 break-all`}>{card.name}</span>
    </button>
  );
});

interface Props {
  pool: PlayableCardSummary[];
  eliminatedIds: Set<string>;
  animatingIds: Set<string>;
  doomedIds: Set<string>;
  bombProgress: { done: number; total: number } | null;
  bombWaveToken: number;
  gridPhase: ReverseGridPhase;
  layoutEpoch: number;
  showSurvivorsOnly: boolean;
  onShowSurvivorsOnlyChange: (v: boolean) => void;
  onCardClick: (card: PlayableCardSummary) => void;
}

function ReverseCardGrid({
  pool,
  eliminatedIds,
  animatingIds,
  doomedIds,
  bombProgress,
  bombWaveToken,
  gridPhase,
  layoutEpoch,
  showSurvivorsOnly,
  onShowSurvivorsOnlyChange,
  onCardClick,
}: Props) {
  const aliveCount = pool.length - eliminatedIds.size;

  const survivorCount = useMemo(
    () => pool.filter((card) => !eliminatedIds.has(card.id)).length,
    [pool, eliminatedIds]
  );

  const visiblePool = useMemo(() => {
    if (!showSurvivorsOnly) return pool;
    return pool.filter(
      (card) =>
        !eliminatedIds.has(card.id) ||
        animatingIds.has(card.id) ||
        doomedIds.has(card.id)
    );
  }, [pool, eliminatedIds, animatingIds, doomedIds, showSurvivorsOnly]);

  const metricsCount =
    gridPhase === 'bomb' || gridPhase === 'move' ? visiblePool.length : survivorCount;

  const { rootRef, headerRef, metrics } = useAdaptiveGridMetrics(
    metricsCount,
    gridPhase,
    layoutEpoch
  );
  const isFit = metrics.mode === 'fit';

  const gridStyle = useMemo(
    () => ({
      gap: metrics.gap,
      gridTemplateColumns: isFit
        ? `repeat(${metrics.cols}, minmax(0, 1fr))`
        : `repeat(auto-fill, minmax(${COMPACT_MIN_W}px, 1fr))`,
      transition:
        gridPhase === 'resize'
          ? 'grid-template-columns 0.4s ease, gap 0.4s ease'
          : undefined,
    }),
    [isFit, metrics.cols, metrics.gap, gridPhase]
  );

  const handleSurvivorsToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onShowSurvivorsOnlyChange(e.target.checked);
    },
    [onShowSurvivorsOnlyChange]
  );

  return (
    <div ref={rootRef} className="h-full flex flex-col min-h-0">
      <div
        ref={headerRef}
        className="shrink-0 flex items-center justify-between gap-2 mb-2"
      >
        <p className="text-[11px] text-apple-gray">
          存活 <span className="font-semibold text-gray-700">{aliveCount}</span> / {pool.length}
        </p>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-apple-blue focus:ring-apple-blue/30 w-3.5 h-3.5"
            checked={showSurvivorsOnly}
            onChange={handleSurvivorsToggle}
          />
          仅展示幸存
        </label>
      </div>
      <div className="relative min-h-0">
        {bombProgress && bombProgress.total > 0 && gridPhase === 'bomb' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center">
            <span className="px-3 py-1 rounded-full bg-red-500/90 text-white text-xs font-semibold shadow-md tabular-nums">
              轰炸中 {bombProgress.done}/{bombProgress.total}
            </span>
          </div>
        )}
        <div
          key={`reverse-grid-${layoutEpoch}`}
          className={`grid w-full content-start ${isFit ? 'justify-items-center' : ''}`}
          style={gridStyle}
        >
          {visiblePool.map((card) => {
            const isAnimating = animatingIds.has(card.id);
            return (
              <div
                key={card.id}
                className={`min-w-0 ${isFit ? 'w-full flex justify-center' : 'w-full'}`}
              >
                <ReverseCard
                  key={isAnimating ? `${card.id}-bomb-${bombWaveToken}` : card.id}
                  card={card}
                  isEliminated={eliminatedIds.has(card.id)}
                  isAnimating={isAnimating}
                  isDoomed={doomedIds.has(card.id)}
                  onClick={onCardClick}
                  minH={metrics.minH}
                  maxW={isFit ? metrics.minW : undefined}
                  textClass={metrics.textClass}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(ReverseCardGrid);

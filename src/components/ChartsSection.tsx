import React, { useId, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DaySummary, PeriodRange, Transaction } from '../types/finance';
import {
  type BreakdownMode,
  getAllMonths,
  groupBreakdown,
} from '../utils/financeEngine';
import {
  CHART_PALETTE,
  formatCompactRp,
  formatDateLabel,
  formatMonthLabel,
  formatRp,
  lastDayOfMonth,
  MONTH_NAMES,
} from '../utils/format';

/* -------------------------------------------------------------------------- */
/* Shared Smooth Curve Helper (Monotone-clamped Bezier, never dips < baseline)*/
/* -------------------------------------------------------------------------- */

function buildSmoothLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.18;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    let cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    let cp2y = p2.y - (p3.y - p1.y) * tension;

    // Clamp control point Y between neighboring points to prevent false overshoot
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    cp1y = Math.max(minY, Math.min(maxY, cp1y));
    cp2y = Math.max(minY, Math.min(maxY, cp2y));

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildSmoothAreaPath(points: { x: number; y: number }[], baseY: number): string {
  if (points.length < 2) return '';
  const line = buildSmoothLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${baseY.toFixed(1)} L ${first.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

/* -------------------------------------------------------------------------- */
/* 1. Daily / Weekly / Monthly Cashflow Line Chart                            */
/* -------------------------------------------------------------------------- */

interface DailyCashflowChartProps {
  calendar: DaySummary[];
  onSelectDay: (date: string) => void;
  activeFilterLabel?: string;
}

type Granularity = 'daily' | 'weekly' | 'monthly';
type FlowVisibility = 'both' | 'expense' | 'income';

interface ChartBucket {
  key: string;
  label: string;
  tooltipLabel: string;
  i: number;
  e: number;
  n: number;
  jumpDate: string | null;
}

function getWeekStartISO(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export const DailyCashflowChart: React.FC<DailyCashflowChartProps> = ({
  calendar,
  onSelectDay,
  activeFilterLabel,
}) => {
  const uid = useId().replace(/:/g, '');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [flowMode, setFlowMode] = useState<FlowVisibility>('both');
  const [showMA, setShowMA] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const buckets = useMemo<ChartBucket[]>(() => {
    if (calendar.length === 0) return [];
    if (granularity === 'daily') {
      return calendar.map((d) => ({
        key: d.d,
        label: formatMonthLabel(d.d.slice(0, 7)),
        tooltipLabel: formatDateLabel(d.d),
        i: d.i,
        e: d.e,
        n: d.n,
        jumpDate: d.n > 0 ? d.d : null,
      }));
    }

    if (granularity === 'weekly') {
      const map: Record<string, ChartBucket> = {};
      for (const d of calendar) {
        const wk = getWeekStartISO(d.d);
        if (!map[wk]) {
          map[wk] = {
            key: wk,
            label: `${parseInt(wk.slice(8, 10), 10)} ${MONTH_NAMES[parseInt(wk.slice(5, 7), 10) - 1]}`,
            tooltipLabel: `Minggu ${formatDateLabel(wk)}`,
            i: 0,
            e: 0,
            n: 0,
            jumpDate: null,
          };
        }
        map[wk].i += d.i;
        map[wk].e += d.e;
        map[wk].n += d.n;
        if (d.n > 0 && !map[wk].jumpDate) map[wk].jumpDate = d.d;
      }
      return Object.values(map).sort((a, b) => (a.key < b.key ? -1 : 1));
    }

    const map: Record<string, ChartBucket> = {};
    for (const d of calendar) {
      const ym = d.d.slice(0, 7);
      if (!map[ym]) {
        map[ym] = {
          key: ym,
          label: formatMonthLabel(ym),
          tooltipLabel: formatMonthLabel(ym),
          i: 0,
          e: 0,
          n: 0,
          jumpDate: null,
        };
      }
      map[ym].i += d.i;
      map[ym].e += d.e;
      map[ym].n += d.n;
      if (d.n > 0 && !map[ym].jumpDate) map[ym].jumpDate = d.d;
    }
    return Object.values(map).sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [calendar, granularity]);

  const W = 820;
  const H = 264;
  const L = 58;
  const R = 16;
  const T = 16;
  const B = 28;
  const baseY = H - B;

  const { topVal, maValues } = useMemo(() => {
    let mx = 1;
    for (const b of buckets) {
      if (flowMode !== 'income' && b.e > mx) mx = b.e;
      if (flowMode !== 'expense' && b.i > mx) mx = b.i;
    }
    const step = Math.pow(10, Math.floor(Math.log10(mx)));
    let top = Math.ceil(mx / step) * step;
    if (top / step < 3) top = Math.ceil(mx / (step / 2)) * (step / 2);

    const ma = buckets.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        sum += buckets[j].e;
        count++;
      }
      return sum / count;
    });

    return { topVal: top || 1, maValues: ma };
  }, [buckets, flowMode]);

  const n = buckets.length;
  const X = (i: number) => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R);
  const Y = (v: number) => T + (1 - v / topVal) * (H - T - B);

  const incomePts = useMemo(
    () => buckets.map((b, i) => ({ x: X(i), y: Y(b.i) })),
    [buckets, topVal, n]
  );
  const expensePts = useMemo(
    () => buckets.map((b, i) => ({ x: X(i), y: Y(b.e) })),
    [buckets, topVal, n]
  );
  const maPts = useMemo(
    () => maValues.map((v, i) => ({ x: X(i), y: Y(v) })),
    [maValues, topVal, n]
  );

  const incomeLinePath = useMemo(() => buildSmoothLinePath(incomePts), [incomePts]);
  const incomeAreaPath = useMemo(() => buildSmoothAreaPath(incomePts, baseY), [incomePts, baseY]);
  const expenseLinePath = useMemo(() => buildSmoothLinePath(expensePts), [expensePts]);
  const expenseAreaPath = useMemo(() => buildSmoothAreaPath(expensePts, baseY), [expensePts, baseY]);
  const maLinePath = useMemo(() => buildSmoothLinePath(maPts), [maPts]);

  const xMarkers = useMemo(() => {
    if (granularity === 'daily') {
      const out: { idx: number; label: string }[] = [];
      let lastMonth = '';
      buckets.forEach((b, i) => {
        const ym = b.key.slice(0, 7);
        if (ym !== lastMonth) {
          const monthNum = parseInt(ym.slice(5, 7), 10);
          if (n < 95 || monthNum % 2 === 1 || i === 0) {
            out.push({ idx: i, label: formatMonthLabel(ym) });
          }
          lastMonth = ym;
        }
      });
      return out;
    }
    const step = Math.max(1, Math.ceil(buckets.length / 8));
    return buckets
      .map((b, idx) => ({ idx, label: b.label }))
      .filter((_, idx) => idx % step === 0 || idx === buckets.length - 1);
  }, [buckets, granularity, n]);

  const activeBucket = hoverIdx !== null && hoverIdx < buckets.length ? buckets[hoverIdx] : null;
  const hoverXPct = hoverIdx !== null ? (X(hoverIdx) / W) * 100 : 0;

  const handlePointerMove = (ev: React.PointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(
      0,
      Math.min(n - 1, Math.round(((x - L) / (W - L - R)) * Math.max(1, n - 1)))
    );
    setHoverIdx(idx);
  };

  return (
    <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Arus Kas{' '}
            {granularity === 'daily'
              ? 'Harian'
              : granularity === 'weekly'
                ? 'Mingguan'
                : 'Bulanan'}
            {activeFilterLabel ? ` · ${activeFilterLabel}` : ''}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Arahkan kursor ke titik grafik untuk detail; klik titik untuk membuka buku kas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800">
            {(
              [
                ['daily', 'Harian'],
                ['weekly', 'Mingguan'],
                ['monthly', 'Bulanan'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setGranularity(k);
                  setHoverIdx(null);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  granularity === k
                    ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800">
            {(
              [
                ['both', 'Semua'],
                ['expense', 'Keluar'],
                ['income', 'Masuk'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFlowMode(k)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  flowMode === k
                    ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {granularity === 'daily' && flowMode !== 'income' && (
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap shrink-0 ml-1">
              <input
                type="checkbox"
                checked={showMA}
                onChange={(e) => setShowMA(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Rata-rata 7h</span>
            </label>
          )}
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Tidak ada transaksi yang cocok dengan filter grafik pada periode ini.
        </div>
      ) : (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto block overflow-visible select-none"
            role="img"
            aria-label="Grafik arus kas"
          >
            <defs>
              <linearGradient id={`incGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`expGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((g) => {
              const v = topVal * g;
              const yy = Y(v);
              return (
                <g key={g}>
                  <line
                    x1={L}
                    x2={W - R}
                    y1={yy}
                    y2={yy}
                    className="stroke-slate-200/80 dark:stroke-slate-800"
                    strokeWidth={1}
                    strokeDasharray={g > 0 ? '2 3' : undefined}
                  />
                  <text
                    x={L - 8}
                    y={yy + 4}
                    textAnchor="end"
                    fontSize={11}
                    className="fill-slate-400 dark:fill-slate-500 font-mono-num"
                  >
                    {formatCompactRp(v)}
                  </text>
                </g>
              );
            })}

            {xMarkers.map((m) => (
              <text
                key={`${m.idx}-${m.label}`}
                x={X(m.idx)}
                y={H - 6}
                textAnchor={m.idx === 0 ? 'start' : m.idx === n - 1 ? 'end' : 'middle'}
                fontSize={11}
                className="fill-slate-500 dark:fill-slate-400"
              >
                {m.label}
              </text>
            ))}

            {/* Soft gradient areas */}
            {flowMode !== 'expense' && incomeAreaPath && (
              <path d={incomeAreaPath} fill={`url(#incGrad-${uid})`} />
            )}
            {flowMode !== 'income' && expenseAreaPath && (
              <path d={expenseAreaPath} fill={`url(#expGrad-${uid})`} />
            )}

            {/* Smooth curves */}
            {flowMode !== 'expense' && (
              <path
                d={incomeLinePath}
                fill="none"
                stroke="#10B981"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
            {flowMode !== 'income' && (
              <path
                d={expenseLinePath}
                fill="none"
                stroke="#F43F5E"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
            {granularity === 'daily' && flowMode !== 'income' && showMA && (
              <path
                d={maLinePath}
                fill="none"
                stroke="#4F46E5"
                strokeWidth={2.2}
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            )}

            {/* Hover crosshair & halo focus points */}
            {hoverIdx !== null && activeBucket && (
              <g>
                <line
                  x1={X(hoverIdx)}
                  x2={X(hoverIdx)}
                  y1={T}
                  y2={baseY}
                  className="stroke-indigo-400/70 dark:stroke-indigo-400/50"
                  strokeDasharray="3 3"
                  strokeWidth={1.25}
                />
                {flowMode !== 'expense' && (
                  <g>
                    <circle cx={X(hoverIdx)} cy={Y(activeBucket.i)} r={9} fill="#10B981" fillOpacity={0.18} />
                    <circle
                      cx={X(hoverIdx)}
                      cy={Y(activeBucket.i)}
                      r={4.5}
                      fill="#10B981"
                      className="stroke-white dark:stroke-[#131929]"
                      strokeWidth={2}
                    />
                  </g>
                )}
                {flowMode !== 'income' && (
                  <g>
                    <circle cx={X(hoverIdx)} cy={Y(activeBucket.e)} r={9} fill="#F43F5E" fillOpacity={0.18} />
                    <circle
                      cx={X(hoverIdx)}
                      cy={Y(activeBucket.e)}
                      r={4.5}
                      fill="#F43F5E"
                      className="stroke-white dark:stroke-[#131929]"
                      strokeWidth={2}
                    />
                  </g>
                )}
                {granularity === 'daily' && flowMode !== 'income' && showMA && (
                  <circle
                    cx={X(hoverIdx)}
                    cy={Y(maValues[hoverIdx])}
                    r={4}
                    fill="#4F46E5"
                    className="stroke-white dark:stroke-[#131929]"
                    strokeWidth={1.8}
                  />
                )}
              </g>
            )}

            <rect
              x={L}
              y={T}
              width={Math.max(1, W - L - R)}
              height={Math.max(1, H - T - B)}
              fill="transparent"
              className="cursor-pointer"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoverIdx(null)}
              onClick={() => {
                if (activeBucket?.jumpDate) onSelectDay(activeBucket.jumpDate);
              }}
            />
          </svg>

          {/* Floating Glass Tooltip Card */}
          {hoverIdx !== null && activeBucket && (
            <div
              className="pointer-events-none absolute top-2 z-20 w-56 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#172036]/95 backdrop-blur-md p-3 shadow-xl shadow-slate-900/10 dark:shadow-black/50 transition-all duration-75"
              style={{
                left: hoverXPct > 62 ? undefined : `calc(${Math.min(72, Math.max(8, hoverXPct))}% + 12px)`,
                right: hoverXPct > 62 ? `calc(${Math.min(72, Math.max(8, 100 - hoverXPct))}% + 12px)` : undefined,
              }}
            >
              <div className="flex items-baseline justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {activeBucket.tooltipLabel}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                  {activeBucket.n} tx
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                {flowMode !== 'expense' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-xs bg-emerald-500 shrink-0" />
                      Pemasukan
                    </span>
                    <span className="font-mono-num tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatRp(activeBucket.i)}
                    </span>
                  </div>
                )}

                {flowMode !== 'income' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-xs bg-rose-500 shrink-0" />
                      Pengeluaran
                    </span>
                    <span className="font-mono-num tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                      {formatRp(activeBucket.e)}
                    </span>
                  </div>
                )}

                {flowMode === 'both' && (
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">Selisih</span>
                    <span
                      className={`font-mono-num tabular-nums font-bold ${
                        activeBucket.i - activeBucket.e >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatRp(activeBucket.i - activeBucket.e)}
                    </span>
                  </div>
                )}

                {granularity === 'daily' && flowMode !== 'income' && showMA && (
                  <div className="flex items-center justify-between gap-3 pt-0.5">
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span className="w-2 h-0.5 bg-indigo-600 shrink-0" />
                      Rata-rata 7h
                    </span>
                    <span className="font-mono-num tabular-nums text-indigo-600 dark:text-indigo-400 font-medium">
                      {formatRp(maValues[hoverIdx])}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-slate-600 dark:text-slate-400">
        {flowMode !== 'expense' && (
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-0.5 bg-emerald-500 inline-block" aria-hidden="true" />
            Pemasukan
          </span>
        )}
        {flowMode !== 'income' && (
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-0.5 bg-rose-500 inline-block" aria-hidden="true" />
            Pengeluaran
          </span>
        )}
        {granularity === 'daily' && flowMode !== 'income' && showMA && (
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-600 inline-block" aria-hidden="true" />
            Rata-rata 7 hari (Pengeluaran)
          </span>
        )}
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Customizable Breakdown Donut Card (Percent / Nominal, Account, Drill)   */
/* -------------------------------------------------------------------------- */

interface BreakdownDonutCardProps {
  title: string;
  rows: Transaction[];
  type: 0 | 1;
  globalAccountFilter?: string;
}

type ValueDisplayMode = 'rp' | 'pct';
type SliceLimit = 5 | 8 | 999;

export const BreakdownDonutCard: React.FC<BreakdownDonutCardProps> = ({
  title,
  rows,
  type,
  globalAccountFilter = '',
}) => {
  const [mode, setMode] = useState<BreakdownMode>('cat');
  const [valueMode, setValueMode] = useState<ValueDisplayMode>('pct');
  const [localAccount, setLocalAccount] = useState<string>('');
  const [drillCategory, setDrillCategory] = useState<string>('');
  const [sliceLimit, setSliceLimit] = useState<SliceLimit>(8);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const availableAccounts = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.type === type && r.account) set.add(r.account);
    });
    return Array.from(set).sort();
  }, [rows, type]);

  const effectiveAccount = globalAccountFilter || localAccount;

  const scopedRows = useMemo(() => {
    return rows.filter((r) => {
      if (r.type !== type) return false;
      if (effectiveAccount && r.account !== effectiveAccount) return false;
      if (drillCategory && (r.category || 'Tanpa kategori') !== drillCategory) return false;
      return true;
    });
  }, [rows, type, effectiveAccount, drillCategory]);

  const activeMode: BreakdownMode = drillCategory ? 'sub' : mode;

  const { entries, total } = useMemo(() => {
    const grouped = groupBreakdown(scopedRows, type, activeMode);
    const keys = Object.keys(grouped).sort((a, b) => grouped[b] - grouped[a]);
    let tot = 0;
    keys.forEach((k) => {
      tot += grouped[k];
    });

    if (sliceLimit >= 999 || keys.length <= sliceLimit) {
      return { entries: keys.map((k): [string, number] => [k, grouped[k]]), total: tot };
    }

    const topN: [string, number][] = keys.slice(0, sliceLimit - 1).map((k) => [k, grouped[k]]);
    const rest = keys.slice(sliceLimit - 1).reduce((acc, k) => acc + grouped[k], 0);
    if (rest > 0) topN.push(['Lainnya', rest]);
    return { entries: topN, total: tot };
  }, [scopedRows, type, activeMode, sliceLimit]);

  const C = 2 * Math.PI * 42;
  let offsetAcc = 0;

  const formatMetric = (val: number) => {
    const pct = total > 0 ? (val / total) * 100 : 0;
    return valueMode === 'pct'
      ? `${pct.toFixed(1).replace('.', ',')}%`
      : formatCompactRp(val);
  };

  const handleRowOrSliceClick = (label: string) => {
    if (activeMode === 'cat' && label !== 'Lainnya' && !drillCategory) {
      setDrillCategory(label);
      setHoveredIdx(null);
    }
  };

  const hoveredEntry = hoveredIdx !== null && entries[hoveredIdx] ? entries[hoveredIdx] : null;
  const hoveredColor =
    hoveredIdx !== null ? CHART_PALETTE[hoveredIdx % CHART_PALETTE.length] : '#4F46E5';

  return (
    <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col">
      {/* Row 1: Title + Nominal/Percent toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
            {title}
            {effectiveAccount ? ` · ${effectiveAccount}` : ''}
          </h2>
          {drillCategory && (
            <button
              type="button"
              onClick={() => {
                setDrillCategory('');
                setHoveredIdx(null);
              }}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <ArrowLeft className="w-3 h-3" />
              Semua kategori (subkategori: {drillCategory})
            </button>
          )}
        </div>

        <div
          className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800 shrink-0"
          role="group"
          aria-label="Format tampilan nilai"
        >
          {(
            [
              ['pct', '% Persen'],
              ['rp', 'Rp Nominal'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setValueMode(k)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                valueMode === k
                  ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Grouping + Local Account Filter + Limit */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800">
          {(
            [
              ['cat', 'Kategori'],
              ['sub', 'Subkategori'],
              ['acc', 'Akun'],
            ] as const
          ).map(([m, lbl]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setDrillCategory('');
                setMode(m);
                setHoveredIdx(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeMode === m
                  ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!globalAccountFilter && activeMode !== 'acc' && (
            <select
              aria-label={`Filter akun untuk ${title}`}
              value={localAccount}
              onChange={(e) => {
                setLocalAccount(e.target.value);
                setHoveredIdx(null);
              }}
              className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Semua Akun</option>
              {availableAccounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label={`Jumlah item ${title}`}
            value={sliceLimit}
            onChange={(e) => setSliceLimit(Number(e.target.value) as SliceLimit)}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={5}>Top 5</option>
            <option value={8}>Top 8</option>
            <option value={999}>Semua</option>
          </select>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Tidak ada data untuk filter ini pada periode terpilih.
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-44 h-44 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full select-none" role="img" aria-label={title}>
              {/* Subtle base ring */}
              <circle
                cx={60}
                cy={60}
                r={42}
                fill="none"
                className="stroke-slate-100 dark:stroke-slate-800/60"
                strokeWidth={16}
              />
              {entries.map(([label, value], i) => {
                const len = (value / total) * C;
                const dash = Math.max(len - 1.1, 0);
                const strokeOffset = -offsetAcc;
                offsetAcc += len;
                const isHover = hoveredIdx === i;
                const dimmed = hoveredIdx !== null && !isHover;

                return (
                  <circle
                    key={label}
                    cx={60}
                    cy={60}
                    r={42}
                    fill="none"
                    stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                    strokeWidth={isHover ? 20 : 16}
                    strokeOpacity={dimmed ? 0.32 : 1}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={strokeOffset}
                    transform="rotate(-90 60 60)"
                    className="transition-all duration-150 cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => handleRowOrSliceClick(label)}
                  />
                );
              })}

              <text
                x={60}
                y={54}
                textAnchor="middle"
                fontSize={7.8}
                className="fill-slate-400 dark:fill-slate-500"
              >
                {hoveredEntry ? hoveredEntry[0].slice(0, 14) : effectiveAccount || 'Total'}
              </text>
              <text
                x={60}
                y={68}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                className="fill-slate-900 dark:fill-white font-mono-num"
              >
                {hoveredEntry ? formatMetric(hoveredEntry[1]) : formatCompactRp(total)}
              </text>
            </svg>

            {/* Aesthetic Floating Donut Tooltip */}
            {hoveredEntry && (
              <div className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#172036]/95 backdrop-blur-md px-3 py-2 shadow-xl shadow-slate-900/10 dark:shadow-black/50">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: hoveredColor }}
                  />
                  <span className="font-bold text-slate-900 dark:text-white">
                    {hoveredEntry[0]}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2 text-xs font-mono-num tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatRp(hoveredEntry[1])}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    ({((hoveredEntry[1] / total) * 100).toFixed(1).replace('.', ',')}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 w-full space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
            {entries.map(([label, value], i) => {
              const pct = (value / total) * 100;
              const pctLabel = `${pct.toFixed(1).replace('.', ',')}%`;
              const color = CHART_PALETTE[i % CHART_PALETTE.length];
              const canDrill = activeMode === 'cat' && label !== 'Lainnya' && !drillCategory;

              return (
                <div
                  key={label}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => handleRowOrSliceClick(label)}
                  className={`py-1.5 px-2.5 rounded-xl transition-colors ${
                    canDrill ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    hoveredIdx === i
                      ? 'bg-slate-100/80 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                        {label}
                      </span>
                    </div>

                    <span className="text-xs font-mono-num tabular-nums whitespace-nowrap shrink-0">
                      {valueMode === 'pct' ? (
                        <>
                          <strong className="font-semibold text-slate-900 dark:text-white">
                            {pctLabel}
                          </strong>
                          <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                            · {formatCompactRp(value)}
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="font-semibold text-slate-900 dark:text-white">
                            {formatRp(value)}
                          </strong>
                          <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                            · {pctLabel}
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.max(2, Math.min(100, pct))}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total > 0 && activeMode === 'cat' && !drillCategory && (
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
          Tip: Klik salah satu kategori untuk melihat rincian subkategorinya.
        </p>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Monthly Category Trend Chart (Interactive Crosshair + Glass Tooltip)    */
/* -------------------------------------------------------------------------- */

interface MonthlyTrendChartProps {
  allCashflowRows: Transaction[];
  activeFilterLabel?: string;
}

export const MonthlyTrendChart: React.FC<MonthlyTrendChartProps> = ({
  allCashflowRows,
  activeFilterLabel,
}) => {
  const [flowType, setFlowType] = useState<0 | 1>(0);
  const [sortBy, setSortBy] = useState<'top' | 'alpha'>('top');
  const [selectedCats, setSelectedCats] = useState<string[] | null>(null);
  const [hoverMonthIdx, setHoverMonthIdx] = useState<number | null>(null);

  const { months, topCategories, seriesMap } = useMemo(() => {
    const ms = getAllMonths(allCashflowRows);
    const map: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};

    for (const r of allCashflowRows) {
      if (r.type !== flowType) continue;
      const cat = r.category || 'Tanpa nama';
      const ym = r.date.slice(0, 7);
      if (!map[cat]) map[cat] = {};
      map[cat][ym] = (map[cat][ym] || 0) + r.amount;
      totals[cat] = (totals[cat] || 0) + r.amount;
    }

    const sortedCats = Object.keys(totals)
      .sort((a, b) => (sortBy === 'alpha' ? a.localeCompare(b) : totals[b] - totals[a]))
      .slice(0, 10);

    return { months: ms, topCategories: sortedCats, seriesMap: map };
  }, [allCashflowRows, flowType, sortBy]);

  const activeCats = useMemo(() => {
    if (selectedCats !== null) {
      return selectedCats.filter((c) => topCategories.includes(c));
    }
    const defaults = topCategories.filter((c) => /food|makan|gaji|tempat/i.test(c));
    return defaults.length > 0 ? defaults.slice(0, 3) : topCategories.slice(0, 3);
  }, [selectedCats, topCategories]);

  const toggleCategory = (cat: string) => {
    const current = activeCats;
    if (current.includes(cat)) {
      setSelectedCats(current.filter((x) => x !== cat));
    } else {
      setSelectedCats([...current, cat]);
    }
  };

  const W = 440;
  const H = 224;
  const L = 52;
  const R = 16;
  const T = 14;
  const B = 24;

  let maxVal = 1;
  activeCats.forEach((cat) => {
    months.forEach((m) => {
      const v = seriesMap[cat]?.[m] || 0;
      if (v > maxVal) maxVal = v;
    });
  });

  const n = months.length;
  const X = (i: number) => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R);
  const Y = (v: number) => T + (1 - v / maxVal) * (H - T - B);

  const handlePointerMove = (ev: React.PointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(
      0,
      Math.min(n - 1, Math.round(((x - L) / (W - L - R)) * Math.max(1, n - 1)))
    );
    setHoverMonthIdx(idx);
  };

  const hoveredMonth = hoverMonthIdx !== null && months[hoverMonthIdx] ? months[hoverMonthIdx] : null;
  const hoverXPct = hoverMonthIdx !== null ? (X(hoverMonthIdx) / W) * 100 : 0;

  return (
    <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Tren Bulanan per Kategori
            {activeFilterLabel ? ` · ${activeFilterLabel}` : ''}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Arahkan kursor ke bulan untuk membandingkan nilai antar kategori.
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800">
            {(
              [
                [0, 'Keluar'],
                [1, 'Masuk'],
              ] as const
            ).map(([t, lbl]) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setFlowType(t);
                  setSelectedCats(null);
                  setHoverMonthIdx(null);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  flowType === t
                    ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <select
            aria-label="Urutkan kategori"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'top' | 'alpha')}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            <option value="top">Terbesar</option>
            <option value="alpha">A–Z</option>
          </select>
        </div>
      </div>

      {topCategories.length === 0 || months.length === 0 ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Belum ada data tren untuk filter ini.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {topCategories.map((cat) => {
              const isSelected = activeCats.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-pressed={isSelected}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                      : 'bg-slate-50 dark:bg-[#0B0F1A] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
            {topCategories.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedCats(activeCats.length === topCategories.length ? [] : [...topCategories])
                }
                className="px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
              >
                {activeCats.length === topCategories.length ? 'Kosongkan' : 'Pilih Semua'}
              </button>
            )}
          </div>

          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto block overflow-visible select-none"
              role="img"
              aria-label="Tren bulanan per kategori"
            >
              {[0, 1, 2, 3].map((i) => {
                const yy = T + (1 - i / 3) * (H - T - B);
                return (
                  <g key={i}>
                    <line
                      x1={L}
                      x2={W - R}
                      y1={yy}
                      y2={yy}
                      className="stroke-slate-200/80 dark:stroke-slate-800"
                      strokeDasharray={i > 0 ? '2 3' : undefined}
                    />
                    <text
                      x={L - 6}
                      y={yy + 4}
                      textAnchor="end"
                      fontSize={10}
                      className="fill-slate-400 dark:fill-slate-500 font-mono-num"
                    >
                      {formatCompactRp((maxVal * i) / 3)}
                    </text>
                  </g>
                );
              })}

              {months.map((m, i) => (
                <text
                  key={m}
                  x={X(i)}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize={10}
                  className={
                    hoverMonthIdx === i
                      ? 'fill-slate-900 dark:fill-white font-bold'
                      : 'fill-slate-500 dark:fill-slate-400'
                  }
                >
                  {MONTH_NAMES[parseInt(m.slice(5, 7), 10) - 1]}
                </text>
              ))}

              {/* Hover vertical crosshair */}
              {hoverMonthIdx !== null && (
                <line
                  x1={X(hoverMonthIdx)}
                  x2={X(hoverMonthIdx)}
                  y1={T}
                  y2={H - B}
                  className="stroke-indigo-400/70 dark:stroke-indigo-400/50"
                  strokeDasharray="3 3"
                  strokeWidth={1.25}
                />
              )}

              {activeCats.map((cat) => {
                const color = CHART_PALETTE[topCategories.indexOf(cat) % CHART_PALETTE.length];
                const pts = months.map((m, i) => ({
                  x: X(i),
                  y: Y(seriesMap[cat]?.[m] || 0),
                }));
                const smoothPath = buildSmoothLinePath(pts);

                return (
                  <g key={cat}>
                    <path d={smoothPath} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
                    {months.map((m, i) => {
                      const v = seriesMap[cat]?.[m] || 0;
                      const isHovered = hoverMonthIdx === i;
                      return (
                        <g key={m}>
                          {isHovered && (
                            <circle cx={X(i)} cy={Y(v)} r={7.5} fill={color} fillOpacity={0.2} />
                          )}
                          <circle
                            cx={X(i)}
                            cy={Y(v)}
                            r={isHovered ? 4.2 : 2.8}
                            fill={color}
                            className="stroke-white dark:stroke-[#131929]"
                            strokeWidth={isHovered ? 1.8 : 1}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              <rect
                x={L}
                y={T}
                width={Math.max(1, W - L - R)}
                height={Math.max(1, H - T - B)}
                fill="transparent"
                className="cursor-crosshair"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverMonthIdx(null)}
              />
            </svg>

            {/* Floating Glass Tooltip for Monthly Trend */}
            {hoveredMonth && activeCats.length > 0 && (
              <div
                className="pointer-events-none absolute top-2 z-20 w-52 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#172036]/95 backdrop-blur-md p-3 shadow-xl shadow-slate-900/10 dark:shadow-black/50 transition-all duration-75"
                style={{
                  left: hoverXPct > 58 ? undefined : `calc(${Math.min(68, Math.max(8, hoverXPct))}% + 10px)`,
                  right: hoverXPct > 58 ? `calc(${Math.min(68, Math.max(8, 100 - hoverXPct))}% + 10px)` : undefined,
                }}
              >
                <div className="pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
                  {formatMonthLabel(hoveredMonth)}
                </div>
                <div className="space-y-1.5 text-xs">
                  {[...activeCats]
                    .sort((a, b) => (seriesMap[b]?.[hoveredMonth] || 0) - (seriesMap[a]?.[hoveredMonth] || 0))
                    .map((cat) => {
                      const color = CHART_PALETTE[topCategories.indexOf(cat) % CHART_PALETTE.length];
                      const val = seriesMap[cat]?.[hoveredMonth] || 0;
                      return (
                        <div key={cat} className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate">{cat}</span>
                          </span>
                          <span className="font-mono-num tabular-nums font-semibold text-slate-900 dark:text-white shrink-0">
                            {formatCompactRp(val)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
            {activeCats.map((cat) => {
              const color = CHART_PALETTE[topCategories.indexOf(cat) % CHART_PALETTE.length];
              return (
                <span key={cat} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {cat}
                </span>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Monthly Grouped Bars Chart (Masuk & Keluar vs Selisih Net + Tooltip)    */
/* -------------------------------------------------------------------------- */

interface MonthlyBarsChartProps {
  allCashflowRows: Transaction[];
  period: PeriodRange;
  onSelectMonth: (from: string, to: string) => void;
  activeFilterLabel?: string;
}

export const MonthlyBarsChart: React.FC<MonthlyBarsChartProps> = ({
  allCashflowRows,
  period,
  onSelectMonth,
  activeFilterLabel,
}) => {
  const [barMode, setBarMode] = useState<'split' | 'net'>('split');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { months, agg, maxAbsVal } = useMemo(() => {
    const ms = getAllMonths(allCashflowRows);
    const map: Record<string, { i: number; e: number }> = {};
    ms.forEach((m) => {
      map[m] = { i: 0, e: 0 };
    });
    allCashflowRows.forEach((r) => {
      const m = r.date.slice(0, 7);
      if (!map[m]) map[m] = { i: 0, e: 0 };
      if (r.type === 1) map[m].i += r.amount;
      else map[m].e += r.amount;
    });
    let mx = 1;
    ms.forEach((m) => {
      if (barMode === 'net') {
        mx = Math.max(mx, Math.abs(map[m].i - map[m].e));
      } else {
        mx = Math.max(mx, map[m].i, map[m].e);
      }
    });
    return { months: ms, agg: map, maxAbsVal: mx };
  }, [allCashflowRows, barMode]);

  const W = 440;
  const H = 224;
  const L = 52;
  const R = 10;
  const T = 14;
  const B = 24;
  const bw = months.length > 0 ? (W - L - R) / months.length : 40;
  const plotH = H - T - B;
  const midY = T + plotH / 2;

  const hoveredMonth = hoverIdx !== null && months[hoverIdx] ? months[hoverIdx] : null;
  const hoveredAgg = hoveredMonth ? agg[hoveredMonth] : null;
  const hoverXPct = hoverIdx !== null ? ((L + (hoverIdx + 0.5) * bw) / W) * 100 : 0;

  return (
    <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Perbandingan Per Bulan
            {activeFilterLabel ? ` · ${activeFilterLabel}` : ''}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Klik batang bulan untuk memfilter dashboard ke bulan tersebut.
          </p>
        </div>

        <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800 shrink-0">
          {(
            [
              ['split', 'Masuk & Keluar'],
              ['net', 'Selisih (Net)'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setBarMode(k)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                barMode === k
                  ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {months.length === 0 ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Belum ada data bulanan.
        </div>
      ) : (
        <>
          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto block overflow-visible select-none"
              role="img"
              aria-label="Pemasukan dan pengeluaran per bulan"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {barMode === 'split'
                ? [0, 1, 2, 3].map((g) => {
                    const yy = T + (1 - g / 3) * plotH;
                    return (
                      <g key={g}>
                        <line
                          x1={L}
                          x2={W - R}
                          y1={yy}
                          y2={yy}
                          className="stroke-slate-200/80 dark:stroke-slate-800"
                          strokeDasharray={g > 0 ? '2 3' : undefined}
                        />
                        <text
                          x={L - 6}
                          y={yy + 4}
                          textAnchor="end"
                          fontSize={10}
                          className="fill-slate-400 dark:fill-slate-500 font-mono-num"
                        >
                          {formatCompactRp((maxAbsVal * g) / 3)}
                        </text>
                      </g>
                    );
                  })
                : [-1, -0.5, 0, 0.5, 1].map((g) => {
                    const yy = midY - g * (plotH / 2);
                    return (
                      <g key={g}>
                        <line
                          x1={L}
                          x2={W - R}
                          y1={yy}
                          y2={yy}
                          className={
                            g === 0
                              ? 'stroke-slate-400 dark:stroke-slate-600'
                              : 'stroke-slate-200/80 dark:stroke-slate-800'
                          }
                          strokeDasharray={g !== 0 ? '2 3' : undefined}
                        />
                        <text
                          x={L - 6}
                          y={yy + 4}
                          textAnchor="end"
                          fontSize={10}
                          className="fill-slate-400 dark:fill-slate-500 font-mono-num"
                        >
                          {formatCompactRp(maxAbsVal * g)}
                        </text>
                      </g>
                    );
                  })}

              {months.map((m, i) => {
                const x = L + i * bw;
                const a = agg[m];
                const isInPeriod = m >= period.from.slice(0, 7) && m <= period.to.slice(0, 7);
                const isHover = hoverIdx === i;

                if (barMode === 'net') {
                  const net = a.i - a.e;
                  const barW = Math.min(32, bw * 0.5);
                  const hh = (Math.abs(net) / maxAbsVal) * (plotH / 2);
                  const yy = net >= 0 ? midY - hh : midY;
                  return (
                    <g
                      key={m}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverIdx(i)}
                      onClick={() => onSelectMonth(`${m}-01`, lastDayOfMonth(m))}
                    >
                      {isHover && (
                        <rect
                          x={x + 2}
                          y={T}
                          width={Math.max(4, bw - 4)}
                          height={plotH}
                          rx={6}
                          className="fill-slate-100 dark:fill-slate-800/50"
                        />
                      )}
                      <rect
                        x={x + (bw - barW) / 2}
                        y={yy}
                        width={barW}
                        height={Math.max(2, hh)}
                        rx={4}
                        fill={net >= 0 ? '#10B981' : '#F43F5E'}
                        fillOpacity={isHover ? 1 : isInPeriod ? 0.9 : 0.3}
                      />
                      <text
                        x={x + bw / 2}
                        y={H - 6}
                        textAnchor="middle"
                        fontSize={10}
                        className={
                          isHover || isInPeriod
                            ? 'fill-slate-900 dark:fill-white font-semibold'
                            : 'fill-slate-400 dark:fill-slate-500'
                        }
                      >
                        {MONTH_NAMES[parseInt(m.slice(5, 7), 10) - 1]}
                      </text>
                    </g>
                  );
                }

                const barW = Math.min(20, bw * 0.34);
                const groupPad = (bw - barW * 2 - 2) / 2;
                const hi = (a.i / maxAbsVal) * plotH;
                const he = (a.e / maxAbsVal) * plotH;

                return (
                  <g
                    key={m}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIdx(i)}
                    onClick={() => onSelectMonth(`${m}-01`, lastDayOfMonth(m))}
                  >
                    {isHover && (
                      <rect
                        x={x + 2}
                        y={T}
                        width={Math.max(4, bw - 4)}
                        height={plotH}
                        rx={6}
                        className="fill-slate-100 dark:fill-slate-800/50"
                      />
                    )}
                    <rect
                      x={x + groupPad}
                      y={H - B - hi}
                      width={barW}
                      height={hi}
                      rx={3.5}
                      fill="#10B981"
                      fillOpacity={isHover ? 1 : isInPeriod ? 0.9 : 0.3}
                    />
                    <rect
                      x={x + groupPad + barW + 2}
                      y={H - B - he}
                      width={barW}
                      height={he}
                      rx={3.5}
                      fill="#F43F5E"
                      fillOpacity={isHover ? 1 : isInPeriod ? 0.9 : 0.3}
                    />
                    <text
                      x={x + bw / 2}
                      y={H - 6}
                      textAnchor="middle"
                      fontSize={10}
                      className={
                        isHover || isInPeriod
                          ? 'fill-slate-900 dark:fill-white font-semibold'
                          : 'fill-slate-400 dark:fill-slate-500'
                      }
                    >
                      {MONTH_NAMES[parseInt(m.slice(5, 7), 10) - 1]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Floating Glass Tooltip for Monthly Bars */}
            {hoveredMonth && hoveredAgg && (
              <div
                className="pointer-events-none absolute top-2 z-20 w-52 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#172036]/95 backdrop-blur-md p-3 shadow-xl shadow-slate-900/10 dark:shadow-black/50 transition-all duration-75"
                style={{
                  left: hoverXPct > 58 ? undefined : `calc(${Math.min(68, Math.max(8, hoverXPct))}% + 8px)`,
                  right: hoverXPct > 58 ? `calc(${Math.min(68, Math.max(8, 100 - hoverXPct))}% + 8px)` : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {formatMonthLabel(hoveredMonth)}
                  </span>
                  {hoveredAgg.i > 0 && (
                    <span className="text-[11px] font-mono-num tabular-nums text-slate-400 dark:text-slate-500">
                      Tabungan {Math.round(((hoveredAgg.i - hoveredAgg.e) / hoveredAgg.i) * 100)}%
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-xs bg-emerald-500 shrink-0" />
                      Pemasukan
                    </span>
                    <span className="font-mono-num tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatRp(hoveredAgg.i)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="w-2 h-2 rounded-xs bg-rose-500 shrink-0" />
                      Pengeluaran
                    </span>
                    <span className="font-mono-num tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                      {formatRp(hoveredAgg.e)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">Selisih</span>
                    <span
                      className={`font-mono-num tabular-nums font-bold ${
                        hoveredAgg.i - hoveredAgg.e >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatRp(hoveredAgg.i - hoveredAgg.e)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-5 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" aria-hidden="true" />
              {barMode === 'net' ? 'Surplus' : 'Pemasukan'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" aria-hidden="true" />
              {barMode === 'net' ? 'Defisit' : 'Pengeluaran'}
            </span>
          </div>
        </>
      )}
    </section>
  );
};

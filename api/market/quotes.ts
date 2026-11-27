import type { IncomingMessage, ServerResponse } from 'http';

interface CachedQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  marketTime: number;
  name: string;
  buy?: number;
  sell?: number;
  source?: string;
  rateUpdatedAt?: string;
}

interface BniRateEntry {
  buy: number;
  sell: number;
  buyChange: number;
  sellChange: number;
}

interface BniRatesPayload {
  updatedAt: string;
  rates: Record<string, BniRateEntry>;
}

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,18}$/;

function parseIdNumber(str: string): number {
  const normalized = str.replace(/\./g, '').replace(',', '.');
  const val = Number(normalized);
  return Number.isFinite(val) ? val : NaN;
}

function parseBniRateCell(cell: string): { rate: number; change: number } | null {
  const cleaned = cell.trim();
  const mainMatch = cleaned.match(/^([\d.,]+)/);
  if (!mainMatch) return null;
  const rate = parseIdNumber(mainMatch[1]);
  if (!(rate > 0)) return null;

  let change = 0;
  const deltaMatch = cleaned.match(/\(\s*([+-])\s*([\d.,]+)\s*\)/);
  if (deltaMatch) {
    const absDelta = parseIdNumber(deltaMatch[2]);
    if (Number.isFinite(absDelta)) {
      change = deltaMatch[1] === '-' ? -absDelta : absDelta;
    }
  }
  return { rate, change };
}

async function fetchBniLiveRates(): Promise<BniRatesPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const resp = await fetch('https://kursdollar.org/bank/bni.php', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 101Financial/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) return { updatedAt: '', rates: {} };
    const html = await resp.text();
    const idx = html.indexOf('>e-Rate<');
    if (idx < 0) return { updatedAt: '', rates: {} };

    const sub = html.slice(idx, idx + 8000);
    const trs = [...sub.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (trs.length < 3) return { updatedAt: '', rates: {} };

    const extractCells = (trHtml: string) =>
      [...trHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
        m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      );

    const headerCells = extractCells(trs[0][1]);
    const codes = headerCells
      .map((c) => {
        const m = c.match(/\(\s*([A-Z]{3})\s*\)/);
        return m ? m[1] : '';
      })
      .filter(Boolean);

    const beliCells = extractCells(trs[1][1]);
    const jualCells = extractCells(trs[2][1]);
    if (codes.length === 0 || beliCells.length < codes.length || jualCells.length < codes.length) {
      return { updatedAt: '', rates: {} };
    }

    const updatedAt = beliCells[0] && !/beli/i.test(beliCells[0]) ? beliCells[0] : '';
    const beliRates = beliCells.slice(-codes.length);
    const jualRates = jualCells.slice(-codes.length);

    const rates: Record<string, BniRateEntry> = {};
    codes.forEach((code, i) => {
      const b = parseBniRateCell(beliRates[i] || '');
      const j = parseBniRateCell(jualRates[i] || '');
      if (b && j) {
        rates[code] = {
          buy: b.rate,
          sell: j.rate,
          buyChange: b.change,
          sellChange: j.change,
        };
      }
    });

    return { updatedAt, rates };
  } catch {
    return { updatedAt: '', rates: {} };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTradingViewIdxBatch(
  symbols: string[]
): Promise<Record<string, CachedQuote>> {
  const result: Record<string, CachedQuote> = {};
  if (symbols.length === 0) return result;

  const tvToAppSym = new Map<string, string>();
  const tvTickers: string[] = [];

  for (const sym of symbols) {
    const clean = sym.replace(/\.JK$/i, '');
    const tvTicker =
      clean === '^JKSE' || clean === 'JKSE' || clean === 'IHSG' || clean === 'COMPOSITE'
        ? 'IDX:COMPOSITE'
        : `IDX:${clean}`;
    tvToAppSym.set(tvTicker, sym);
    if (!tvTickers.includes(tvTicker)) {
      tvTickers.push(tvTicker);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const resp = await fetch('https://scanner.tradingview.com/indonesia/scan', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        symbols: { tickers: tvTickers },
        columns: ['name', 'close', 'change', 'change_abs', 'currency', 'description'],
      }),
    });

    if (resp.ok) {
      const json = (await resp.json()) as {
        data?: Array<{
          s?: string;
          d?: [
            string | null,
            number | null,
            number | null,
            number | null,
            string | null,
            string | null,
          ];
        }>;
      };

      const marketTime = Math.floor(Date.now() / 1000);
      for (const row of json.data || []) {
        const tvSym = row.s || '';
        const appSym = tvToAppSym.get(tvSym);
        const vals = row.d;
        if (!appSym || !vals) continue;
        const price = typeof vals[1] === 'number' ? vals[1] : null;
        if (price === null) continue;
        const changePercent = typeof vals[2] === 'number' ? vals[2] : 0;
        const change = typeof vals[3] === 'number' ? vals[3] : 0;

        result[appSym] = {
          symbol: appSym,
          price,
          previousClose: price - change,
          change,
          changePercent,
          currency: vals[4] || 'IDR',
          marketTime,
          name: vals[5] || vals[0] || appSym,
        };
      }
    }
  } catch {
    // Best-effort network call
  } finally {
    clearTimeout(timeout);
  }

  return result;
}

async function fetchLiveFxRates(): Promise<Record<string, number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return {};
    const json = (await resp.json()) as { rates?: Record<string, number> };
    const rates = json.rates;
    const idrPerUsd = rates?.IDR;
    if (!rates || typeof idrPerUsd !== 'number' || !(idrPerUsd > 0)) return {};

    const toIdr: Record<string, number> = { IDR: 1 };
    for (const [code, perUsd] of Object.entries(rates)) {
      if (typeof perUsd === 'number' && perUsd > 0) {
        toIdr[code] = idrPerUsd / perUsd;
      }
    }
    return toIdr;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const rawSymbols = Array.from(
    new Set(
      (url.searchParams.get('symbols') || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SYMBOL_RE.test(s))
    )
  ).slice(0, 35);

  const rawFx = Array.from(
    new Set(
      (url.searchParams.get('fx') || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{3}$/.test(s))
    )
  ).slice(0, 20);

  const [quotes, bniPayload, fallbackFxTable] = await Promise.all([
    fetchTradingViewIdxBatch(rawSymbols),
    rawFx.length > 0 ? fetchBniLiveRates() : Promise.resolve({ updatedAt: '', rates: {} } as BniRatesPayload),
    rawFx.length > 0 ? fetchLiveFxRates() : Promise.resolve({} as Record<string, number>),
  ]);

  const nowSec = Math.floor(Date.now() / 1000);
  const fx: Record<string, CachedQuote> = {};
  for (const code of rawFx) {
    const bni = bniPayload.rates[code];
    if (bni && bni.sell > 0) {
      const previousClose = bni.sell - bni.sellChange;
      const changePercent = previousClose > 0 ? (bni.sellChange / previousClose) * 100 : 0;
      fx[code] = {
        symbol: code,
        price: bni.sell,
        previousClose,
        change: bni.sellChange,
        changePercent,
        currency: 'IDR',
        marketTime: nowSec,
        name: `${code}/IDR (BNI e-Rate)`,
        buy: bni.buy,
        sell: bni.sell,
        source: 'BNI e-Rate',
        rateUpdatedAt: bniPayload.updatedAt,
      };
      continue;
    }

    const spot = fallbackFxTable[code];
    if (typeof spot === 'number' && spot > 0) {
      fx[code] = {
        symbol: code,
        price: spot,
        previousClose: spot,
        change: 0,
        changePercent: 0,
        currency: 'IDR',
        marketTime: nowSec,
        name: `${code}/IDR`,
        source: 'Pasar Spot',
      };
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  res.end(
    JSON.stringify({
      quotes,
      fx,
      bniUpdatedAt: bniPayload.updatedAt || null,
      fetchedAt: new Date().toISOString(),
    })
  );
}

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const CACHE_TTL_MS = 60_000;

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

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const quoteCache = new Map<string, CacheEntry<CachedQuote>>();
let fxRatesCache: CacheEntry<Record<string, number>> | null = null;
let bniRatesCache: CacheEntry<BniRatesPayload> | null = null;

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
  const now = Date.now();
  if (bniRatesCache && bniRatesCache.expiresAt > now) {
    return bniRatesCache.data;
  }

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
    if (!resp.ok) return bniRatesCache?.data || { updatedAt: '', rates: {} };
    const html = await resp.text();
    const idx = html.indexOf('>e-Rate<');
    if (idx < 0) return bniRatesCache?.data || { updatedAt: '', rates: {} };

    const sub = html.slice(idx, idx + 8000);
    const trs = [...sub.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (trs.length < 3) return bniRatesCache?.data || { updatedAt: '', rates: {} };

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
      return bniRatesCache?.data || { updatedAt: '', rates: {} };
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

    if (Object.keys(rates).length > 0) {
      const payload: BniRatesPayload = { updatedAt, rates };
      bniRatesCache = { data: payload, expiresAt: now + CACHE_TTL_MS };
      return payload;
    }
    return bniRatesCache?.data || { updatedAt: '', rates: {} };
  } catch {
    return bniRatesCache?.data || { updatedAt: '', rates: {} };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTradingViewIdxBatch(
  symbols: string[]
): Promise<Record<string, CachedQuote>> {
  const result: Record<string, CachedQuote> = {};
  if (symbols.length === 0) return result;

  const now = Date.now();
  const missing: string[] = [];

  for (const sym of symbols) {
    const cached = quoteCache.get(sym);
    if (cached && cached.expiresAt > now) {
      result[sym] = cached.data;
    } else {
      missing.push(sym);
    }
  }

  if (missing.length === 0) return result;

  // Map UI symbol -> TradingView IDX ticker
  const tvToAppSym = new Map<string, string>();
  const tvTickers: string[] = [];

  for (const sym of missing) {
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
          d?: [string | null, number | null, number | null, number | null, string | null, string | null];
        }>;
      };

      const marketTime = Math.floor(now / 1000);
      for (const row of json.data || []) {
        const tvSym = row.s || '';
        const appSym = tvToAppSym.get(tvSym);
        const vals = row.d;
        if (!appSym || !vals) continue;
        const price = typeof vals[1] === 'number' ? vals[1] : null;
        if (price === null) continue;
        const changePercent = typeof vals[2] === 'number' ? vals[2] : 0;
        const change = typeof vals[3] === 'number' ? vals[3] : 0;
        const previousClose = price - change;
        const currency = vals[4] || 'IDR';
        const description = vals[5] || vals[0] || appSym;

        const quote: CachedQuote = {
          symbol: appSym,
          price,
          previousClose,
          change,
          changePercent,
          currency,
          marketTime,
          name: description,
        };
        quoteCache.set(appSym, { data: quote, expiresAt: now + CACHE_TTL_MS });
        result[appSym] = quote;
      }
    }
  } catch {
    // Best-effort network call; return cached entries if any
  } finally {
    clearTimeout(timeout);
  }

  return result;
}

async function fetchLiveFxRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (fxRatesCache && fxRatesCache.expiresAt > now) {
    return fxRatesCache.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return fxRatesCache?.data || {};
    const json = (await resp.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    const rates = json.rates;
    const idrPerUsd = rates?.IDR;
    if (!rates || typeof idrPerUsd !== 'number' || !(idrPerUsd > 0)) {
      return fxRatesCache?.data || {};
    }

    const toIdr: Record<string, number> = { IDR: 1 };
    for (const [code, perUsd] of Object.entries(rates)) {
      if (typeof perUsd === 'number' && perUsd > 0) {
        toIdr[code] = idrPerUsd / perUsd;
      }
    }

    fxRatesCache = { data: toIdr, expiresAt: now + CACHE_TTL_MS };
    return toIdr;
  } catch {
    return fxRatesCache?.data || {};
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Live market quotes endpoint for IDX/IHSG stocks and BNI e-Rate / Forex -> IDR
  app.get('/api/market/quotes', async (req, res) => {
    const rawSymbols = Array.from(
      new Set(
        String(req.query.symbols || '')
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => SYMBOL_RE.test(s))
      )
    ).slice(0, 35);

    const rawFx = Array.from(
      new Set(
        String(req.query.fx || '')
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

    res.json({
      quotes,
      fx,
      bniUpdatedAt: bniPayload.updatedAt || null,
      fetchedAt: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

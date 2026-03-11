/**
 * BTC Alpha Calculation Engine
 *
 * Core value proposition: Codex clients should accumulate MORE BTC than
 * a simple buy-and-hold (DCA) strategy would produce.
 *
 * Benchmark definition (confirmed with client):
 *   For each USD-to-BTC purchase the program makes, record the BTC acquired.
 *   Sum those up = "DCA benchmark" (what a passive buyer would have).
 *   Alpha = actual BTC balance − DCA benchmark BTC
 *
 * For BTC direct deposits: counted as-is in both actual and benchmark
 * (client already owned BTC, so no conversion needed).
 *
 * USD is always partially in cash (DCA-ing progressively), so the benchmark
 * mirrors the same timing — no "lump sum on day one" distortion.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HOW sFOX TRANSACTION DATA WORKS
 * ──────────────────────────────────────────────────────────────────────────
 * Every trade produces TWO rows — one for each side of the pair:
 *
 *   USD→BTC buy:
 *     Row A: action=Buy, currency=usd,  amount=-999.99  (USD leaving)
 *     Row B: action=Buy, currency=btc,  amount=+0.0156  (BTC arriving)
 *
 *   USD→SOL buy (USD-funded altcoin, NOT a BTC rotation):
 *     Row A: action=Buy, currency=usd,  amount=-999.99  (USD leaving)
 *     Row B: action=Buy, currency=sol,  amount=+8.35    (SOL arriving)
 *
 *   SOL→USD sell (altcoin exit back to USD, NOT a BTC rotation):
 *     Row A: action=Sell, currency=sol, amount=-32.5    (SOL leaving)
 *     Row B: action=Sell, currency=usd, amount=+7876    (USD arriving)
 *
 *   BTC→Altcoin rotation (future, when implemented):
 *     Row A: action=Sell, currency=btc, amount=-0.05    (BTC leaving)
 *     Row B: action=Buy,  currency=sol, amount=+55.0    (SOL arriving)
 *   In this case the currency=btc row with action=Sell is the rotation OUT.
 *   When the altcoin is later sold back to BTC:
 *     Row A: action=Sell, currency=sol, amount=-55.0    (SOL leaving)
 *     Row B: action=Buy,  currency=btc, amount=+0.055   (BTC arriving — alpha if > 0.05)
 *
 * CONCLUSION: The BTC balance is FULLY captured by tracking ONLY the
 * currency=btc rows. We never need to look at altcoin rows for BTC accounting.
 * The alpha comes from the difference between BTC spent on rotations vs
 * BTC received back from rotations — which is automatically captured by
 * the currency=btc rows (sells reduce actual, buys increase actual).
 *
 * Benchmark = only USD→BTC purchases (action=Buy, currency=btc)
 *             + direct BTC deposits (action=Deposit, currency=btc)
 * Actual    = all currency=btc movements (buys, sells, deposits, withdrawals)
 */

import { SfoxTransactionFull } from "./sfox";

export interface BtcAlphaResult {
  /** Client's actual current BTC balance */
  actualBtc: number;
  /** BTC the client would have if every USD→BTC purchase was just held (no trading) */
  benchmarkBtc: number;
  /** Alpha = actualBtc - benchmarkBtc */
  alphaBtc: number;
  /** Alpha as % of benchmark: (alpha / benchmark) * 100 */
  alphaPercent: number;
  /** USD value of alpha at current BTC price */
  alphaUsd: number;
  /** Timeline data for the benchmark comparison chart */
  timeline: BtcAlphaTimelinePoint[];
  /** Monthly BTC accumulation bars */
  monthlyAccumulation: MonthlyBtcAccumulation[];
  /** Plain-English performance statement */
  performanceStatement: string;
  /** Join date (date of first transaction) */
  joinDate: string | null;
}

export interface BtcAlphaTimelinePoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Actual BTC balance at this point */
  actualBtc: number;
  /** Benchmark BTC balance at this point (cumulative DCA purchases) */
  benchmarkBtc: number;
}

export interface MonthlyBtcAccumulation {
  /** Month label e.g. "Jan 2024" */
  month: string;
  /** ISO month key e.g. "2024-01" for sorting */
  monthKey: string;
  /** Net BTC change in this month (actual) */
  btcGained: number;
  /** Net BTC change in this month (benchmark) */
  benchmarkBtcGained: number;
}

/**
 * Compute BTC alpha from a full transaction history.
 *
 * @param transactions  All transactions from sFOX /v1/account/transactions
 * @param currentBtcBalance  Current BTC balance from sFOX /v1/account/balance
 * @param btcPrice  Current BTC/USD price
 */
export function computeBtcAlpha(
  transactions: SfoxTransactionFull[],
  currentBtcBalance: number,
  btcPrice: number
): BtcAlphaResult {
  // Sort transactions chronologically
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.day).getTime() - new Date(b.day).getTime()
  );

  // ── Step 1: Identify all BTC-movement events ──────────────────────────────
  //
  // We ONLY look at rows where currency === "btc".
  // This captures every BTC movement regardless of what the other side was.
  //
  // Benchmark events (what a passive DCA buyer would have):
  //   - action=Buy,     currency=btc  → USD→BTC purchase (benchmark + actual)
  //   - action=Deposit, currency=btc  → Direct BTC deposit (benchmark + actual)
  //
  // Actual-only events (trading activity that generates alpha):
  //   - action=Sell,    currency=btc  → BTC sold/rotated out (actual only, reduces balance)
  //     When BTC is later bought back via action=Buy, currency=btc after a rotation,
  //     that buy IS counted in actual (and benchmark if it was a USD→BTC purchase).
  //     The key: if BTC was sold for an altcoin and then bought back for MORE BTC,
  //     the extra BTC shows up as a larger Buy amount than the Sell amount → alpha.
  //
  // We do NOT look at altcoin rows at all — the BTC accounting is complete
  // from the BTC rows alone.

  interface BtcEvent {
    date: string;
    btcAmount: number;       // positive = gain, negative = loss
    isBenchmarkEvent: boolean;
    label: string;
  }

  const events: BtcEvent[] = [];

  for (const tx of sorted) {
    const currency = (tx.currency || "").toLowerCase();
    const action = (tx.action || "").toLowerCase();
    const amount = tx.amount || 0;
    const date = tx.day ? tx.day.slice(0, 10) : "";

    if (!date) continue;

    // Only process BTC-currency rows
    if (currency !== "btc") continue;

    if (action === "deposit") {
      // Direct BTC deposit — benchmark + actual
      const btcAmount = Math.abs(amount);
      if (btcAmount > 0) {
        events.push({ date, btcAmount, isBenchmarkEvent: true, label: "BTC Deposit" });
      }
    } else if (action === "buy") {
      // BTC received (either from USD purchase or from altcoin rotation return)
      // Both count in actual. Only USD→BTC purchases count in benchmark.
      // We distinguish by checking if price is a "normal" BTC/USD price (> $1000).
      // BTC/altcoin prices would be tiny fractions (e.g., 0.00001 BTC per SOL).
      const btcAmount = Math.abs(amount);
      if (btcAmount > 0) {
        // If price > 1000, this is a USD→BTC purchase (benchmark event)
        // If price <= 1000 or price is 0, this is BTC received from altcoin rotation
        const isUsdToBtc = (tx.price || 0) > 1000;
        events.push({
          date,
          btcAmount,
          isBenchmarkEvent: isUsdToBtc,
          label: isUsdToBtc ? "USD→BTC Purchase" : "Altcoin→BTC Rotation Return",
        });
      }
    } else if (action === "sell") {
      // BTC sold — two cases:
      //   1. BTC→USD exit (price > 1000): client cashed out BTC to USD.
      //      Treat as neutral — reduce both actual and benchmark equally.
      //      The benchmark assumes they would have sold too (it's their money).
      //   2. BTC→Altcoin rotation (price <= 1000 or 0): BTC rotated into an altcoin.
      //      Only reduces actual. Benchmark holds BTC. Alpha is generated when
      //      the altcoin is later sold back for MORE BTC than was spent.
      const btcAmount = -Math.abs(amount);
      if (btcAmount !== 0) {
        const isBtcToUsdSell = (tx.price || 0) > 1000;
        events.push({
          date,
          btcAmount,
          isBenchmarkEvent: isBtcToUsdSell,
          label: isBtcToUsdSell ? "BTC→USD Exit" : "BTC→Altcoin Rotation Out",
        });
      }
    } else if (action === "withdrawal" || action === "withdraw") {
      // BTC withdrawn to external wallet — always neutral.
      // Reduce both actual and benchmark: the benchmark assumes they would have
      // withdrawn the same BTC (it's their money leaving the program).
      const btcAmount = -Math.abs(amount);
      if (btcAmount !== 0) {
        events.push({ date, btcAmount, isBenchmarkEvent: true, label: "BTC Withdrawal" });
      }
    }
  }

  // ── Step 2: Build timeline ────────────────────────────────────────────────

  const dateSet = new Set<string>();
  for (const e of events) dateSet.add(e.date);
  const today = new Date().toISOString().slice(0, 10);
  dateSet.add(today);
  const dates = Array.from(dateSet).sort();

  let runningActual = 0;
  let runningBenchmark = 0;

  const eventsByDate = new Map<string, BtcEvent[]>();
  for (const e of events) {
    const arr = eventsByDate.get(e.date) || [];
    arr.push(e);
    eventsByDate.set(e.date, arr);
  }

  const timeline: BtcAlphaTimelinePoint[] = [];

  for (const date of dates) {
    const dayEvents = eventsByDate.get(date) || [];
    for (const e of dayEvents) {
      runningActual += e.btcAmount;
      if (e.isBenchmarkEvent) {
        runningBenchmark += e.btcAmount;
      }
    }
    timeline.push({
      date,
      actualBtc: Math.max(0, runningActual),
      benchmarkBtc: Math.max(0, runningBenchmark),
    });
  }

  // ── Step 3: Anchor actual balance to real sFOX balance ───────────────────
  //
  // Transaction history may not perfectly reconstruct balance due to fees,
  // rounding, and partial fills. Use the real current balance for the final
  // alpha calculation, but keep the timeline for charting.

  const benchmarkBtc = Math.max(0, runningBenchmark);
  const actualBtc = Math.max(0, currentBtcBalance);
  const alphaBtc = actualBtc - benchmarkBtc;
  const alphaPercent = benchmarkBtc > 0 ? (alphaBtc / benchmarkBtc) * 100 : 0;
  const alphaUsd = alphaBtc * btcPrice;

  // Update last timeline point with real balance
  if (timeline.length > 0) {
    timeline[timeline.length - 1].actualBtc = actualBtc;
    timeline[timeline.length - 1].benchmarkBtc = benchmarkBtc;
  }

  // ── Step 4: Monthly accumulation bars ────────────────────────────────────

  const monthlyMap = new Map<string, { actual: number; benchmark: number }>();

  for (const e of events) {
    const monthKey = e.date.slice(0, 7);
    const entry = monthlyMap.get(monthKey) || { actual: 0, benchmark: 0 };
    entry.actual += e.btcAmount;
    if (e.isBenchmarkEvent) {
      entry.benchmark += e.btcAmount;
    }
    monthlyMap.set(monthKey, entry);
  }

  const monthlyAccumulation: MonthlyBtcAccumulation[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, data]) => {
      const [year, month] = monthKey.split("-");
      const label = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      return {
        month: label,
        monthKey,
        btcGained: data.actual,
        benchmarkBtcGained: data.benchmark,
      };
    });

  // ── Step 5: Performance statement ────────────────────────────────────────

  const joinDate = sorted.length > 0 ? sorted[0].day?.slice(0, 10) : null;
  let performanceStatement = "";

  if (joinDate) {
    const joinDateObj = new Date(joinDate);
    const joinMonthYear = joinDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const alphaUsdFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Math.abs(alphaUsd));

    const alphaBtcAbs = Math.abs(alphaBtc).toFixed(6);

    if (alphaBtc > 0.000001) {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio has accumulated ${alphaBtcAbs} BTC more than the buy-and-hold benchmark — equivalent to ${alphaUsdFormatted} at today's price.`;
    } else if (alphaBtc < -0.000001) {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio is ${alphaBtcAbs} BTC behind the buy-and-hold benchmark. The strategy is still accumulating — this gap typically closes as rotations complete.`;
    } else {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio is tracking in line with the buy-and-hold benchmark. Alpha accumulates as rotations complete.`;
    }
  }

  return {
    actualBtc,
    benchmarkBtc,
    alphaBtc,
    alphaPercent,
    alphaUsd,
    timeline,
    monthlyAccumulation,
    performanceStatement,
    joinDate,
  };
}

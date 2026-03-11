/**
 * Background Sync Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 5 minutes. Processes clients one at a time with a 3-second pause
 * between each to stay well within sFOX rate limits.
 *
 * For each client:
 *   1. Fetch current balances from sFOX /v1/user/balance  (exact quantities)
 *   2. Fetch current market prices from sFOX /v1/markets  (no external APIs)
 *   3. Fetch full transaction history from sFOX            (for BTC alpha calc)
 *   4. Run the BTC alpha calculation engine
 *   5. Upsert the result into portfolio_snapshots
 *   6. Log the result to sync_log
 *
 * All dashboard and admin views read from portfolio_snapshots — never from sFOX
 * directly. Rate limiting, sFOX downtime, or slow responses never affect the UI.
 */

import { getDb, getAllClients, getClientCredentials } from "./db";
import { SfoxClient } from "./sfox";
import { computeBtcAlpha } from "./btcAlpha";
import { portfolioSnapshots, syncLog } from "../drizzle/schema";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const DELAY_BETWEEN_CLIENTS_MS = 3000;     // 3 seconds between clients

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncClient(userId: number, encryptedApiKey: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(`[Sync] Database not available, skipping client ${userId}`);
    return;
  }

  const startTime = Date.now();
  let status: "success" | "error" | "rate_limited" = "success";
  let errorMessage: string | undefined;

  try {
    const client = new SfoxClient(encryptedApiKey);

    // ── 1. Fetch exact balances from sFOX ────────────────────────────────────
    const balances = await client.getBalances();
    const btcBalance = balances.find((b) => b.currency === "btc");
    const actualBtcFromBalance = btcBalance?.total ?? 0;
    console.log(`[Sync] Client ${userId} balances (${balances.length} assets):`, JSON.stringify(balances.slice(0,3)));
    console.log(`[Sync] Client ${userId} BTC balance entry:`, JSON.stringify(btcBalance), `=> actualBtcFromBalance=${actualBtcFromBalance}`);

    // ── 2. Fetch current prices from sFOX markets ────────────────────────────
    // Only fetch prices for currencies the client actually holds (excluding USD)
    const heldCurrencies = balances
      .map((b) => b.currency)
      .filter((c) => c !== "usd");
    const prices = await client.getMarketPrices(heldCurrencies);
    const btcPrice = prices["btc"] || 0;
    console.log(`[Sync] Client ${userId} prices:`, JSON.stringify(prices));

    // ── 3. Fetch full transaction history ────────────────────────────────────
    const transactions = await client.getAllTransactions(2000);

    // ── 4. Run BTC alpha calculation ─────────────────────────────────────────
    // Pass the real BTC balance from the balance endpoint — not reconstructed
    const alpha = computeBtcAlpha(transactions, actualBtcFromBalance, btcPrice);

    // ── 5. Compute portfolio totals ──────────────────────────────────────────
    // Total deposited = sum of all USD deposit transactions
    const totalDepositedUsd = transactions
      .filter((tx) => {
        const action = (tx.action || "").toLowerCase();
        const currency = (tx.currency || "").toLowerCase();
        return action === "deposit" && currency === "usd" && (tx.amount || 0) > 0;
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);

    // Build balances display using real sFOX balance quantities + sFOX prices
    const balancesData = balances
      .filter((b) => b.total > 0.000001)
      .map((b) => {
        const price = b.currency === "usd" ? 1 : (prices[b.currency] || 0);
        return {
          currency: b.currency,
          total: b.total,
          usdValue: b.total * price,
          price,
        };
      })
      .filter((b) => b.usdValue > 0.01 || b.total > 0.000001)
      .sort((a, b) => {
        if (a.currency === "btc") return -1;
        if (b.currency === "btc") return 1;
        if (a.currency === "usd") return -2;
        if (b.currency === "usd") return 2;
        return b.usdValue - a.usdValue;
      });

    const totalValueUsd = balancesData.reduce((sum, b) => sum + b.usdValue, 0);
    const dollarGrowth = totalValueUsd - totalDepositedUsd;
    const percentGrowth = totalDepositedUsd > 0
      ? (dollarGrowth / totalDepositedUsd) * 100
      : 0;

    // ── 6. Serialize and upsert snapshot ────────────────────────────────────
    const chartData = alpha.timeline.map((t) => ({
      date: t.date,
      actualBtc: t.actualBtc,
      benchmarkBtc: t.benchmarkBtc,
    }));

    const monthlyBarsData = alpha.monthlyAccumulation.map((m) => ({
      month: m.month,
      monthKey: m.monthKey,
      btcGained: m.btcGained,
      benchmarkBtcGained: m.benchmarkBtcGained,
    }));

    const snapshotValues = {
      userId,
      actualBtc: alpha.actualBtc.toFixed(8),
      benchmarkBtc: alpha.benchmarkBtc.toFixed(8),
      alphaBtc: alpha.alphaBtc.toFixed(8),
      alphaPercent: alpha.alphaPercent.toFixed(4),
      alphaUsd: alpha.alphaUsd.toFixed(2),
      totalValueUsd: totalValueUsd.toFixed(2),
      totalDepositedUsd: totalDepositedUsd.toFixed(2),
      dollarGrowth: dollarGrowth.toFixed(2),
      percentGrowth: percentGrowth.toFixed(4),
      btcPrice: btcPrice.toFixed(2),
      balancesJson: JSON.stringify(balancesData),
      monthlyBarsJson: JSON.stringify(monthlyBarsData),
      chartDataJson: JSON.stringify(chartData),
      joinDate: alpha.joinDate ? new Date(alpha.joinDate) : null,
      syncedAt: new Date(),
    };

    await db
      .insert(portfolioSnapshots)
      .values(snapshotValues)
      .onDuplicateKeyUpdate({
        set: {
          actualBtc: snapshotValues.actualBtc,
          benchmarkBtc: snapshotValues.benchmarkBtc,
          alphaBtc: snapshotValues.alphaBtc,
          alphaPercent: snapshotValues.alphaPercent,
          alphaUsd: snapshotValues.alphaUsd,
          totalValueUsd: snapshotValues.totalValueUsd,
          totalDepositedUsd: snapshotValues.totalDepositedUsd,
          dollarGrowth: snapshotValues.dollarGrowth,
          percentGrowth: snapshotValues.percentGrowth,
          btcPrice: snapshotValues.btcPrice,
          balancesJson: snapshotValues.balancesJson,
          monthlyBarsJson: snapshotValues.monthlyBarsJson,
          chartDataJson: snapshotValues.chartDataJson,
          joinDate: snapshotValues.joinDate,
          syncedAt: snapshotValues.syncedAt,
        },
      });

    console.log(
      `[Sync] ✓ Client ${userId} synced in ${Date.now() - startTime}ms` +
      ` — BTC: ${alpha.actualBtc.toFixed(6)} (from balance: ${actualBtcFromBalance.toFixed(6)})` +
      ` | Benchmark: ${alpha.benchmarkBtc.toFixed(6)}` +
      ` | Alpha: ${alpha.alphaBtc.toFixed(6)} (${alpha.alphaPercent.toFixed(2)}%)` +
      ` | BTC price: $${btcPrice.toFixed(0)} (sFOX)` +
      ` | Portfolio: $${totalValueUsd.toFixed(0)}`
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes("429") || errMsg.includes("1015") || errMsg.includes("rate limit")) {
      status = "rate_limited";
      errorMessage = `Rate limited by sFOX/Cloudflare: ${errMsg}`;
      console.warn(`[Sync] ⚠ Client ${userId} rate limited — will retry next cycle`);
    } else {
      status = "error";
      errorMessage = errMsg;
      console.error(`[Sync] ✗ Client ${userId} failed: ${errMsg}`);
    }
  }

  // Always log the sync attempt
  try {
    const db2 = await getDb();
    if (db2) {
      await db2.insert(syncLog).values({
        userId,
        status,
        errorMessage: errorMessage || null,
        durationMs: Date.now() - startTime,
      });
    }
  } catch (logErr) {
    console.warn(`[Sync] Failed to write sync log for client ${userId}:`, logErr);
  }
}

async function runSyncCycle(): Promise<void> {
  console.log("[Sync] Starting sync cycle...");

  let clients: Awaited<ReturnType<typeof getAllClients>>;
  try {
    clients = await getAllClients();
  } catch (err) {
    console.error("[Sync] Failed to fetch client list:", err);
    return;
  }

  const clientsWithKeys = await Promise.all(
    clients.map(async (c) => {
      const creds = await getClientCredentials(c.id);
      return creds ? { id: c.id, encryptedKey: creds.sfoxApiKey } : null;
    })
  );

  const eligible = clientsWithKeys.filter(Boolean) as { id: number; encryptedKey: string }[];

  if (eligible.length === 0) {
    console.log("[Sync] No clients with API keys to sync.");
    return;
  }

  console.log(`[Sync] Syncing ${eligible.length} client(s)...`);

  for (let i = 0; i < eligible.length; i++) {
    await syncClient(eligible[i].id, eligible[i].encryptedKey);
    if (i < eligible.length - 1) {
      await delay(DELAY_BETWEEN_CLIENTS_MS);
    }
  }

  console.log("[Sync] Cycle complete.");
}

/**
 * Start the background sync job.
 * Call once from the server entry point.
 * Runs immediately on startup (after 10s), then every SYNC_INTERVAL_MS.
 */
export function startSyncJob(): void {
  console.log(`[Sync] Background sync job started — interval: ${SYNC_INTERVAL_MS / 1000}s`);

  setTimeout(() => {
    runSyncCycle().catch((err) => console.error("[Sync] Startup cycle failed:", err));
  }, 10000);

  setInterval(() => {
    runSyncCycle().catch((err) => console.error("[Sync] Scheduled cycle failed:", err));
  }, SYNC_INTERVAL_MS);
}

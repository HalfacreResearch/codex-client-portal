import { config } from "dotenv";
import { getDb } from "./server/db.ts";
import { SfoxClient } from "./server/sfox.ts";

config();

async function analyzeClient(clientName, userId) {
  console.log(`\n========== Analyzing ${clientName} (User ID: ${userId}) ==========\n`);
  
  const db = await getDb();
  const credentials = await db
    .select()
    .from(await import("./drizzle/schema.ts").then(m => m.clientCredentials))
    .where((await import("drizzle-orm").then(m => m.eq))(
      (await import("./drizzle/schema.ts").then(m => m.clientCredentials)).userId,
      userId
    ))
    .limit(1);

  if (!credentials || credentials.length === 0) {
    console.log(`No credentials found for ${clientName}`);
    return;
  }

  const client = new SfoxClient(credentials[0].sfoxApiKey);
  
  try {
    // Fetch all data
    const [balances, deposits, orders] = await Promise.all([
      client.getBalances(),
      client.getDeposits(),
      client.getOrders(100),
    ]);

    console.log("=== CURRENT BALANCES ===");
    balances
      .filter(b => b.total > 0)
      .forEach(b => {
        console.log(`${b.currency.toUpperCase()}: ${b.total}`);
      });

    console.log("\n=== ALL DEPOSITS (sorted by date) ===");
    const sortedDeposits = deposits.sort((a, b) => a.created_at - b.created_at);
    sortedDeposits.forEach(tx => {
      const date = new Date(tx.created_at).toISOString().split('T')[0];
      console.log(`${date} | ${tx.type} | ${tx.currency.toUpperCase()} | Amount: ${tx.amount} | Status: ${tx.status}`);
    });

    console.log("\n=== ALL ORDERS/TRADES (sorted by date) ===");
    const sortedOrders = orders.sort((a, b) => a.created_at - b.created_at);
    sortedOrders.forEach(order => {
      const date = new Date(order.created_at).toISOString().split('T')[0];
      console.log(`${date} | ${order.action} | ${order.pair} | Qty: ${order.quantity} | Price: ${order.price} | Total: ${order.total_usd || 'N/A'}`);
    });

    // Calculate USD metrics
    console.log("\n=== USD METRICS CALCULATION ===");
    const usdDeposits = deposits.filter(tx => tx.currency.toLowerCase() === "usd");
    const totalUsdDeposited = usdDeposits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    console.log(`Total USD Deposited: $${totalUsdDeposited.toFixed(2)}`);
    
    const usdBalance = balances.find(b => b.currency.toLowerCase() === "usd");
    console.log(`Current USD Balance: $${usdBalance ? usdBalance.total.toFixed(2) : '0.00'}`);

    // Calculate BTC metrics
    console.log("\n=== BTC METRICS CALCULATION ===");
    const btcBalance = balances.find(b => b.currency.toLowerCase() === "btc");
    console.log(`Current BTC Balance: ${btcBalance ? btcBalance.total : 0} BTC`);
    
    const btcDeposits = deposits.filter(tx => tx.currency.toLowerCase() === "btc");
    const totalBtcDeposited = btcDeposits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    console.log(`Total BTC Deposited/Transferred In: ${totalBtcDeposited} BTC`);
    
    const btcOrders = orders.filter(o => o.pair.toLowerCase().includes("btc"));
    const btcBought = btcOrders
      .filter(o => o.action.toLowerCase() === "buy")
      .reduce((sum, o) => sum + parseFloat(o.quantity), 0);
    const btcSold = btcOrders
      .filter(o => o.action.toLowerCase() === "sell")
      .reduce((sum, o) => sum + parseFloat(o.quantity), 0);
    
    console.log(`BTC Bought (from trades): ${btcBought} BTC`);
    console.log(`BTC Sold (from trades): ${btcSold} BTC`);
    console.log(`Total BTC Acquired (deposits + buys): ${(totalBtcDeposited + btcBought).toFixed(8)} BTC`);
    console.log(`Net BTC Acquired (deposits + buys - sells): ${(totalBtcDeposited + btcBought - btcSold).toFixed(8)} BTC`);
    
    const btcGrowth = (btcBalance ? btcBalance.total : 0) - (totalBtcDeposited + btcBought - btcSold);
    const btcGrowthPercent = (totalBtcDeposited + btcBought - btcSold) > 0 
      ? (btcGrowth / (totalBtcDeposited + btcBought - btcSold)) * 100 
      : 0;
    
    console.log(`BTC Growth: ${btcGrowth.toFixed(8)} BTC`);
    console.log(`BTC Growth %: ${btcGrowthPercent.toFixed(2)}%`);

  } catch (error) {
    console.error(`Error analyzing ${clientName}:`, error.message);
  }
}

async function main() {
  console.log("Waiting for rate limit to clear...");
  console.log("This script will analyze Van and Glenn's transaction data.\n");
  
  // Analyze Van (User ID 90044 based on earlier query)
  await analyzeClient("Van Halfacre", 90044);
  
  // Wait a bit between requests to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Analyze Glenn - need to find his user ID first
  const db = await getDb();
  const users = await db
    .select()
    .from(await import("./drizzle/schema.ts").then(m => m.users))
    .where((await import("drizzle-orm").then(m => m.like))(
      (await import("./drizzle/schema.ts").then(m => m.users)).name,
      "%Glenn%"
    ));
  
  if (users.length > 0) {
    await analyzeClient("Glenn Halfacre", users[0].id);
  } else {
    console.log("\nGlenn Halfacre not found in database");
  }
  
  process.exit(0);
}

main().catch(console.error);

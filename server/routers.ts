import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createTransport } from "nodemailer";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getClientCredentials, createSupportRequest, upsertClientCredentials, getAllClients, createClient, deleteClientCredentials, getUserById, getUserByEmail, getDb } from "./db";
import { magicLinkTokens } from "../drizzle/schema";
import { SfoxClient, getCryptoPrices } from "./sfox";
import { notifyOwner } from "./_core/notification";

const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000;

async function sendMagicLinkEmail(email: string, name: string | null, magicUrl: string) {
  const mailer = createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpPort === 465,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
  });
  const displayName = name || "there";
  await mailer.sendMail({
    from: `"BTC Treasury Codex" <${ENV.smtpFrom}>`,
    to: email,
    subject: "Your login link for BTC Treasury Codex",
    html: `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;"><h1 style="color:#f7931a;">BTC Treasury Codex</h1><p>Hi ${displayName},</p><p>Click the button below to log in to your Codex client portal. This link expires in 15 minutes.</p><div style="text-align:center;margin:40px 0;"><a href="${magicUrl}" style="background:#f7931a;color:#000;text-decoration:none;padding:16px 32px;border-radius:4px;font-size:16px;font-weight:bold;">Log In to Codex Portal</a></div><p style="color:#888;font-size:14px;">If you did not request this, ignore this email.</p><p style="color:#888;font-size:12px;">${magicUrl}</p></body></html>`,
    text: `Hi ${displayName},\n\nLogin link (expires in 15 minutes):\n${magicUrl}\n\nIf you did not request this, ignore this email.`,
  });
}

// Admin-only procedure - checks if user has admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    requestMagicLink: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email.toLowerCase().trim());
        // Always return success to prevent email enumeration
        if (!user) return { success: true, message: "If that email is registered, a login link has been sent." };
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);
        await database.insert(magicLinkTokens).values({ email: input.email.toLowerCase().trim(), token, expiresAt });
        const magicUrl = `${ENV.appUrl}/api/auth/verify?token=${token}`;
        await sendMagicLinkEmail(input.email, user.name, magicUrl);
        return { success: true, message: "Login link sent. Check your email." };
      }),
  }),

  portfolio: router({
    getData: protectedProcedure.query(async ({ ctx }) => {
      const credentials = await getClientCredentials(ctx.user.id);
      
      if (!credentials) {
        return {
          hasCredentials: false,
          error: "Your account is being set up. Please contact us if you need assistance.",
          balances: [],
          deposits: [],
          orders: [],
          prices: {},
          totalValue: 0,
          totalDeposited: 0,
          dollarGrowth: 0,
          percentGrowth: 0,
          btcMetrics: null,
        };
      }

      try {
        const client = new SfoxClient(credentials.sfoxApiKey);
        const [balances, deposits, orders, prices, allTransactions] = await Promise.all([
          client.getBalances(),
          client.getDeposits(),
          client.getOrders(1000),
          getCryptoPrices(),
          client.getAllTransactions(1000),
        ]);

        let totalValue = 0;
        const balancesWithUsd = balances
          .filter(b => b.total > 0)
          .map(b => {
            const price = prices[b.currency.toLowerCase()] || 0;
            const usdValue = b.total * price;
            totalValue += usdValue;
            return { ...b, price, usdValue };
          });

        // Calculate total USD deposited: cash deposits + BTC deposits valued at deposit time
        let totalDeposited = 0;
        for (const tx of deposits) {
          const currency = (tx.currency || "").toLowerCase();
          if (currency === "usd") {
            totalDeposited += parseFloat(tx.amount);
          } else if (currency === "btc" && tx.price) {
            // BTC deposit: use price at deposit time from sFOX API
            totalDeposited += parseFloat(tx.amount) * tx.price;
          }
        }
        const dollarGrowth = totalValue - totalDeposited;
        const percentGrowth = totalDeposited > 0 ? (dollarGrowth / totalDeposited) * 100 : 0;

        const btcBalance = balances.find(b => b.currency.toLowerCase() === "btc");
        let btcMetrics = null;
        
        if (btcBalance && btcBalance.total > 0) {
          // BTC Growth: Measures profit from BTC-pair trades
          // Formula: (Net BTC gained from trades) / (BTC spent on trades) × 100
          // Example: Spent 0.05166591 BTC on SOL, sold for 0.05259301 BTC = +1.79% growth
          
          // Get BTC deposits (baseline)
          const btcDeposits = deposits
            .filter(tx => tx.currency && tx.currency.toLowerCase() === "btc")
            .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
          

          
          // Get all BTC transactions from history
          // Fallback: if allTransactions is empty, use orders array
          let btcTransactions = [];
          if (allTransactions.length > 0) {
            btcTransactions = allTransactions.filter(tx => 
              (tx.currency || "").toLowerCase() === "btc"
            );
          } else {
            // Use orders as fallback - convert back to transaction format
            btcTransactions = orders
              .filter(o => o.pair.toLowerCase().includes("btc"))
              .map(o => ({
                id: o.id,
                currency: "btc",
                amount: parseFloat(o.quantity) * (o.action === "Sell" ? 1 : -1),
                price: parseFloat(o.price),
                timestamp: new Date(o.filled_at || o.created_at || Date.now()).getTime() / 1000,
                action: o.action
              }));
          }
          
          // DEBUG: Log first 10 transactions to see ALL fields
          console.log(`[BTC Growth Debug] Client: ${credentials.userId}`);
          console.log(`[BTC Growth Debug] Total transactions: ${allTransactions.length}`);
          console.log(`[BTC Growth Debug] First 10 transactions:`);
          allTransactions.slice(0, 10).forEach((tx, i) => {
            console.log(`  ${i + 1}. currency=${tx.currency}, symbol=${tx.symbol}, price=${tx.price}, amount=${tx.amount}, net_proceeds=${tx.net_proceeds}, action=${tx.action}, day=${tx.day}`);
          });
          
          // BTC-pair trades: Crypto trades where net_proceeds is in BTC (very small numbers)
          // For SOL/BTC trades, net_proceeds will be ~0.05 BTC, not ~$1000 USD
          // Filter: currency is NOT btc/usd AND net_proceeds < 1 (indicating BTC amounts)
          const btcPairTrades = allTransactions.filter(tx => {
            const currency = (tx.currency || "").toLowerCase();
            const netProceeds = Math.abs(tx.net_proceeds || 0);
            const price = tx.price || 0;
            
            // BTC-pair trades have:
            // 1. Currency is crypto (not btc, not usd)
            // 2. Price < 0.01 (BTC-denominated) OR net_proceeds < 1 (BTC amount)
            const isCrypto = currency !== "btc" && currency !== "usd" && currency !== "usdc";
            const hasBtcPrice = price > 0 && price < 0.01;
            const hasBtcProceeds = netProceeds > 0 && netProceeds < 1;
            
            const isMatch = isCrypto && (hasBtcPrice || hasBtcProceeds);
            
            if (isMatch) {
              console.log(`[BTC Growth Debug] Found BTC-pair trade: currency=${currency}, price=${price}, net_proceeds=${tx.net_proceeds}, amount=${tx.amount}, action=${tx.action}`);
            }
            
            return isMatch;
          });
          
          console.log(`[BTC Growth Debug] BTC-pair trades found: ${btcPairTrades.length}`);
                  
          // For BTC-pair trades, net_proceeds represents the BTC amount
          // Buy action = negative net_proceeds (spending BTC to buy crypto)
          // Sell action = positive net_proceeds (selling crypto for BTC)
          const btcSpentOnTrades = btcPairTrades
            .filter(tx => tx.action === "Buy")
            .reduce((sum, tx) => sum + Math.abs(tx.net_proceeds || 0), 0);
          
          const btcReceivedFromTrades = btcPairTrades
            .filter(tx => tx.action === "Sell")
            .reduce((sum, tx) => sum + Math.abs(tx.net_proceeds || 0), 0);
          
          // Net BTC from trades
          const btcGrowth = btcReceivedFromTrades - btcSpentOnTrades;
          
          // Calculate BTC holdings at time of first BTC-pair trade
          // by reconstructing balance from transaction history
          let btcHoldingsAtTradeTime = btcDeposits; // Default to deposits
          
          if (btcPairTrades.length > 0) {
            // Sort all BTC transactions by timestamp
            const sortedBtcTxs = btcTransactions.sort((a, b) => a.timestamp - b.timestamp);
            
            // Find timestamp of first BTC-pair trade
            const firstBtcPairTrade = btcPairTrades.sort((a, b) => a.timestamp - b.timestamp)[0];
            const firstTradeTimestamp = firstBtcPairTrade.timestamp;
            
            // Sum all BTC transactions that happened BEFORE the first BTC-pair trade
            // This includes deposits (already counted) and any BTC/USD trades
            const btcBeforeTrade = sortedBtcTxs
              .filter(tx => tx.timestamp < firstTradeTimestamp)
              .reduce((sum, tx) => sum + tx.amount, 0);
            
            // BTC holdings = net BTC from all transactions before first trade (includes deposits)
            btcHoldingsAtTradeTime = btcBeforeTrade;
          }
          
          const btcPrice = prices.btc || 0;
          
          btcMetrics = {
            totalPurchased: btcDeposits, // BTC deposits (baseline)
            totalSold: 0, // Not tracking this separately
            currentlyHeld: btcBalance.total,
            currentValue: btcBalance.total * btcPrice,
            price: btcPrice,
            btcFromTrades: btcGrowth, // Net BTC generated by Treasury
            btcHoldingsAtTradeTime, // For percentage calculation
          };
          
          console.log(`[BTC Growth Debug] Final calculation:`);
          console.log(`  btcFromTrades (btcGrowth): ${btcGrowth}`);
          console.log(`  btcHoldingsAtTradeTime: ${btcHoldingsAtTradeTime}`);
          console.log(`  btcSpentOnTrades: ${btcSpentOnTrades}`);
          console.log(`  btcReceivedFromTrades: ${btcReceivedFromTrades}`);
          console.log(`  btcDeposits: ${btcDeposits}`);
          console.log(`  Percentage: ${btcHoldingsAtTradeTime > 0 ? (btcGrowth / btcHoldingsAtTradeTime * 100).toFixed(4) : 0}%`);
        }

        const formattedOrders = orders.map(o => ({
          id: o.id,
          date: o.filled_at || o.created_at,
          action: o.action,
          pair: o.pair,
          quantity: parseFloat(o.quantity),
          price: parseFloat(o.price),
          totalUsd: parseFloat(o.amount),
          status: o.status,
        }));

        return {
          hasCredentials: true,
          error: null,
          balances: balancesWithUsd,
          deposits,
          orders: formattedOrders,
          prices,
          totalValue,
          totalDeposited,
          dollarGrowth,
          percentGrowth,
          btcMetrics,
        };
      } catch (error) {
        console.error("[Portfolio] Failed to fetch data:", error);
        return {
          hasCredentials: true,
          error: "Unable to load portfolio data. Please contact support.",
          balances: [],
          deposits: [],
          orders: [],
          prices: {},
          totalValue: 0,
          totalDeposited: 0,
          dollarGrowth: 0,
          percentGrowth: 0,
          btcMetrics: null,
        };
      }
    }),
  }),

  support: router({
    requestCall: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user;
      
      await createSupportRequest({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      });

      const timestamp = new Date().toLocaleString("en-US", {
        timeZone: "America/Chicago",
        dateStyle: "full",
        timeStyle: "short",
      });

      await notifyOwner({
        title: "New Call Request from Client",
        content: `
**Client Request for Call**

A client has requested a call through the Codex Client Portal.

**Client Details:**
- Name: ${user.name || "Not provided"}
- Email: ${user.email || "Not provided"}
- Timestamp: ${timestamp}

Please reach out to this client at your earliest convenience.
        `.trim(),
      });

      return { success: true };
    }),
  }),

  // Admin routes for managing clients
  admin: router({
    // Get all clients with their credential status
    getClients: adminProcedure.query(async () => {
      const clients = await getAllClients();
      return clients;
    }),

    // Add a new client with their sFOX API key
    addClient: adminProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Valid email is required"),
        sfoxApiKey: z.string().min(1, "sFOX API key is required"),
      }))
      .mutation(async ({ input }) => {
        const { name, email, sfoxApiKey } = input;
        
        // Create the user account
        const userId = await createClient(name, email);
        
        // Add their sFOX API key (will be encrypted)
        await upsertClientCredentials(userId, sfoxApiKey);
        
        return { success: true, userId };
      }),

    // Update a client's sFOX API key
    updateClientApiKey: adminProcedure
      .input(z.object({
        userId: z.number(),
        sfoxApiKey: z.string().min(1, "sFOX API key is required"),
      }))
      .mutation(async ({ input }) => {
        const { userId, sfoxApiKey } = input;
        await upsertClientCredentials(userId, sfoxApiKey);
        return { success: true };
      }),

    // Remove a client's API key (but keep their account)
    removeClientApiKey: adminProcedure
      .input(z.object({
        userId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await deleteClientCredentials(input.userId);
        return { success: true };
      }),

    // Debug endpoint to view raw transaction data
    debugTransactions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        const credentials = await getClientCredentials(input.userId);
        if (!credentials) {
          return { transactions: [], error: "No credentials found" };
        }
        
        const sfoxClient = new SfoxClient(credentials.sfoxApiKey);
        const allTransactions = await sfoxClient.getAllTransactions(1000);
        
        // Return first 50 transactions with all fields
        return {
          total: allTransactions.length,
          transactions: allTransactions.slice(0, 50).map(tx => ({
            day: tx.day,
            action: tx.action,
            currency: tx.currency,
            amount: tx.amount,
            symbol: tx.symbol,
            net_proceeds: tx.net_proceeds,
            price: tx.price,
          }))
        };
      }),

    getClientPortfolio: protectedProcedure      .input(z.object({
        userId: z.number(),
      }))
      .query(async ({ input }) => {
        const user = await getUserById(input.userId);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
        }

        const credentials = await getClientCredentials(input.userId);
        
        if (!credentials) {
          return {
            client: { id: user.id, name: user.name, email: user.email },
            hasCredentials: false,
            error: "No API key configured for this client.",
            balances: [],
            deposits: [],
            orders: [],
            prices: {},
            totalValue: 0,
            totalDeposited: 0,
            dollarGrowth: 0,
            percentGrowth: 0,
            btcMetrics: null,
          };
        }

        try {
          const client = new SfoxClient(credentials.sfoxApiKey);
          const [balances, deposits, orders, prices, allTransactions] = await Promise.all([
            client.getBalances(),
            client.getDeposits(),
            client.getOrders(1000),
            getCryptoPrices(),
            client.getAllTransactions(1000),
          ]);
          
          console.log(`[Admin Portfolio] Fetched ${allTransactions.length} transactions for user ${input.userId}`);
          if (allTransactions.length > 0) {
            console.log(`[Admin Portfolio] First transaction:`, JSON.stringify(allTransactions[0], null, 2));
          } else {
            console.log(`[Admin Portfolio] WARNING: No transactions returned from sFOX API`);
            console.log(`[Admin Portfolio] Balances count: ${balances.length}`);
            console.log(`[Admin Portfolio] Deposits count: ${deposits.length}`);
            console.log(`[Admin Portfolio] Orders count: ${orders.length}`);
          }
          
          let totalValue = 0;;
          const balancesWithUsd = balances
            .filter(b => b.total > 0)
            .map(b => {
              const price = prices[b.currency.toLowerCase()] || 0;
              const usdValue = b.total * price;
              totalValue += usdValue;
              return { ...b, price, usdValue };
            });

          // Calculate total USD deposited: cash deposits + BTC deposits valued at deposit time
        let totalDeposited = 0;
        for (const tx of deposits) {
          const currency = (tx.currency || "").toLowerCase();
          if (currency === "usd") {
            totalDeposited += parseFloat(tx.amount);
          } else if (currency === "btc" && tx.price) {
            // BTC deposit: use price at deposit time from sFOX API
            totalDeposited += parseFloat(tx.amount) * tx.price;
          }
        }
          const dollarGrowth = totalValue - totalDeposited;
          const percentGrowth = totalDeposited > 0 ? (dollarGrowth / totalDeposited) * 100 : 0;

          const btcBalance = balances.find(b => b.currency.toLowerCase() === "btc");
          let btcMetrics = null;
          
          if (btcBalance && btcBalance.total > 0) {
            // Get BTC deposits
            const btcDeposits = deposits
              .filter(tx => tx.currency && tx.currency.toLowerCase() === "btc")
              .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
            
            // Get all BTC transactions for timeline reconstruction
            const btcTransactions = allTransactions
              .filter(tx => (tx.currency || "").toLowerCase() === "btc")
              .map(tx => ({
                amount: tx.action === "Buy" ? tx.amount : -tx.amount,
                timestamp: new Date(tx.day).getTime(),
                action: tx.action
              }));
            
            // NET BTC GAINS APPROACH: Calculate net BTC from completed rotations
            // Group buy/sell trades by pair and calculate net BTC gained
            const btcPairTxs = allTransactions
              .filter(tx => {
                const action = (tx.action || "").toLowerCase();
                const symbol = (tx.symbol || "").toLowerCase();
                const currency = (tx.currency || "").toLowerCase();
                
                if (action !== "buy" && action !== "sell") return false;
                if (!symbol || !symbol.endsWith("btc")) return false;
                if (currency === "btc") return false;
                
                return true;
              })
              .map(tx => {
                const isBuy = (tx.action || "").toLowerCase() === "buy";
                const amount = Math.abs(tx.amount || 0);
                const price = Math.abs(tx.price || 0);
                
                // Calculate BTC amount: amount × price
                // For BTC-pair trades, price is denominated in BTC per unit of crypto
                // This works for both buy and sell
                const btcAmount = amount * price;
                
                return {
                  date: tx.day,
                  pair: (tx.symbol || "").toUpperCase(),
                  currency: (tx.currency || "").toUpperCase(),
                  isBuy,
                  btcSpent: isBuy ? btcAmount : 0,
                  btcReceived: !isBuy ? btcAmount : 0,
                };
              });
            
            // Group by pair and calculate net BTC for each rotation
            const rotationsByPair = new Map<string, { btcSpent: number; btcReceived: number; lastDate: string }>();
            
            btcPairTxs.forEach(tx => {
              const existing = rotationsByPair.get(tx.pair) || { btcSpent: 0, btcReceived: 0, lastDate: tx.date };
              rotationsByPair.set(tx.pair, {
                btcSpent: existing.btcSpent + tx.btcSpent,
                btcReceived: existing.btcReceived + tx.btcReceived,
                lastDate: new Date(tx.date) > new Date(existing.lastDate) ? tx.date : existing.lastDate,
              });
            });
            
            // Convert to array with net BTC calculated
            const btcPairTrades = Array.from(rotationsByPair.entries())
              .map(([pair, data]) => ({
                pair,
                date: data.lastDate,
                btcSpent: data.btcSpent,
                btcReceived: data.btcReceived,
                netBtc: data.btcReceived - data.btcSpent,
                percentGain: data.btcSpent > 0 ? ((data.btcReceived - data.btcSpent) / data.btcSpent) * 100 : 0,
              }))
              .filter(trade => trade.btcSpent > 0 && trade.btcReceived > 0) // Only show completed rotations
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            console.log(`[BTC Rotations] Found ${btcPairTrades.length} completed rotations for userId=${input.userId}`);

            
            const btcPrice = prices.btc || 0;
            
            btcMetrics = {
              totalPurchased: btcDeposits,
              totalSold: 0,
              currentlyHeld: btcBalance.total,
              currentValue: btcBalance.total * btcPrice,
              price: btcPrice,
              btcPairTrades, // Array of completed rotations with net BTC // Array of BTC-pair trades for display
            };
            

          }
          const formattedOrders = orders.map(o => ({
            id: o.id,
            date: o.filled_at || o.created_at,
            action: o.action,
            pair: o.pair,
            quantity: parseFloat(o.quantity),
            price: parseFloat(o.price),
            totalUsd: parseFloat(o.amount),
            status: o.status,
          }));

          return {
            client: { id: user.id, name: user.name, email: user.email },
            hasCredentials: true,
            error: null,
            balances: balancesWithUsd,
            deposits,
            orders: formattedOrders,
            prices,
            totalValue,
            totalDeposited,
            dollarGrowth,
            percentGrowth,
            btcMetrics,
            debugTotalTransactions: allTransactions.length,
            debugTransactions: allTransactions.slice(0, 20).map((tx: any) => ({
              day: tx.day,
              action: tx.action,
              currency: tx.currency,
              amount: tx.amount,
              symbol: tx.symbol || "NULL",
              net_proceeds: tx.net_proceeds,
            })),
          };
        } catch (error: any) {
          console.error("\n========== ADMIN PORTFOLIO ERROR ==========");
          console.error("[Admin] Failed to fetch client portfolio for userId:", input.userId);
          console.error("[Admin] Error message:", error?.message || error);
          console.error("[Admin] Error stack:", error?.stack);
          console.error("[Admin] Full error:", JSON.stringify(error?.response?.data || error, null, 2));
          console.error("==========================================\n");
          return {
            client: { id: user.id, name: user.name, email: user.email },
            hasCredentials: true,
            error: "Unable to load portfolio data. API key may be invalid.",
            balances: [],
            deposits: [],
            orders: [],
            prices: {},
            totalValue: 0,
            totalDeposited: 0,
            dollarGrowth: 0,
            percentGrowth: 0,
            btcMetrics: null,
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

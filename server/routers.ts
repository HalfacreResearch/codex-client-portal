import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getClientCredentials, createSupportRequest, upsertClientCredentials, getAllClients, createClient, deleteClientCredentials, getUserById } from "./db";
import { SfoxClient, getCryptoPrices } from "./sfox";
import { notifyOwner } from "./_core/notification";

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
          
          // DEBUG: Log all transactions to see structure
          console.log(`[BTC Growth Debug] Client ID: ${credentials.userId}`);
          console.log(`[BTC Growth Debug] Total transactions: ${allTransactions.length}`);
          
          // Sample 10 transactions with different currencies
          const sampleTxs = allTransactions.slice(0, 20).map(tx => ({
            currency: tx.currency,
            price: tx.price,
            amount: tx.amount,
            action: tx.action
          }));
          console.log(`[BTC Growth Debug] Sample transactions:`, JSON.stringify(sampleTxs, null, 2));
          
          // BTC-pair trades are crypto/BTC pairs (like SOL/BTC, LINK/BTC)
          // They have BTC-denominated prices (0.0001 to 0.01) and currency is NOT 'btc' or 'usd'
          // This excludes BTC/USD trades which have currency='btc'
          const btcPairTrades = allTransactions.filter(tx => {
            const price = tx.price || 0;
            const currency = (tx.currency || "").toLowerCase();
            // Must have BTC-denominated price AND not be a BTC/USD trade
            return price > 0 && price < 0.01 && currency !== "btc" && currency !== "usd";
          });
          
          console.log(`[BTC Growth Debug] BTC-pair trades found: ${btcPairTrades.length}`);
          if (btcPairTrades.length > 0) {
            console.log(`[BTC Growth Debug] BTC-pair trades:`, JSON.stringify(btcPairTrades.map(tx => ({
              currency: tx.currency,
              price: tx.price,
              amount: tx.amount,
              action: tx.action
            })), null, 2));
          }
                  
          // For BTC-pair trades, amount is in the crypto currency (SOL, LINK, etc.)
          // We need to multiply by price to get BTC value
          // Buy action = spending BTC to buy crypto
          // Sell action = selling crypto for BTC (receiving BTC)
          const btcSpentOnTrades = btcPairTrades
            .filter(tx => tx.action === "Buy")
            .reduce((sum, tx) => sum + Math.abs(tx.amount) * (tx.price || 0), 0);
          
          const btcReceivedFromTrades = btcPairTrades
            .filter(tx => tx.action === "Sell")
            .reduce((sum, tx) => sum + Math.abs(tx.amount) * (tx.price || 0), 0);
          
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

    // Get a specific client's portfolio data (for admin viewing)
    getClientPortfolio: adminProcedure
      .input(z.object({
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
            // Get BTC from trades (buy orders)
            const btcOrders = orders.filter(o => o.pair.toLowerCase().includes("btc"));
            const btcBought = btcOrders.filter(o => o.action === "Buy").reduce((sum, o) => sum + parseFloat(o.quantity), 0);
            const btcSold = btcOrders.filter(o => o.action === "Sell").reduce((sum, o) => sum + parseFloat(o.quantity), 0);
            
            // Get BTC from deposits/transfers (these count as "acquired" BTC)
            const btcDeposits = deposits
              .filter(tx => tx.currency && tx.currency.toLowerCase() === "btc")
              .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
            
            // Total BTC acquired = bought + deposited
            const totalBtcAcquired = btcBought + btcDeposits;
            
            const btcPrice = prices.btc || 0;
            
            btcMetrics = {
              totalPurchased: totalBtcAcquired, // Includes both purchases and deposits
              totalSold: btcSold,
              currentlyHeld: btcBalance.total,
              currentValue: btcBalance.total * btcPrice,
              price: btcPrice,
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
          };
        } catch (error: any) {
          console.error("[Admin] Failed to fetch client portfolio:", error?.message || error);
          console.error("[Admin] Full error:", JSON.stringify(error?.response?.data || error, null, 2));
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

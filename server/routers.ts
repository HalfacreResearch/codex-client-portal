import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createTransport } from "nodemailer";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getClientCredentials,
  createSupportRequest,
  upsertClientCredentials,
  getAllClients,
  createClient,
  deleteClientCredentials,
  getUserById,
  getUserByEmail,
  getDb,
} from "./db";
import { magicLinkTokens, portfolioSnapshots } from "../drizzle/schema";
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

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

/**
 * Read a client's portfolio snapshot from the database.
 * Returns null if no snapshot exists yet (sync hasn't run).
 */
async function getPortfolioSnapshot(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Parse a portfolio snapshot row into the shape the frontend expects.
 */
function parseSnapshot(snap: NonNullable<Awaited<ReturnType<typeof getPortfolioSnapshot>>>) {
  return {
    actualBtc: parseFloat(snap.actualBtc),
    benchmarkBtc: parseFloat(snap.benchmarkBtc),
    alphaBtc: parseFloat(snap.alphaBtc),
    alphaPercent: parseFloat(snap.alphaPercent),
    alphaUsd: parseFloat(snap.alphaUsd),
    totalValueUsd: parseFloat(snap.totalValueUsd),
    totalDepositedUsd: parseFloat(snap.totalDepositedUsd),
    dollarGrowth: parseFloat(snap.dollarGrowth),
    percentGrowth: parseFloat(snap.percentGrowth),
    btcPrice: parseFloat(snap.btcPrice),
    balances: JSON.parse(snap.balancesJson || "[]"),
    monthlyBars: JSON.parse(snap.monthlyBarsJson || "[]"),
    chartData: JSON.parse(snap.chartDataJson || "[]"),
    joinDate: snap.joinDate ? snap.joinDate.toISOString().slice(0, 10) : null,
    syncedAt: snap.syncedAt.toISOString(),
  };
}

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ────────────────────────────────────────────────────────────────
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
        if (!user) return { success: true, message: "If that email is registered, a login link has been sent." };
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);
        await database.insert(magicLinkTokens).values({ email: input.email.toLowerCase().trim(), token, expiresAt });
        const magicUrl = `${ENV.appUrl}/auth/verify?token=${token}`;
        await sendMagicLinkEmail(input.email, user.name, magicUrl);
        return { success: true, message: "Login link sent. Check your email." };
      }),
  }),

  // ─── Portfolio (client self-view) ────────────────────────────────────────
  // Reads from portfolio_snapshots — never calls sFOX directly.
  // Data is kept fresh by the background sync job (runs every 5 minutes).
  portfolio: router({
    getData: protectedProcedure.query(async ({ ctx }) => {
      const credentials = await getClientCredentials(ctx.user.id);

      if (!credentials) {
        return {
          hasCredentials: false,
          syncPending: false,
          error: "Your account is being set up. Please contact us if you need assistance.",
          snapshot: null,
        };
      }

      const snap = await getPortfolioSnapshot(ctx.user.id);

      if (!snap) {
        return {
          hasCredentials: true,
          syncPending: true,
          error: null,
          snapshot: null,
        };
      }

      return {
        hasCredentials: true,
        syncPending: false,
        error: null,
        snapshot: parseSnapshot(snap),
      };
    }),
  }),

  // ─── Support ─────────────────────────────────────────────────────────────
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

  // ─── Admin ───────────────────────────────────────────────────────────────
  admin: router({
    // List all clients with credential status and last sync time
    getClients: adminProcedure.query(async () => {
      const clients = await getAllClients();
      const db = await getDb();
      if (!db) return clients.map(c => ({ ...c, syncedAt: null, alphaPercent: null }));

      // Attach snapshot metadata to each client
      const withAlpha = await Promise.all(
        clients.map(async (c) => {
          const snap = await getPortfolioSnapshot(c.id);
          return {
            ...c,
            syncedAt: snap?.syncedAt?.toISOString() || null,
            alphaPercent: snap ? parseFloat(snap.alphaPercent) : null,
            alphaBtc: snap ? parseFloat(snap.alphaBtc) : null,
          };
        })
      );
      return withAlpha;
    }),

    // Add a new client
    addClient: adminProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Valid email is required"),
        sfoxApiKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { name, email, sfoxApiKey } = input;
        const userId = await createClient(name, email);
        if (sfoxApiKey && sfoxApiKey.trim()) {
          await upsertClientCredentials(userId, sfoxApiKey.trim());
        }
        return { success: true, userId };
      }),

    // Update a client's sFOX API key
    updateClientApiKey: adminProcedure
      .input(z.object({
        userId: z.number(),
        sfoxApiKey: z.string().min(1, "sFOX API key is required"),
      }))
      .mutation(async ({ input }) => {
        await upsertClientCredentials(input.userId, input.sfoxApiKey);
        return { success: true };
      }),

    // Remove a client's API key
    removeClientApiKey: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteClientCredentials(input.userId);
        return { success: true };
      }),

    // Send a magic link to a client
    sendClientMagicLink: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const user = await getUserById(input.userId);
        if (!user || !user.email) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
        }
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);
        await database.insert(magicLinkTokens).values({ email: user.email.toLowerCase(), token, expiresAt });
        const magicUrl = `${ENV.appUrl}/auth/verify?token=${token}`;
        await sendMagicLinkEmail(user.email, user.name, magicUrl);
        return { success: true };
      }),

    // Get full portfolio snapshot for a specific client (admin view)
    // Reads from DB — never calls sFOX directly.
    getClientPortfolio: adminProcedure
      .input(z.object({ userId: z.number() }))
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
            syncPending: false,
            error: "No API key configured for this client.",
            snapshot: null,
          };
        }

        const snap = await getPortfolioSnapshot(input.userId);

        if (!snap) {
          return {
            client: { id: user.id, name: user.name, email: user.email },
            hasCredentials: true,
            syncPending: true,
            error: null,
            snapshot: null,
          };
        }

        return {
          client: { id: user.id, name: user.name, email: user.email },
          hasCredentials: true,
          syncPending: false,
          error: null,
          snapshot: parseSnapshot(snap),
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;

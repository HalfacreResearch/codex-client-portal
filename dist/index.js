// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/magicLink.ts
import { and, eq as eq2, gt } from "drizzle-orm";
import { createTransport } from "nodemailer";
import { nanoid } from "nanoid";

// drizzle/schema.ts
import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var clientCredentials = mysqlTable("client_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sfoxApiKey: text("sfoxApiKey").notNull(),
  // Encrypted API key
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var supportRequests = mysqlTable("support_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: text("userName"),
  userEmail: varchar("userEmail", { length: 320 }),
  status: mysqlEnum("status", ["pending", "contacted", "resolved"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var magicLinkTokens = mysqlTable("magic_link_tokens", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  // e.g. "2025-03"
  fileUrl: text("fileUrl").notNull(),
  // URL to the uploaded PDF
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var adminMessages = mysqlTable("admin_messages", {
  id: int("id").autoincrement().primaryKey(),
  toUserId: int("toUserId"),
  // null = broadcast to all
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var portfolioSnapshots = mysqlTable("portfolio_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // BTC alpha metrics (stored as strings to preserve decimal precision)
  actualBtc: text("actualBtc").notNull().default("0"),
  benchmarkBtc: text("benchmarkBtc").notNull().default("0"),
  alphaBtc: text("alphaBtc").notNull().default("0"),
  alphaPercent: text("alphaPercent").notNull().default("0"),
  alphaUsd: text("alphaUsd").notNull().default("0"),
  // Portfolio totals
  totalValueUsd: text("totalValueUsd").notNull().default("0"),
  totalDepositedUsd: text("totalDepositedUsd").notNull().default("0"),
  dollarGrowth: text("dollarGrowth").notNull().default("0"),
  percentGrowth: text("percentGrowth").notNull().default("0"),
  btcPrice: text("btcPrice").notNull().default("0"),
  // Serialized JSON for charts and UI
  balancesJson: text("balancesJson").notNull().default("[]"),
  // [{currency, total, usdValue, price}]
  monthlyBarsJson: text("monthlyBarsJson").notNull().default("[]"),
  // [{month, btcGained}]
  chartDataJson: text("chartDataJson").notNull().default("[]"),
  // [{date, actualBtc, benchmarkBtc}]
  // Join date (date of first BTC purchase)
  joinDate: timestamp("joinDate"),
  // Sync metadata
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var syncLog = mysqlTable("sync_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["success", "error", "rate_limited"]).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// server/sfox.ts
import axios from "axios";
import * as crypto from "crypto";
var SFOX_API_BASE = "https://api.sfox.com";
var ENCRYPTION_KEY = process.env.JWT_SECRET || "default-encryption-key-change-me";
function encryptApiKey(plainKey) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}
function decryptApiKey(encryptedKey) {
  const [ivHex, authTagHex, encrypted] = encryptedKey.split(":");
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted key format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
var SfoxClient = class {
  apiKey;
  constructor(encryptedApiKey) {
    this.apiKey = decryptApiKey(encryptedApiKey);
  }
  async request(endpoint, params) {
    const url = new URL(endpoint, SFOX_API_BASE);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 15e3
    });
    return response.data;
  }
  /**
   * Get current account balances for all assets.
   * Returns exact quantities held — no prices included.
   * Use getMarketPrices() to get current USD prices.
   *
   * sFOX /v1/user/balance returns an array of balance objects,
   * one per currency, with available + held quantities.
   */
  async getBalances() {
    const data = await this.request("/v1/user/balance");
    return data.map((item) => {
      const available = Number(item.available) || 0;
      const held = Number(item.held) || 0;
      const balance = Number(item.balance) || 0;
      const total = balance > 0 ? balance : available + held;
      return {
        currency: (item.currency || "").toLowerCase(),
        available,
        held,
        total
      };
    }).filter((b) => b.total > 0);
  }
  /**
   * Get current market prices from sFOX for a set of currency pairs.
   * Uses /v1/offer/buy?quantity=10&pair=XXXUSD to get the current best price.
   * quantity=10 ensures we meet sFOX's $5 minimum order for low-price assets like XRP.
   * Fetches prices for all currencies in the provided list.
   *
   * Returns a map of currency → USD price, e.g. { btc: 83000, eth: 2100, ... }
   * USD itself is always 1.
   */
  async getMarketPrices(currencies = ["btc", "eth", "sol", "xrp", "link"]) {
    const prices = { usd: 1 };
    for (const currency of currencies) {
      if (currency === "usd") continue;
      try {
        const pair = `${currency}usd`;
        const result = await this.request(`/v1/offer/buy`, {
          quantity: "10",
          // Must be >=10 to meet sFOX $5 minimum for low-price assets (e.g. XRP ~$1.38)
          pair
        });
        const price = Number(result.price) || Number(result.vwap) || 0;
        if (price > 0) {
          prices[currency] = price;
        }
      } catch (err) {
        console.warn(`[sFOX] Could not fetch price for ${currency}:`, err instanceof Error ? err.message : err);
      }
    }
    return prices;
  }
  /**
   * Get all transactions for BTC alpha calculation.
   * Fetches from 2024-01-01 to capture full history.
   * Logs the first transaction for debugging.
   */
  async getAllTransactions(limit = 2e3) {
    const from = (/* @__PURE__ */ new Date("2024-01-01T00:00:00Z")).getTime();
    console.log(`[sFOX] Fetching transactions from ${new Date(from).toISOString()}, limit=${limit}`);
    const result = await this.request("/v1/account/transactions", {
      limit: limit.toString(),
      from: from.toString()
    });
    console.log(`[sFOX] Received ${result.length} transactions`);
    return result;
  }
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getClientCredentials(userId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get credentials: database not available");
    return void 0;
  }
  const result = await db.select().from(clientCredentials).where(eq(clientCredentials.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function upsertClientCredentials(userId, plainApiKey) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const encryptedKey = encryptApiKey(plainApiKey);
  const existing = await getClientCredentials(userId);
  if (existing) {
    await db.update(clientCredentials).set({ sfoxApiKey: encryptedKey, updatedAt: /* @__PURE__ */ new Date() }).where(eq(clientCredentials.userId, userId));
  } else {
    await db.insert(clientCredentials).values({
      userId,
      sfoxApiKey: encryptedKey
    });
  }
}
async function createSupportRequest(request) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const result = await db.insert(supportRequests).values(request);
  return result;
}
async function getAllClients() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  const allUsers = await db.select().from(users).where(eq(users.role, "user")).orderBy(users.createdAt);
  const clientsWithStatus = await Promise.all(
    allUsers.map(async (user) => {
      const creds = await getClientCredentials(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        hasApiKey: !!creds,
        createdAt: user.createdAt,
        lastSignedIn: user.lastSignedIn
      };
    })
  );
  return clientsWithStatus;
}
async function createClient(name, email) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error("A client with this email already exists");
  }
  const pendingOpenId = `pending-${email}-${Date.now()}`;
  const result = await db.insert(users).values({
    openId: pendingOpenId,
    name,
    email,
    role: "user"
  });
  const insertId = Number(result[0].insertId);
  return insertId;
}
async function deleteClientCredentials(userId) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  await db.delete(clientCredentials).where(eq(clientCredentials.userId, userId));
}
async function getUserById(userId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/env.ts
var ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // SMTP for magic link emails
  smtpHost: process.env.SMTP_HOST ?? "smtp.hostinger.com",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "465"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@codexyield.com",
  // App base URL for magic link generation
  appUrl: process.env.APP_URL ?? "https://client.codexyield.com"
};

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var SDKServer = class {
  getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }
  async createSessionToken(openId, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({ openId, name: options.name || "" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) return null;
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, name } = payload;
      if (!isNonEmptyString(openId)) return null;
      return { openId, name: isNonEmptyString(name) ? name : "" };
    } catch {
      return null;
    }
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) throw ForbiddenError("Invalid session cookie");
    const user = await getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    await upsertUser({ openId: user.openId, lastSignedIn: /* @__PURE__ */ new Date() });
    return user;
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) return /* @__PURE__ */ new Map();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
};
var sdk = new SDKServer();

// server/_core/magicLink.ts
var MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1e3;
function createMailer() {
  return createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpPort === 465,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass
    }
  });
}
async function sendMagicLinkEmail(email, name, magicUrl) {
  const mailer = createMailer();
  const displayName = name || "there";
  await mailer.sendMail({
    from: `"BTC Treasury Codex" <${ENV.smtpFrom}>`,
    to: email,
    subject: "Your login link for BTC Treasury Codex",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="background:#0a0a0a;color:#ffffff;font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="color:#f7931a;font-size:24px;margin:0;">BTC Treasury Codex</h1>
          </div>
          <p style="font-size:16px;line-height:1.6;">Hi ${displayName},</p>
          <p style="font-size:16px;line-height:1.6;">Click the button below to log in to your Codex client portal. This link expires in 15 minutes and can only be used once.</p>
          <div style="text-align:center;margin:40px 0;">
            <a href="${magicUrl}" style="background:#f7931a;color:#000000;text-decoration:none;padding:16px 32px;border-radius:4px;font-size:16px;font-weight:bold;display:inline-block;">
              Log In to Codex Portal
            </a>
          </div>
          <p style="font-size:14px;color:#888888;line-height:1.6;">If you did not request this link, you can safely ignore this email. Your account has not been accessed.</p>
          <p style="font-size:14px;color:#888888;">Or copy and paste this URL into your browser:<br/><span style="color:#f7931a;">${magicUrl}</span></p>
          <hr style="border:1px solid #222;margin:32px 0;" />
          <p style="font-size:12px;color:#555555;text-align:center;">BTC Treasury Codex &bull; codexyield.com</p>
        </body>
      </html>
    `,
    text: `Hi ${displayName},

Click this link to log in to your Codex client portal (expires in 15 minutes):

${magicUrl}

If you did not request this, ignore this email.

-- BTC Treasury Codex`
  });
}
function registerMagicLinkRoutes(app) {
  app.post("/api/auth/magic-link", async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      res.json({ success: true, message: "If that email is registered, a login link has been sent." });
      return;
    }
    try {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const token = nanoid(64);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);
      await database.insert(magicLinkTokens).values({
        email: normalizedEmail,
        token,
        expiresAt
      });
      const magicUrl = `${ENV.appUrl}/api/auth/verify?token=${token}`;
      await sendMagicLinkEmail(normalizedEmail, user.name, magicUrl);
      res.json({ success: true, message: "Login link sent. Check your email." });
    } catch (error) {
      console.error("[MagicLink] Failed to send magic link:", error);
      res.status(500).json({ error: "Failed to send login link. Please try again." });
    }
  });
  app.get("/api/auth/verify", async (req, res) => {
    const token = req.query.token;
    if (!token) {
      res.redirect(302, "/?error=invalid_token");
      return;
    }
    try {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const now = /* @__PURE__ */ new Date();
      const [tokenRecord] = await database.select().from(magicLinkTokens).where(
        and(
          eq2(magicLinkTokens.token, token),
          eq2(magicLinkTokens.used, false),
          gt(magicLinkTokens.expiresAt, now)
        )
      ).limit(1);
      if (!tokenRecord) {
        res.redirect(302, "/?error=expired_token");
        return;
      }
      await database.update(magicLinkTokens).set({ used: true }).where(eq2(magicLinkTokens.id, tokenRecord.id));
      const user = await getUserByEmail(tokenRecord.email);
      if (!user) {
        res.redirect(302, "/?error=user_not_found");
        return;
      }
      await upsertUser({
        openId: user.openId,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      if (user.role === "admin") {
        res.redirect(302, "/admin");
      } else {
        res.redirect(302, "/dashboard");
      }
    } catch (error) {
      console.error("[MagicLink] Verification failed:", error);
      res.redirect(302, "/?error=server_error");
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ success: true });
  });
}

// server/routers.ts
import { TRPCError as TRPCError2 } from "@trpc/server";
import { z as z2 } from "zod";
import { eq as eq3 } from "drizzle-orm";
import { nanoid as nanoid2 } from "nanoid";
import { createTransport as createTransport3 } from "nodemailer";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { createTransport as createTransport2 } from "nodemailer";
async function notifyOwner(payload) {
  const { title, content } = payload;
  if (!title?.trim() || !content?.trim()) {
    console.warn("[Notification] Missing title or content");
    return false;
  }
  try {
    const mailer = createTransport2({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpPort === 465,
      auth: { user: ENV.smtpUser, pass: ENV.smtpPass }
    });
    await mailer.sendMail({
      from: `"BTC Treasury Codex" <${ENV.smtpFrom}>`,
      to: ENV.smtpFrom,
      subject: `[Codex Portal] ${title}`,
      html: `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;"><h2 style="color:#f7931a;">${title}</h2><div style="white-space:pre-wrap;line-height:1.6;">${content.replace(/\n/g, "<br>")}</div></body></html>`,
      text: `${title}

${content}`
    });
    return true;
  } catch (error) {
    console.warn("[Notification] Failed to send email notification:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var MAGIC_LINK_EXPIRY_MS2 = 15 * 60 * 1e3;
async function sendMagicLinkEmail2(email, name, magicUrl) {
  const mailer = createTransport3({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpPort === 465,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPass }
  });
  const displayName = name || "there";
  await mailer.sendMail({
    from: `"BTC Treasury Codex" <${ENV.smtpFrom}>`,
    to: email,
    subject: "Your login link for BTC Treasury Codex",
    html: `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;"><h1 style="color:#f7931a;">BTC Treasury Codex</h1><p>Hi ${displayName},</p><p>Click the button below to log in to your Codex client portal. This link expires in 15 minutes.</p><div style="text-align:center;margin:40px 0;"><a href="${magicUrl}" style="background:#f7931a;color:#000;text-decoration:none;padding:16px 32px;border-radius:4px;font-size:16px;font-weight:bold;">Log In to Codex Portal</a></div><p style="color:#888;font-size:14px;">If you did not request this, ignore this email.</p><p style="color:#888;font-size:12px;">${magicUrl}</p></body></html>`,
    text: `Hi ${displayName},

Login link (expires in 15 minutes):
${magicUrl}

If you did not request this, ignore this email.`
  });
}
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError2({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
async function getPortfolioSnapshot(userId) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portfolioSnapshots).where(eq3(portfolioSnapshots.userId, userId)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}
function parseSnapshot(snap) {
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
    syncedAt: snap.syncedAt.toISOString()
  };
}
var appRouter = router({
  system: systemRouter,
  // ─── Auth ────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    requestMagicLink: publicProcedure.input(z2.object({ email: z2.string().email() })).mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email.toLowerCase().trim());
      if (!user) return { success: true, message: "If that email is registered, a login link has been sent." };
      const database = await getDb();
      if (!database) throw new TRPCError2({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const token = nanoid2(64);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS2);
      await database.insert(magicLinkTokens).values({ email: input.email.toLowerCase().trim(), token, expiresAt });
      const magicUrl = `${ENV.appUrl}/auth/verify?token=${token}`;
      await sendMagicLinkEmail2(input.email, user.name, magicUrl);
      return { success: true, message: "Login link sent. Check your email." };
    })
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
          snapshot: null
        };
      }
      const snap = await getPortfolioSnapshot(ctx.user.id);
      if (!snap) {
        return {
          hasCredentials: true,
          syncPending: true,
          error: null,
          snapshot: null
        };
      }
      return {
        hasCredentials: true,
        syncPending: false,
        error: null,
        snapshot: parseSnapshot(snap)
      };
    })
  }),
  // ─── Support ─────────────────────────────────────────────────────────────
  support: router({
    requestCall: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user;
      await createSupportRequest({
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      });
      const timestamp2 = (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        dateStyle: "full",
        timeStyle: "short"
      });
      await notifyOwner({
        title: "New Call Request from Client",
        content: `
**Client Request for Call**
A client has requested a call through the Codex Client Portal.
**Client Details:**
- Name: ${user.name || "Not provided"}
- Email: ${user.email || "Not provided"}
- Timestamp: ${timestamp2}
Please reach out to this client at your earliest convenience.
        `.trim()
      });
      return { success: true };
    })
  }),
  // ─── Admin ───────────────────────────────────────────────────────────────
  admin: router({
    // List all clients with credential status and last sync time
    getClients: adminProcedure2.query(async () => {
      const clients = await getAllClients();
      const db = await getDb();
      if (!db) return clients.map((c) => ({ ...c, syncedAt: null, alphaPercent: null }));
      const withAlpha = await Promise.all(
        clients.map(async (c) => {
          const snap = await getPortfolioSnapshot(c.id);
          return {
            ...c,
            syncedAt: snap?.syncedAt?.toISOString() || null,
            alphaPercent: snap ? parseFloat(snap.alphaPercent) : null,
            alphaBtc: snap ? parseFloat(snap.alphaBtc) : null
          };
        })
      );
      return withAlpha;
    }),
    // Add a new client
    addClient: adminProcedure2.input(z2.object({
      name: z2.string().min(1, "Name is required"),
      email: z2.string().email("Valid email is required"),
      sfoxApiKey: z2.string().optional()
    })).mutation(async ({ input }) => {
      const { name, email, sfoxApiKey } = input;
      const userId = await createClient(name, email);
      if (sfoxApiKey && sfoxApiKey.trim()) {
        await upsertClientCredentials(userId, sfoxApiKey.trim());
      }
      return { success: true, userId };
    }),
    // Update a client's sFOX API key
    updateClientApiKey: adminProcedure2.input(z2.object({
      userId: z2.number(),
      sfoxApiKey: z2.string().min(1, "sFOX API key is required")
    })).mutation(async ({ input }) => {
      await upsertClientCredentials(input.userId, input.sfoxApiKey);
      return { success: true };
    }),
    // Remove a client's API key
    removeClientApiKey: adminProcedure2.input(z2.object({ userId: z2.number() })).mutation(async ({ input }) => {
      await deleteClientCredentials(input.userId);
      return { success: true };
    }),
    // Send a magic link to a client
    sendClientMagicLink: adminProcedure2.input(z2.object({ userId: z2.number() })).mutation(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user || !user.email) {
        throw new TRPCError2({ code: "NOT_FOUND", message: "Client not found" });
      }
      const database = await getDb();
      if (!database) throw new TRPCError2({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const token = nanoid2(64);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS2);
      await database.insert(magicLinkTokens).values({ email: user.email.toLowerCase(), token, expiresAt });
      const magicUrl = `${ENV.appUrl}/auth/verify?token=${token}`;
      await sendMagicLinkEmail2(user.email, user.name, magicUrl);
      return { success: true };
    }),
    // Get full portfolio snapshot for a specific client (admin view)
    // Reads from DB — never calls sFOX directly.
    getClientPortfolio: adminProcedure2.input(z2.object({ userId: z2.number() })).query(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user) {
        throw new TRPCError2({ code: "NOT_FOUND", message: "Client not found" });
      }
      const credentials = await getClientCredentials(input.userId);
      if (!credentials) {
        return {
          client: { id: user.id, name: user.name, email: user.email },
          hasCredentials: false,
          syncPending: false,
          error: "No API key configured for this client.",
          snapshot: null
        };
      }
      const snap = await getPortfolioSnapshot(input.userId);
      if (!snap) {
        return {
          client: { id: user.id, name: user.name, email: user.email },
          hasCredentials: true,
          syncPending: true,
          error: null,
          snapshot: null
        };
      }
      return {
        client: { id: user.id, name: user.name, email: user.email },
        hasCredentials: true,
        syncPending: false,
        error: null,
        snapshot: parseSnapshot(snap)
      };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid as nanoid3 } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
var plugins = [react(), tailwindcss()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1", ".codexyield.com"],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid3()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (req, res) => {
    if (req.originalUrl.startsWith("/api/")) {
      res.status(404).json({ error: "API route not found" });
      return;
    }
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/btcAlpha.ts
function computeBtcAlpha(transactions, currentBtcBalance, btcPrice) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.day).getTime() - new Date(b.day).getTime()
  );
  const events = [];
  for (const tx of sorted) {
    const currency = (tx.currency || "").toLowerCase();
    const action = (tx.action || "").toLowerCase();
    const amount = tx.amount || 0;
    const date = tx.day ? tx.day.slice(0, 10) : "";
    if (!date) continue;
    if (currency !== "btc") continue;
    if (action === "deposit") {
      const btcAmount = Math.abs(amount);
      if (btcAmount > 0) {
        events.push({ date, btcAmount, isBenchmarkEvent: true, label: "BTC Deposit" });
      }
    } else if (action === "buy") {
      const btcAmount = Math.abs(amount);
      if (btcAmount > 0) {
        const isUsdToBtc = (tx.price || 0) > 1e3;
        events.push({
          date,
          btcAmount,
          isBenchmarkEvent: isUsdToBtc,
          label: isUsdToBtc ? "USD\u2192BTC Purchase" : "Altcoin\u2192BTC Rotation Return"
        });
      }
    } else if (action === "sell") {
      const btcAmount = -Math.abs(amount);
      if (btcAmount !== 0) {
        const isBtcToUsdSell = (tx.price || 0) > 1e3;
        events.push({
          date,
          btcAmount,
          isBenchmarkEvent: isBtcToUsdSell,
          label: isBtcToUsdSell ? "BTC\u2192USD Exit" : "BTC\u2192Altcoin Rotation Out"
        });
      }
    } else if (action === "withdrawal" || action === "withdraw") {
      const btcAmount = -Math.abs(amount);
      if (btcAmount !== 0) {
        events.push({ date, btcAmount, isBenchmarkEvent: true, label: "BTC Withdrawal" });
      }
    }
  }
  const dateSet = /* @__PURE__ */ new Set();
  for (const e of events) dateSet.add(e.date);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  dateSet.add(today);
  const dates = Array.from(dateSet).sort();
  let runningActual = 0;
  let runningBenchmark = 0;
  const eventsByDate = /* @__PURE__ */ new Map();
  for (const e of events) {
    const arr = eventsByDate.get(e.date) || [];
    arr.push(e);
    eventsByDate.set(e.date, arr);
  }
  const timeline = [];
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
      benchmarkBtc: Math.max(0, runningBenchmark)
    });
  }
  const benchmarkBtc = Math.max(0, runningBenchmark);
  const actualBtc = Math.max(0, currentBtcBalance);
  const alphaBtc = actualBtc - benchmarkBtc;
  const alphaPercent = benchmarkBtc > 0 ? alphaBtc / benchmarkBtc * 100 : 0;
  const alphaUsd = alphaBtc * btcPrice;
  if (timeline.length > 0) {
    timeline[timeline.length - 1].actualBtc = actualBtc;
    timeline[timeline.length - 1].benchmarkBtc = benchmarkBtc;
  }
  const monthlyMap = /* @__PURE__ */ new Map();
  for (const e of events) {
    const monthKey = e.date.slice(0, 7);
    const entry = monthlyMap.get(monthKey) || { actual: 0, benchmark: 0 };
    entry.actual += e.btcAmount;
    if (e.isBenchmarkEvent) {
      entry.benchmark += e.btcAmount;
    }
    monthlyMap.set(monthKey, entry);
  }
  const monthlyAccumulation = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([monthKey, data]) => {
    const [year, month] = monthKey.split("-");
    const label = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    });
    return {
      month: label,
      monthKey,
      btcGained: data.actual,
      benchmarkBtcGained: data.benchmark
    };
  });
  const joinDate = sorted.length > 0 ? sorted[0].day?.slice(0, 10) : null;
  let performanceStatement = "";
  if (joinDate) {
    const joinDateObj = new Date(joinDate);
    const joinMonthYear = joinDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const alphaUsdFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(Math.abs(alphaUsd));
    const alphaBtcAbs = Math.abs(alphaBtc).toFixed(6);
    if (alphaBtc > 1e-6) {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio has accumulated ${alphaBtcAbs} BTC more than the buy-and-hold benchmark \u2014 equivalent to ${alphaUsdFormatted} at today's price.`;
    } else if (alphaBtc < -1e-6) {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio is ${alphaBtcAbs} BTC behind the buy-and-hold benchmark. The strategy is still accumulating \u2014 this gap typically closes as rotations complete.`;
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
    joinDate
  };
}

// server/syncJob.ts
var SYNC_INTERVAL_MS = 5 * 60 * 1e3;
var DELAY_BETWEEN_CLIENTS_MS = 3e3;
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function syncClient(userId, encryptedApiKey) {
  const db = await getDb();
  if (!db) {
    console.warn(`[Sync] Database not available, skipping client ${userId}`);
    return;
  }
  const startTime = Date.now();
  let status = "success";
  let errorMessage;
  try {
    const client = new SfoxClient(encryptedApiKey);
    const balances = await client.getBalances();
    const btcBalance = balances.find((b) => b.currency === "btc");
    const actualBtcFromBalance = btcBalance?.total ?? 0;
    console.log(`[Sync] Client ${userId} balances (${balances.length} assets):`, JSON.stringify(balances.slice(0, 3)));
    console.log(`[Sync] Client ${userId} BTC balance entry:`, JSON.stringify(btcBalance), `=> actualBtcFromBalance=${actualBtcFromBalance}`);
    const heldCurrencies = balances.map((b) => b.currency).filter((c) => c !== "usd");
    const prices = await client.getMarketPrices(heldCurrencies);
    const btcPrice = prices["btc"] || 0;
    console.log(`[Sync] Client ${userId} prices:`, JSON.stringify(prices));
    const transactions = await client.getAllTransactions(2e3);
    const alpha = computeBtcAlpha(transactions, actualBtcFromBalance, btcPrice);
    const totalDepositedUsd = transactions.filter((tx) => {
      const action = (tx.action || "").toLowerCase();
      const currency = (tx.currency || "").toLowerCase();
      return action === "deposit" && currency === "usd" && (tx.amount || 0) > 0;
    }).reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
    const balancesData = balances.filter((b) => b.total > 1e-6).map((b) => {
      const price = b.currency === "usd" ? 1 : prices[b.currency] || 0;
      return {
        currency: b.currency,
        total: b.total,
        usdValue: b.total * price,
        price
      };
    }).filter((b) => b.usdValue > 0.01 || b.total > 1e-6).sort((a, b) => {
      if (a.currency === "btc") return -1;
      if (b.currency === "btc") return 1;
      if (a.currency === "usd") return -2;
      if (b.currency === "usd") return 2;
      return b.usdValue - a.usdValue;
    });
    const totalValueUsd = balancesData.reduce((sum, b) => sum + b.usdValue, 0);
    const dollarGrowth = totalValueUsd - totalDepositedUsd;
    const percentGrowth = totalDepositedUsd > 0 ? dollarGrowth / totalDepositedUsd * 100 : 0;
    const chartData = alpha.timeline.map((t2) => ({
      date: t2.date,
      actualBtc: t2.actualBtc,
      benchmarkBtc: t2.benchmarkBtc
    }));
    const monthlyBarsData = alpha.monthlyAccumulation.map((m) => ({
      month: m.month,
      monthKey: m.monthKey,
      btcGained: m.btcGained,
      benchmarkBtcGained: m.benchmarkBtcGained
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
      syncedAt: /* @__PURE__ */ new Date()
    };
    await db.insert(portfolioSnapshots).values(snapshotValues).onDuplicateKeyUpdate({
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
        syncedAt: snapshotValues.syncedAt
      }
    });
    console.log(
      `[Sync] \u2713 Client ${userId} synced in ${Date.now() - startTime}ms \u2014 BTC: ${alpha.actualBtc.toFixed(6)} (from balance: ${actualBtcFromBalance.toFixed(6)}) | Benchmark: ${alpha.benchmarkBtc.toFixed(6)} | Alpha: ${alpha.alphaBtc.toFixed(6)} (${alpha.alphaPercent.toFixed(2)}%) | BTC price: $${btcPrice.toFixed(0)} (sFOX) | Portfolio: $${totalValueUsd.toFixed(0)}`
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("429") || errMsg.includes("1015") || errMsg.includes("rate limit")) {
      status = "rate_limited";
      errorMessage = `Rate limited by sFOX/Cloudflare: ${errMsg}`;
      console.warn(`[Sync] \u26A0 Client ${userId} rate limited \u2014 will retry next cycle`);
    } else {
      status = "error";
      errorMessage = errMsg;
      console.error(`[Sync] \u2717 Client ${userId} failed: ${errMsg}`);
    }
  }
  try {
    const db2 = await getDb();
    if (db2) {
      await db2.insert(syncLog).values({
        userId,
        status,
        errorMessage: errorMessage || null,
        durationMs: Date.now() - startTime
      });
    }
  } catch (logErr) {
    console.warn(`[Sync] Failed to write sync log for client ${userId}:`, logErr);
  }
}
async function runSyncCycle() {
  console.log("[Sync] Starting sync cycle...");
  let clients;
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
  const eligible = clientsWithKeys.filter(Boolean);
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
function startSyncJob() {
  console.log(`[Sync] Background sync job started \u2014 interval: ${SYNC_INTERVAL_MS / 1e3}s`);
  setTimeout(() => {
    runSyncCycle().catch((err) => console.error("[Sync] Startup cycle failed:", err));
  }, 1e4);
  setInterval(() => {
    runSyncCycle().catch((err) => console.error("[Sync] Scheduled cycle failed:", err));
  }, SYNC_INTERVAL_MS);
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerMagicLinkRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (process.env.NODE_ENV === "production") {
      startSyncJob();
    }
  });
}
startServer().catch(console.error);

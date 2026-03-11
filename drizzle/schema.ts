import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Client credentials table for storing encrypted sFOX API keys.
 * Staff enters API keys via database UI - keys are encrypted before storage.
 * Clients never see or interact with API keys directly.
 */
export const clientCredentials = mysqlTable("client_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sfoxApiKey: text("sfoxApiKey").notNull(), // Encrypted API key
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientCredential = typeof clientCredentials.$inferSelect;
export type InsertClientCredential = typeof clientCredentials.$inferInsert;

/**
 * Support requests table for tracking "Request a Call" submissions.
 */
export const supportRequests = mysqlTable("support_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: text("userName"),
  userEmail: varchar("userEmail", { length: 320 }),
  status: mysqlEnum("status", ["pending", "contacted", "resolved"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportRequest = typeof supportRequests.$inferSelect;
export type InsertSupportRequest = typeof supportRequests.$inferInsert;

/**
 * Magic link tokens for passwordless email authentication.
 * Tokens expire after 15 minutes and can only be used once.
 */
export const magicLinkTokens = mysqlTable("magic_link_tokens", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type InsertMagicLinkToken = typeof magicLinkTokens.$inferInsert;

/**
 * Intelligence reports uploaded by admin for clients.
 */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // e.g. "2025-03"
  fileUrl: text("fileUrl").notNull(), // URL to the uploaded PDF
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

/**
 * Admin messages sent to individual clients or all clients.
 */
export const adminMessages = mysqlTable("admin_messages", {
  id: int("id").autoincrement().primaryKey(),
  toUserId: int("toUserId"), // null = broadcast to all
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminMessage = typeof adminMessages.$inferSelect;
export type InsertAdminMessage = typeof adminMessages.$inferInsert;

/**
 * Portfolio snapshots — pre-computed portfolio data per client.
 * Written by the background sync job every 5-10 minutes.
 * All dashboard and admin views read from here instead of calling sFOX directly.
 * One row per client, upserted on each sync cycle.
 */
export const portfolioSnapshots = mysqlTable("portfolio_snapshots", {
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
  balancesJson: text("balancesJson").notNull().default("[]"),       // [{currency, total, usdValue, price}]
  monthlyBarsJson: text("monthlyBarsJson").notNull().default("[]"), // [{month, btcGained}]
  chartDataJson: text("chartDataJson").notNull().default("[]"),     // [{date, actualBtc, benchmarkBtc}]
  // Join date (date of first BTC purchase)
  joinDate: timestamp("joinDate"),
  // Sync metadata
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type InsertPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;

/**
 * Sync log — records each sync attempt per client.
 * Used for debugging, monitoring, and showing "last updated" timestamps.
 */
export const syncLog = mysqlTable("sync_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["success", "error", "rate_limited"]).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SyncLog = typeof syncLog.$inferSelect;
export type InsertSyncLog = typeof syncLog.$inferInsert;

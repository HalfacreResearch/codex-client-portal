import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

import axios from "axios";
import * as crypto from "crypto";

const SFOX_API_BASE = "https://api.sfox.com";
const ENCRYPTION_KEY = process.env.JWT_SECRET || "default-encryption-key-change-me";

/**
 * Encrypt an API key for secure storage in the database.
 * Uses AES-256-GCM encryption with the JWT_SECRET as the key.
 */
export function encryptApiKey(plainKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an API key from the database.
 */
export function decryptApiKey(encryptedKey: string): string {
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

/**
 * sFOX API client.
 * All data — balances, prices, and transactions — comes directly from sFOX.
 * No external price APIs (CoinGecko etc.) are used.
 */
export class SfoxClient {
  private apiKey: string;

  constructor(encryptedApiKey: string) {
    this.apiKey = decryptApiKey(encryptedApiKey);
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, SFOX_API_BASE);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    const response = await axios.get<T>(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
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
  async getBalances(): Promise<SfoxBalance[]> {
    const data = await this.request<SfoxBalanceArrayItem[]>("/v1/user/balance");
    return data
      .map((item) => {
        const available = Number(item.available) || 0;
        const held = Number(item.held) || 0;
        // sFOX returns 'balance' as the total — use it directly as the primary source
        // since available + held may not always sum correctly (e.g. staking wallets)
        const balance = Number(item.balance) || 0;
        const total = balance > 0 ? balance : (available + held);
        return {
          currency: (item.currency || "").toLowerCase(),
          available,
          held,
          total,
        };
      })
      .filter((b) => b.total > 0);
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
  async getMarketPrices(currencies: string[] = ["btc", "eth", "sol", "xrp", "link"]): Promise<Record<string, number>> {
    const prices: Record<string, number> = { usd: 1 };

    for (const currency of currencies) {
      if (currency === "usd") continue;
      try {
        const pair = `${currency}usd`;
        const result = await this.request<SfoxOrderEstimate>(`/v1/offer/buy`, {
          quantity: "10", // Must be >=10 to meet sFOX $5 minimum for low-price assets (e.g. XRP ~$1.38)
          pair,
        });
        const price = Number(result.price) || Number(result.vwap) || 0;
        if (price > 0) {
          prices[currency] = price;
        }
      } catch (err) {
        // Pair may not exist — skip silently
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
  async getAllTransactions(limit: number = 2000): Promise<SfoxTransactionFull[]> {
    const from = new Date("2024-01-01T00:00:00Z").getTime();
    console.log(`[sFOX] Fetching transactions from ${new Date(from).toISOString()}, limit=${limit}`);
    const result = await this.request<SfoxTransactionFull[]>("/v1/account/transactions", {
      limit: limit.toString(),
      from: from.toString(),
    });
    console.log(`[sFOX] Received ${result.length} transactions`);
    return result;
  }
}

// ── Type definitions ──────────────────────────────────────────────────────────

export interface SfoxBalanceArrayItem {
  currency: string;
  balance: number;
  available: number;
  held: number;
}

export interface SfoxBalance {
  currency: string;
  available: number;
  held: number;
  total: number;
}

export interface SfoxOrderEstimate {
  price: number | string;
  subtotal: number | string;
  fees: number | string;
  total: number | string;
  quantity: number | string;
  vwap: number | string;
  currency_pair: string;
  routing_type: string;
}

export interface SfoxOrder {
  id: number;
  action: string;
  pair: string;
  quantity: string;
  price: string;
  amount: string;
  status: string;
  filled_at?: string;
  created_at: string;
}

// Full transaction response from /v1/account/transactions
export interface SfoxTransactionFull {
  id: number;
  order_id: string;
  trade_id: string;
  day: string;
  action: string;
  currency: string;
  amount: number;
  net_proceeds: number;
  price: number;
  fees: number;
  status: string;
  symbol: string;
  timestamp: number;
  account_balance?: number; // Running USD account balance after this transaction
}

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
 * sFOX API client for fetching portfolio data.
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
    });

    return response.data;
  }

  /**
   * Get current account balances for all cryptocurrencies.
   */
  async getBalances(): Promise<SfoxBalance[]> {
    const data = await this.request<SfoxBalanceArrayItem[]>("/v1/user/balance");
    // sFOX returns an array of balance objects
    return data.map((item) => ({
      currency: item.currency,
      available: item.available || 0,
      held: item.held || 0,
      total: (item.available || 0) + (item.held || 0),
    }));
  }

  /**
   * Get USD deposit transactions since a given timestamp.
   */
  async getDeposits(fromTimestamp?: number): Promise<SfoxTransaction[]> {
    const from = fromTimestamp || new Date("2025-01-01T00:00:00Z").getTime();
    const data = await this.request<SfoxTransaction[]>("/v1/account/transactions", {
      types: "deposit",
      from: from.toString(),
      limit: "1000",
    });
    return data.filter(tx => tx.status === "done");
  }

  /**
   * Get raw transactions from sFOX API.
   * Returns all transaction data with original amount signs.
   */
  async getRawTransactions(limit: number = 1000): Promise<SfoxTransactionFull[]> {
    return this.request<SfoxTransactionFull[]>("/v1/account/transactions", {
      limit: limit.toString(),
    });
  }

  /**
   * Get all transactions (for detailed analysis).
   */
  async getAllTransactions(limit: number = 1000): Promise<SfoxTransactionFull[]> {
    return this.request<SfoxTransactionFull[]>("/v1/account/transactions", {
      limit: limit.toString(),
    });
  }

  /**
   * Get recent trade transactions (buys and sells).
   * Uses /v1/account/transactions which contains all trade activity.
   */
  async getOrders(limit: number = 20): Promise<SfoxOrder[]> {
    const data = await this.request<SfoxTransactionFull[]>("/v1/account/transactions", {
      limit: limit.toString(),
    });
    // Filter for buy/sell transactions and transform to order format
    return data
      .filter(tx => tx.action === "Buy" || tx.action === "Sell")
      .filter(tx => tx.currency !== "usd") // Get the crypto side of trades
      .map(tx => ({
        id: tx.id,
        action: tx.action,
        pair: tx.symbol || `${tx.currency}/usd`,
        quantity: String(Math.abs(tx.amount)),
        price: String(tx.price),
        amount: String(Math.abs(tx.amount) * tx.price),
        status: tx.status,
        filled_at: tx.day,
        created_at: tx.day,
      }));
  }
}

// Type definitions for sFOX API responses

// sFOX returns balances as an array of objects
export interface SfoxBalanceArrayItem {
  currency: string;
  balance: number;
  available: number;
  held: number;
  borrow_wallet: number;
  collateral_wallet: number;
  lending_wallet: number;
  trading_wallet: number;
  staking_wallet: number;
}

export interface SfoxBalanceResponse {
  [currency: string]: {
    available: string;
    held: string;
  };
}

export interface SfoxBalance {
  currency: string;
  available: number;
  held: number;
  total: number;
}

export interface SfoxTransaction {
  id: number;
  action: string;
  amount: string;
  currency: string;
  status: string;
  timestamp: number;
  fee?: string;
  price?: number;
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
  balance?: number; // BTC balance after this transaction
}

/**
 * Fetch current cryptocurrency prices in USD.
 * Uses CoinGecko API for current prices.
 */
export async function getCryptoPrices(): Promise<Record<string, number>> {
  try {
    // Fetch prices for all supported cryptocurrencies
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,chainlink,usd-coin,tether&vs_currencies=usd",
      { timeout: 5000 }
    );
    
    return {
      btc: response.data.bitcoin?.usd || 0,
      eth: response.data.ethereum?.usd || 0,
      sol: response.data.solana?.usd || 0,
      xrp: response.data.ripple?.usd || 0,
      link: response.data.chainlink?.usd || 0,
      usdc: response.data["usd-coin"]?.usd || 1,
      usdt: response.data.tether?.usd || 1,
      usd: 1,
    };
  } catch {
    // Return fallback prices if API fails
    return {
      btc: 100000,
      eth: 3500,
      sol: 200,
      xrp: 2.5,
      link: 25,
      usdc: 1,
      usdt: 1,
      usd: 1,
    };
  }
}

/**
 * Fetch historical BTC price at a specific timestamp.
 * Uses CoinGecko API to get historical price data.
 */
export async function getHistoricalBtcPrice(timestamp: number): Promise<number> {
  try {
    // Convert timestamp to date string (DD-MM-YYYY format required by CoinGecko)
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    
    // Fetch historical price from CoinGecko
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${dateStr}`,
      { timeout: 5000 }
    );
    
    return response.data.market_data?.current_price?.usd || 100000;
  } catch (error) {
    console.error(`Failed to fetch historical BTC price for timestamp ${timestamp}:`, error);
    // Return current price as fallback
    const prices = await getCryptoPrices();
    return prices.btc;
  }
}

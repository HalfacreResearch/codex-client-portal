import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, clientCredentials, supportRequests, InsertSupportRequest } from "../drizzle/schema";
import { ENV } from './_core/env';
import { encryptApiKey } from "./sfox";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get a user by their email address.
 * Used to match OAuth logins with pre-created staff accounts.
 */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get client credentials (encrypted sFOX API key) for a user.
 */
export async function getClientCredentials(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get credentials: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(clientCredentials)
    .where(eq(clientCredentials.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Upsert client credentials with encrypted API key.
 * Staff uses this via database UI to set up client API keys.
 */
export async function upsertClientCredentials(userId: number, plainApiKey: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const encryptedKey = encryptApiKey(plainApiKey);

  const existing = await getClientCredentials(userId);
  if (existing) {
    await db
      .update(clientCredentials)
      .set({ sfoxApiKey: encryptedKey, updatedAt: new Date() })
      .where(eq(clientCredentials.userId, userId));
  } else {
    await db.insert(clientCredentials).values({
      userId,
      sfoxApiKey: encryptedKey,
    });
  }
}

/**
 * Create a support request when a client clicks "Request a Call".
 */
export async function createSupportRequest(request: InsertSupportRequest) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(supportRequests).values(request);
  return result;
}

/**
 * Get all support requests (for admin view).
 */
export async function getSupportRequests() {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const result = await db
    .select()
    .from(supportRequests)
    .orderBy(supportRequests.createdAt);

  return result;
}


/**
 * Get all clients (users with role 'user') along with their credential status.
 * Used by admin panel to display client list.
 */
export async function getAllClients() {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.role, "user"))
    .orderBy(users.createdAt);

  // Get credentials for each user
  const clientsWithStatus = await Promise.all(
    allUsers.map(async (user) => {
      const creds = await getClientCredentials(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        hasApiKey: !!creds,
        createdAt: user.createdAt,
        lastSignedIn: user.lastSignedIn,
      };
    })
  );

  return clientsWithStatus;
}

/**
 * Create a new client account (pre-created by staff).
 * Returns the new user's ID.
 */
export async function createClient(name: string, email: string): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Check if user with this email already exists
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error("A client with this email already exists");
  }

  // Create with a pending openId that will be replaced on first login
  const pendingOpenId = `pending-${email}-${Date.now()}`;
  
  const result = await db.insert(users).values({
    openId: pendingOpenId,
    name,
    email,
    role: "user",
  });

  // Get the inserted ID
  const insertId = Number(result[0].insertId);
  return insertId;
}

/**
 * Delete client credentials (remove API key but keep account).
 */
export async function deleteClientCredentials(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(clientCredentials).where(eq(clientCredentials.userId, userId));
}


/**
 * Get a user by their ID.
 * Used by admin to view client details.
 */
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

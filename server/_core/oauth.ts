import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // Check if a user with this email was pre-created by staff
      // If so, update that record with the openId from OAuth
      if (userInfo.email) {
        const existingUserByEmail = await db.getUserByEmail(userInfo.email);
        if (existingUserByEmail && !existingUserByEmail.openId.startsWith("pending-")) {
          // User exists with a real openId, proceed normally
        } else if (existingUserByEmail && existingUserByEmail.openId.startsWith("pending-")) {
          // Staff pre-created this account - update with real openId
          const database = await getDb();
          if (database) {
            await database
              .update(users)
              .set({
                openId: userInfo.openId,
                name: userInfo.name || existingUserByEmail.name,
                loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
                lastSignedIn: new Date(),
              })
              .where(eq(users.id, existingUserByEmail.id));
          }

          const sessionToken = await sdk.createSessionToken(userInfo.openId, {
            name: userInfo.name || existingUserByEmail.name || "",
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

          res.redirect(302, "/dashboard");
          return;
        }
      }

      // Standard flow: upsert user normally
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/dashboard");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

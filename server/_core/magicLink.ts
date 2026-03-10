import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { and, eq, gt } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { createTransport } from "nodemailer";
import { nanoid } from "nanoid";
import { magicLinkTokens } from "../../drizzle/schema";
import * as db from "../db";
import { getDb } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

function createMailer() {
  return createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpPort === 465,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });
}

async function sendMagicLinkEmail(email: string, name: string | null, magicUrl: string) {
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
    text: `Hi ${displayName},\n\nClick this link to log in to your Codex client portal (expires in 15 minutes):\n\n${magicUrl}\n\nIf you did not request this, ignore this email.\n\n-- BTC Treasury Codex`,
  });
}

export function registerMagicLinkRoutes(app: Express) {
  // POST /api/auth/magic-link - Request a magic link
  app.post("/api/auth/magic-link", async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists in our system
    const user = await db.getUserByEmail(normalizedEmail);
    if (!user) {
      // Return success anyway to prevent email enumeration
      res.json({ success: true, message: "If that email is registered, a login link has been sent." });
      return;
    }

    try {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Generate a secure token
      const token = nanoid(64);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

      // Store token in DB
      await database.insert(magicLinkTokens).values({
        email: normalizedEmail,
        token,
        expiresAt,
      });

      // Build magic link URL
      const magicUrl = `${ENV.appUrl}/api/auth/verify?token=${token}`;

      // Send email
      await sendMagicLinkEmail(normalizedEmail, user.name, magicUrl);

      res.json({ success: true, message: "Login link sent. Check your email." });
    } catch (error) {
      console.error("[MagicLink] Failed to send magic link:", error);
      res.status(500).json({ error: "Failed to send login link. Please try again." });
    }
  });

  // GET /api/auth/verify - Verify magic link token and create session
  app.get("/api/auth/verify", async (req: Request, res: Response) => {
    const token = req.query.token as string;

    if (!token) {
      res.redirect(302, "/?error=invalid_token");
      return;
    }

    try {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Find valid, unused, non-expired token
      const now = new Date();
      const [tokenRecord] = await database
        .select()
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.token, token),
            eq(magicLinkTokens.used, false),
            gt(magicLinkTokens.expiresAt, now)
          )
        )
        .limit(1);

      if (!tokenRecord) {
        res.redirect(302, "/?error=expired_token");
        return;
      }

      // Mark token as used
      await database
        .update(magicLinkTokens)
        .set({ used: true })
        .where(eq(magicLinkTokens.id, tokenRecord.id));

      // Get user
      const user = await db.getUserByEmail(tokenRecord.email);
      if (!user) {
        res.redirect(302, "/?error=user_not_found");
        return;
      }

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect based on role
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

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ success: true });
  });
}

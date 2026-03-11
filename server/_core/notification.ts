import { createTransport } from "nodemailer";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

/**
 * Sends an owner notification via Hostinger SMTP email.
 * Used for client call requests and system alerts.
 * Returns true if delivered, false on failure (non-throwing).
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = payload;
  if (!title?.trim() || !content?.trim()) {
    console.warn("[Notification] Missing title or content");
    return false;
  }

  try {
    const mailer = createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpPort === 465,
      auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
    });

    await mailer.sendMail({
      from: `"BTC Treasury Codex" <${ENV.smtpFrom}>`,
      to: ENV.smtpFrom,
      subject: `[Codex Portal] ${title}`,
      html: `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;"><h2 style="color:#f7931a;">${title}</h2><div style="white-space:pre-wrap;line-height:1.6;">${content.replace(/\n/g, "<br>")}</div></body></html>`,
      text: `${title}\n\n${content}`,
    });

    return true;
  } catch (error) {
    console.warn("[Notification] Failed to send email notification:", error);
    return false;
  }
}

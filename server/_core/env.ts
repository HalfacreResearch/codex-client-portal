export const ENV = {
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
  appUrl: process.env.APP_URL ?? "https://client.codexyield.com",
};

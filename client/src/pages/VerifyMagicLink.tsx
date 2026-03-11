import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * VerifyMagicLink - handles /auth/verify?token=...
 *
 * When the user clicks the magic link in their email, they land here.
 * This page immediately does a hard redirect to /api/auth/verify?token=...
 * so the Express server can process the token, set the session cookie,
 * and redirect to /admin or /dashboard.
 *
 * We use window.location.replace (not wouter navigation) to force a full
 * server round-trip instead of client-side routing.
 */
export default function VerifyMagicLink() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setLocation("/?error=invalid_token");
      return;
    }

    // Hard redirect to the Express API route — bypasses the SPA router
    window.location.replace(`/api/auth/verify?token=${encodeURIComponent(token)}`);
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">Verifying your login link...</p>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

export default function Home() {
  const { isAuthenticated, user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestMagicLink = trpc.auth.requestMagicLink.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => setError(err.message || "Failed to send login link. Please try again."),
  });

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      setLocation(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [isAuthenticated, loading, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    requestMagicLink.mutate({ email: email.trim().toLowerCase() });
  };

  const urlParams = new URLSearchParams(window.location.search);
  const urlError = urlParams.get("error");
  const errorMessages: Record<string, string> = {
    invalid_token: "This login link is invalid. Please request a new one.",
    expired_token: "This login link has expired. Please request a new one.",
    user_not_found: "No account found with that email. Please contact your advisor.",
    server_error: "Something went wrong. Please try again.",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <img src="/logo.webp" alt="BTC Treasury Codex" className="w-9 h-9 rounded-lg object-cover" />
          <span className="text-lg font-bold text-foreground tracking-tight">BTC Treasury Codex</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
              <img src="/logo.webp" alt="" className="w-10 h-10 rounded-xl object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Client Portal</h1>
            <p className="text-muted-foreground text-sm">BTC Treasury Codex — Secure access to your portfolio</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
            {submitted ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Check your email</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  We sent a login link to <span className="text-foreground font-medium">{email}</span>. Click the link to access your dashboard.
                </p>
                <p className="text-xs text-muted-foreground">
                  Link expires in 15 minutes.{" "}
                  <button onClick={() => { setSubmitted(false); setError(null); }} className="text-primary hover:underline">
                    Try again
                  </button>
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-foreground mb-1">Sign in</h2>
                <p className="text-muted-foreground text-sm mb-6">Enter your email and we will send you a secure login link.</p>

                {(urlError || error) && (
                  <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3 mb-5">
                    {urlError ? errorMessages[urlError] ?? "An error occurred." : error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email address</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={requestMagicLink.isPending}
                    className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
                  >
                    {requestMagicLink.isPending ? "Sending..." : "Send Login Link"}
                  </button>
                </form>
                <p className="text-xs text-muted-foreground text-center mt-5">No password needed. We will email you a secure one-time link.</p>
              </>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Need help? Contact{" "}
            <a href="mailto:matt@codexyield.com" className="text-primary hover:underline">matt@codexyield.com</a>
          </p>
        </div>
      </main>

      <footer className="border-t border-border/40 py-5 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="text-xs text-muted-foreground">2025 BTC Treasury Codex</span>
          <span className="text-xs text-muted-foreground">Powered by sFOX</span>
        </div>
      </footer>
    </div>
  );
}

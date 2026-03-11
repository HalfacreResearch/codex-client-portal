import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, LogOut, TrendingUp, TrendingDown,
  BarChart3, Bitcoin, Clock, RefreshCw,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBtc(n: number) {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);
}
function fmtPct(n: number) {
  const v = n ?? 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ClientView() {
  const { user, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const clientId = parseInt(params.id || "0", 10);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  const { data: portfolio, isLoading, refetch, isRefetching } = trpc.admin.getClientPortfolio.useQuery(
    { userId: clientId },
    {
      enabled: !!user && user.role === "admin" && clientId > 0,
      staleTime: 60_000,
      refetchInterval: 5 * 60 * 1000,
    }
  );

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 h-16">
          <div className="container flex items-center justify-between h-full">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </header>
        <main className="container py-8 space-y-6 max-w-6xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  const snap = portfolio?.snapshot;
  const isAhead = (snap?.alphaBtc ?? 0) >= 0;

  // Build chart data safely — all values guarded against null/undefined
  const rawTimeline = (snap?.chartData as any[]) || [];
  const step = Math.max(1, Math.floor(rawTimeline.length / 60));
  const chartTimeline = rawTimeline
    .filter((_: unknown, i: number) => i % step === 0 || i === rawTimeline.length - 1)
    .map((p: any) => ({
      date: p.date,
      "Client BTC": parseFloat((p.actualBtc ?? 0).toFixed(6)),
      "Buy & Hold": parseFloat((p.benchmarkBtc ?? 0).toFixed(6)),
    }));

  const monthlyData = ((snap?.monthlyBars as any[]) || []).map((m: any) => ({
    month: m.month,
    "Client BTC": parseFloat((m.btcGained ?? 0).toFixed(6)),
    "Buy & Hold": parseFloat((m.benchmarkBtcGained ?? 0).toFixed(6)),
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="BTC Treasury Codex" className="w-10 h-10 rounded-lg object-cover" />
            <span className="text-xl font-bold text-foreground">BTC Treasury Codex</span>
            <span className="text-sm text-muted-foreground">/ Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")}>
              <ArrowLeft className="w-4 h-4 mr-2" />Back to Admin
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6 max-w-6xl">

        {/* Client name + sync status */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {portfolio?.client?.name || "Client"}'s Portfolio
            </h1>
            <p className="text-muted-foreground text-sm">{portfolio?.client?.email}</p>
          </div>
          {snap?.syncedAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
              <Clock className="h-3 w-3" />
              Synced {fmtTimeAgo(snap.syncedAt)}
            </p>
          )}
        </div>

        {/* No API key */}
        {!portfolio?.hasCredentials && (
          <Card className="bg-card border-border text-center py-12">
            <CardContent>
              <Bitcoin className="h-12 w-12 text-primary mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground">No sFOX API key configured for this client.</p>
              <p className="text-xs text-muted-foreground mt-2">Add an API key from the Admin panel to enable portfolio tracking.</p>
            </CardContent>
          </Card>
        )}

        {/* Sync pending */}
        {portfolio?.hasCredentials && portfolio.syncPending && (
          <Card className="bg-card border-border text-center py-12">
            <CardContent>
              <RefreshCw className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-bold mb-2">Syncing Portfolio</h2>
              <p className="text-muted-foreground mb-4">
                First sync in progress — data will appear within 1–2 minutes.
              </p>
              <Button onClick={() => refetch()} disabled={isRefetching} variant="outline" className="border-primary text-primary">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                Check Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {portfolio?.error && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="pt-4 pb-4 text-destructive text-sm">{portfolio.error}</CardContent>
          </Card>
        )}

        {/* Main content — only shown when snapshot exists */}
        {portfolio?.hasCredentials && !portfolio.syncPending && snap && (
          <>
            {/* BTC Alpha Hero */}
            <Card className="bg-card border-0 overflow-hidden" style={{ borderTop: "4px solid #f7931a" }}>
              <CardContent className="pt-8 pb-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="text-center md:text-left">
                    <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-3">
                      BTC Alpha vs Buy &amp; Hold
                    </p>
                    <div className="flex items-baseline gap-3 justify-center md:justify-start">
                      <span className={`text-7xl font-black leading-none ${isAhead ? "text-green-500" : "text-red-500"}`}>
                        {isAhead ? "+" : ""}{(snap.alphaPercent ?? 0).toFixed(2)}%
                      </span>
                      {isAhead
                        ? <TrendingUp className="h-8 w-8 text-green-500 shrink-0" />
                        : <TrendingDown className="h-8 w-8 text-red-500 shrink-0" />
                      }
                    </div>
                    <p className="text-muted-foreground text-sm mt-2">
                      {isAhead ? "ahead of" : "behind"} the passive DCA benchmark
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-10 gap-y-5 text-center shrink-0">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Client BTC</p>
                      <p className="text-2xl font-bold text-foreground">{fmtBtc(snap.actualBtc)}</p>
                      <p className="text-xs text-muted-foreground">{fmtUsd(snap.actualBtc * snap.btcPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Buy &amp; Hold Would Be</p>
                      <p className="text-2xl font-bold text-muted-foreground">{fmtBtc(snap.benchmarkBtc)}</p>
                      <p className="text-xs text-muted-foreground">{fmtUsd(snap.benchmarkBtc * snap.btcPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">BTC Alpha</p>
                      <p className={`text-2xl font-bold ${isAhead ? "text-green-500" : "text-red-500"}`}>
                        {isAhead ? "+" : ""}{fmtBtc(snap.alphaBtc)}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmtUsd(snap.alphaUsd)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">BTC Price</p>
                      <p className="text-2xl font-bold text-primary">{fmtUsd(snap.btcPrice)}</p>
                      <p className="text-xs text-muted-foreground">at last sync</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Portfolio Value", value: fmtUsd(snap.totalValueUsd), color: "text-primary" },
                { label: "Total Deposited", value: fmtUsd(snap.totalDepositedUsd), color: "text-muted-foreground" },
                {
                  label: "USD Growth",
                  value: fmtUsd(snap.dollarGrowth),
                  color: (snap.dollarGrowth ?? 0) >= 0 ? "text-green-500" : "text-red-500",
                },
                {
                  label: "USD Return",
                  value: fmtPct(snap.percentGrowth),
                  color: (snap.percentGrowth ?? 0) >= 0 ? "text-green-500" : "text-red-500",
                },
              ].map(({ label, value, color }) => (
                <Card key={label} className="bg-card border-border">
                  <CardContent className="pt-5 pb-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Holdings */}
            {((snap.balances as any[]) || []).length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Current Holdings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(snap.balances as any[]).map((b: any) => (
                      <div key={b.currency} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-foreground w-14">{b.currency.toUpperCase()}</span>
                          <span className="text-muted-foreground text-sm">{fmtBtc(b.total ?? 0)}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">{fmtUsd(b.usdValue ?? 0)}</p>
                          <p className="text-xs text-muted-foreground">{fmtUsd(b.price ?? 0)} / unit</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Benchmark Chart */}
            {chartTimeline.length > 1 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    BTC Accumulation vs Buy &amp; Hold
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Client's actual BTC balance vs. what a passive DCA buyer would have</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartTimeline} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "#888" }} tickLine={false} tickFormatter={(v) => (v ?? 0).toFixed(4)} />
                      <Tooltip
                        contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 6 }}
                        labelStyle={{ color: "#888", fontSize: 11 }}
                        formatter={(value: number, name: string) => [`${fmtBtc(value ?? 0)} BTC`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Client BTC" stroke="#f7931a" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="Buy & Hold" stroke="#555" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Monthly Bars */}
            {monthlyData.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Monthly BTC Accumulation
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">BTC added each month — client vs. buy &amp; hold benchmark</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#888" }} tickLine={false} tickFormatter={(v) => (v ?? 0).toFixed(4)} />
                      <Tooltip
                        contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 6 }}
                        labelStyle={{ color: "#888", fontSize: 11 }}
                        formatter={(value: number, name: string) => [`${fmtBtc(value ?? 0)} BTC`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Client BTC" fill="#f7931a" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Buy & Hold" fill="#444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

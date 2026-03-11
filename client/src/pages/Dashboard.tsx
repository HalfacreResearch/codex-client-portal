import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogOut, Phone, TrendingUp, TrendingDown, Share2, Bitcoin, DollarSign, BarChart3, Clock, RefreshCw } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBtc(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
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

// ─── Shareable Card Generator ─────────────────────────────────────────────────

function downloadShareCard(alphaPercent: number, joinDate: string | null, btcPrice: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = "#f7931a";
  ctx.fillRect(0, 0, 1080, 8);

  ctx.fillStyle = "#f7931a";
  ctx.font = "bold 40px Arial";
  ctx.fillText("BTC Treasury Codex", 80, 110);

  ctx.fillStyle = "#666";
  ctx.font = "26px Arial";
  ctx.fillText("Client Performance Report", 80, 155);

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 185);
  ctx.lineTo(1000, 185);
  ctx.stroke();

  const isPositive = alphaPercent >= 0;
  ctx.fillStyle = isPositive ? "#22c55e" : "#ef4444";
  ctx.font = "bold 170px Arial";
  const alphaStr = `${isPositive ? "+" : ""}${alphaPercent.toFixed(1)}%`;
  const tw = ctx.measureText(alphaStr).width;
  ctx.fillText(alphaStr, (1080 - tw) / 2, 490);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 44px Arial";
  const label = "More BTC Than Buy & Hold";
  const lw = ctx.measureText(label).width;
  ctx.fillText(label, (1080 - lw) / 2, 570);

  ctx.fillStyle = "#888";
  ctx.font = "28px Arial";
  const sub = "BTC-denominated alpha vs. passive DCA strategy";
  const sw = ctx.measureText(sub).width;
  ctx.fillText(sub, (1080 - sw) / 2, 625);

  if (joinDate) {
    const d = new Date(joinDate);
    const joinStr = `Member since ${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
    ctx.fillStyle = "#555";
    ctx.font = "24px Arial";
    const jw = ctx.measureText(joinStr).width;
    ctx.fillText(joinStr, (1080 - jw) / 2, 710);
  }

  ctx.fillStyle = "#444";
  ctx.font = "22px Arial";
  const priceStr = `BTC price at time of report: ${fmtUsd(btcPrice)}`;
  const pw = ctx.measureText(priceStr).width;
  ctx.fillText(priceStr, (1080 - pw) / 2, 790);

  ctx.fillStyle = "#f7931a";
  ctx.fillRect(0, 1040, 1080, 8);
  ctx.fillStyle = "#333";
  ctx.font = "22px Arial";
  ctx.fillText("client.codexyield.com  ·  Powered by BTC Treasury Codex", 80, 1028);

  const link = document.createElement("a");
  link.download = "codex-btc-alpha.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const requestCallMutation = trpc.support.requestCall.useMutation();

  const { data, isLoading, error, refetch, isRefetching } = trpc.portfolio.getData.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min to match sync cycle
  });

  const handleLogout = useCallback(async () => {
    await logout();
    setLocation("/");
  }, [logout, setLocation]);

  const snap = data?.snapshot;

  const handleShare = useCallback(() => {
    if (!snap) return;
    downloadShareCard(parseFloat(String(snap.alphaPercent)), snap.joinDate, snap.btcPrice);
  }, [snap]);

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full bg-card border-border">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive mb-4">Unable to load your portfolio. Please try again.</p>
            <Button onClick={handleLogout} variant="outline">Log Out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data.hasCredentials) {
    return (
      <div className="min-h-screen bg-background">
        <Header userName={user?.name} userRole={user?.role} onLogout={handleLogout} onRequestCall={() => requestCallMutation.mutate()} isRequestingCall={requestCallMutation.isPending} />
        <main className="container py-12 max-w-2xl">
          <Card className="bg-card border-border text-center py-12">
            <CardContent>
              <Bitcoin className="h-12 w-12 text-primary mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-bold mb-2">Account Setup in Progress</h2>
              <p className="text-muted-foreground mb-6">Your account is being configured. Please contact us if you need assistance.</p>
              <Button onClick={() => requestCallMutation.mutate()} disabled={requestCallMutation.isPending} className="bg-primary hover:bg-primary/90 text-black font-bold">
                <Phone className="h-4 w-4 mr-2" />Request a Call
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Sync pending — first sync hasn't completed yet
  if (data.syncPending || !snap) {
    return (
      <div className="min-h-screen bg-background">
        <Header userName={user?.name} userRole={user?.role} onLogout={handleLogout} onRequestCall={() => requestCallMutation.mutate()} isRequestingCall={requestCallMutation.isPending} />
        <main className="container py-12 max-w-2xl">
          <Card className="bg-card border-border text-center py-12">
            <CardContent>
              <RefreshCw className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-bold mb-2">Syncing Your Portfolio</h2>
              <p className="text-muted-foreground mb-6">
                Your portfolio data is being synced from sFOX. This typically takes less than a minute.
                This page will refresh automatically.
              </p>
              <Button onClick={() => refetch()} disabled={isRefetching} variant="outline" className="border-primary text-primary">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                Check Again
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isAhead = snap.alphaBtc >= 0;

  // Thin timeline to ≤60 points for chart performance
  const rawTimeline = snap.chartData || [];
  const step = Math.max(1, Math.floor(rawTimeline.length / 60));
  const chartTimeline = rawTimeline
    .filter((_: unknown, i: number) => i % step === 0 || i === rawTimeline.length - 1)
    .map((p: { date: string; actualBtc: number; benchmarkBtc: number }) => ({
      date: p.date,
      "Your BTC": parseFloat(p.actualBtc.toFixed(6)),
      "Buy & Hold": parseFloat(p.benchmarkBtc.toFixed(6)),
    }));

  const monthlyData = (snap.monthlyBars || []).map((m: { month: string; btcGained: number; benchmarkBtcGained: number }) => ({
    month: m.month,
    "Your BTC": parseFloat(m.btcGained.toFixed(6)),
    "Buy & Hold": parseFloat(m.benchmarkBtcGained.toFixed(6)),
  }));

  // Build performance statement from snapshot data
  const joinDate = snap.joinDate;
  let performanceStatement = "";
  if (joinDate) {
    const joinDateObj = new Date(joinDate);
    const joinMonthYear = joinDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const alphaBtcAbs = Math.abs(snap.alphaBtc).toFixed(6);
    const alphaUsdFormatted = fmtUsd(Math.abs(snap.alphaUsd));
    if (snap.alphaBtc > 0.000001) {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio has accumulated ${alphaBtcAbs} BTC more than the buy-and-hold benchmark — equivalent to ${alphaUsdFormatted} at today's price.`;
    } else if (snap.alphaBtc < -0.000001) {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio is ${alphaBtcAbs} BTC behind the buy-and-hold benchmark. The strategy is still accumulating — this gap typically closes as rotations complete.`;
    } else {
      performanceStatement = `Since joining in ${joinMonthYear}, your portfolio is tracking in line with the buy-and-hold benchmark. Alpha accumulates as rotations complete.`;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        userName={user?.name}
        userRole={user?.role}
        onLogout={handleLogout}
        onRequestCall={() => requestCallMutation.mutate()}
        isRequestingCall={requestCallMutation.isPending}
      />

      <main className="container py-8 space-y-6 max-w-6xl">

        {/* Welcome + last synced */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Data synced {fmtTimeAgo(snap.syncedAt)} · updates every 5 minutes
            </p>
          </div>
          <Button onClick={handleShare} variant="outline" className="border-primary text-primary hover:bg-primary hover:text-black font-semibold">
            <Share2 className="h-4 w-4 mr-2" />Share My Results
          </Button>
        </div>

        {/* ── BTC Alpha Hero ── */}
        <Card className="bg-card border-0 overflow-hidden" style={{ borderTop: "4px solid #f7931a" }}>
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              {/* Left: headline metric */}
              <div className="text-center md:text-left">
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-3">
                  BTC Alpha vs Buy &amp; Hold
                </p>
                <div className="flex items-baseline gap-3 justify-center md:justify-start">
                  <span className={`text-7xl font-black leading-none ${isAhead ? "text-green-500" : "text-red-500"}`}>
                    {isAhead ? "+" : ""}{snap.alphaPercent.toFixed(2)}%
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

              {/* Right: stat grid */}
              <div className="grid grid-cols-2 gap-x-10 gap-y-5 text-center shrink-0">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your BTC</p>
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
                  <p className="text-2xl font-bold text-foreground">{fmtUsd(snap.btcPrice)}</p>
                  <p className="text-xs text-muted-foreground">synced {fmtTimeAgo(snap.syncedAt)}</p>
                </div>
              </div>
            </div>

            {/* Performance statement */}
            {performanceStatement && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground leading-relaxed italic">
                  "{performanceStatement}"
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Portfolio Summary ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Portfolio Value", value: fmtUsd(snap.totalValueUsd), Icon: DollarSign, color: "text-primary" },
            { label: "Total Deposited", value: fmtUsd(snap.totalDepositedUsd), Icon: DollarSign, color: "text-muted-foreground" },
            {
              label: "USD Growth",
              value: fmtUsd(snap.dollarGrowth),
              Icon: snap.dollarGrowth >= 0 ? TrendingUp : TrendingDown,
              color: snap.dollarGrowth >= 0 ? "text-green-500" : "text-red-500",
            },
            {
              label: "USD Return",
              value: fmtPct(snap.percentGrowth),
              Icon: BarChart3,
              color: snap.percentGrowth >= 0 ? "text-green-500" : "text-red-500",
            },
          ].map(({ label, value, Icon, color }) => (
            <Card key={label} className="bg-card border-border">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                </div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Holdings ── */}
        {(snap.balances as any[]).length > 0 && (
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
                      <span className="text-muted-foreground text-sm">{fmtBtc(b.total)}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{fmtUsd(b.usdValue)}</p>
                      <p className="text-xs text-muted-foreground">{fmtUsd(b.price)} / unit</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Benchmark Comparison Chart ── */}
        {chartTimeline.length > 1 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                BTC Accumulation vs Buy &amp; Hold
              </CardTitle>
              <p className="text-xs text-muted-foreground">Your actual BTC balance vs. what a passive DCA buyer would have</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartTimeline} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} tickLine={false} tickFormatter={(v) => v.toFixed(4)} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 6 }}
                    labelStyle={{ color: "#888", fontSize: 11 }}
                    formatter={(value: number, name: string) => [`${fmtBtc(value)} BTC`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Your BTC" stroke="#f7931a" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="Buy & Hold" stroke="#555" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── Monthly BTC Accumulation ── */}
        {monthlyData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Monthly BTC Accumulation
              </CardTitle>
              <p className="text-xs text-muted-foreground">BTC added each month — yours vs. what buy &amp; hold would have added</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} tickLine={false} tickFormatter={(v) => v.toFixed(4)} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 6 }}
                    labelStyle={{ color: "#888", fontSize: 11 }}
                    formatter={(value: number, name: string) => [`${fmtBtc(value)} BTC`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Your BTC" fill="#f7931a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Buy & Hold" fill="#444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── Share CTA ── */}
        <Card className="bg-card" style={{ border: "1px solid rgba(247,147,26,0.2)" }}>
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <div>
              <p className="font-semibold text-foreground">Know someone who should be accumulating more BTC?</p>
              <p className="text-sm text-muted-foreground">Download your performance card and share it with friends and family.</p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Button onClick={handleShare} className="bg-primary hover:bg-primary/90 text-black font-bold whitespace-nowrap">
                <Share2 className="h-4 w-4 mr-2" />Download Performance Card
              </Button>
              <Button onClick={() => requestCallMutation.mutate()} disabled={requestCallMutation.isPending} variant="outline" className="border-primary text-primary hover:bg-primary hover:text-black font-bold whitespace-nowrap">
                <Phone className="h-4 w-4 mr-2" />Request a Call
              </Button>
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  userName,
  userRole,
  onLogout,
  onRequestCall,
  isRequestingCall,
}: {
  userName?: string | null;
  userRole?: string | null;
  onLogout: () => void;
  onRequestCall: () => void;
  isRequestingCall: boolean;
}) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <img src="/logo.webp" alt="BTC Treasury Codex" className="w-10 h-10 rounded-lg object-cover" />
          <span className="text-xl font-bold text-foreground">BTC Treasury Codex</span>
        </div>
        <div className="flex items-center gap-4">
          {userRole === "admin" && (
            <a href="/admin" className="text-sm text-primary hover:underline font-medium">Admin Panel</a>
          )}
          <Button variant="ghost" onClick={onLogout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4 mr-2" />Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 h-16">
        <div className="container flex items-center justify-between h-full">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-24" />
        </div>
      </header>
      <main className="container py-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </main>
    </div>
  );
}

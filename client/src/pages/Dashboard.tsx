import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  RefreshCw,
  TrendingUp,
  Wallet,
  Bitcoin,
  Phone,
  LogOut,
  Share2,
} from "lucide-react";
import { useState } from "react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, decimals: number = 4): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const {
    data: portfolio,
    isLoading,
    refetch,
  } = trpc.portfolio.getData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const requestCallMutation = trpc.support.requestCall.useMutation({
    onSuccess: () => {
      toast.success("Call request submitted! Our team will contact you soon.");
    },
    onError: () => {
      toast.error("Failed to submit request. Please try again.");
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success("Portfolio data refreshed");
  };

  const handleRequestCall = () => {
    requestCallMutation.mutate();
  };

  const handleLogout = () => {
    logout();
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!portfolio?.hasCredentials || portfolio.error) {
    return (
      <div className="min-h-screen bg-background">
        <Header userName={user?.name} userRole={user?.role} onLogout={handleLogout} onRequestCall={handleRequestCall} isRequestingCall={requestCallMutation.isPending} />
        <main className="container py-8">
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Wallet className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Account Setup in Progress</h2>
              <p className="text-muted-foreground text-center max-w-md">
                {portfolio?.error || "Your account is being set up. Please contact us if you need assistance."}
              </p>
              <Button
                onClick={handleRequestCall}
                disabled={requestCallMutation.isPending}
                className="mt-6 bg-primary hover:bg-primary/90"
              >
                <Phone className="h-4 w-4 mr-2" />
                Request a Call
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Calculate BTC CAGR metrics
  const btcFromTrades = (portfolio.btcMetrics as any)?.btcFromTrades || 0;
  const btcHoldingsAtTradeTime = (portfolio.btcMetrics as any)?.btcHoldingsAtTradeTime || portfolio.btcMetrics?.totalPurchased || 0;
  const btcCagrPercent = btcHoldingsAtTradeTime > 0 ? (btcFromTrades / btcHoldingsAtTradeTime) * 100 : 0;
  const currentBtc = portfolio.btcMetrics?.currentlyHeld || 0;
  const btcPrice = portfolio.btcMetrics?.price || 0;
  const btcUsdValue = currentBtc * btcPrice;
  const [showShareCard, setShowShareCard] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header userName={user?.name} userRole={user?.role} onLogout={handleLogout} onRequestCall={handleRequestCall} isRequestingCall={requestCallMutation.isPending} />

      <main className="container py-8">

        {/* ============================================================
            HERO: BTC Holdings + BTC CAGR
            ============================================================ */}
        <div
          className="rounded-lg mb-8 p-8 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0f0f0f 0%, #1a1200 50%, #0f0f0f 100%)",
            border: "1px solid rgba(247,147,26,0.3)",
          }}
        >
          {/* BTC watermark */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: "14rem",
              fontWeight: 900,
              color: "rgba(247,147,26,0.04)",
              lineHeight: 1,
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            ₿
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#F7931A",
                marginBottom: "0.5rem",
              }}
            >
              BTC Treasury Codex — {user?.name || "Client"}'s Portfolio
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: "2rem",
                alignItems: "center",
                marginTop: "1.5rem",
              }}
            >
              {/* BTC Holdings */}
              <div>
                <p style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#888", marginBottom: "0.75rem" }}>
                  BTC Holdings
                </p>
                <p
                  style={{
                    fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
                    fontWeight: 700,
                    color: "#F7931A",
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatNumber(currentBtc, 8)}
                </p>
                <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.5rem" }}>BTC</p>
                <p style={{ fontSize: "1rem", color: "#ccc", marginTop: "0.25rem" }}>{formatCurrency(btcUsdValue)} USD</p>
              </div>

              {/* Divider */}
              <div style={{ width: "1px", height: "120px", background: "rgba(247,147,26,0.2)" }} />

              {/* BTC CAGR */}
              <div>
                <p style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#888", marginBottom: "0.75rem" }}>
                  BTC CAGR
                </p>
                <p
                  style={{
                    fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
                    fontWeight: 700,
                    color: btcCagrPercent >= 0 ? "#22c55e" : "#ef4444",
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {formatPercent(btcCagrPercent)}
                </p>
                <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.5rem" }}>In Bitcoin Terms</p>
                <p style={{ fontSize: "1rem", color: "#ccc", marginTop: "0.25rem" }}>
                  {btcFromTrades >= 0 ? "+" : ""}{formatNumber(btcFromTrades, 8)} BTC generated
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2rem" }}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                style={{ borderColor: "rgba(247,147,26,0.3)", color: "#ccc" }}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShareCard(!showShareCard)}
                style={{ borderColor: "rgba(247,147,26,0.3)", color: "#F7931A" }}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share My Performance
              </Button>
            </div>
          </div>
        </div>

        {/* ============================================================
            SHAREABLE PERFORMANCE CARD (toggle)
            ============================================================ */}
        {showShareCard && (
          <Card className="bg-card border-border mb-8" style={{ borderColor: "rgba(247,147,26,0.3)" }}>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Share2 className="h-5 w-5 text-primary" />
                Your Performance Card
              </CardTitle>
              <p className="text-sm text-muted-foreground">Screenshot this to share your Bitcoin CAGR with friends and family.</p>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  background: "linear-gradient(135deg, #0a0a0a 0%, #1a1200 100%)",
                  border: "2px solid rgba(247,147,26,0.4)",
                  padding: "2.5rem",
                  textAlign: "center",
                  maxWidth: "480px",
                  margin: "0 auto",
                }}
              >
                <p style={{ fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#F7931A", marginBottom: "1rem" }}>Bitcoin Treasury Codex</p>
                <p style={{ fontSize: "0.85rem", color: "#888", marginBottom: "0.5rem" }}>My BTC Holdings</p>
                <p style={{ fontSize: "2.5rem", fontWeight: 700, color: "#F7931A", lineHeight: 1 }}>{formatNumber(currentBtc, 8)} BTC</p>
                <p style={{ fontSize: "0.8rem", color: "#888", margin: "1.5rem 0 0.5rem" }}>BTC CAGR (Bitcoin Terms)</p>
                <p style={{ fontSize: "3rem", fontWeight: 700, color: btcCagrPercent >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }}>{formatPercent(btcCagrPercent)}</p>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "1.5rem", paddingTop: "1rem" }}>
                  <p style={{ fontSize: "0.65rem", color: "#555", letterSpacing: "0.1em" }}>codexyield.com &nbsp;|&nbsp; Powered by Halfacre Research</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            SECONDARY: USD METRICS
            ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">USD Deposited</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(portfolio.totalDeposited)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Portfolio Value (USD)</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(portfolio.totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">USD Growth</p>
              <p className={`text-2xl font-bold ${portfolio.dollarGrowth >= 0 ? "text-green-500" : "text-muted-foreground"}`}>
                {portfolio.dollarGrowth >= 0 ? "+" : ""}{formatCurrency(portfolio.dollarGrowth)}
              </p>
              <p className={`text-sm mt-1 ${portfolio.percentGrowth >= 0 ? "text-green-500" : "text-muted-foreground"}`}>
                {formatPercent(portfolio.percentGrowth)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ============================================================
            BTC HOLDINGS BREAKDOWN
            ============================================================ */}
        {portfolio.btcMetrics && (
          <Card className="bg-card border-border mb-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Bitcoin className="h-5 w-5 text-primary" />
                BTC Holdings Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">BTC Deposited</p>
                  <p className="text-xl font-bold text-foreground">{formatNumber(portfolio.btcMetrics.totalPurchased, 8)} BTC</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC Currently Held</p>
                  <p className="text-xl font-bold text-primary">{formatNumber(portfolio.btcMetrics.currentlyHeld, 8)} BTC</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC Generated by Codex</p>
                  <p className={`text-xl font-bold ${btcFromTrades >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {btcFromTrades >= 0 ? "+" : ""}{formatNumber(btcFromTrades, 8)} BTC
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC Price (Live)</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(portfolio.btcMetrics.price)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            ASSET BALANCES
            ============================================================ */}
        {portfolio.balances && portfolio.balances.length > 0 && (
          <Card className="bg-card border-border mb-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Account Balances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {portfolio.balances.map((balance) => (
                  <div key={balance.currency} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <span className="text-xs font-bold text-foreground uppercase">{balance.currency.slice(0, 3)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground uppercase">{balance.currency}</p>
                        <p className="text-sm text-muted-foreground">{formatNumber(balance.total, 8)}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(balance.usdValue)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            BTC ROTATION TRADES
            ============================================================ */}
        {portfolio.btcMetrics && (portfolio.btcMetrics as any).btcPairTrades && (portfolio.btcMetrics as any).btcPairTrades.length > 0 && (
          <Card className="bg-card border-border mb-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                BTC Rotation Trades
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Trades executed to grow BTC holdings in Bitcoin-denominated terms</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Pair</TableHead>
                    <TableHead className="text-right">BTC Spent</TableHead>
                    <TableHead className="text-right">BTC Received</TableHead>
                    <TableHead className="text-right">Net BTC</TableHead>
                    <TableHead className="text-right">% Gain</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(portfolio.btcMetrics as any).btcPairTrades.map((trade: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{formatDate(trade.date)}</TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{trade.pair}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatNumber(trade.btcSpent, 8)} BTC</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatNumber(trade.btcReceived, 8)} BTC</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-bold ${trade.netBtc >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {trade.netBtc >= 0 ? "+" : ""}{formatNumber(trade.netBtc, 8)} BTC
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${trade.percentGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {trade.percentGain >= 0 ? "+" : ""}{formatNumber(trade.percentGain, 2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            REQUEST A CALL CTA
            ============================================================ */}
        <Card className="bg-card border-border" style={{ borderColor: "rgba(247,147,26,0.2)" }}>
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <div>
              <p className="font-semibold text-foreground">Have questions about your portfolio?</p>
              <p className="text-sm text-muted-foreground">Schedule a call with Matthew Halfacre directly.</p>
            </div>
            <Button
              onClick={handleRequestCall}
              disabled={requestCallMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-black font-bold whitespace-nowrap"
            >
              <Phone className="h-4 w-4 mr-2" />
              Request a Call
            </Button>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}

function Header({ 
  userName, 
  userRole,
  onLogout, 
  onRequestCall, 
  isRequestingCall 
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
            <a href="/admin" className="text-sm text-primary hover:underline font-medium">
              Admin Panel
            </a>
          )}
          <Button
            variant="outline"
            onClick={onRequestCall}
            disabled={isRequestingCall}
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <Phone className="h-4 w-4 mr-2" />
            Request a Call
          </Button>
          <Button variant="ghost" onClick={onLogout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 h-16">
        <div className="container flex items-center justify-between h-full">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
      </header>
      <main className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-12 w-48 mb-6" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

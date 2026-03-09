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
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bitcoin,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useEffect } from "react";

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

export default function ClientView() {
  const { user, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const clientId = parseInt(params.id || "0", 10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  const {
    data: portfolio,
    isLoading,
    refetch,
  } = trpc.admin.getClientPortfolio.useQuery(
    { userId: clientId },
    { enabled: !!user && user.role === "admin" && clientId > 0 }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

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
        <main className="container py-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </main>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  // Calculate BTC CAGR metrics (same logic as Dashboard.tsx)
  const btcFromTrades = (portfolio?.btcMetrics as any)?.btcFromTrades || 0;
  const btcHoldingsAtTradeTime = (portfolio?.btcMetrics as any)?.btcHoldingsAtTradeTime || portfolio?.btcMetrics?.totalPurchased || 0;
  const btcCagrPercent = btcHoldingsAtTradeTime > 0 ? (btcFromTrades / btcHoldingsAtTradeTime) * 100 : 0;
  const currentBtc = portfolio?.btcMetrics?.currentlyHeld || 0;
  const btcPrice = portfolio?.btcMetrics?.price || 0;
  const btcUsdValue = currentBtc * btcPrice;
  const isPositiveGrowth = (portfolio?.dollarGrowth || 0) >= 0;
  const isPositiveBtcCagr = btcCagrPercent >= 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="BTC Treasury Codex" className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <span className="text-xl font-bold text-foreground">BTC Treasury Codex</span>
              <span className="ml-2 text-sm text-muted-foreground">Admin View</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Back button and client info */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setLocation("/admin")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {portfolio?.client?.name || "Client"}'s Portfolio
              </h1>
              <p className="text-muted-foreground">{portfolio?.client?.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-border"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {!portfolio?.hasCredentials || portfolio.error ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bitcoin className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">No Portfolio Data</h2>
              <p className="text-muted-foreground text-center max-w-md">
                {portfolio?.error || "This client doesn't have an API key configured yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ===== HERO: BTC Holdings + BTC CAGR ===== */}
            <div
              className="rounded-lg mb-8 p-8 text-center relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0f0f0f 0%, #1a1200 50%, #0f0f0f 100%)", border: "1px solid rgba(247,147,26,0.3)" }}
            >
              <p className="text-sm font-semibold tracking-widest mb-6" style={{ color: "#f7931a", textTransform: "uppercase" }}>
                Bitcoin Performance
              </p>
              <div className="flex flex-col md:flex-row items-center justify-center gap-12">
                {/* BTC Holdings */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Bitcoin className="w-6 h-6" style={{ color: "#f7931a" }} />
                    <span className="text-sm text-muted-foreground uppercase tracking-wider">BTC Holdings</span>
                  </div>
                  <p className="text-6xl font-black leading-none" style={{ color: "#f7931a" }}>
                    {formatNumber(currentBtc, 8)}
                  </p>
                  <p className="text-lg text-muted-foreground mt-1">BTC</p>
                  <p className="text-sm text-muted-foreground mt-1">{formatCurrency(btcUsdValue)} USD</p>
                </div>

                {/* Divider */}
                <div className="hidden md:block w-px h-24 bg-border" />

                {/* BTC CAGR */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-1">
                    {isPositiveBtcCagr
                      ? <TrendingUp className="w-6 h-6 text-green-500" />
                      : <TrendingDown className="w-6 h-6 text-red-500" />}
                    <span className="text-sm text-muted-foreground uppercase tracking-wider">BTC CAGR</span>
                  </div>
                  <p className={`text-6xl font-black leading-none ${isPositiveBtcCagr ? "text-green-500" : "text-red-500"}`}>
                    {formatPercent(btcCagrPercent)}
                  </p>
                  <p className="text-lg text-muted-foreground mt-1">annualized in BTC terms</p>
                </div>
              </div>
            </div>

            {/* ===== USD Metrics (secondary) ===== */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">USD Deposited</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(portfolio.totalDeposited)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Portfolio Value</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(portfolio.totalValue)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">USD Growth</p>
                <p className={`text-xl font-bold ${isPositiveGrowth ? "text-green-500" : "text-red-500"}`}>
                  {isPositiveGrowth ? "+" : "-"}{formatCurrency(Math.abs(portfolio.dollarGrowth))}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">USD Return</p>
                <p className={`text-xl font-bold ${isPositiveGrowth ? "text-green-500" : "text-red-500"}`}>
                  {formatPercent(portfolio.percentGrowth)}
                </p>
              </div>
            </div>

            {/* ===== Holdings Breakdown ===== */}
            <Card className="bg-card border-border mb-6">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Bitcoin className="h-5 w-5 text-primary" />
                  Holdings Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {portfolio.balances?.map((balance: any) => (
                    <div key={balance.currency} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                          <span className="text-xs font-bold text-foreground uppercase">{balance.currency.slice(0, 3)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground uppercase">{balance.currency}</p>
                          <p className="text-sm text-muted-foreground">{formatNumber(balance.total, balance.currency === "USD" ? 2 : 8)} {balance.currency.toUpperCase()}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-foreground">{formatCurrency(balance.usdValue)}</p>
                    </div>
                  ))}
                  {(!portfolio.balances || portfolio.balances.length === 0) && (
                    <p className="text-muted-foreground text-center py-4">No holdings found</p>
                  )}
                </div>
              </CardContent>
            </Card>

            
            {/* BTC Rotation Trades Card */}
            {portfolio.btcMetrics && (portfolio.btcMetrics as any).btcPairTrades && (
              <Card className="bg-card border-border mb-6">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Bitcoin className="h-5 w-5 text-primary" />
                    BTC Rotation Trades
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Trades executed using BTC as the trading pair to grow BTC holdings
                  </p>
                </CardHeader>
                <CardContent>
                  {(portfolio.btcMetrics as any).btcPairTrades.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No BTC-pair trades found yet
                    </p>
                  ) : (
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
                            <TableCell className="font-medium">
                              {formatDate(trade.date)}
                            </TableCell>
                            <TableCell className="font-mono text-sm font-semibold">
                              {trade.pair}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {formatNumber(trade.btcSpent, 8)} BTC
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {formatNumber(trade.btcReceived, 8)} BTC
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm font-bold ${
                              trade.netBtc >= 0 ? "text-green-600" : "text-red-600"
                            }`}>
                              {trade.netBtc >= 0 ? "+" : ""}{formatNumber(trade.netBtc, 8)} BTC
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm font-semibold ${
                              trade.percentGain >= 0 ? "text-green-600" : "text-red-600"
                            }`}>
                              {trade.percentGain >= 0 ? "+" : ""}{formatNumber(trade.percentGain, 2)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}


          </>
        )}
      </main>
    </div>
  );
}

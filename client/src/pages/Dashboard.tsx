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
  TrendingDown,
  Wallet,
  DollarSign,
  Bitcoin,
  Phone,
  LogOut,
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

  const isPositiveGrowth = portfolio.dollarGrowth >= 0;

  return (
    <div className="min-h-screen bg-background">
      <Header userName={user?.name} userRole={user?.role} onLogout={handleLogout} onRequestCall={handleRequestCall} isRequestingCall={requestCallMutation.isPending} />
      
      <main className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Portfolio Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user?.name || "Client"}</p>
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

        {/* Top Row: Portfolio Overview & USD Growth */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Portfolio Overview Card */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Portfolio Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
                <p className="text-4xl font-bold text-foreground">{formatCurrency(portfolio.totalValue)}</p>
              </div>
              <div className="space-y-3">
                {portfolio.balances.map((balance) => (
                  <div key={balance.currency} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <span className="text-xs font-bold text-foreground uppercase">{balance.currency.slice(0, 3)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground uppercase">{balance.currency}</p>
                        <p className="text-sm text-muted-foreground">{formatNumber(balance.total)} {balance.currency.toUpperCase()}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(balance.usdValue)}</p>
                  </div>
                ))}
                {portfolio.balances.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No holdings found</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* USD Growth Metrics Card */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                USD Growth Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Total USD Deposited</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(portfolio.totalDeposited)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Portfolio Value</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(portfolio.totalValue)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dollar Growth</p>
                  <p className={`text-2xl font-bold flex items-center gap-2 ${isPositiveGrowth ? "text-green-500" : "text-red-500"}`}>
                    {isPositiveGrowth ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {formatCurrency(Math.abs(portfolio.dollarGrowth))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Percentage Growth</p>
                  <p className={`text-2xl font-bold ${isPositiveGrowth ? "text-green-500" : "text-red-500"}`}>
                    {formatPercent(portfolio.percentGrowth)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* BTC Performance Card (conditional) */}
        {portfolio.btcMetrics && (
          <Card className="bg-card border-border mb-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Bitcoin className="h-5 w-5 text-primary" />
                BTC Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Total BTC Purchased</p>
                  <p className="text-2xl font-bold text-foreground">{formatNumber(portfolio.btcMetrics.totalPurchased, 8)} BTC</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC Currently Held</p>
                  <p className="text-2xl font-bold text-foreground">{formatNumber(portfolio.btcMetrics.currentlyHeld, 8)} BTC</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC Growth</p>
                  <p className="text-2xl font-bold text-green-500">
                    {(() => {
                      const netAcquired = portfolio.btcMetrics.totalPurchased - portfolio.btcMetrics.totalSold;
                      const growth = portfolio.btcMetrics.currentlyHeld - netAcquired;
                      return formatNumber(growth, 8);
                    })()} BTC
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BTC Percentage Growth</p>
                  <p className="text-2xl font-bold text-green-500">
                    {(() => {
                      // BTC Growth % = BTC gained from trades / BTC holdings at trade time × 100
                      const btcFromTrades = (portfolio.btcMetrics as any).btcFromTrades || 0;
                      const btcHoldingsAtTradeTime = (portfolio.btcMetrics as any).btcHoldingsAtTradeTime || portfolio.btcMetrics.totalPurchased;
                      const percentGrowth = btcHoldingsAtTradeTime > 0 ? (btcFromTrades / btcHoldingsAtTradeTime) * 100 : 0;
                      return formatPercent(percentGrowth);
                    })()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}


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

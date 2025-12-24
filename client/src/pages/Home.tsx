import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Wallet, Shield, TrendingUp, BarChart3 } from "lucide-react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="BTC Treasury Codex" className="w-10 h-10 rounded-lg object-cover" />
            <span className="text-xl font-bold text-foreground">BTC Treasury Codex</span>
          </div>
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Login
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main>
        <section className="py-24 md:py-32">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
                Your Crypto Portfolio,{" "}
                <span className="text-primary">Simplified</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Access your sFOX trading account dashboard with real-time portfolio tracking, 
                growth metrics, and trade history — all in one secure portal.
              </p>
              <Button
                size="lg"
                onClick={() => window.location.href = getLoginUrl()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6"
              >
                Login to Dashboard
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 border-t border-border">
          <div className="container">
            <h2 className="text-2xl font-bold text-foreground text-center mb-12">
              Everything You Need to Track Your Portfolio
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <FeatureCard
                icon={<Wallet className="h-8 w-8" />}
                title="Portfolio Overview"
                description="View your total portfolio value and individual cryptocurrency holdings in real-time."
              />
              <FeatureCard
                icon={<TrendingUp className="h-8 w-8" />}
                title="Growth Metrics"
                description="Track your USD deposits, current value, and overall portfolio growth percentage."
              />
              <FeatureCard
                icon={<BarChart3 className="h-8 w-8" />}
                title="Trade History"
                description="Review your recent trades with detailed information on each transaction."
              />
              <FeatureCard
                icon={<Shield className="h-8 w-8" />}
                title="Secure Access"
                description="Login securely with your email — no passwords to remember."
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 border-t border-border">
          <div className="container">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Ready to View Your Portfolio?
              </h2>
              <p className="text-muted-foreground mb-8">
                Login with your email to access your personalized dashboard.
              </p>
              <Button
                size="lg"
                onClick={() => window.location.href = getLoginUrl()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Get Started
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">C</span>
              </div>
              <span className="font-semibold text-foreground">BTC Treasury Codex</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 BTC Treasury Codex. All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-lg bg-card border border-border">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

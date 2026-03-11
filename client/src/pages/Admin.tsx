import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users, Plus, Key, LogOut, CheckCircle, XCircle,
  Loader2, TrendingUp, TrendingDown, Mail, Clock,
} from "lucide-react";

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtBtc(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
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

export default function Admin() {
  const { user, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  // getClients now returns alpha data embedded from the snapshot — no separate getAllClientAlpha call needed
  const { data: clients, isLoading: clientsLoading, refetch } = trpc.admin.getClients.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin", staleTime: 60_000 }
  );

  const addClientMutation = trpc.admin.addClient.useMutation({
    onSuccess: () => {
      toast.success("Client added successfully");
      refetch();
      setAddDialogOpen(false);
      setNewClient({ name: "", email: "", sfoxApiKey: "" });
    },
    onError: (err) => toast.error(err.message || "Failed to add client"),
  });

  const updateApiKeyMutation = trpc.admin.updateClientApiKey.useMutation({
    onSuccess: () => {
      toast.success("API key updated — portfolio will sync within 5 minutes");
      refetch();
      setEditDialogOpen(false);
      setEditingClient(null);
      setNewApiKey("");
    },
    onError: (err) => toast.error(err.message || "Failed to update API key"),
  });

  const sendMagicLinkMutation = trpc.admin.sendClientMagicLink.useMutation({
    onSuccess: () => toast.success("Login link sent"),
    onError: (err) => toast.error(err.message || "Failed to send login link"),
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<{ id: number; name: string | null } | null>(null);
  const [newApiKey, setNewApiKey] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", sfoxApiKey: "" });

  const handleAddClient = () => {
    if (!newClient.name || !newClient.email) {
      toast.error("Name and email are required");
      return;
    }
    addClientMutation.mutate(newClient);
  };

  const handleUpdateApiKey = () => {
    if (!editingClient || !newApiKey) {
      toast.error("Please enter an API key");
      return;
    }
    updateApiKeyMutation.mutate({ userId: editingClient.id, sfoxApiKey: newApiKey });
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  const totalClients = clients?.length || 0;
  const activeClients = clients?.filter(c => c.hasApiKey).length || 0;
  const pendingClients = clients?.filter(c => !c.hasApiKey).length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="BTC Treasury Codex" className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <span className="text-xl font-bold text-foreground">BTC Treasury Codex</span>
              <span className="ml-2 text-sm text-muted-foreground">Admin Panel</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-7xl space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Clients</CardDescription>
              <CardTitle className="text-3xl">{totalClients}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active (API Key Set)</CardDescription>
              <CardTitle className="text-3xl text-green-500">{activeClients}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Setup</CardDescription>
              <CardTitle className="text-3xl text-yellow-500">{pendingClients}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Client Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle>Client Management</CardTitle>
                  <CardDescription>Manage client accounts and view BTC alpha performance · data syncs every 5 minutes</CardDescription>
                </div>
              </div>

              {/* Add Client Dialog */}
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 text-black font-bold">
                    <Plus className="w-4 h-4 mr-2" />Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                    <DialogDescription>
                      Create a client account. The sFOX API key can be added now or later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Client Name</Label>
                      <Input
                        id="name"
                        placeholder="Jane Smith"
                        value={newClient.name}
                        onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="jane@example.com"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sfoxApiKey">sFOX API Key <span className="text-muted-foreground text-xs">(optional — can add later)</span></Label>
                      <Input
                        id="sfoxApiKey"
                        type="password"
                        placeholder="sFOX API key"
                        value={newClient.sfoxApiKey}
                        onChange={(e) => setNewClient({ ...newClient, sfoxApiKey: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                    <Button
                      onClick={handleAddClient}
                      disabled={addClientMutation.isPending}
                      className="bg-primary hover:bg-primary/90 text-black font-bold"
                    >
                      {addClientMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                      Add Client
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>

          <CardContent>
            {clientsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : clients && clients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>BTC Alpha</TableHead>
                    <TableHead>Actual BTC</TableHead>
                    <TableHead>Last Synced</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const alphaPercent = (client as any).alphaPercent as number | null;
                    const alphaBtc = (client as any).alphaBtc as number | null;
                    const syncedAt = (client as any).syncedAt as string | null;
                    const isAhead = alphaBtc !== null ? alphaBtc >= 0 : null;

                    return (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">
                          <a href={`/client/${client.id}`} className="text-primary hover:underline">
                            {client.name || "—"}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{client.email || "—"}</TableCell>
                        <TableCell>
                          {client.hasApiKey ? (
                            <span className="inline-flex items-center gap-1 text-green-500 text-sm">
                              <CheckCircle className="w-4 h-4" />Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-yellow-500 text-sm">
                              <XCircle className="w-4 h-4" />Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {alphaPercent !== null ? (
                            <span className={`inline-flex items-center gap-1 font-semibold text-sm ${isAhead ? "text-green-500" : "text-red-500"}`}>
                              {isAhead ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {fmtPct(alphaPercent)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Syncing…</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {alphaBtc !== null ? fmtBtc(alphaBtc) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {syncedAt ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {fmtTimeAgo(syncedAt)}
                            </span>
                          ) : (
                            <span className="text-yellow-500">Pending first sync</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => sendMagicLinkMutation.mutate({ userId: client.id })}
                              disabled={sendMagicLinkMutation.isPending}
                              title="Send login link to client"
                            >
                              <Mail className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingClient({ id: client.id, name: client.name });
                                setNewApiKey("");
                                setEditDialogOpen(true);
                              }}
                            >
                              <Key className="w-4 h-4 mr-1" />
                              {client.hasApiKey ? "Update Key" : "Add Key"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No clients yet. Click "Add Client" to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit API Key Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update sFOX API Key</DialogTitle>
              <DialogDescription>
                Enter a new sFOX API key for {editingClient?.name || "this client"}.
                The portfolio will sync automatically within 5 minutes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newApiKey">New sFOX API Key</Label>
                <Input
                  id="newApiKey"
                  type="password"
                  placeholder="Enter sFOX API key"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleUpdateApiKey}
                disabled={updateApiKeyMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-black font-bold"
              >
                {updateApiKeyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
                Save Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}

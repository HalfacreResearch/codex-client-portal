import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Key, LogOut, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function Admin() {
  const { user, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  const { data: clients, isLoading: clientsLoading, refetch } = trpc.admin.getClients.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );

  const addClientMutation = trpc.admin.addClient.useMutation({
    onSuccess: () => {
      toast.success("Client added successfully");
      refetch();
      setAddDialogOpen(false);
      setNewClient({ name: "", email: "", sfoxApiKey: "" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add client");
    },
  });

  const updateApiKeyMutation = trpc.admin.updateClientApiKey.useMutation({
    onSuccess: () => {
      toast.success("API key updated successfully");
      refetch();
      setEditDialogOpen(false);
      setEditingClient(null);
      setNewApiKey("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update API key");
    },
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<{ id: number; name: string | null } | null>(null);
  const [newApiKey, setNewApiKey] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", sfoxApiKey: "" });

  const handleAddClient = () => {
    if (!newClient.name || !newClient.email || !newClient.sfoxApiKey) {
      toast.error("Please fill in all fields");
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

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
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
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Clients</CardDescription>
              <CardTitle className="text-3xl">{clients?.length || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active (API Key Set)</CardDescription>
              <CardTitle className="text-3xl text-green-500">
                {clients?.filter(c => c.hasApiKey).length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Setup</CardDescription>
              <CardTitle className="text-3xl text-yellow-500">
                {clients?.filter(c => !c.hasApiKey).length || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Client Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                <div>
                  <CardTitle>Client Management</CardTitle>
                  <CardDescription>Add and manage client accounts</CardDescription>
                </div>
              </div>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                    <DialogDescription>
                      Create a new client account with their sFOX API key. The client can then log in with their email.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Client Name</Label>
                      <Input
                        id="name"
                        placeholder="John Smith"
                        value={newClient.name}
                        onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">sFOX API Key</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="Enter sFOX API key"
                        value={newClient.sfoxApiKey}
                        onChange={(e) => setNewClient({ ...newClient, sfoxApiKey: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddClient} disabled={addClientMutation.isPending}>
                      {addClientMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
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
                    <TableHead>Created</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">
                        <a 
                          href={`/client/${client.id}`}
                          className="text-primary hover:underline cursor-pointer"
                        >
                          {client.name || "—"}
                        </a>
                      </TableCell>
                      <TableCell>{client.email || "—"}</TableCell>
                      <TableCell>
                        {client.hasApiKey ? (
                          <span className="inline-flex items-center gap-1 text-green-500">
                            <CheckCircle className="w-4 h-4" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-yellow-500">
                            <XCircle className="w-4 h-4" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(client.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(client.lastSignedIn).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingClient({ id: client.id, name: client.name });
                            setNewApiKey("");
                            setEditDialogOpen(true);
                          }}
                        >
                          <Key className="w-4 h-4 mr-2" />
                          {client.hasApiKey ? "Update Key" : "Add Key"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No clients yet. Click "Add Client" to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit API Key Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update API Key</DialogTitle>
              <DialogDescription>
                Enter a new sFOX API key for {editingClient?.name || "this client"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newApiKey">New sFOX API Key</Label>
                <Input
                  id="newApiKey"
                  type="password"
                  placeholder="Enter new sFOX API key"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateApiKey} disabled={updateApiKeyMutation.isPending}>
                {updateApiKeyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Key className="w-4 h-4 mr-2" />
                )}
                Update Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

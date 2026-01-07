import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, User, FileText, CheckCircle, Clock, X, Loader2 } from 'lucide-react';
import { useClientStore } from '../../stores';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, Button, Input, Label, Separator } from '../../components/ui';
import { cn } from '../../lib/utils';
import { formatDateLocale } from '../../../shared/utils';

export function ClientsPage() {
  const navigate = useNavigate();
  const { 
    clients, 
    isLoading, 
    error, 
    pagination,
    searchQuery,
    fetchClients, 
    createClient,
    setSearchQuery 
  } = useClientStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    nationality: '',
    passportNumber: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    // Debounced search would be better
    setTimeout(() => fetchClients({ search: e.target.value }), 300);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const result = await createClient(newClient);
    setCreating(false);
    if (result) {
      setShowCreateModal(false);
      setNewClient({ name: '', email: '', phone: '', nationality: '', passportNumber: '' });
    }
  };

  const getStatusBadge = (status: string, hasApprovedExtraction: boolean) => {
    if (hasApprovedExtraction) {
      return (
        <span className="status-badge bg-green-50 text-green-700 border border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Ready
        </span>
      );
    }
    return (
      <span className="status-badge bg-yellow-50 text-yellow-700 border border-yellow-200">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </span>
    );
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Clients</h1>
            <p className="page-description">
              Manage your visa applicants and their documents.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients by name or email..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-10"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && clients.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && clients.length === 0 && (
        <div className="empty-state">
          <User className="empty-state-icon" />
          <h3 className="empty-state-title">No clients yet</h3>
          <p className="empty-state-description">
            Add your first client to start managing their visa applications.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            Add Client
          </Button>
        </div>
      )}

      {/* Client Grid */}
      {clients.length > 0 && (
        <div className="card-grid">
          {clients.map((client) => (
            <Card 
              key={client._id} 
              className="hover-lift cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/clients/${client._id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-base">{client.name}</CardTitle>
                      <CardDescription className="text-xs">{client.email}</CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(client.status, client.hasApprovedExtraction)}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    <span>{client.documentCount} docs</span>
                  </div>
                  <span className="text-border">|</span>
                  <span>{client.nationality || 'N/A'}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Added {formatDateLocale(client.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: pagination.totalPages }, (_, i) => (
            <Button
              key={i + 1}
              variant={pagination.page === i + 1 ? 'default' : 'outline'}
              size="sm"
              onClick={() => fetchClients({ page: i + 1 })}
            >
              {i + 1}
            </Button>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md animate-fade-in">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Add New Client</CardTitle>
                <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>Enter the client's basic information</CardDescription>
            </CardHeader>
            <form onSubmit={handleCreateClient}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={newClient.name}
                    onChange={(e) => setNewClient(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={newClient.phone}
                      onChange={(e) => setNewClient(prev => ({ ...prev, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input
                      id="nationality"
                      value={newClient.nationality}
                      onChange={(e) => setNewClient(prev => ({ ...prev, nationality: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passport">Passport Number</Label>
                    <Input
                      id="passport"
                      value={newClient.passportNumber}
                      onChange={(e) => setNewClient(prev => ({ ...prev, passportNumber: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
              <div className="flex justify-end gap-3 p-6 pt-0">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Create Client
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

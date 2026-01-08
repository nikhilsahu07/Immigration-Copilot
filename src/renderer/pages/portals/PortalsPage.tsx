import React, { useEffect, useState } from 'react';
import { Plus, Globe, ExternalLink, Trash2, X, Loader2 } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label } from '../../components/ui';
import { usePortalStore } from '../../stores';

export function PortalsPage() {
  const { 
    portals, 
    isLoading, 
    error, 
    fetchPortals, 
    createPortal, 
    deletePortal,
    clearError 
  } = usePortalStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newPortal, setNewPortal] = useState({
    name: '',
    url: '',
    country: '',
    description: '',
  });

  useEffect(() => {
    fetchPortals();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const result = await createPortal(newPortal);
    setCreating(false);
    if (result) {
      setShowCreateModal(false);
      setNewPortal({ name: '', url: '', country: '', description: '' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this portal?')) return;
    setDeleting(id);
    await deletePortal(id);
    setDeleting(null);
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Portals</h1>
            <p className="page-description">
              Configure immigration portal URLs for automation.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            Add Portal
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-destructive hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && portals.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && portals.length === 0 && (
        <div className="empty-state">
          <Globe className="empty-state-icon" />
          <h3 className="empty-state-title">No portals configured</h3>
          <p className="empty-state-description">
            Add immigration portal URLs to enable automation.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            Add Portal
          </Button>
        </div>
      )}

      {/* Portal Grid */}
      {portals.length > 0 && (
        <div className="card-grid">
          {portals.map((portal) => (
            <Card key={portal._id} className="hover-lift">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{portal.name}</CardTitle>
                      <CardDescription className="text-xs">{portal.country}</CardDescription>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(portal._id)}
                    disabled={deleting === portal._id}
                  >
                    {deleting === portal._id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <a 
                    href={portal.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground truncate"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{portal.url}</span>
                  </a>
                </div>
                {portal.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {portal.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md animate-fade-in">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Add New Portal</CardTitle>
                <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>Configure a new immigration portal</CardDescription>
            </CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Portal Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., US Visa Application"
                    value={newPortal.name}
                    onChange={(e) => setNewPortal(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Portal URL *</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://..."
                    value={newPortal.url}
                    onChange={(e) => setNewPortal(prev => ({ ...prev, url: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    placeholder="e.g., United States"
                    value={newPortal.country}
                    onChange={(e) => setNewPortal(prev => ({ ...prev, country: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Optional description"
                    value={newPortal.description}
                    onChange={(e) => setNewPortal(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </CardContent>
              <div className="flex justify-end gap-3 p-6 pt-0">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Portal
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

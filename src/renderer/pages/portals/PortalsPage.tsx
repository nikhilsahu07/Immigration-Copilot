import React, { useEffect, useState } from 'react';
import { Plus, Globe, ExternalLink, Trash2, X, Loader2, Edit } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label } from '../../components/ui';
import { usePortalStore } from '../../stores';

export function PortalsPage() {
  const { 
    portals, 
    isLoading, 
    error, 
    fetchPortals, 
    createPortal, 
    updatePortal,
    deletePortal,
    clearError 
  } = usePortalStore();

  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    country: '',
    description: '',
  });

  useEffect(() => {
    fetchPortals();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let result;
    if (editingId) {
      result = await updatePortal(editingId, formData);
    } else {
      result = await createPortal(formData);
    }
    
    setIsSubmitting(false);
    if (result) {
      closeModal();
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ name: '', url: '', country: '', description: '' });
    setShowModal(true);
  };

  const openEditModal = (portal: typeof portals[0]) => {
    setEditingId(portal._id);
    setFormData({
      name: portal.name,
      url: portal.url,
      country: portal.country,
      description: portal.description || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', url: '', country: '', description: '' });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
          <Button onClick={openCreateModal}>
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
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4" />
            Add Portal
          </Button>
        </div>
      )}

      {/* Portal Grid */}
      {portals.length > 0 && (
        <div className="card-grid">
          {portals.map((portal) => (
            <Card key={portal._id} className="hover-lift group relative">
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
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => openEditModal(portal)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(portal._id, e)}
                      disabled={deleting === portal._id}
                    >
                      {deleting === portal._id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md animate-fade-in">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editingId ? 'Edit Portal' : 'Add New Portal'}</CardTitle>
                <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CardDescription>
                {editingId ? 'Update portal configuration' : 'Configure a new immigration portal'}
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Portal Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., US Visa Application"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Portal URL *</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://..."
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    placeholder="e.g., United States"
                    value={formData.country}
                    onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Optional description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </CardContent>
              <div className="flex justify-end gap-3 p-6 pt-0">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Save Changes' : 'Create Portal'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Plus, Globe, ExternalLink, Trash2, X, Loader2 } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label } from '../../components/ui';

export function PortalsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPortal, setNewPortal] = useState({
    name: '',
    url: '',
    country: '',
    description: '',
  });

  // Placeholder data
  const portals = [
    { _id: '1', name: 'US Visa Application', url: 'https://ceac.state.gov', country: 'United States', isActive: true },
    { _id: '2', name: 'UK Visa Application', url: 'https://www.gov.uk/apply-uk-visa', country: 'United Kingdom', isActive: true },
    { _id: '3', name: 'Canada Express Entry', url: 'https://www.canada.ca/en/immigration-refugees-citizenship', country: 'Canada', isActive: true },
    { _id: '4', name: 'Schengen Visa Portal', url: 'https://example.com/schengen', country: 'European Union', isActive: true },
  ];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    // Would call portal.create API
    console.log('Creating portal:', newPortal);
    setShowCreateModal(false);
    setNewPortal({ name: '', url: '', country: '', description: '' });
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

      {/* Portal Grid */}
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
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
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
            </CardContent>
          </Card>
        ))}
      </div>

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
                <Button type="submit">Create Portal</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Key, Plus, Edit, Trash2, Check, X, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui';
import { api } from '../../../lib/api';
import type { Credential, CreateCredentialInput, UpdateCredentialInput } from '../../../../shared/types';

export function CredentialsList() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [formData, setFormData] = useState({ title: '', apiKey: '', isActive: false });
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const result = await api.credential.list();
      if (result.success && result.data) {
        setCredentials(result.data);
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (credential?: Credential) => {
    if (credential) {
      setEditingCredential(credential);
      setFormData({
        title: credential.title,
        apiKey: credential.apiKey,
        isActive: credential.isActive,
      });
    } else {
      setEditingCredential(null);
      setFormData({ title: '', apiKey: '', isActive: false });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCredential(null);
    setFormData({ title: '', apiKey: '', isActive: false });
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.apiKey.trim()) {
      alert('Title and API key are required');
      return;
    }

    setSaving(true);
    try {
      if (editingCredential) {
        const updateData: UpdateCredentialInput = {
          title: formData.title,
          apiKey: formData.apiKey,
          isActive: formData.isActive,
        };
        const result = await api.credential.update({
          id: editingCredential._id,
          data: updateData,
        });
        if (result.success) {
          await loadCredentials();
          handleCloseDialog();
        } else {
          alert(result.error || 'Failed to update credential');
        }
      } else {
        const createData: CreateCredentialInput = {
          title: formData.title,
          apiKey: formData.apiKey,
          isActive: formData.isActive,
        };
        const result = await api.credential.create(createData);
        if (result.success) {
          await loadCredentials();
          handleCloseDialog();
        } else {
          alert(result.error || 'Failed to create credential');
        }
      }
    } catch (error) {
      console.error('Failed to save credential:', error);
      alert('Failed to save credential');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this credential?')) {
      return;
    }

    try {
      const result = await api.credential.delete({ id });
      if (result.success) {
        await loadCredentials();
      } else {
        alert(result.error || 'Failed to delete credential');
      }
    } catch (error) {
      console.error('Failed to delete credential:', error);
      alert('Failed to delete credential');
    }
  };

  const toggleShowApiKey = (id: string) => {
    setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Gemini API Keys</CardTitle>
                <CardDescription>Manage your Gemini API credentials</CardDescription>
              </div>
            </div>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No API keys configured</p>
              <p className="text-sm mt-2">Add your first Gemini API key to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {credentials.map((credential) => (
                <div
                  key={credential._id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    credential.isActive ? 'border-primary bg-primary/5' : 'bg-muted/30'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{credential.title}</span>
                      {credential.isActive && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="text-xs font-mono bg-background px-2 py-1 rounded">
                        {showApiKey[credential._id]
                          ? credential.apiKey
                          : `${credential.apiKey.substring(0, 8)}...${credential.apiKey.substring(credential.apiKey.length - 4)}`}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toggleShowApiKey(credential._id)}
                      >
                        {showApiKey[credential._id] ? (
                          <EyeOff className="w-3 h-3" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {new Date(credential.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(credential)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(credential._id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCredential ? 'Edit API Key' : 'Add API Key'}
            </DialogTitle>
            <DialogDescription>
              {editingCredential
                ? 'Update your Gemini API key details'
                : 'Add a new Gemini API key to use for AI operations'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Production Key, Development Key"
              />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Enter your Gemini API key"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isActive" className="font-normal cursor-pointer">
                Set as active (this will deactivate other keys)
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseDialog} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

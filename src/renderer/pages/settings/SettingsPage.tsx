import React from 'react';
import { Building, User, Key, Bell } from 'lucide-react';
import { useAuthStore } from '../../stores';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Input, Label } from '../../components/ui';
import { AgentsList } from './components/AgentsList';
import { CredentialsList } from './components/CredentialsList';

export function SettingsPage() {
  const { agent, company } = useAuthStore();

  return (
    <div className="page-container max-w-4xl">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-description">
          Manage your account and company settings.
        </p>
      </div>

      <div className="space-y-6">
        {/* Company Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Company Details</CardTitle>
                <CardDescription>Manage your company information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={company?.name || ''} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Company ID</Label>
                <Input value={company?._id || ''} readOnly className="font-mono text-xs" />
              </div>
            </div>
            <Button variant="outline">Edit Company Details</Button>
          </CardContent>
        </Card>

        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Manage your personal account settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={agent?.name || ''} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={agent?.email || ''} readOnly />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={agent?.role || 'agent'} readOnly className="capitalize" />
            </div>
            <Button variant="outline">Edit Profile</Button>
          </CardContent>
        </Card>

        {/* Team Management (Admin Only) */}
        {agent?.role === 'admin' && <AgentsList />}

        {/* Gemini API Keys */}
        <CredentialsList />

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage passwords and security settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">Last changed: Never</p>
              </div>
              <Button variant="outline">Change Password</Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Configure notification preferences</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

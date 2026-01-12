
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label } from '../../../../components/ui';
import type { AgentPublic, CreateAgentInput, UpdateAgentInput } from '../../../../shared/types';
import { Loader2 } from 'lucide-react';

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAgentInput | UpdateAgentInput) => Promise<boolean>;
  agent?: AgentPublic | null; // If null, mode is create
  isLoading?: boolean;
}

export function AgentModal({ isOpen, onClose, onSubmit, agent, isLoading }: AgentModalProps) {
  const isEditing = !!agent;
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'agent' as 'agent' | 'admin',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (agent) {
        setFormData({
          name: agent.name,
          email: agent.email,
          role: agent.role,
          password: '', // Don't show existing password
        });
      } else {
        setFormData({
          name: '',
          email: '',
          role: 'agent',
          password: '',
        });
      }
      setErrors({});
    }
  }, [isOpen, agent]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    
    // Password required for creation, optional for update
    if (!isEditing && !formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password && formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Cast to the expected types since formData has role as 'agent' | 'admin' but inputs expect optional
    const submissionData = isEditing 
      ? { ...formData } as UpdateAgentInput
      : { ...formData, companyId: 'temp' } as CreateAgentInput; // companyId is handled by backend but required by type

    await onSubmit(submissionData);
    // Don't close here, parent handles it on success
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Agent' : 'Add New Agent'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {isEditing ? 'New Password (Optional)' : 'Password'}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder={isEditing ? 'Leave blank to keep current' : 'Enter password'}
              className={errors.password ? 'border-red-500' : ''}
            />
            {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Update Agent' : 'Create Agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

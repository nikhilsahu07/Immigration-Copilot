
import React, { useEffect, useState } from 'react';
import { useAgentStore, useAuthStore } from '../../../stores';
import { Button, Card, CardHeader, CardTitle, CardContent, CardDescription, Alert, AlertTitle, AlertDescription } from '../../../components/ui';
import { AgentModal } from './AgentModal';
import { Users, Plus, Pencil, Trash2, Shield, ShieldCheck, Mail, Calendar, Loader2 } from 'lucide-react';
import type { AgentPublic, CreateAgentInput, UpdateAgentInput } from '../../../../shared/types';

export function AgentsList() {
  const { agents, fetchAgents, createAgent, updateAgent, deleteAgent, isLoading, error } = useAgentStore();
  const { agent: currentAgent } = useAuthStore();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentPublic | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCreate = () => {
    setSelectedAgent(null);
    setModalOpen(true);
  };

  const handleEdit = (agent: AgentPublic) => {
    setSelectedAgent(agent);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this agent? This action cannot be undone.')) {
      setActionLoading(true);
      await deleteAgent(id);
      setActionLoading(false);
    }
  };

  const handleModalSubmit = async (data: CreateAgentInput | UpdateAgentInput) => {
    setActionLoading(true);
    let success = false;
    
    if (selectedAgent) {
      // Update
      const updateData: UpdateAgentInput = {
        name: data.name,
        email: data.email,
        role: data.role as 'admin' | 'agent',
      };
        if ('password' in data && data.password) {
          updateData.password = data.password;
        }
      success = await updateAgent(selectedAgent._id, updateData);
    } else {
      // Create
      const createData: CreateAgentInput = {
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role as 'admin' | 'agent',
        companyId: 'managed-by-backend', // ignored by store/backend
      };
      // We know data has password for create based on validation
      if ('password' in data) {
         createData.password = data.password!;
      }
      success = await createAgent(createData);
    }
    
    setActionLoading(false);
    if (success) {
      setModalOpen(false);
    }
    return success;
  };

  if (!currentAgent || currentAgent.role !== 'admin') {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Team Management</CardTitle>
              <CardDescription>Manage agent accounts and roles</CardDescription>
            </div>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Add Agent
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading && agents.length === 0 ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent._id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${agent.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                      {agent.role === 'admin' ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        {agent.name}
                        {agent._id === currentAgent._id && <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">(You)</span>}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {agent.email}
                        </span>
                        <span className="flex items-center gap-1 capitalize">
                          {agent.role}
                        </span>
                        {agent.lastLoginAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Last login: {new Date(agent.lastLoginAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEdit(agent)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      disabled={agent._id === currentAgent._id}
                      onClick={() => handleDelete(agent._id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {agents.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No agents found. Add your first team member!
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AgentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        agent={selectedAgent}
        isLoading={actionLoading}
      />
    </>
  );
}

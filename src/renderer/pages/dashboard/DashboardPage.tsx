import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileText, Play, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../stores';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, Button } from '../../components/ui';

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    positive: boolean;
  };
}

function StatCard({ title, value, description, icon }: StatCardProps) {
  return (
    <Card className="hover-lift">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { agent, company } = useAuthStore();

  // Placeholder stats - in real app these would come from API
  const stats = {
    totalClients: 24,
    pendingExtractions: 3,
    completedJobs: 156,
    activePortals: 8,
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-description">
              Welcome back, {agent?.name}. Here's an overview of your activity.
            </p>
          </div>
          <Button onClick={() => navigate('/clients')}>
            <Users className="w-4 h-4" />
            View Clients
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Total Clients"
          value={stats.totalClients}
          description="Active visa applicants"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="Pending Review"
          value={stats.pendingExtractions}
          description="Extractions awaiting approval"
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          title="Completed Jobs"
          value={stats.completedJobs}
          description="Forms filled this month"
          icon={<CheckCircle className="w-5 h-5" />}
        />
        <StatCard
          title="Active Portals"
          value={stats.activePortals}
          description="Immigration portals configured"
          icon={<Play className="w-5 h-5" />}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover-lift cursor-pointer" onClick={() => navigate('/clients')}>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <CardTitle>Manage Clients</CardTitle>
            <CardDescription>
              Add new clients, upload documents, and review extracted data.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover-lift cursor-pointer" onClick={() => navigate('/automation')}>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Play className="w-5 h-5 text-primary" />
            </div>
            <CardTitle>Start Automation</CardTitle>
            <CardDescription>
              Select a client and portal to begin AI-powered form filling.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover-lift cursor-pointer" onClick={() => navigate('/portals')}>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <CardTitle>Manage Portals</CardTitle>
            <CardDescription>
              Add and configure immigration portal URLs for automation.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest actions in your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { action: 'Extraction approved', client: 'John Smith', time: '2 hours ago', icon: CheckCircle, color: 'text-green-600' },
              { action: 'New client added', client: 'Maria Garcia', time: '4 hours ago', icon: Users, color: 'text-blue-600' },
              { action: 'Automation completed', client: 'Ahmed Hassan', time: '1 day ago', icon: Play, color: 'text-purple-600' },
              { action: 'Document uploaded', client: 'Li Wei', time: '2 days ago', icon: FileText, color: 'text-orange-600' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.action}</p>
                  <p className="text-xs text-muted-foreground">{item.client}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

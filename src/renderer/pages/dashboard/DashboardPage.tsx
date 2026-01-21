import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileText, Play, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores';
import { api, DashboardStats, ActivityItem } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, Button } from '../../components/ui';
import { formatRelativeTime } from '../../../shared/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  isLoading?: boolean;
}

function StatCard({ title, value, description, icon, isLoading }: StatCardProps) {
  return (
    <Card className="hover-lift">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const actionIcons: Record<string, { icon: React.ElementType; color: string }> = {
  'New client added': { icon: Users, color: 'text-blue-600' },
  'Client updated': { icon: Users, color: 'text-blue-600' },
  'Document uploaded': { icon: FileText, color: 'text-orange-600' },
  'Extraction approved': { icon: CheckCircle, color: 'text-green-600' },
  'Data extraction started': { icon: FileText, color: 'text-purple-600' },
  'Automation started': { icon: Play, color: 'text-purple-600' },
  'Automation completed': { icon: CheckCircle, color: 'text-green-600' },
  'Portal added': { icon: Play, color: 'text-blue-600' },
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { agent } = useAuthStore();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    pendingExtractions: 0,
    completedJobs: 0,
    activePortals: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsResult, activityResult] = await Promise.all([
        api.dashboard.getStats(),
        api.dashboard.getActivity({ limit: 10 }),
      ]);

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      } else {
        setError(statsResult.error || 'Failed to load stats');
      }

      if (activityResult.success && activityResult.data) {
        setActivities(activityResult.data);
      }
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const getActivityIcon = (action: string) => {
    const config = actionIcons[action] || { icon: AlertCircle, color: 'text-gray-600' };
    return config;
  };

  const formatActivityTime = (date: Date) => {
    return formatRelativeTime(new Date(date));
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

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Total Clients"
          value={stats.totalClients}
          description="Active visa applicants"
          icon={<Users className="w-5 h-5" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Pending Review"
          value={stats.pendingExtractions}
          description="Extractions awaiting approval"
          icon={<Clock className="w-5 h-5" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Completed Jobs"
          value={stats.completedJobs}
          description="Forms filled successfully"
          icon={<CheckCircle className="w-5 h-5" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Active Portals"
          value={stats.activePortals}
          description="Immigration portals configured"
          icon={<Play className="w-5 h-5" />}
          isLoading={isLoading}
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
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent activity. Start by adding a client or portal.
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((item, i) => {
                const { icon: Icon, color } = getActivityIcon(item.action);
                const clientName = item.details?.name || item.details?.filename || item.resourceType;
                return (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {String(clientName)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatActivityTime(item.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

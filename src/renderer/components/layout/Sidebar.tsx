import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FolderOpen, 
  Play, 
  Globe, 
  Settings, 
  LogOut,
  FileText
} from 'lucide-react';
import { useAuthStore } from '../../stores';
import { cn } from '../../lib/utils';
import { Separator } from '../ui';

interface SidebarProps {
  className?: string;
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/automation', label: 'Automation', icon: Play },
  { path: '/portals', label: 'Portals', icon: Globe },
];

const bottomItems = [
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ className }: SidebarProps) {
  const { agent, company, logout } = useAuthStore();
  const location = useLocation();

  const handleLogout = () => {
    logout();
  };

  return (
    <aside className={cn('sidebar', className)}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
            <FileText className="w-4 h-4 text-background" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Immigration Copilot</h1>
            <p className="text-xs text-muted-foreground truncate max-w-[140px]">
              {company?.name || 'Company'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-content">
        <div className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'sidebar-nav-item rounded-md',
                  isActive && 'active'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          
          <div className="space-y-1 px-2">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'sidebar-nav-item rounded-md',
                    isActive && 'active'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            <button
              onClick={handleLogout}
              className="sidebar-nav-item rounded-md w-full text-left text-destructive hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* User Info */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <span className="text-sm font-medium">
              {agent?.name?.charAt(0).toUpperCase() || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{agent?.name || 'Agent'}</p>
            <p className="text-xs text-muted-foreground truncate">{agent?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

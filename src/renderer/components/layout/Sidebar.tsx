import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Play, 
  Globe, 
  Settings, 
  LogOut,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuthStore, useAutomationStore } from '../../stores';
import { cn } from '../../lib/utils';
import { Separator, Button } from '../ui';
import { api } from '../../lib/api';

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
  const { isRunning, isPaused } = useAutomationStore();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-collapse when automation starts
  useEffect(() => {
    if (isRunning && !isPaused && !collapsed) {
      setCollapsed(true);
    }
  }, [isRunning, isPaused]);

  // Update BrowserView bounds when sidebar toggles
  useEffect(() => {
    const updateBrowserView = async () => {
      // Main Sidebar = 64px (collapsed) or 256px (expanded)
      // Automation Panel = 400px (fixed in css)
      // Total Left Offset = Sidebar + 400
      // Note: This logic assumes we are on the Automation page with the panel open.
      // If we are elsewhere, resizing might not be needed or could be different.
      // Ideally, the current page should dictate the browser view offset, 
      // but globally managing it here ensures the "push" effect works.
      
      const sidebarWidth = collapsed ? 64 : 256;
      const automationPanelWidth = location.pathname === '/automation' ? 400 : 0;
      const totalOffset = sidebarWidth + automationPanelWidth;

      // Only resize if automation is actually relevant (browser view is likely shown)
      if (location.pathname === '/automation') {
         // Add a small delay for transition to finish
         setTimeout(() => {
            api.browserView.resize({ width: totalOffset });
         }, 300);
      }
    };

    updateBrowserView();
  }, [collapsed, location.pathname]);

  const handleLogout = () => {
    logout();
  };

  return (
    <aside 
      className={cn(
        'border-r bg-card flex flex-col transition-all duration-300 ease-in-out relative',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Toggle Button */}
      <Button
         variant="ghost"
         size="icon"
         className="absolute -right-3 top-6 h-6 w-6 rounded-full border bg-background shadow-md z-10 hover:bg-accent"
         onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </Button>

      {/* Header */}
      <div className={cn("flex items-center mx-auto transition-all duration-300", collapsed ? "h-16 px-0 justify-center" : "h-16 px-6 gap-3")}>
        <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-background" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-semibold text-sm whitespace-nowrap">Immigration Copilot</h1>
            <p className="text-xs text-muted-foreground truncate max-w-[140px]">
              {company?.name || 'Company'}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent rounded-md',
                  isActive && 'text-foreground bg-accent',
                  collapsed && 'justify-center px-0'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </div>

        <div className="mt-auto pt-4">
          {!collapsed && <Separator className="mb-4 mx-2 w-auto" />}
          {collapsed && <div className="h-px bg-border my-4 mx-2" />}
          
          <div className="space-y-1 px-2">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent rounded-md',
                    isActive && 'text-foreground bg-accent',
                    collapsed && 'justify-center px-0'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}

            <button
              onClick={handleLogout}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md w-full',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? "Logout" : undefined}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* User Info */}
      <div className={cn("border-t transition-all duration-300", collapsed ? "p-2" : "p-4")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium">
              {agent?.name?.charAt(0).toUpperCase() || 'A'}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-sm font-medium truncate">{agent?.name || 'Agent'}</p>
              <p className="text-xs text-muted-foreground truncate">{agent?.email}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

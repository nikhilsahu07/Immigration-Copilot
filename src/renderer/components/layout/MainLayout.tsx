import React from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '../../lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className={cn('flex-1 overflow-y-auto', className)}>
        {children}
      </main>
    </div>
  );
}

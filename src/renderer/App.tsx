import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ React Error Boundary caught an error:', error);
    console.error('Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error?.message}</p>
          <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ClientsPage } from './pages/clients/ClientsPage';
import { ClientDetailPage } from './pages/clients/ClientDetailPage';
import { ExtractionPage } from './pages/extraction/ExtractionPage';
import { AutomationPage } from './pages/automation/AutomationPage';
import { PortalsPage } from './pages/portals/PortalsPage';
import { SettingsPage } from './pages/settings/SettingsPage';

// Layout
import { MainLayout } from './components/layout/MainLayout';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Auth route wrapper (redirects to dashboard if already authenticated)
function AuthRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

export function App() {
  try {
    return (
      <ErrorBoundary>
        <HashRouter>
          <Routes>
        {/* Auth routes */}
        <Route 
          path="/login" 
          element={
            <AuthRoute>
              <LoginPage />
            </AuthRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <AuthRoute>
              <RegisterPage />
            </AuthRoute>
          } 
        />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/:id" element={<ClientDetailPage />} />
                  <Route path="/extraction/:clientId" element={<ExtractionPage />} />
                  <Route path="/automation" element={<AutomationPage />} />
                  <Route path="/portals" element={<PortalsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </MainLayout>
            </ProtectedRoute>
          }
        />
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('❌ Error in App component:', error);
    throw error;
  }
}

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';

// User Views
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { UserDashboard } from './pages/UserDashboard';
import { BusinessesPage } from './pages/BusinessesPage';
import { ProcessImagesPage } from './pages/ProcessImagesPage';
import { HistoryPage } from './pages/HistoryPage';
import { UserSettingsPage } from './pages/UserSettingsPage';

// Admin Views
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminBusinessesPage } from './pages/admin/AdminBusinessesPage';
import { AdminJobsPage } from './pages/admin/AdminJobsPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminDatabasePage } from './pages/admin/AdminDatabasePage';
import { AdminLogsPage } from './pages/admin/AdminLogsPage';

import { Loader2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [viewParams, setViewParams] = useState<any>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const navigate = (view: string, params: any = {}) => {
    setCurrentView(view);
    setViewParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm font-medium text-slate-400">Loading WatermarkPro Workspace...</p>
      </div>
    );
  }

  // If not logged in, render authentication flows
  if (!user) {
    if (currentView === 'register') {
      return <Register onNavigate={navigate} />;
    }
    if (currentView === 'forgot-password') {
      return <ForgotPassword onNavigate={navigate} />;
    }
    if (currentView === 'reset-password') {
      return <ResetPassword onNavigate={navigate} />;
    }
    return <Login onNavigate={navigate} />;
  }

  // Render Authenticated App Layout
  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <UserDashboard onNavigate={navigate} />;
      case 'businesses':
        return (
          <BusinessesPage
            onNavigate={navigate}
            initialOpenAdd={!!viewParams.openAddModal}
          />
        );
      case 'process':
        return (
          <ProcessImagesPage
            onNavigate={navigate}
            preSelectedBusinessId={viewParams.selectedBusinessId}
          />
        );
      case 'history':
        return <HistoryPage onNavigate={navigate} />;
      case 'settings':
        return <UserSettingsPage />;

      // Admin Views
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={navigate} />;
      case 'admin-users':
        return <AdminUsersPage />;
      case 'admin-businesses':
        return <AdminBusinessesPage />;
      case 'admin-jobs':
        return <AdminJobsPage />;
      case 'admin-settings':
        return <AdminSettingsPage />;
      case 'admin-database':
        return <AdminDatabasePage />;
      case 'admin-logs':
        return <AdminLogsPage />;

      default:
        return <UserDashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-blue-600 selection:text-white">
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        activeView={currentView}
      />

      <div className="flex-1 flex">
        <Sidebar
          currentView={currentView}
          onNavigate={navigate}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Content Area (offset by sidebar on lg screens) */}
        <main className="flex-1 lg:pl-64 min-w-0 flex flex-col justify-between">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto flex-1">
            {renderCurrentView()}
          </div>

          {/* High Density System Status Footer */}
          <footer
            id="system-status-footer"
            className="h-12 bg-slate-900 text-slate-400 px-4 sm:px-8 flex items-center justify-between text-[10px] font-medium tracking-wide uppercase border-t border-slate-800 shrink-0"
          >
            <div className="flex items-center gap-4 sm:gap-6 truncate">
              <span>Engine: v2.4.1 (WebP-Turbo)</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Auto-Clean: 60 min</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-slate-300">System Operational</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );

};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

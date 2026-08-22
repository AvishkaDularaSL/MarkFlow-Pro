import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Briefcase,
  Wand2,
  History,
  Settings,
  Users,
  Database,
  FileText,
  Sliders,
  Shield,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isOpen,
  onClose,
}) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const userNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'businesses', label: 'My Businesses', icon: <Briefcase className="w-4 h-4" /> },
    {
      id: 'process',
      label: 'Process Images',
      icon: <Wand2 className="w-4 h-4" />,
      badge: 'Studio',
    },
    { id: 'history', label: 'Processing History', icon: <History className="w-4 h-4" /> },
    { id: 'settings', label: 'Account Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const adminNavItems = [
    { id: 'admin-dashboard', label: 'Admin Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'admin-users', label: 'User Directory', icon: <Users className="w-4 h-4" /> },
    { id: 'admin-businesses', label: 'All Businesses', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'admin-jobs', label: 'Processing Jobs', icon: <Sliders className="w-4 h-4" /> },
    { id: 'admin-settings', label: 'System Settings', icon: <Settings className="w-4 h-4" /> },
    { id: 'admin-database', label: 'Database Config', icon: <Database className="w-4 h-4" /> },
    { id: 'admin-logs', label: 'Audit Logs', icon: <FileText className="w-4 h-4" /> },
  ];

  const handleItemClick = (id: string) => {
    onNavigate(id);
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex-1 px-4 py-5 space-y-6 overflow-y-auto">
          {/* Main User Navigation */}
          <div>
            <p className="px-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
              Main Menu
            </p>
            <nav className="mt-2 space-y-1">
              {userNavItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    id={`sidebar-nav-${item.id}`}
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {item.badge && !isActive && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Admin Navigation Section */}
          {isAdmin && (
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-400 uppercase">
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Portal</span>
              </div>
              <nav className="mt-2 space-y-1">
                {adminNavItems.map((item) => {
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`sidebar-admin-nav-${item.id}`}
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          )}
        </div>

        {/* User Card & Logout at bottom */}
        {user && (
          <div className="p-4 mt-auto border-t border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-white truncate max-w-[120px]">{user.name}</span>
                  <span className="text-[10px] text-slate-400">
                    {user.role === 'admin' ? 'System Administrator' : 'Pro User Plan'}
                  </span>
                </div>
              </div>

              <button
                id="sidebar-logout-btn"
                onClick={() => logout()}
                title="Sign out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};


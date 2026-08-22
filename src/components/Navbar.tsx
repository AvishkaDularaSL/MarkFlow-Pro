import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Layers, ShieldCheck, UserCheck, LogOut, Menu } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
  activeView: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, activeView }) => {
  const { user, logout } = useAuth();

  return (
    <header
      id="top-navbar"
      className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8 text-slate-900 shadow-xs"
    >
      <div className="flex items-center gap-4">
        <button
          id="mobile-sidebar-toggle"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-sm shadow-blue-200">
            W
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900">MarkFlow Pro</span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase tracking-wider border border-green-200">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Right User Info & Actions */}
      <div className="flex items-center gap-3 sm:gap-6">
        {user && (
          <div className="flex items-center gap-3 sm:gap-4 pl-3 sm:pl-4 border-l border-slate-200">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</span>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                {user.role === 'admin' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    <ShieldCheck className="w-3 h-3" /> Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    <UserCheck className="w-3 h-3 text-emerald-600" /> Pro User Plan
                  </span>
                )}
                <span className="text-slate-300 text-xs">•</span>
                <span className="text-[10px] font-mono text-slate-400 truncate max-w-[130px]">{user.email}</span>
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold border border-slate-700 shadow-xs">
              {user.name.charAt(0).toUpperCase()}
            </div>

            <button
              id="navbar-logout-btn"
              onClick={() => logout()}
              title="Sign out of account"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-md transition-colors"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};


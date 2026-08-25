import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { AdminStats, AuditLog } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  Briefcase,
  Layers,
  HardDrive,
  Shield,
  Activity,
  Trash2,
  Download,
  Clock,
  Sparkles,
  Loader2,
  CheckCircle2,
  Database,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { success, error } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchAdminData = async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.get<any>('/api/admin/stats'),
        api.get<{ logs: any[] }>('/api/admin/logs?limit=8'),
      ]);
      const rawStats = statsRes?.stats || statsRes || {};
      setStats({
        totalUsers: Number(rawStats.totalUsers) || 0,
        totalBusinesses: Number(rawStats.totalBusinesses) || 0,
        totalJobs: Number(rawStats.totalJobs) || 0,
        totalImagesProcessed: Number(rawStats.totalImagesProcessed ?? rawStats.totalProcessedImages) || 0,
        activeSessions: Number(rawStats.activeSessions) || 0,
        databaseType: rawStats.databaseType || 'Supabase Cloud PostgreSQL Database (Image Process System)',
        databaseSizeBytes: Number(rawStats.databaseSizeBytes) || 0,
        storageUsageBytes: Number(rawStats.storageUsageBytes ?? rawStats.storageBytes) || 0,
        supabaseConnected: rawStats.supabaseConnected ?? true,
        supabaseRlsBlocked: Boolean(rawStats.supabaseRlsBlocked),
        supabaseProjectName: rawStats.supabaseProjectName || 'Image Process System',
        supabaseProjectId: rawStats.supabaseProjectId || 'zrzvcgbcmyzgtitxlvjr',
        supabaseUrl: rawStats.supabaseUrl || 'https://zrzvcgbcmyzgtitxlvjr.supabase.co',
      });
      setRecentLogs(logsRes?.logs || []);
    } catch (err: any) {
      error('Admin Portal Error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleSyncSupabase = async () => {
    setIsSyncing(true);
    try {
      const res = await api.post<{ message: string }>('/api/admin/supabase/sync');
      success('Supabase Sync', res.message || 'Supabase database synchronized successfully.');
      fetchAdminData();
    } catch (err: any) {
      error('Sync Failed', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTriggerCleanup = async () => {
    setIsCleaning(true);
    try {
      const res = await api.post<{ message: string; expiredCount: number }>('/api/admin/cleanup');
      success('Cleanup Complete', res.message);
      fetchAdminData();
    } catch (err: any) {
      error('Cleanup Failed', err.message);
    } finally {
      setIsCleaning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div id="admin-dashboard-view" className="space-y-6">
      {/* Admin Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Administration Control Center
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            System overview, resource monitoring, user management, and manual garbage collection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="admin-sync-supabase-btn"
            onClick={handleSyncSupabase}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync Supabase Cloud</span>
          </button>

          <button
            id="admin-trigger-cleanup-btn"
            onClick={handleTriggerCleanup}
            disabled={isCleaning}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
          >
            {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>Purge Expired</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('admin-users')}
          className="bg-white border border-slate-200 p-5 rounded-xl cursor-pointer hover:border-slate-300 shadow-xs hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Users</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3 font-mono">{stats?.totalUsers || 0}</p>
          <p className="text-xs text-blue-600 font-semibold mt-1">Click to manage users &rarr;</p>
        </div>

        <div
          onClick={() => onNavigate('admin-businesses')}
          className="bg-white border border-slate-200 p-5 rounded-xl cursor-pointer hover:border-slate-300 shadow-xs hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Businesses</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3 font-mono">{stats?.totalBusinesses || 0}</p>
          <p className="text-xs text-indigo-600 font-semibold mt-1">Click to inspect brands &rarr;</p>
        </div>

        <div
          onClick={() => onNavigate('admin-jobs')}
          className="bg-white border border-slate-200 p-5 rounded-xl cursor-pointer hover:border-slate-300 shadow-xs hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Jobs Executed</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3 font-mono">{stats?.totalJobs || 0}</p>
          <p className="text-xs text-purple-600 font-semibold mt-1 font-mono">
            {stats?.totalImagesProcessed || 0} WebP images rendered
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Active Storage Sessions</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3 font-mono">{stats?.activeSessions || 0}</p>
          <p className="text-xs text-slate-400 mt-1">Auto-expires in 60 mins</p>
        </div>
      </div>

      {/* Storage & Engine Details + Recent Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System & Storage Specs */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Supabase Cloud Database</span>
            </h2>
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Database Engine</span>
              <span className="text-emerald-700 font-bold">Supabase PostgreSQL</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Project Name</span>
              <span className="text-slate-900 font-bold">{stats?.supabaseProjectName || 'Image Process System'}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Project ID</span>
              <span className="text-slate-900 font-bold font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                {stats?.supabaseProjectId || 'zrzvcgbcmyzgtitxlvjr'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Temporary Storage</span>
              <span className="text-slate-900 font-bold font-mono">
                {((stats?.storageUsageBytes || 0) / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Sharp Acceleration</span>
              <span className="text-emerald-600 font-bold">Native libvips Enabled</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigate('admin-settings')}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors"
            >
              Configure System &amp; Storage Settings
            </button>
          </div>
        </div>

        {/* Live Audit Trail Logs */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Real-Time Audit Log</span>
            </h2>
            <button
              onClick={() => onNavigate('admin-logs')}
              className="text-xs text-blue-600 hover:text-blue-700 font-bold"
            >
              View all logs &rarr;
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">No audit logs recorded yet.</div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs hover:border-slate-300 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900">{log.action}</span>
                      <span className="text-slate-500 ml-1.5 font-mono text-[11px]">
                        {log.details ? JSON.stringify(log.details) : (log as any).metadata ? JSON.stringify((log as any).metadata) : ''}
                      </span>
                    </div>
                  </div>
                  <span className="text-slate-400 text-[10px] shrink-0 ml-3 font-mono">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

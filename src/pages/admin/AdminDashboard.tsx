import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  Briefcase,
  Layers,
  Image as ImageIcon,
  Clock,
  Shield,
  Trash2,
  Database,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileCheck,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { success, error } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);

  const fetchAdminData = async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.get<any>('/api/admin/stats'),
        api.get<{ logs: any[] }>('/api/admin/logs?limit=5'),
      ]);
      const rawStats = statsRes?.stats || statsRes || {};
      setStats({
        totalUsers: Number(rawStats.totalUsers) || 0,
        totalBusinesses: Number(rawStats.totalBusinesses) || 0,
        totalJobs: Number(rawStats.totalJobs) || 0,
        totalImagesProcessed: Number(rawStats.totalImagesProcessed ?? rawStats.totalProcessedImages) || 0,
        activeSessions: Number(rawStats.activeSessions) || 0,
        databaseType: rawStats.databaseType || 'SQLite 3 (Embedded Local Database)',
        databaseSizeBytes: Number(rawStats.databaseSizeBytes) || 0,
        databaseSizeFormatted: rawStats.databaseSizeFormatted || '0 KB',
        storageUsageBytes: Number(rawStats.storageUsageBytes ?? rawStats.storageBytes) || 0,
        sqliteFilePath: rawStats.sqliteFilePath || '/storage/watermarkpro.sqlite',
        sqliteEngine: rawStats.sqliteEngine || 'SQLite 3 Embedded Engine',
        sqliteTotalRecords: Number(rawStats.sqliteTotalRecords) || 0,
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

  const handleIntegrityCheck = async () => {
    setIsCheckingIntegrity(true);
    try {
      const res = await api.post<{ message: string; check: { status: string; details: string[] } }>(
        '/api/admin/sqlite/integrity-check'
      );
      if (res.check?.status === 'ok') {
        success('SQLite Integrity Verified', 'Database integrity check passed with 0 errors.');
      } else {
        error('Integrity Notice', res.message || 'SQLite integrity check reported issues.');
      }
      fetchAdminData();
    } catch (err: any) {
      error('Integrity Check Failed', err.message);
    } finally {
      setIsCheckingIntegrity(false);
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
            System overview, SQLite embedded database monitoring, user accounts, and 2-day session management.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="admin-sqlite-integrity-btn"
            onClick={handleIntegrityCheck}
            disabled={isCheckingIntegrity}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            {isCheckingIntegrity ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCheck className="w-3.5 h-3.5" />
            )}
            <span>Verify SQLite Integrity</span>
          </button>

          <button
            id="admin-trigger-cleanup-btn"
            onClick={handleTriggerCleanup}
            disabled={isCleaning}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
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
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Registered Users</span>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats?.totalUsers || 0}</span>
            <span className="text-xs text-indigo-600 font-semibold">Active Accounts</span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('admin-businesses')}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Watermark Brands</span>
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats?.totalBusinesses || 0}</span>
            <span className="text-xs text-purple-600 font-semibold">Businesses</span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('admin-jobs')}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Batch Jobs</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats?.totalJobs || 0}</span>
            <span className="text-xs text-emerald-600 font-semibold">Jobs Completed</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Images</span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats?.totalImagesProcessed || 0}
            </span>
            <span className="text-xs text-amber-600 font-semibold">Processed</span>
          </div>
        </div>
      </div>

      {/* Storage & Engine Details + Recent Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System & SQLite Storage Specs */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>SQLite Embedded Database</span>
            </h2>
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operational
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Database Engine</span>
              <span className="text-emerald-700 font-bold">SQLite 3 (Embedded WASM/Node)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Database File</span>
              <span className="text-slate-900 font-bold font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                watermarkpro.sqlite
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">DB Size &amp; Records</span>
              <span className="text-slate-900 font-bold font-mono">
                {stats?.databaseSizeFormatted || '0 KB'} ({stats?.sqliteTotalRecords || 0} records)
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Session Lifetime</span>
              <span className="text-indigo-700 font-bold">2 Days (48 Hours Auth Token)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Security Guard</span>
              <span className="text-emerald-600 font-bold">Lockout + Token Revocation</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 font-medium">Temporary Storage</span>
              <span className="text-slate-900 font-bold font-mono">
                {((stats?.storageUsageBytes || 0) / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigate('admin-settings')}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
            >
              Open SQLite &amp; System Settings
            </button>
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900">Recent Security &amp; System Events</h2>
            </div>
            <button
              onClick={() => onNavigate('admin-logs')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              View All Logs
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              No recent audit activity found in SQLite.
            </div>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{log.action}</span>
                      {log.ip_address && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          [{log.ip_address}]
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      User: {log.user_email || 'System'}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {new Date(log.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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

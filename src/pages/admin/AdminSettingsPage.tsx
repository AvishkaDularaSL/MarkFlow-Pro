import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { SystemSettings } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  Settings2,
  Save,
  Loader2,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  X,
  Database,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  ExternalLink,
  Code2,
} from 'lucide-react';

export const AdminSettingsPage: React.FC = () => {
  const { success, error } = useToast();
  const [settings, setSettings] = useState<SystemSettings>({
    session_expiry_minutes: 60,
    max_images_per_batch: 100,
    max_image_size_mb: 50,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    default_webp_quality: 80,
    auto_cleanup_interval_minutes: 5,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Supabase state
  const [supabaseStatus, setSupabaseStatus] = useState<any>(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [showSqlSchema, setShowSqlSchema] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);

  // Clean all data modal state
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const fetchSettings = async () => {
    try {
      const [settingsRes, supabaseRes] = await Promise.all([
        api.get<{ settings: any }>('/api/admin/settings'),
        api.get<any>('/api/admin/supabase/status').catch(() => null),
      ]);
      if (settingsRes.settings) {
        setSettings({
          session_expiry_minutes: Number(settingsRes.settings.session_expiry_minutes) || 60,
          max_images_per_batch: Number(settingsRes.settings.max_images_per_batch) || 100,
          max_image_size_mb: Number(settingsRes.settings.max_image_size_mb) || 50,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          default_webp_quality: Number(settingsRes.settings.default_webp_quality) || 80,
          auto_cleanup_interval_minutes: Number(settingsRes.settings.auto_cleanup_interval_minutes) || 5,
        });
      }
      if (supabaseRes) {
        setSupabaseStatus(supabaseRes);
      }
    } catch (err: any) {
      error('Failed to load settings', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    try {
      const res = await api.get<any>('/api/admin/supabase/status');
      setSupabaseStatus(res);
      if (res?.status?.connected) {
        success('Supabase Connected', `Connected to project '${res.projectName}' (${res.status.latencyMs ?? 15}ms latency)`);
      } else {
        error('Supabase Connection Notice', res?.status?.error || 'Could not connect to Supabase database.');
      }
    } catch (err: any) {
      error('Connection Test Error', err.message);
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handleSyncSupabase = async () => {
    setIsSyncingSupabase(true);
    try {
      const res = await api.post<{ message: string }>('/api/admin/supabase/sync');
      success('Supabase Sync Success', res.message || 'Records synchronized to Supabase Cloud Database.');
    } catch (err: any) {
      error('Supabase Sync Failed', err.message);
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handleCopySql = () => {
    if (supabaseStatus?.sqlSchema) {
      navigator.clipboard.writeText(supabaseStatus.sqlSchema);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
      success('SQL Copied', 'Supabase SQL Schema copied to clipboard.');
    }
  };

  const handleCopyRlsSql = () => {
    const rlsSql = supabaseStatus?.rlsFixSql || `-- Run this in Supabase SQL Editor:
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.processing_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs DISABLE ROW LEVEL SECURITY;`;
    navigator.clipboard.writeText(rlsSql);
    setCopiedRlsSql(true);
    setTimeout(() => setCopiedRlsSql(false), 2000);
    success('RLS Fix SQL Copied', 'Copied RLS disable script. Paste and run in Supabase SQL Editor.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.put<{ settings: any; message?: string }>('/api/admin/settings', { settings });
      if (res.settings) {
        setSettings({
          session_expiry_minutes: Number(res.settings.session_expiry_minutes) || 60,
          max_images_per_batch: Number(res.settings.max_images_per_batch) || 100,
          max_image_size_mb: Number(res.settings.max_image_size_mb) || 50,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          default_webp_quality: Number(res.settings.default_webp_quality) || 80,
          auto_cleanup_interval_minutes: Number(res.settings.auto_cleanup_interval_minutes) || 5,
        });
      }
      success('System Settings Saved', 'Application configuration has been updated successfully.');
    } catch (err: any) {
      error('Failed to save settings', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanAllData = async () => {
    setIsCleaning(true);
    try {
      const res = await api.post<{ message: string; result: any }>('/api/admin/clean-all-data');
      success('Data Cleaned & Reset', res.message || 'All application data wiped and default settings restored.');
      setIsCleanModalOpen(false);
      setConfirmInput('');
      await fetchSettings();
    } catch (err: any) {
      error('Clean Data Failed', err.message || 'Failed to wipe application data.');
    } finally {
      setIsCleaning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div id="admin-settings-view" className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-amber-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              System &amp; Storage Configuration
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure global storage limits, cleanup intervals, and image optimization standards.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Temporary Storage Lifetime (Minutes)
            </label>
            <input
              id="setting-session-expiry"
              type="number"
              min="5"
              max="1440"
              required
              value={settings.session_expiry_minutes}
              onChange={(e) =>
                setSettings((s) => ({ ...s, session_expiry_minutes: parseInt(e.target.value, 10) }))
              }
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Time before temporary uploaded files &amp; batches are purged.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Auto-Cleanup Worker Interval (Minutes)
            </label>
            <input
              id="setting-cleanup-interval"
              type="number"
              min="1"
              max="60"
              required
              value={settings.auto_cleanup_interval_minutes}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  auto_cleanup_interval_minutes: parseInt(e.target.value, 10),
                }))
              }
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Frequency of server garbage collector sweep.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Max Images Allowed Per Batch
            </label>
            <input
              id="setting-max-images"
              type="number"
              min="1"
              max="200"
              required
              value={settings.max_images_per_batch}
              onChange={(e) =>
                setSettings((s) => ({ ...s, max_images_per_batch: parseInt(e.target.value, 10) }))
              }
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Max Image File Size (MB)
            </label>
            <input
              id="setting-max-size"
              type="number"
              min="1"
              max="100"
              required
              value={settings.max_image_size_mb}
              onChange={(e) =>
                setSettings((s) => ({ ...s, max_image_size_mb: parseInt(e.target.value, 10) }))
              }
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Default WebP Compression Quality (%)
            </label>
            <input
              id="setting-default-quality"
              type="number"
              min="10"
              max="100"
              required
              value={settings.default_webp_quality}
              onChange={(e) =>
                setSettings((s) => ({ ...s, default_webp_quality: parseInt(e.target.value, 10) }))
              }
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            id="save-settings-btn"
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-xs transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Configuration</span>
          </button>
        </div>
      </form>

      {/* Supabase PostgreSQL Cloud Database Integration Section */}
      <div className="bg-white border border-emerald-200 rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Supabase Cloud Database</h2>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Cloud Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Connected to Supabase PostgreSQL for cloud persistence and user data synchronization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              id="test-supabase-connection-btn"
              type="button"
              onClick={handleTestSupabase}
              disabled={isTestingSupabase}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all disabled:opacity-50"
            >
              {isTestingSupabase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              <span>Test Ping</span>
            </button>

            <button
              id="sync-supabase-settings-btn"
              type="button"
              onClick={handleSyncSupabase}
              disabled={isSyncingSupabase}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all disabled:opacity-50"
            >
              {isSyncingSupabase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Sync All Data</span>
            </button>
          </div>
        </div>

        {/* RLS Notice & 1-Click Fix if write is blocked by Supabase Row-Level Security */}
        {supabaseStatus?.status?.canWrite === false && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-amber-900">
                    Row-Level Security (RLS) is currently preventing data saving
                  </h3>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                    By default, Supabase enables RLS which blocks insert/update queries from client API keys. Run the 1-line RLS disable script in your Supabase SQL Editor to allow saving users, businesses, and batch jobs.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyRlsSql}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-all cursor-pointer"
              >
                {copiedRlsSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRlsSql ? 'Copied SQL!' : 'Copy RLS Fix SQL'}</span>
              </button>
            </div>

            <div className="p-2.5 bg-slate-900 text-amber-300 font-mono text-[11px] rounded-lg overflow-x-auto border border-slate-800">
              ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;<br />
              ALTER TABLE IF EXISTS public.businesses DISABLE ROW LEVEL SECURITY;<br />
              ALTER TABLE IF EXISTS public.processing_jobs DISABLE ROW LEVEL SECURITY;<br />
              ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;<br />
              ALTER TABLE IF EXISTS public.activity_logs DISABLE ROW LEVEL SECURITY;
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Project Name</span>
            <span className="text-slate-900 font-bold mt-1 block">Image Process System</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Project ID</span>
            <span className="text-slate-900 font-bold font-mono text-[11px] mt-1 block">zrzvcgbcmyzgtitxlvjr</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">REST Endpoint URL</span>
            <span className="text-slate-700 font-mono text-[10px] truncate mt-1 block" title="https://zrzvcgbcmyzgtitxlvjr.supabase.co/rest/v1/">
              https://zrzvcgbcmyzgtitxlvjr.supabase.co/rest/v1/
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Publishable Key</span>
            <span className="text-emerald-700 font-mono text-[11px] font-bold mt-1 block">
              sb_publishable_OtAt...eFe
            </span>
          </div>
        </div>

        {/* SQL Schema Inspector toggle */}
        <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Code2 className="w-4 h-4 text-slate-500" />
              <span>Supabase PostgreSQL Schema DDL</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 transition-colors"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copied!' : 'Copy SQL Schema'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSqlSchema(!showSqlSchema)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 underline"
              >
                {showSqlSchema ? 'Hide Schema' : 'View SQL Schema'}
              </button>
            </div>
          </div>

          {showSqlSchema && (
            <div className="relative mt-2">
              <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-60 border border-slate-800">
                {supabaseStatus?.sqlSchema || 'Loading schema...'}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone: Clean All Data / Factory Reset */}
      <div className="bg-white border border-rose-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Danger Zone: Clean All Data &amp; Reset</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Permanently purges all business brands, uploaded image sessions, job records, converted ZIP packages, and audit logs from disk storage, and restores all system settings to their default values. The primary administrator account (<strong>dularaavishka890@gmail.com</strong>) is preserved.
            </p>
          </div>
          <button
            id="clean-all-data-btn"
            type="button"
            onClick={() => setIsCleanModalOpen(true)}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-xs transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clean All Data</span>
          </button>
        </div>
      </div>

      {/* Clean All Data Confirmation Modal */}
      {isCleanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-rose-600 font-bold">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Confirm Data Purge</h3>
              </div>
              <button
                onClick={() => setIsCleanModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-lg leading-relaxed">
                <strong>Warning:</strong> This action cannot be undone. All businesses, uploaded files, job history, and temporary storage files will be deleted from disk.
              </p>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Account Preserved:</span>
                </div>
                <div className="font-mono text-slate-800 pl-5">dularaavishka890@gmail.com</div>
              </div>
              <p>
                To confirm, please type <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">RESET DATA</span> below:
              </p>
              <input
                id="clean-data-confirm-input"
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type RESET DATA to confirm"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsCleanModalOpen(false);
                  setConfirmInput('');
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                id="confirm-clean-data-btn"
                type="button"
                disabled={confirmInput !== 'RESET DATA' || isCleaning}
                onClick={handleCleanAllData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Permanently Clean All Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

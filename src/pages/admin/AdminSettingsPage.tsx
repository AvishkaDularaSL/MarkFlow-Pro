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
  FileCheck,
  Download,
  HardDrive,
  Lock,
  Clock,
  Sparkles,
  CheckCircle2,
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
    auth_session_lifetime_days: 2,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // SQLite Embedded state
  const [sqliteMetadata, setSqliteMetadata] = useState<any>(null);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<string | null>(null);

  // Clean all data modal state
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const fetchSettings = async () => {
    try {
      const [settingsRes, sqliteRes] = await Promise.all([
        api.get<{ settings: any }>('/api/admin/settings'),
        api.get<any>('/api/admin/sqlite/status').catch(() => null),
      ]);
      if (settingsRes.settings) {
        setSettings({
          session_expiry_minutes: Number(settingsRes.settings.session_expiry_minutes) || 60,
          max_images_per_batch: Number(settingsRes.settings.max_images_per_batch) || 100,
          max_image_size_mb: Number(settingsRes.settings.max_image_size_mb) || 50,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          default_webp_quality: Number(settingsRes.settings.default_webp_quality) || 80,
          auto_cleanup_interval_minutes: Number(settingsRes.settings.auto_cleanup_interval_minutes) || 5,
          auth_session_lifetime_days: Number(settingsRes.settings.auth_session_lifetime_days) || 2,
        });
      }
      if (sqliteRes) {
        setSqliteMetadata(sqliteRes.metadata);
        if (sqliteRes.status?.integrity) {
          setIntegrityResult(sqliteRes.status.integrity);
        }
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

  const handleTestIntegrity = async () => {
    setIsCheckingIntegrity(true);
    try {
      const res = await api.post<any>('/api/admin/sqlite/integrity-check');
      const status = res?.check?.status || 'ok';
      setIntegrityResult(status);
      if (status === 'ok') {
        success('SQLite Integrity Verified', 'Database check passed with 0 errors.');
      } else {
        error('SQLite Issue Found', res?.message || 'Integrity check encountered anomalies.');
      }
      fetchSettings();
    } catch (err: any) {
      error('Integrity Check Error', err.message);
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const handleVacuum = async () => {
    setIsVacuuming(true);
    try {
      const res = await api.post<{ message: string }>('/api/admin/sqlite/vacuum');
      success('Database Optimized', res.message || 'SQLite vacuum completed successfully.');
      fetchSettings();
    } catch (err: any) {
      error('Vacuum Failed', err.message);
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.post<{ message: string; result?: any }>('/api/admin/sqlite/backup');
      success('Backup Created', res.message || 'SQLite snapshot created.');
      fetchSettings();
    } catch (err: any) {
      error('Backup Failed', err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownloadDb = () => {
    const token = localStorage.getItem('watermark_token');
    const url = `/api/admin/sqlite/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'watermarkpro.sqlite');
    document.body.appendChild(link);
    link.click();
    link.remove();
    success('Download Started', 'Downloading watermarkpro.sqlite database file.');
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
          auth_session_lifetime_days: Number(res.settings.auth_session_lifetime_days) || 2,
        });
      }
      success('Settings Saved', res.message || 'System settings saved to SQLite database.');
    } catch (err: any) {
      error('Save Failed', err.message || 'Failed to update settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteCleanAll = async () => {
    if (confirmInput.trim().toUpperCase() !== 'DELETE ALL DATA') {
      error('Invalid Confirmation', 'Please type exactly "DELETE ALL DATA" to proceed.');
      return;
    }

    setIsCleaning(true);
    try {
      const res = await api.post<{ message: string }>('/api/admin/clean-all-data');
      success('Factory Reset Completed', res.message || 'All application data wiped in SQLite.');
      setIsCleanModalOpen(false);
      setConfirmInput('');
      fetchSettings();
    } catch (err: any) {
      error('Factory Reset Failed', err.message || 'Could not wipe application data.');
    } finally {
      setIsCleaning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">System &amp; Security Settings</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              SQLite embedded database management, security policy, 2-day session duration, and automated maintenance.
            </p>
          </div>
        </div>
      </div>

      {/* SQLite Embedded Database Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">SQLite Embedded Database</h2>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Embedded Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Self-contained, serverless SQLite 3 engine stored locally with prepared statements and disk durability.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="test-sqlite-integrity-btn"
              type="button"
              onClick={handleTestIntegrity}
              disabled={isCheckingIntegrity}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isCheckingIntegrity ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>Integrity Check</span>
            </button>

            <button
              id="vacuum-sqlite-btn"
              type="button"
              onClick={handleVacuum}
              disabled={isVacuuming}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isVacuuming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              )}
              <span>Vacuum &amp; Optimize</span>
            </button>

            <button
              id="backup-sqlite-btn"
              type="button"
              onClick={handleBackup}
              disabled={isBackingUp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {isBackingUp ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <HardDrive className="w-3.5 h-3.5" />
              )}
              <span>Create Backup</span>
            </button>

            <button
              id="download-sqlite-btn"
              type="button"
              onClick={handleDownloadDb}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .sqlite</span>
            </button>
          </div>
        </div>

        {/* Database specs cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Database Architecture</span>
            <span className="text-slate-900 font-bold mt-1 block">SQLite 3 (Embedded WASM/Node)</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Storage File</span>
            <span className="text-slate-900 font-bold font-mono text-[11px] mt-1 block truncate" title={sqliteMetadata?.filePath}>
              watermarkpro.sqlite
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Database Size</span>
            <span className="text-slate-900 font-bold font-mono text-[11px] mt-1 block">
              {sqliteMetadata?.fileSizeFormatted || '0 KB'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium block text-[11px]">Integrity Status</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{integrityResult?.toUpperCase() || 'OK (VERIFIED)'}</span>
            </span>
          </div>
        </div>

        {/* Active table records breakdown */}
        {sqliteMetadata?.tableCounts && (
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 mb-2">SQLite Active Table Records</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {Object.entries(sqliteMetadata.tableCounts).map(([tbl, count]) => (
                <div key={tbl} className="p-2 rounded bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 font-mono block truncate" title={tbl}>
                    {tbl}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{String(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Security Features Overview Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Security Architecture &amp; Protection Status</h2>
            <p className="text-xs text-slate-500">Enhanced protection against brute-force attacks, token theft, and injection.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>2-Day Session Expiry</span>
            </div>
            <p className="text-[11px] text-slate-500">
              JWT tokens and client sessions are strictly limited to exactly 48 hours (2 days) before re-authentication is required.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Token Revocation (Logout)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Logged-out tokens are immediately hashed and stored in the SQLite revoked token registry, preventing reuse.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Brute-Force Lockout</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Accounts and IPs are automatically locked for 15 minutes after 5 consecutive failed login attempts.
            </p>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          Processing &amp; Session Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* User Auth Session Lifetime */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Authentication Session Lifetime (Days)</span>
              <span className="text-[11px] font-bold text-indigo-600">Fixed: 2 Days (48 Hours)</span>
            </label>
            <input
              type="number"
              min="1"
              max="7"
              value={settings.auth_session_lifetime_days || 2}
              onChange={(e) =>
                setSettings({ ...settings, auth_session_lifetime_days: parseInt(e.target.value, 10) || 2 })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[11px] text-slate-400">
              Users are automatically required to log in again after 2 days (48 hours).
            </p>
          </div>

          {/* Temporary Upload Session Lifetime */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Temporary Upload Session Lifetime (Minutes)</span>
              <span className="text-[11px] font-normal text-slate-400">Default: 60</span>
            </label>
            <input
              type="number"
              min="5"
              max="1440"
              value={settings.session_expiry_minutes}
              onChange={(e) =>
                setSettings({ ...settings, session_expiry_minutes: parseInt(e.target.value, 10) || 60 })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[11px] text-slate-400">
              Temporary uploaded images and downloadable batch ZIPs will be purged after this duration.
            </p>
          </div>

          {/* Max Images Per Batch */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Max Images per Batch</span>
              <span className="text-[11px] font-normal text-slate-400">Default: 100</span>
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={settings.max_images_per_batch}
              onChange={(e) =>
                setSettings({ ...settings, max_images_per_batch: parseInt(e.target.value, 10) || 100 })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[11px] text-slate-400">
              Maximum number of images accepted in a single batch watermarking session.
            </p>
          </div>

          {/* Max Single Image Size */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Max Image File Size (MB)</span>
              <span className="text-[11px] font-normal text-slate-400">Default: 50 MB</span>
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={settings.max_image_size_mb}
              onChange={(e) =>
                setSettings({ ...settings, max_image_size_mb: parseInt(e.target.value, 10) || 50 })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[11px] text-slate-400">
              Individual file upload limit for source images and logo branding assets.
            </p>
          </div>

          {/* Default WebP Quality */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Default WebP Quality (1-100)</span>
              <span className="text-[11px] font-normal text-slate-400">Default: 80%</span>
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={settings.default_webp_quality}
              onChange={(e) =>
                setSettings({ ...settings, default_webp_quality: parseInt(e.target.value, 10) || 80 })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[11px] text-slate-400">
              Initial compression quality pre-selected on the image processing view.
            </p>
          </div>

          {/* Auto Cleanup Interval */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Auto-Cleanup Interval (Minutes)</span>
              <span className="text-[11px] font-normal text-slate-400">Default: 5 mins</span>
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={settings.auto_cleanup_interval_minutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_cleanup_interval_minutes: parseInt(e.target.value, 10) || 5,
                })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[11px] text-slate-400">
              How often the server background worker removes expired files and revoked tokens.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Settings to SQLite</span>
          </button>
        </div>
      </form>

      {/* Danger Zone: Factory Reset / Clean All Data */}
      <div className="bg-red-50/50 border border-red-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-950">Danger Zone: Factory Reset</h2>
              <p className="text-xs text-red-700 mt-1 max-w-2xl leading-relaxed">
                Permanently wipes all businesses, uploaded images, jobs, processed images, and non-admin accounts from the SQLite database. Your administrator account (dularaavishka890@gmail.com) will be preserved.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCleanModalOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reset All Application Data</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isCleanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm SQLite Factory Reset</h3>
                  <p className="text-xs text-slate-500">Irreversible operation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCleanModalOpen(false);
                  setConfirmInput('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
              <p className="font-semibold">This action will permanently delete:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-700">
                <li>All watermark business logos from SQLite and disk storage</li>
                <li>All batch processing history and download ZIPs</li>
                <li>All non-admin users and session logs</li>
              </ul>
              <p className="pt-1 font-semibold text-emerald-800">
                Admin account (dularaavishka890@gmail.com) will be preserved.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Type <span className="font-mono font-bold text-red-600">DELETE ALL DATA</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE ALL DATA"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsCleanModalOpen(false);
                  setConfirmInput('');
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanAll}
                disabled={isCleaning || confirmInput.trim().toUpperCase() !== 'DELETE ALL DATA'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isCleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirm Wipe All Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

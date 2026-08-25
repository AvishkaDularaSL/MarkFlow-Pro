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

  // Clean all data modal state
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const fetchSettings = async () => {
    try {
      const res = await api.get<{ settings: any }>('/api/admin/settings');
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
    } catch (err: any) {
      error('Failed to load settings', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

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

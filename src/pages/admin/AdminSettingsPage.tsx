import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { SystemSettings } from '../../types';
import { useToast } from '../../context/ToastContext';
import { Settings2, Save, HardDrive, Clock, Sparkles, Loader2, Sliders } from 'lucide-react';

export const AdminSettingsPage: React.FC = () => {
  const { success, error } = useToast();
  const [settings, setSettings] = useState<SystemSettings>({
    session_expiry_minutes: 60,
    max_images_per_batch: 50,
    max_image_size_mb: 30,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    default_webp_quality: 80,
    auto_cleanup_interval_minutes: 15,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get<{ settings: SystemSettings }>('/api/admin/settings');
        if (res.settings) {
          setSettings(res.settings);
        }
      } catch (err: any) {
        error('Failed to load settings', err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.put('/api/admin/settings', settings);
      success('System Settings Saved', 'Application configuration has been updated.');
    } catch (err: any) {
      error('Failed to save settings', err.message);
    } finally {
      setIsSaving(false);
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
            <p className="text-[11px] text-slate-500 mt-1">Default 60 minutes (1 hour) auto-cleanup window.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Auto-Cleanup Background Interval (Minutes)
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
    </div>
  );
};

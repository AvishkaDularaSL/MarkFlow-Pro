import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Business, ProcessingJob } from '../types';
import {
  Briefcase,
  Wand2,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Download,
  Plus,
  ArrowRight,
  Sparkles,
  Layers,
  HardDrive,
} from 'lucide-react';

interface UserDashboardProps {
  onNavigate: (view: string, params?: any) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [sessionInfo, setSessionInfo] = useState<{ id: string; imageCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [bizRes, jobsRes, sessionRes] = await Promise.all([
          api.get<{ businesses: Business[] }>('/api/businesses'),
          api.get<{ jobs: ProcessingJob[] }>('/api/process/history'),
          api.get<{ session: any; uploadedImages: any[] }>('/api/process/session').catch(() => null),
        ]);

        setBusinesses(bizRes.businesses || []);
        setJobs(jobsRes.jobs || []);
        if (sessionRes?.session) {
          setSessionInfo({
            id: sessionRes.session.id,
            imageCount: sessionRes.uploadedImages?.length || 0,
          });
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const totalImagesProcessed = jobs.reduce((acc, j) => acc + (j.completed_images || 0), 0);

  return (
    <div id="user-dashboard-view" className="space-y-6">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900 border border-slate-800 p-6 sm:p-8 text-white shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" /> High-Performance WebP Studio
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome back, {user?.name}
          </h1>
          <p className="text-slate-300 text-sm mt-2 leading-relaxed">
            Batch watermark your visual assets, convert them into lightweight next-gen WebP images,
            and reuse your original uploads across multiple businesses seamlessly.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              id="dash-process-btn"
              onClick={() => onNavigate('process')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-md shadow-blue-600/30 transition-all hover:scale-[1.01]"
            >
              <Wand2 className="w-4 h-4" />
              <span>Process Images Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              id="dash-add-biz-btn"
              onClick={() => onNavigate('businesses', { openAddModal: true })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Add Business</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Registered Businesses</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">{businesses.length}</p>
          <p className="text-xs text-slate-500 mt-1">Ready for custom watermarks</p>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Images Processed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">{totalImagesProcessed}</p>
          <p className="text-xs text-slate-500 mt-1">Optimized to WebP format</p>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Processing Jobs</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">{jobs.length}</p>
          <p className="text-xs text-slate-500 mt-1">All-time batch jobs</p>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Active Temp Session</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {sessionInfo?.imageCount || 0}{' '}
            <span className="text-sm font-normal text-slate-500">images</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">Loaded in current workspace</p>
        </div>
      </div>

      {/* Grid: Quick Businesses Preview + Recent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Businesses Column (1 col) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span>Your Businesses</span>
            </h2>
            <button
              onClick={() => onNavigate('businesses')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              View all ({businesses.length})
            </button>
          </div>

          {businesses.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">No businesses yet</p>
              <p className="text-xs text-slate-500 mt-1">Add your company logo to start watermarking.</p>
              <button
                onClick={() => onNavigate('businesses', { openAddModal: true })}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Business
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {businesses.slice(0, 3).map((biz) => (
                <div
                  key={biz.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      <img
                        src={`/api/businesses/${biz.id}/logo`}
                        alt={biz.name}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{biz.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {biz.description || 'Active watermark profile'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('process', { selectedBusinessId: biz.id })}
                    className="shrink-0 p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors"
                    title="Process with this business"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Jobs Column (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>Recent Processing Jobs</span>
            </h2>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              Full history
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl p-6 bg-slate-50">
              <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No processing jobs yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Upload your images, position your watermark, and convert them to WebP in one click.
              </p>
              <button
                onClick={() => onNavigate('process')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-200"
              >
                <Wand2 className="w-3.5 h-3.5" /> Start First Job
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px] font-bold">
                    <th className="pb-3">Business</th>
                    <th className="pb-3">Images</th>
                    <th className="pb-3">Settings</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.slice(0, 5).map((job) => {
                    const isExpired = new Date(job.expires_at).getTime() < Date.now();
                    return (
                      <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 font-semibold text-slate-900">{job.business_name}</td>
                        <td className="py-3 text-slate-600 font-mono">
                          {job.completed_images} / {job.total_images} WebP
                        </td>
                        <td className="py-3 text-slate-500">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono font-medium">
                            Q:{job.quality}% | Op:{job.opacity}%
                          </span>
                        </td>
                        <td className="py-3">
                          {job.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded capitalize">
                              {job.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {job.status === 'completed' && !isExpired && (
                            <a
                              href={`/api/process/download/zip/${job.id}?token=${localStorage.getItem('watermark_token')}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold transition-colors"
                            >
                              <Download className="w-3 h-3" /> ZIP
                            </a>
                          )}
                          {isExpired && <span className="text-[11px] text-slate-400">Expired</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

};

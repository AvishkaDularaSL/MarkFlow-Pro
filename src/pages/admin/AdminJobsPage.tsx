import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { ProcessingJob } from '../../types';
import { useToast } from '../../context/ToastContext';
import { Sliders, Download, CheckCircle2, Clock, Trash2, Search, Loader2, Layers } from 'lucide-react';

export const AdminJobsPage: React.FC = () => {
  const { error } = useToast();
  const [jobs, setJobs] = useState<(ProcessingJob & { user_email?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchJobs = async () => {
    try {
      const res = await api.get<{ jobs: any[] }>('/api/admin/jobs');
      setJobs(res.jobs || []);
    } catch (err: any) {
      error('Failed to load jobs', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const authToken = localStorage.getItem('watermark_token');

  const filtered = jobs.filter(
    (j) =>
      j.business_name.toLowerCase().includes(search.toLowerCase()) ||
      (j.user_email && j.user_email.toLowerCase().includes(search.toLowerCase())) ||
      j.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div id="admin-jobs-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Processing Jobs Directory
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitor batch image watermarking tasks, render jobs, and ZIP package distributions.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by Job ID, brand name, or user email..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-xs"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-semibold select-none">
                <th className="py-3.5 px-5 whitespace-nowrap min-w-[200px]">Job &amp; User</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">Brand</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center min-w-[100px]">Images</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[150px]">Format &amp; Quality</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px]">Status</th>
                <th className="py-3.5 px-5 whitespace-nowrap text-right min-w-[110px]">Package</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
                    <span>Loading jobs...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No processing jobs found.
                  </td>
                </tr>
              ) : (
                filtered.map((j) => {
                  const isExpired = new Date(j.expires_at).getTime() < Date.now();
                  return (
                    <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-5 align-middle">
                        <div className="font-mono text-slate-900 font-semibold text-xs truncate max-w-[200px]" title={j.id}>
                          #{j.id.replace(/^job_/, '').slice(0, 12)}...
                        </div>
                        <div className="text-slate-400 text-[11px] font-medium mt-0.5 truncate max-w-[200px]" title={j.user_email || j.user_id}>
                          {j.user_email || j.user_id}
                        </div>
                      </td>
                      <td className="py-4 px-4 align-middle">
                        <div className="font-semibold text-slate-900 text-sm truncate max-w-[160px]">
                          {j.business_name}
                        </div>
                      </td>
                      <td className="py-4 px-4 align-middle text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-bold text-slate-900 font-mono text-xs">
                            {j.completed_images} / {j.total_images}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">processed</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-middle">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-mono uppercase font-medium whitespace-nowrap">
                          {j.output_format || 'webp'} • {j.quality}%
                        </span>
                      </td>
                      <td className="py-4 px-4 align-middle">
                        {isExpired ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold uppercase whitespace-nowrap">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase whitespace-nowrap">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 align-middle text-right">
                        {!isExpired && j.status === 'completed' ? (
                          <a
                            href={`/api/process/download/zip/${j.id}?token=${authToken}`}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 active:bg-purple-200 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-all shadow-2xs whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ZIP</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs italic whitespace-nowrap">Purged</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

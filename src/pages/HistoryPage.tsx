import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ProcessingJob } from '../types';
import { useToast } from '../context/ToastContext';
import {
  History,
  Download,
  Calendar,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  HardDrive,
} from 'lucide-react';

interface HistoryPageProps {
  onNavigate: (view: string, params?: any) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigate }) => {
  const { error } = useToast();
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get<{ jobs: ProcessingJob[] }>('/api/process/history');
        setJobs(res.jobs || []);
      } catch (err: any) {
        error('Failed to load history', err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const authToken = localStorage.getItem('watermark_token');

  return (
    <div id="processing-history-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-blue-600" />
            <span>Processing History &amp; Downloads</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review previous batch jobs, output metrics, and download generated WebP archives.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <History className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Processing History</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            When you run image watermarking batches, their run metrics and download links will be recorded here.
          </p>
          <button
            onClick={() => onNavigate('process')}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-200"
          >
            Go to Image Studio
          </button>
        </div>
      )}

      {!isLoading && jobs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] font-bold">
                  <th className="py-3.5 px-4">Job ID &amp; Brand</th>
                  <th className="py-3.5 px-4">Images</th>
                  <th className="py-3.5 px-4">Watermark Config</th>
                  <th className="py-3.5 px-4">Date &amp; Status</th>
                  <th className="py-3.5 px-4">Storage Expiry</th>
                  <th className="py-3.5 px-4 text-right">Download Archive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const isExpired = new Date(job.expires_at).getTime() < Date.now();
                  return (
                    <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">{job.business_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{job.id}</div>
                      </td>
                      <td className="py-4 px-4 text-slate-600 font-mono">
                        <span className="font-bold text-slate-900">{job.completed_images}</span> /{' '}
                        {job.total_images} converted
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] capitalize border border-slate-200 font-medium">
                            {job.position.replace('-', ' ')}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] border border-slate-200 font-medium">
                            Op: {job.opacity}%
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] border border-emerald-200 font-bold font-mono">
                            WebP Q:{job.quality}%
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-slate-700 font-medium">
                          {new Date(job.created_at).toLocaleString()}
                        </div>
                        <div className="mt-1">
                          {job.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Completed
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded capitalize">
                              {job.status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3" /> Expired (Auto-cleaned)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold">
                            <Clock className="w-3 h-3" /> Active (1-hr window)
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {!isExpired && job.status === 'completed' ? (
                          <a
                            id={`history-download-${job.id}`}
                            href={`/api/process/download/zip/${job.id}?token=${authToken}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download ZIP</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


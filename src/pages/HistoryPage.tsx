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
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-semibold select-none">
                  <th className="py-3.5 px-5 whitespace-nowrap min-w-[180px]">Job &amp; Brand</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-center min-w-[100px]">Images</th>
                  <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">Watermark Config</th>
                  <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">Created &amp; Status</th>
                  <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Storage Status</th>
                  <th className="py-3.5 px-5 text-right whitespace-nowrap min-w-[140px]">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const isExpired = new Date(job.expires_at).getTime() < Date.now();
                  const formattedDate = new Date(job.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Job & Brand */}
                      <td className="py-4 px-5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                            {job.business_name ? job.business_name.charAt(0).toUpperCase() : 'B'}
                          </div>
                          <div className="min-w-0 max-w-[200px]">
                            <div className="font-semibold text-slate-900 text-sm truncate" title={job.business_name}>
                              {job.business_name || 'Custom Brand'}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono tracking-tight truncate" title={job.id}>
                              #{job.id.replace(/^job_/, '').slice(0, 10)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Images count */}
                      <td className="py-4 px-4 align-middle text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-bold text-slate-900 font-mono text-xs">
                            {job.completed_images} / {job.total_images}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">processed</span>
                        </div>
                      </td>

                      {/* Config badges */}
                      <td className="py-4 px-4 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200 capitalize whitespace-nowrap">
                            {job.position.replace('-', ' ')}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200 whitespace-nowrap">
                            Op: {job.opacity}%
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200 font-mono uppercase whitespace-nowrap">
                            {(job.output_format || 'webp')} Q:{job.quality}%
                          </span>
                        </div>
                      </td>

                      {/* Date & Status */}
                      <td className="py-4 px-4 align-middle">
                        <div className="space-y-1">
                          <div className="text-slate-700 text-xs font-medium whitespace-nowrap">
                            {formattedDate}
                          </div>
                          <div>
                            {job.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Completed
                              </span>
                            ) : job.status === 'failed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 whitespace-nowrap">
                                <AlertTriangle className="w-3 h-3 text-rose-600" /> Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 capitalize whitespace-nowrap">
                                <Loader2 className="w-3 h-3 animate-spin text-amber-600" /> {job.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Storage Expiry */}
                      <td className="py-4 px-4 align-middle">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
                            <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            <span>Expired</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-medium whitespace-nowrap">
                            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>Active (1-hr)</span>
                          </span>
                        )}
                      </td>

                      {/* Download Button */}
                      <td className="py-4 px-5 align-middle text-right">
                        {!isExpired && job.status === 'completed' ? (
                          <a
                            id={`history-download-${job.id}`}
                            href={`/api/process/download/zip/${job.id}?token=${authToken}`}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs hover:shadow-sm transition-all whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download ZIP</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic whitespace-nowrap">Unavailable</span>
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


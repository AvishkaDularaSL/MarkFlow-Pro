import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Business } from '../../types';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { Briefcase, Trash2, Search, Loader2, AlertTriangle, Building2 } from 'lucide-react';

export const AdminBusinessesPage: React.FC = () => {
  const { success, error } = useToast();
  const [businesses, setBusinesses] = useState<(Business & { owner_name?: string; owner_email?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingBiz, setDeletingBiz] = useState<Business | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBusinesses = async () => {
    try {
      const res = await api.get<{ businesses: any[] }>('/api/admin/businesses');
      setBusinesses(res.businesses || []);
    } catch (err: any) {
      error('Failed to load businesses', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const handleDelete = async () => {
    if (!deletingBiz) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/admin/businesses/${deletingBiz.id}`);
      success('Business Removed', `${deletingBiz.name} was removed from the system.`);
      setDeletingBiz(null);
      fetchBusinesses();
    } catch (err: any) {
      error('Delete Failed', err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.owner_name && b.owner_name.toLowerCase().includes(search.toLowerCase())) ||
      (b.owner_email && b.owner_email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div id="admin-businesses-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              All Registered Businesses
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Inspect and moderate all business brands, uploaded logos, and company profiles across all users.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by business name or user email..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-3 px-4 font-bold">Logo &amp; Brand</th>
                <th className="py-3 px-4 font-bold">Owner Account</th>
                <th className="py-3 px-4 font-bold">Created Date</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                    <span>Loading registered businesses...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-500">
                    No businesses found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center p-1 shrink-0"
                          style={{
                            backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
                            backgroundSize: '8px 8px',
                          }}
                        >
                          <img
                            src={`/api/businesses/${b.id}/logo?t=${Date.now()}`}
                            alt={b.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-xs">{b.name}</p>
                          <p className="text-slate-500 text-[11px] truncate max-w-xs">
                            {b.description || 'No description provided'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-semibold">{b.owner_name || 'System'}</div>
                      <div className="text-slate-500 text-[11px] font-mono">{b.owner_email || b.user_id}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(b.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setDeletingBiz(b)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete business"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={!!deletingBiz}
        onClose={() => setDeletingBiz(null)}
        title="Delete Business (Admin)"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-rose-50 text-rose-800 rounded-xl border border-rose-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <p className="text-xs">
              Are you sure you want to delete <strong className="font-bold">{deletingBiz?.name}</strong>? All associated watermark presets and data will be removed.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setDeletingBiz(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Confirm Delete</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

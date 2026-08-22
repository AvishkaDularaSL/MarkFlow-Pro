import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Business } from '../types';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/Modal';
import {
  Briefcase,
  Plus,
  Edit2,
  Trash2,
  Wand2,
  Upload,
  Loader2,
  Building2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

interface BusinessesPageProps {
  onNavigate: (view: string, params?: any) => void;
  initialOpenAdd?: boolean;
}

export const BusinessesPage: React.FC<BusinessesPageProps> = ({
  onNavigate,
  initialOpenAdd = false,
}) => {
  const { success, error, warning } = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add / Edit Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialOpenAdd);
  const [editingBiz, setEditingBiz] = useState<Business | null>(null);
  const [deletingBiz, setDeletingBiz] = useState<Business | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBusinesses = async () => {
    try {
      const res = await api.get<{ businesses: Business[] }>('/api/businesses');
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

  useEffect(() => {
    if (initialOpenAdd) {
      setIsAddModalOpen(true);
    }
  }, [initialOpenAdd]);

  const handleOpenAdd = () => {
    setEditingBiz(null);
    setFormName('');
    setFormDesc('');
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (biz: Business) => {
    setEditingBiz(biz);
    setFormName(biz.name);
    setFormDesc(biz.description || '');
    setLogoFile(null);
    setLogoPreviewUrl(`/api/businesses/${biz.id}/logo?t=${Date.now()}`);
    setIsAddModalOpen(true);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type.toLowerCase())) {
      warning('Invalid Logo Format', 'Please upload a PNG, JPG, or WebP file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      warning('File Too Large', 'Logo size must be less than 10MB.');
      return;
    }

    setLogoFile(file);
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      error('Name Required', 'Please provide a business or company name.');
      return;
    }

    if (!editingBiz && !logoFile) {
      error('Logo Required', 'Please upload a company logo file.');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('name', formName.trim());
    formData.append('description', formDesc.trim());
    if (logoFile) {
      formData.append('logo', logoFile);
    }

    try {
      if (editingBiz) {
        await api.put(`/api/businesses/${editingBiz.id}`, formData);
        success('Business Updated', `${formName} profile has been saved.`);
      } else {
        await api.post('/api/businesses', formData);
        success('Business Created', `${formName} has been registered.`);
      }
      setIsAddModalOpen(false);
      fetchBusinesses();
    } catch (err: any) {
      error('Save Failed', err.message || 'Could not save business.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingBiz) return;
    setIsSubmitting(true);
    try {
      await api.delete(`/api/businesses/${deletingBiz.id}`);
      success('Business Deleted', `${deletingBiz.name} was removed.`);
      setDeletingBiz(null);
      fetchBusinesses();
    } catch (err: any) {
      error('Delete Failed', err.message || 'Could not delete business.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="businesses-page-view" className="space-y-6">
      {/* Header with Title and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-blue-600" />
            <span>Registered Businesses</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your brand identities and high-resolution watermarking logos.
          </p>
        </div>

        <button
          id="add-new-business-btn"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-200 transition-all hover:scale-[1.01] self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Business</span>
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && businesses.length === 0 && (
        <div
          id="no-businesses-empty-state"
          className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-lg mx-auto shadow-xs"
        >
          <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <Briefcase className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Businesses Registered Yet</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Create your first company profile with a transparent PNG or WebP logo to start watermarking your image batches.
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Your First Business</span>
          </button>
        </div>
      )}

      {/* Business Cards Grid */}
      {!isLoading && businesses.length > 0 && (
        <div
          id="businesses-card-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {businesses.map((biz) => (
            <div
              key={biz.id}
              id={`business-card-${biz.id}`}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-all duration-200 shadow-xs hover:shadow-sm group"
            >
              {/* Card Top: Logo Container & Info */}
              <div>
                {/* Checkerboard transparent preview box for logo */}
                <div
                  className="w-full h-36 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center p-4 relative overflow-hidden group-hover:border-slate-300 transition-colors"
                  style={{
                    backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
                    backgroundSize: '12px 12px',
                  }}
                >
                  <img
                    src={`/api/businesses/${biz.id}/logo?t=${new Date(biz.updated_at).getTime()}`}
                    alt={biz.name}
                    className="max-h-24 max-w-full object-contain filter drop-shadow-xs transition-transform duration-200 group-hover:scale-105"
                  />
                  <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/90 border border-slate-200 text-slate-600 shadow-xs">
                    {biz.logo_mime.replace('image/', '').toUpperCase()}
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">
                    {biz.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[32px]">
                    {biz.description || 'Custom corporate branding profile for image watermark rendering.'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Added on {new Date(biz.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Card Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  id={`use-biz-btn-${biz.id}`}
                  onClick={() => onNavigate('process', { selectedBusinessId: biz.id })}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 text-xs font-bold transition-all"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Use For Processing</span>
                </button>

                <button
                  id={`edit-biz-btn-${biz.id}`}
                  onClick={() => handleOpenEdit(biz)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                  title="Edit business details"
                  aria-label="Edit business"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                <button
                  id={`delete-biz-btn-${biz.id}`}
                  onClick={() => setDeletingBiz(biz)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                  title="Delete business"
                  aria-label="Delete business"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Business Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmitting && setIsAddModalOpen(false)}
        title={editingBiz ? 'Edit Business Profile' : 'Register New Business'}
        subtitle="Provide the company details and a transparent logo for watermark placement."
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              Business / Company Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="biz-form-name"
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Apex Digital Ltd"
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              Description / Notes <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              id="biz-form-desc"
              rows={2}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="e.g. Official watermark for product catalog photos"
              className="mt-1.5 block w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-xs transition-all"
            />
          </div>

          {/* Logo Upload & Preview Area */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Company Logo {editingBiz ? '(Leave empty to keep current)' : <span className="text-rose-500">*</span>}
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleLogoChange}
              className="hidden"
              id="biz-logo-file-input"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-xl p-4 cursor-pointer text-center transition-colors group"
            >
              {logoPreviewUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="w-32 h-20 rounded-md bg-white border border-slate-200 flex items-center justify-center p-2 shadow-xs"
                    style={{
                      backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
                      backgroundSize: '10px 10px',
                    }}
                  >
                    <img
                      src={logoPreviewUrl}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-blue-600 group-hover:underline font-semibold">
                    Click to change logo
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-3">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-400 group-hover:text-blue-600 flex items-center justify-center transition-colors shadow-xs">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    <span className="text-blue-600">Click to upload logo</span> (PNG, JPG, WebP)
                  </p>
                  <p className="text-[11px] text-slate-500">Transparent PNG recommended for best results</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              id="biz-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingBiz ? (
                'Save Changes'
              ) : (
                'Register Business'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingBiz}
        onClose={() => !isSubmitting && setDeletingBiz(null)}
        title="Delete Business Profile"
        subtitle="This action cannot be undone."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-800 leading-relaxed">
              Are you sure you want to delete <strong>{deletingBiz?.name}</strong>? Its uploaded logo
              will be permanently removed from server storage.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDeletingBiz(null)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              id="confirm-delete-biz-btn"
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-colors disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Business'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};


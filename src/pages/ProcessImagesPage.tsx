import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../lib/api';
import {
  Business,
  UploadedImage,
  ProcessingSession,
  WatermarkConfig,
  ProcessingJob,
  ProcessedImage,
} from '../types';
import { useToast } from '../context/ToastContext';
import { ImageDropzone } from '../components/ImageDropzone';
import { PositionGrid } from '../components/PositionGrid';
import {
  Wand2,
  Briefcase,
  Layers,
  Sparkles,
  Download,
  Trash2,
  RefreshCw,
  Eye,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  ArrowRight,
  Loader2,
  Maximize2,
  Clock,
  RotateCw,
} from 'lucide-react';

interface ProcessImagesPageProps {
  onNavigate: (view: string, params?: any) => void;
  preSelectedBusinessId?: string;
}

export const ProcessImagesPage: React.FC<ProcessImagesPageProps> = ({
  onNavigate,
  preSelectedBusinessId,
}) => {
  const { success, error, warning, info } = useToast();

  // Session & Images state
  const [session, setSession] = useState<ProcessingSession | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>(preSelectedBusinessId || '');
  const [previewImageId, setPreviewImageId] = useState<string>('');

  // Watermark settings state
  const [config, setConfig] = useState<WatermarkConfig>({
    position: 'bottom-right',
    logo_size: 20,
    opacity: 50,
    margin: 20,
    rotation: 0,
    bg_mode: 'transparent',
    output_format: 'webp',
    quality: 80,
    webp_quality: 80,
  });

  // Live preview state
  const [previewDataUri, setPreviewDataUri] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<{
    width: number;
    height: number;
    previewFileSize: number;
    estimatedFullFileSize: number;
    outputFormat: string;
    quality: number;
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Processing execution state
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [lastCompletedJob, setLastCompletedJob] = useState<ProcessingJob | null>(null);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [batchStats, setBatchStats] = useState<{
    totalInputBytes: number;
    totalOutputBytes: number;
    compressionSavingsPct: number;
    format: string;
  } | null>(null);

  // Preview modal
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);

  // Debounce ref for preview updates
  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Load: Load Session, Images, and Businesses
  const loadInitialData = async () => {
    try {
      const [sessRes, bizRes] = await Promise.all([
        api.get<{ session: ProcessingSession; uploadedImages: UploadedImage[] }>('/api/process/session'),
        api.get<{ businesses: Business[] }>('/api/businesses'),
      ]);

      setSession(sessRes.session);
      setUploadedImages(sessRes.uploadedImages || []);
      setBusinesses(bizRes.businesses || []);

      if (sessRes.uploadedImages?.length > 0) {
        setPreviewImageId(sessRes.uploadedImages[0].id);
      }

      // Auto-select business if provided or default to first
      if (preSelectedBusinessId) {
        setSelectedBusinessId(preSelectedBusinessId);
      } else if (bizRes.businesses?.length > 0 && !selectedBusinessId) {
        setSelectedBusinessId(bizRes.businesses[0].id);
      }
    } catch (err: any) {
      error('Failed to initialize studio', err.message);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Update selected business if prop changes
  useEffect(() => {
    if (preSelectedBusinessId) {
      setSelectedBusinessId(preSelectedBusinessId);
    }
  }, [preSelectedBusinessId]);

  // Selected business object
  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId);

  // 2. Fetch live preview when parameters change
  const fetchLivePreview = useCallback(async () => {
    if (!previewImageId || !selectedBusinessId || !session) {
      setPreviewDataUri(null);
      setPreviewStats(null);
      return;
    }

    setIsPreviewLoading(true);
    try {
      const res = await api.post<{
        dataUri: string;
        width: number;
        height: number;
        previewFileSize: number;
        estimatedFullFileSize: number;
        outputFormat: string;
        quality: number;
      }>('/api/process/preview', {
        imageId: previewImageId,
        businessId: selectedBusinessId,
        config,
      });
      setPreviewDataUri(res.dataUri);
      setPreviewStats({
        width: res.width,
        height: res.height,
        previewFileSize: res.previewFileSize,
        estimatedFullFileSize: res.estimatedFullFileSize,
        outputFormat: res.outputFormat || config.output_format || 'webp',
        quality: res.quality || config.quality || 80,
      });
    } catch (err: any) {
      console.error('Preview fetch error:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [previewImageId, selectedBusinessId, session, config]);

  // Debounced effect for live preview
  useEffect(() => {
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }

    previewDebounceRef.current = setTimeout(() => {
      fetchLivePreview();
    }, 180);

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [fetchLivePreview]);

  // 3. Handle image uploads
  const handleUploadFiles = async (files: File[]) => {
    if (!session) {
      error('No Active Session', 'Please refresh the page to start a session.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('sessionId', session.id);
    files.forEach((file) => {
      formData.append('images', file);
    });

    try {
      const res = await api.post<{
        message: string;
        addedImages: UploadedImage[];
        uploadedImages: UploadedImage[];
      }>('/api/process/upload', formData);

      setUploadedImages(res.uploadedImages);
      success('Upload Complete', `Added ${res.addedImages.length} images to your session.`);

      if (!previewImageId && res.uploadedImages.length > 0) {
        setPreviewImageId(res.uploadedImages[0].id);
      }
    } catch (err: any) {
      error('Upload Failed', err.message || 'Could not upload images.');
    } finally {
      setIsUploading(false);
    }
  };

  // 4. Handle remove single image
  const handleRemoveImage = async (imgId: string) => {
    try {
      await api.delete(`/api/process/images/${imgId}`);
      const updated = uploadedImages.filter((img) => img.id !== imgId);
      setUploadedImages(updated);
      if (previewImageId === imgId) {
        setPreviewImageId(updated.length > 0 ? updated[0].id : '');
      }
      info('Image Removed');
    } catch (err: any) {
      error('Remove Failed', err.message);
    }
  };

  // 5. Start a completely fresh session
  const handleStartFreshSession = async () => {
    try {
      const res = await api.post<{ session: ProcessingSession; uploadedImages: UploadedImage[] }>(
        '/api/process/session/new'
      );
      setSession(res.session);
      setUploadedImages([]);
      setPreviewImageId('');
      setPreviewDataUri(null);
      setLastCompletedJob(null);
      setProcessedImages([]);
      success('Fresh Session Created', 'Workspace cleared. You can upload new images.');
    } catch (err: any) {
      error('Failed to reset session', err.message);
    }
  };

  // 6. Execute batch processing
  const handleExecuteBatch = async () => {
    if (!session) {
      error('Missing Session', 'Please refresh your browser.');
      return;
    }

    if (uploadedImages.length === 0) {
      warning('No Images', 'Please upload at least one image before processing.');
      return;
    }

    if (!selectedBusinessId) {
      warning('Select Business', 'Please select a registered business brand.');
      return;
    }

    setIsProcessing(true);
    setProcessProgress(15);
    setLastCompletedJob(null);

    // Simulate steady progress feedback while server Sharp finishes batch
    const interval = setInterval(() => {
      setProcessProgress((prev) => (prev < 85 ? prev + Math.floor(Math.random() * 15) + 5 : prev));
    }, 200);

    try {
      const res = await api.post<{
        message: string;
        job: ProcessingJob;
        processedImages: ProcessedImage[];
        stats?: {
          totalInputBytes: number;
          totalOutputBytes: number;
          compressionSavingsPct: number;
          format: string;
        };
      }>('/api/process/execute', {
        sessionId: session.id,
        businessId: selectedBusinessId,
        config,
      });

      clearInterval(interval);
      setProcessProgress(100);
      setLastCompletedJob(res.job);
      setProcessedImages(res.processedImages);
      if (res.stats) {
        setBatchStats(res.stats);
      }

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
      });

      success('Processing Complete!', res.message);
    } catch (err: any) {
      clearInterval(interval);
      error('Processing Failed', err.message || 'Could not process images.');
    } finally {
      setIsProcessing(false);
    }
  };

  const authToken = localStorage.getItem('watermark_token');

  // Programmatic download handler for ZIP file
  const handleDownloadZip = (jobId: string) => {
    if (!jobId) {
      warning('Download Error', 'Job ID is not available.');
      return;
    }
    info('Downloading ZIP', 'Your batch archive download is starting...');
    const downloadUrl = `/api/process/download/zip/${jobId}?token=${authToken || ''}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `Watermarked_Images_${jobId}.zip`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="process-images-studio-view" className="space-y-6">
      {/* Studio Header & Workflow Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Wand2 className="w-6 h-6 text-blue-600" />
              <span>Image Watermark Studio</span>
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">
              Format: {config.output_format || 'webp'}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              ⚡ 100% Native Engine (No AI / Pure Sharp)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Apply company logos, customize layout &amp; transparency, convert to WebP/PNG/JPG/AVIF, and batch-download.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="new-workspace-btn"
            onClick={handleStartFreshSession}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors"
            title="Clear current workspace and start new session"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Workspace</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Controls (5 cols) & Right Live Preview / Results (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Settings (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-5">
          {/* STEP 1: Upload Images */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <span>Upload Source Images</span>
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                {uploadedImages.length} {uploadedImages.length === 1 ? 'image' : 'images'} loaded
              </span>
            </div>

            <ImageDropzone
              onFilesSelected={handleUploadFiles}
              isUploading={isUploading}
              maxFiles={50}
            />

            {/* Uploaded Thumbnails Strip */}
            {uploadedImages.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Workspace Images (Click to preview)</span>
                  <span className="font-mono font-semibold text-slate-700">{uploadedImages.length} Total</span>
                </div>

                <div
                  id="uploaded-images-strip"
                  className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200"
                >
                  {uploadedImages.map((img) => {
                    const isSelected = previewImageId === img.id;
                    return (
                      <div
                        key={img.id}
                        id={`thumbnail-${img.id}`}
                        onClick={() => setPreviewImageId(img.id)}
                        className={`group relative aspect-square rounded-md overflow-hidden border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 ring-2 ring-blue-600/30'
                            : 'border-slate-200 hover:border-slate-400 opacity-90 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={`/api/process/original-preview/${img.id}?token=${authToken}`}
                          alt={img.original_name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(img.id);
                          }}
                          className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove image from session"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        {isSelected && (
                          <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1 py-0.2 rounded bg-blue-600 text-white">
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Select Business Brand */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>Select Business Brand</span>
              </h2>

              <button
                type="button"
                onClick={() => onNavigate('businesses', { openAddModal: true })}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
              >
                + Add Business
              </button>
            </div>

            {businesses.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <p className="font-bold text-amber-800">No businesses found</p>
                <p className="mt-1 text-amber-700">
                  Please register a business profile with your company logo first.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('businesses', { openAddModal: true })}
                  className="mt-2.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Register Business Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Choose watermark identity:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {businesses.map((biz) => {
                    const isSelected = selectedBusinessId === biz.id;
                    return (
                      <div
                        key={biz.id}
                        id={`biz-select-card-${biz.id}`}
                        onClick={() => setSelectedBusinessId(biz.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 shadow-xs'
                            : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-12 h-9 rounded-md bg-white border border-slate-200 flex items-center justify-center p-1 shrink-0 shadow-xs"
                            style={{
                              backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
                              backgroundSize: '8px 8px',
                            }}
                          >
                            <img
                              src={`/api/businesses/${biz.id}/logo?t=${new Date(biz.updated_at).getTime()}`}
                              alt={biz.name}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{biz.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {biz.description || 'Branded watermark logo'}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 ml-2">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: Watermark Settings Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                3
              </span>
              <span>Watermark Configuration</span>
            </h2>

            {/* Position Picker */}
            <PositionGrid
              value={config.position}
              onChange={(pos) => setConfig((prev) => ({ ...prev, position: pos }))}
            />

            {/* Logo Size (%) Slider */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Logo Scale (% of Image Width)</span>
                <span className="font-bold font-mono text-blue-600">{config.logo_size}%</span>
              </div>
              <input
                id="slider-logo-size"
                type="range"
                min="5"
                max="80"
                value={config.logo_size}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, logo_size: parseInt(e.target.value, 10) }))
                }
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Opacity (%) Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Watermark Opacity</span>
                <span className="font-bold font-mono text-blue-600">{config.opacity}%</span>
              </div>
              <input
                id="slider-opacity"
                type="range"
                min="5"
                max="100"
                value={config.opacity}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, opacity: parseInt(e.target.value, 10) }))
                }
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Margin (px) Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Edge Margin</span>
                <span className="font-bold font-mono text-blue-600">{config.margin}px</span>
              </div>
              <input
                id="slider-margin"
                type="range"
                min="0"
                max="100"
                value={config.margin}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, margin: parseInt(e.target.value, 10) }))
                }
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Rotation (deg) Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Rotation Angle</span>
                <span className="font-bold font-mono text-blue-600">{config.rotation}°</span>
              </div>
              <input
                id="slider-rotation"
                type="range"
                min="-180"
                max="180"
                step="5"
                value={config.rotation}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, rotation: parseInt(e.target.value, 10) }))
                }
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Background Pill Mode */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">Logo Container Style</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="bg-mode-transparent"
                  onClick={() => setConfig((prev) => ({ ...prev, bg_mode: 'transparent' }))}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    config.bg_mode === 'transparent'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                  }`}
                >
                  Transparent
                </button>
                <button
                  type="button"
                  id="bg-mode-white-card"
                  onClick={() => setConfig((prev) => ({ ...prev, bg_mode: 'white-card' }))}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    config.bg_mode === 'white-card'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                  }`}
                >
                  White Card Pill
                </button>
              </div>
            </div>

            {/* NEW REQUIREMENT: Output Format Selection */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Select Output Format</span>
                <span className="text-[11px] font-bold text-blue-600 uppercase font-mono">{config.output_format || 'webp'}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'webp', name: 'WebP', desc: 'Fastest Web' },
                  { id: 'png', name: 'PNG', desc: 'Lossless' },
                  { id: 'jpeg', name: 'JPEG', desc: 'Universal' },
                  { id: 'avif', name: 'AVIF', desc: 'Next-Gen' },
                ].map((fmt) => {
                  const isSelected = (config.output_format || 'webp') === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      id={`format-btn-${fmt.id}`}
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, output_format: fmt.id as any }))
                      }
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-600 text-blue-950 ring-1 ring-blue-600 shadow-xs'
                          : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold">{fmt.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{fmt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Output Quality Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  {config.output_format?.toUpperCase() || 'WEBP'} Quality / Compression
                </span>
                <span className="font-bold font-mono text-emerald-600">
                  {config.quality || config.webp_quality || 80}%
                </span>
              </div>
              <input
                id="slider-quality"
                type="range"
                min="10"
                max="100"
                value={config.quality || config.webp_quality || 80}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setConfig((prev) => ({ ...prev, quality: val, webp_quality: val }));
                }}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <p className="text-[11px] text-slate-500">
                {(config.output_format || 'webp') === 'png'
                  ? 'Optimized PNG with 8-level zlib deflate compression and alpha transparency.'
                  : (config.output_format || 'webp') === 'avif'
                  ? 'AVIF provides up to 50% smaller file size than JPEG with pristine quality.'
                  : `Quality ${config.quality || 80}% provides ~${Math.round(100 - (config.quality || 80) * 0.7)}% size reduction with sharp clarity.`}
              </p>
            </div>

            {/* Main Batch Execute Button */}
            <div className="pt-3">
              <button
                id="execute-process-btn"
                type="button"
                onClick={handleExecuteBatch}
                disabled={isProcessing || uploadedImages.length === 0 || !selectedBusinessId}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing {uploadedImages.length} Images...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Process {uploadedImages.length} Images to {(config.output_format || 'webp').toUpperCase()}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Interactive Preview & Processed Output (7 cols on lg) - STICKY SECTION */}
        <div id="live-preview-section" className="lg:col-span-7 space-y-5 lg:sticky lg:top-6 self-start">
          {/* Real-Time Preview Card ("ss section") */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Live Watermark Preview</h2>
              </div>

              {selectedBusiness && (
                <span className="text-xs text-slate-600 font-medium px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                  Target: <strong className="text-blue-700">{selectedBusiness.name}</strong>
                </span>
              )}
            </div>

            {/* Preview Stage Container */}
            <div
              id="live-preview-viewport"
              className="relative w-full aspect-video sm:h-96 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden group shadow-inner"
              style={{
                backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
                backgroundSize: '16px 16px',
              }}
            >
              {isPreviewLoading && (
                <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-xs flex items-center justify-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-md">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Updating live preview...</span>
                  </div>
                </div>
              )}

              {previewDataUri ? (
                <>
                  <img
                    src={previewDataUri}
                    alt="Watermark preview"
                    className="max-w-full max-h-full object-contain filter drop-shadow-sm"
                  />
                  <button
                    onClick={() => setActiveModalImage(previewDataUri)}
                    className="absolute bottom-3 right-3 p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Expand preview"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="text-center p-6 space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 mx-auto shadow-xs">
                    <Eye className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-slate-600">
                    {uploadedImages.length === 0
                      ? 'Upload images to see live watermark overlay'
                      : !selectedBusinessId
                      ? 'Select a business brand on the left to preview watermark'
                      : 'Rendering preview...'}
                  </p>
                </div>
              )}
            </div>

            {/* FINAL IMAGE SIZE & PREVIEW SPECS (REQUIREMENT #5: Need to show final image Size) */}
            {previewStats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Est. Final Size</span>
                  <span className="font-mono font-bold text-blue-600 text-xs">
                    ~{(previewStats.estimatedFullFileSize / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Resolution</span>
                  <span className="font-mono font-semibold text-slate-700 text-xs">
                    {previewStats.width} × {previewStats.height} px
                  </span>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Output Format</span>
                  <span className="font-mono font-bold text-emerald-600 text-xs uppercase">
                    {previewStats.outputFormat} (Q:{previewStats.quality}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Processing Progress Bar (if running) */}
          {isProcessing && (
            <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-xs space-y-3 animate-pulse">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Converting batch to {(config.output_format || 'webp').toUpperCase()} with watermark...</span>
                </span>
                <span className="text-blue-600 font-mono font-bold">{processProgress}%</span>
              </div>

              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${processProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* COMPLETED RESULTS PANEL */}
          {lastCompletedJob && processedImages.length > 0 && (
            <div
              id="processing-results-panel"
              className="bg-white border border-green-200 rounded-xl p-5 shadow-sm space-y-4"
            >
              {/* Results Header & ZIP Download Option (REQUIREMENT #4) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Batch Ready: {lastCompletedJob.completed_images} {(lastCompletedJob.output_format || 'webp').toUpperCase()} Images
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Brand: <strong className="text-slate-800">{lastCompletedJob.business_name}</strong> | Quality: {lastCompletedJob.quality}%
                  </p>
                </div>

                {/* Main ZIP Download Option */}
                <button
                  id="download-zip-btn"
                  type="button"
                  onClick={() => handleDownloadZip(lastCompletedJob.id)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 transition-all hover:scale-[1.01]"
                >
                  <Download className="w-4 h-4" />
                  <span>Download All as ZIP</span>
                </button>
              </div>

              {/* Total Batch Size & Compression Savings (REQUIREMENT #5) */}
              {batchStats && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-900">Batch Output:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {(batchStats.totalOutputBytes / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <span className="text-slate-500 font-mono">
                      (Original: {(batchStats.totalInputBytes / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[11px]">
                    Saved {batchStats.compressionSavingsPct}% Storage
                  </span>
                </div>
              )}

              {/* RE-PROCESS SAME IMAGES WITH ANOTHER BUSINESS */}
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Re-Process with Another Business?
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Your {uploadedImages.length} original uploaded files are safely preserved. Select another company brand to generate another batch without re-uploading!
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    id="reprocess-business-select"
                    value={selectedBusinessId}
                    onChange={(e) => setSelectedBusinessId(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-900 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <button
                    id="reprocess-now-btn"
                    onClick={handleExecuteBatch}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm shadow-blue-200 transition-all"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Process Again</span>
                  </button>
                </div>
              </div>

              {/* Individual Processed Images List with FINAL SIZES */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Individual Outputs ({processedImages.length}):
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {processedImages.map((proc) => {
                    const finalKB = (proc.file_size / 1024).toFixed(1);
                    const origKB = proc.original_file_size
                      ? (proc.original_file_size / 1024).toFixed(1)
                      : null;
                    const savings =
                      origKB && parseFloat(origKB) > 0
                        ? Math.max(0, Math.round((1 - parseFloat(finalKB) / parseFloat(origKB)) * 100))
                        : null;

                    return (
                      <div
                        key={proc.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-md overflow-hidden bg-white border border-slate-200 shrink-0">
                            <img
                              src={`/api/process/processed-preview/${proc.id}?token=${authToken}`}
                              alt={proc.output_filename}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {proc.output_filename}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-mono">
                              <span className="font-bold text-blue-700">Size: {finalKB} KB</span>
                              {origKB && (
                                <span className="text-slate-400">
                                  (Orig: {origKB} KB {savings ? `• -${savings}%` : ''})
                                </span>
                              )}
                              <span>• {proc.width}x{proc.height}px</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            id={`download-single-${proc.id}`}
                            href={`/api/process/download/image/${proc.id}?token=${authToken}`}
                            download={proc.output_filename}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs transition-colors"
                          >
                            <Download className="w-3 h-3" /> {(proc.output_format || 'webp').toUpperCase()}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Preview Modal */}
      {activeModalImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveModalImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xl p-2">
            <img
              src={activeModalImage}
              alt="High-resolution preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

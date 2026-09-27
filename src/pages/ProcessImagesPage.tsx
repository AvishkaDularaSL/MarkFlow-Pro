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
  ImageUpscaleConfig,
} from '../types';
import { useToast } from '../context/ToastContext';
import { ImageDropzone } from '../components/ImageDropzone';
import { ImageUrlImporter } from '../components/ImageUrlImporter';
import { UploadSourceModal } from '../components/UploadSourceModal';
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
  UploadCloud,
  Link2,
  Plus,
  Target,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  ArrowLeftRight,
  Cpu,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface ProcessImagesPageProps {
  onNavigate: (view: string, params?: any) => void;
  preSelectedBusinessId?: string;
  initialMode?: 'all' | 'upscale' | 'watermark';
}

export const ProcessImagesPage: React.FC<ProcessImagesPageProps> = ({
  onNavigate,
  preSelectedBusinessId,
  initialMode = 'all',
}) => {
  const { success, error, warning, info } = useToast();

  // Active studio workflow mode
  const [studioMode, setStudioMode] = useState<'all' | 'upscale' | 'watermark'>(initialMode);

  // Session & Images state
  const [session, setSession] = useState<ProcessingSession | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>(preSelectedBusinessId || '');
  const [previewImageId, setPreviewImageId] = useState<string>('');
  const [uploadMethod, setUploadMethod] = useState<'direct' | 'links'>('direct');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  // Preview zoom inspect state ('fit' vs 'actual')
  const [previewZoom, setPreviewZoom] = useState<'fit' | 'actual'>('fit');

  // Watermark and Upscale settings state
  const [config, setConfig] = useState<WatermarkConfig>({
    watermark_enabled: initialMode !== 'upscale',
    position: 'center',
    logo_size: 50,
    opacity: 60,
    margin: 20,
    rotation: 0,
    bg_mode: 'transparent',
    output_format: 'original',
    quality: 85,
    webp_quality: 85,
    compression_mode: 'quality',
    target_file_size_kb: 500,
    upscale: {
      enabled: initialMode === 'upscale' || initialMode === 'all',
      mode: 'scale',
      scale: 2,
      preset: '1080p',
      custom_width: 1920,
      custom_height: 1080,
      maintain_aspect_ratio: true,
      kernel: 'lanczos3',
      sharpen: true,
      sharpen_amount: 2,
      denoise: true,
      enhance_contrast: false,
    },
  });

  // Target output file size local states
  const [targetSizeValue, setTargetSizeValue] = useState<number>(500);
  const [targetSizeUnit, setTargetSizeUnit] = useState<'KB' | 'MB'>('KB');

  // Live preview state with upscale metrics
  const [previewDataUri, setPreviewDataUri] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<{
    width: number;
    height: number;
    originalWidth?: number;
    originalHeight?: number;
    upscaledWidth?: number;
    upscaledHeight?: number;
    previewFileSize: number;
    estimatedFullFileSize: number;
    outputFormat: string;
    quality: number;
    upscaled?: boolean;
    scaleFactor?: number;
    kernel?: string;
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

  // Helper to update upscale configuration options
  const updateUpscale = (patch: Partial<ImageUpscaleConfig>) => {
    setConfig((prev) => ({
      ...prev,
      upscale: {
        ...(prev.upscale || {
          enabled: true,
          mode: 'scale',
          scale: 2,
          preset: '1080p',
          custom_width: 1920,
          custom_height: 1080,
          maintain_aspect_ratio: true,
          kernel: 'lanczos3',
          sharpen: true,
          sharpen_amount: 2,
          denoise: true,
          enhance_contrast: false,
        }),
        ...patch,
      },
    }));
  };

  // Currently inspected source image & live estimated dimensions
  const currentSourceImg = uploadedImages.find((img) => img.id === previewImageId) || uploadedImages[0];
  const sourceW = currentSourceImg?.width || 1200;
  const sourceH = currentSourceImg?.height || 800;

  const upscale = config.upscale || {
    enabled: true,
    mode: 'scale',
    scale: 2,
    preset: '1080p',
    custom_width: 1920,
    custom_height: 1080,
    maintain_aspect_ratio: true,
    kernel: 'lanczos3',
    sharpen: true,
    sharpen_amount: 2,
    denoise: true,
    enhance_contrast: false,
  };

  let calculatedW = sourceW;
  let calculatedH = sourceH;
  if (upscale.enabled) {
    if (upscale.mode === 'scale') {
      calculatedW = Math.round(sourceW * (upscale.scale || 2));
      calculatedH = Math.round(sourceH * (upscale.scale || 2));
    } else if (upscale.mode === 'preset') {
      let pw = 1920, ph = 1080;
      if (upscale.preset === '2k') { pw = 2560; ph = 1440; }
      else if (upscale.preset === '4k') { pw = 3840; ph = 2160; }
      else if (upscale.preset === 'instagram') { pw = 1080; ph = 1080; }
      else if (upscale.preset === 'ecommerce') { pw = 2048; ph = 2048; }

      if (upscale.maintain_aspect_ratio) {
        const aspect = sourceW / sourceH;
        if (aspect > pw / ph) {
          calculatedW = pw;
          calculatedH = Math.max(1, Math.round(pw / aspect));
        } else {
          calculatedH = ph;
          calculatedW = Math.max(1, Math.round(ph * aspect));
        }
      } else {
        calculatedW = pw;
        calculatedH = ph;
      }
    } else if (upscale.mode === 'custom') {
      const cw = upscale.custom_width || sourceW * 2;
      const ch = upscale.custom_height || sourceH * 2;
      if (upscale.maintain_aspect_ratio) {
        const aspect = sourceW / sourceH;
        if (aspect > cw / ch) {
          calculatedW = cw;
          calculatedH = Math.max(1, Math.round(cw / aspect));
        } else {
          calculatedH = ch;
          calculatedW = Math.max(1, Math.round(ch * aspect));
        }
      } else {
        calculatedW = cw;
        calculatedH = ch;
      }
    }
  }

  const sourceMP = ((sourceW * sourceH) / 1000000).toFixed(2);
  const upscaledMP = ((calculatedW * calculatedH) / 1000000).toFixed(2);
  const pixelMultiplier = ((calculatedW * calculatedH) / Math.max(1, sourceW * sourceH)).toFixed(1);

  // 2. Fetch live preview when parameters change
  const fetchLivePreview = useCallback(async () => {
    if (!previewImageId || !session) {
      setPreviewDataUri(null);
      setPreviewStats(null);
      return;
    }

    if (config.watermark_enabled !== false && !selectedBusinessId) {
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
        originalWidth?: number;
        originalHeight?: number;
        upscaledWidth?: number;
        upscaledHeight?: number;
        previewFileSize: number;
        estimatedFullFileSize: number;
        outputFormat: string;
        quality: number;
        upscaled?: boolean;
        scaleFactor?: number;
        kernel?: string;
      }>('/api/process/preview', {
        imageId: previewImageId,
        businessId: selectedBusinessId || undefined,
        config,
      });
      setPreviewDataUri(res.dataUri);
      setPreviewStats({
        width: res.width,
        height: res.height,
        originalWidth: res.originalWidth,
        originalHeight: res.originalHeight,
        upscaledWidth: res.upscaledWidth,
        upscaledHeight: res.upscaledHeight,
        previewFileSize: res.previewFileSize,
        estimatedFullFileSize: res.estimatedFullFileSize,
        outputFormat: res.outputFormat || config.output_format || 'webp',
        quality: res.quality || config.quality || 80,
        upscaled: res.upscaled,
        scaleFactor: res.scaleFactor,
        kernel: res.kernel,
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

  // 3b. Handle images imported from URLs
  const handleImagesImportedFromUrls = (newImages: UploadedImage[], allImages: UploadedImage[]) => {
    setUploadedImages(allImages);
    if (!previewImageId && allImages.length > 0) {
      setPreviewImageId(newImages.length > 0 ? newImages[0].id : allImages[0].id);
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

    if (config.watermark_enabled !== false && !selectedBusinessId) {
      warning('Select Business', 'Please select a registered business brand or switch to Image Upscale Only.');
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
        businessId: selectedBusinessId || undefined,
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

  // Programmatic download handler for single image (preserving exact original file name)
  const handleDownloadSingleImage = async (proc: ProcessedImage) => {
    const downloadUrl = `/api/process/download/image/${proc.id}?token=${authToken || ''}`;
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        error('Download Failed', errJson.error || 'Failed to download image');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', proc.output_filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      error('Download Failed', err.message || 'Error downloading file');
    }
  };

  // Programmatic download handler for ZIP file
  const handleDownloadZip = async (jobId: string) => {
    if (!jobId) {
      warning('Download Error', 'Job ID is not available.');
      return;
    }
    info('Downloading ZIP', 'Preparing your valid batch ZIP archive...');
    try {
      const downloadUrl = `/api/process/download/zip/${jobId}?token=${authToken || ''}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        error('Download Failed', errJson.error || 'Failed to download ZIP archive');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const downloadName = lastCompletedJob?.zip_filename || `Watermarked_Batch_${jobId.substring(4, 10)}.zip`;
      link.setAttribute('download', downloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
      success('Download Ready', 'Batch ZIP archive downloaded successfully.');
    } catch (err: any) {
      error('Download Failed', err.message || 'Error downloading archive');
    }
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
              Format: {config.output_format === 'original' ? 'Original (PNG/JPG)' : config.output_format || 'original'}
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

      {/* Studio Mode Selector Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-bold w-full sm:w-auto">
          <button
            type="button"
            id="studio-mode-all-btn"
            onClick={() => {
              setStudioMode('all');
              setConfig((prev) => ({
                ...prev,
                watermark_enabled: true,
                upscale: { ...(prev.upscale || ({} as any)), enabled: true },
              }));
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              studioMode === 'all'
                ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>All-in-One Studio (Watermark + Upscale)</span>
          </button>

          <button
            type="button"
            id="studio-mode-upscale-btn"
            onClick={() => {
              setStudioMode('upscale');
              setConfig((prev) => ({
                ...prev,
                watermark_enabled: false,
                upscale: { ...(prev.upscale || ({} as any)), enabled: true },
              }));
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              studioMode === 'upscale'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Image Upscale Only</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
              Non-AI
            </span>
          </button>

          <button
            type="button"
            id="studio-mode-watermark-btn"
            onClick={() => {
              setStudioMode('watermark');
              setConfig((prev) => ({
                ...prev,
                watermark_enabled: true,
                upscale: { ...(prev.upscale || ({} as any)), enabled: false },
              }));
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              studioMode === 'watermark'
                ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Watermark Only</span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 pr-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-slate-600">
            {config.upscale?.enabled && config.watermark_enabled !== false
              ? 'Multi-Pass: Algorithmic Upscale + Brand Watermark'
              : config.upscale?.enabled
              ? 'High-Fidelity Algorithmic Upscaling (100% Non-AI)'
              : 'Brand Watermark & WebP Studio'}
          </span>
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  {uploadedImages.length} {uploadedImages.length === 1 ? 'image' : 'images'} loaded
                </span>
                <button
                  type="button"
                  id="open-upload-modal-btn"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                  title="Open Upload Source Modal"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Option 1 vs Option 2 Tabs */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg text-xs font-bold">
              <button
                type="button"
                id="tab-direct-upload"
                onClick={() => setUploadMethod('direct')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md transition-all ${
                  uploadMethod === 'direct'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Option 1: Direct Upload</span>
              </button>

              <button
                type="button"
                id="tab-image-links"
                onClick={() => setUploadMethod('links')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md transition-all ${
                  uploadMethod === 'links'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Option 2: Image Links</span>
              </button>
            </div>

            {uploadMethod === 'direct' ? (
              <ImageDropzone
                onFilesSelected={handleUploadFiles}
                isUploading={isUploading}
                maxFiles={50}
              />
            ) : (
              <ImageUrlImporter
                sessionId={session?.id || ''}
                onImagesImported={handleImagesImportedFromUrls}
                isProcessing={isUploading}
              />
            )}

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
                <span>Select Business Brand (Watermark)</span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="toggle-watermark-enabled-btn"
                  onClick={() => {
                    const next = config.watermark_enabled === false;
                    setConfig((prev) => ({ ...prev, watermark_enabled: next }));
                    if (!next) {
                      setStudioMode('upscale');
                    }
                  }}
                  className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all border ${
                    config.watermark_enabled === false
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                  }`}
                >
                  {config.watermark_enabled === false ? 'Enable Watermark' : 'Skip Watermark (Upscale Only)'}
                </button>
                {config.watermark_enabled !== false && (
                  <button
                    type="button"
                    onClick={() => onNavigate('businesses', { openAddModal: true })}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    + Add Business
                  </button>
                )}
              </div>
            </div>

            {config.watermark_enabled === false ? (
              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Maximize2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <p className="font-bold">Watermark is skipped for this batch</p>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Your images will be upscaled and processed with pure algorithmic resampling without any logo overlay.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, watermark_enabled: true }))}
                  className="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-50 shadow-2xs shrink-0"
                >
                  Enable Watermark
                </button>
              </div>
            ) : businesses.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <p className="font-bold text-amber-800">No businesses found</p>
                <p className="mt-1 text-amber-700">
                  Please register a business profile with your company logo first, or skip watermark to upscale only.
                </p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('businesses', { openAddModal: true })}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs"
                  >
                    Register Business Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, watermark_enabled: false }))}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg shadow-xs"
                  >
                    Skip Watermark
                  </button>
                </div>
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

          {/* STEP 3: Watermark Settings Panel (Visible when watermark is enabled) */}
          {config.watermark_enabled !== false ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <span>Watermark Configuration</span>
                </h2>
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Logo Overlay
                </span>
              </div>

              {/* Position Picker */}
              <PositionGrid
                value={config.position}
                onChange={(pos) => setConfig((prev) => ({ ...prev, position: pos }))}
              />

              {/* Logo Size (%) Slider */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    Logo Scale (% of Image Width)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="input-logo-size-number"
                      type="number"
                      min="1"
                      max="100"
                      value={config.logo_size}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setConfig((prev) => ({
                            ...prev,
                            logo_size: Math.max(1, Math.min(100, val)),
                          }));
                        }
                      }}
                      className="w-14 text-center font-bold font-mono text-blue-600 bg-blue-50/50 border border-blue-200 rounded px-1 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <span className="font-bold text-slate-500 text-xs">%</span>
                  </div>
                </div>
                <input
                  id="slider-logo-size"
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={config.logo_size}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, logo_size: parseInt(e.target.value, 10) }))
                  }
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                {/* Quick Preset Buttons */}
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  {[
                    { label: '25%', val: 25 },
                    { label: '50%', val: 50 },
                    { label: '75%', val: 75 },
                    { label: '100% (Full)', val: 100 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, logo_size: preset.val }))}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors border ${
                        config.logo_size === preset.val
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
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
            </div>
          ) : null}

          {/* SECTION: IMAGE UPSCALE (100% Non-AI Algorithmic Resampling) */}
          <div
            id="image-upscale-section"
            className={`bg-white border rounded-xl p-5 shadow-xs space-y-4 transition-all ${
              config.upscale?.enabled
                ? 'border-indigo-300 ring-1 ring-indigo-200/70'
                : 'border-slate-200'
            }`}
          >
            {/* Upscale Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Maximize2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Image Upscale</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                      Non-AI
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    High-precision algorithmic interpolation &amp; sharpness restoration
                  </p>
                </div>
              </div>

              {/* Master Upscale Toggle Switch */}
              <label
                htmlFor="toggle-upscale-enabled"
                className="relative inline-flex items-center cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  id="toggle-upscale-enabled"
                  checked={!!config.upscale?.enabled}
                  onChange={(e) => updateUpscale({ enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                <span className="ml-2 text-xs font-bold text-slate-700">
                  {config.upscale?.enabled ? 'Active' : 'Off'}
                </span>
              </label>
            </div>

            {config.upscale?.enabled ? (
              <div className="space-y-4 pt-1">
                {/* Real-time Megapixels & Resolution Badge */}
                <div className="p-3 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-purple-50/80 rounded-xl border border-indigo-200/80 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block">
                        Source Resolution:
                      </span>
                      <span className="font-mono font-semibold text-slate-700">
                        {sourceW} × {sourceH} px ({sourceMP} MP)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-indigo-600 font-bold">
                      <ArrowRight className="w-4 h-4" />
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block">
                        Upscaled Target:
                      </span>
                      <span className="font-mono font-bold text-indigo-700">
                        {calculatedW} × {calculatedH} px ({upscaledMP} MP)
                      </span>
                    </div>

                    <span className="px-2 py-1 rounded-md bg-white border border-indigo-200 text-[11px] font-bold text-indigo-700 font-mono shadow-2xs">
                      +{((Number(pixelMultiplier) - 1) * 100).toFixed(0)}% Pixels ({pixelMultiplier}x)
                    </span>
                  </div>
                </div>

                {/* Upscale Mode Selector Tabs */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    Upscale Mode
                  </label>
                  <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-lg text-xs font-bold">
                    <button
                      type="button"
                      id="upscale-mode-scale-btn"
                      onClick={() => updateUpscale({ mode: 'scale' })}
                      className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1 ${
                        upscale.mode === 'scale'
                          ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80 font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Scale Factor</span>
                    </button>

                    <button
                      type="button"
                      id="upscale-mode-preset-btn"
                      onClick={() => updateUpscale({ mode: 'preset' })}
                      className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1 ${
                        upscale.mode === 'preset'
                          ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80 font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>Resolution Preset</span>
                    </button>

                    <button
                      type="button"
                      id="upscale-mode-custom-btn"
                      onClick={() => updateUpscale({ mode: 'custom' })}
                      className={`py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1 ${
                        upscale.mode === 'custom'
                          ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80 font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Custom Dimensions</span>
                    </button>
                  </div>
                </div>

                {/* MODE 1: SCALE MULTIPLIER CONTROLS */}
                {upscale.mode === 'scale' && (
                  <div className="space-y-3 p-3 bg-slate-50/70 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                        Scale Factor Multiplier
                      </span>
                      <span className="font-mono font-bold text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-200">
                        {Number(upscale.scale || 2).toFixed(1)}x ({calculatedW} × {calculatedH} px)
                      </span>
                    </div>

                    <input
                      id="slider-upscale-scale"
                      type="range"
                      min="1"
                      max="4"
                      step="0.1"
                      value={upscale.scale || 2}
                      onChange={(e) => updateUpscale({ scale: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />

                    {/* Scale Quick Presets */}
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {[
                        { label: '1.25x', val: 1.25 },
                        { label: '1.5x', val: 1.5 },
                        { label: '2.0x (FHD/2K)', val: 2.0 },
                        { label: '3.0x', val: 3.0 },
                        { label: '4.0x (4K Ultra)', val: 4.0 },
                      ].map((s) => {
                        const isSelected = Math.abs((upscale.scale || 2) - s.val) < 0.05;
                        return (
                          <button
                            key={s.label}
                            type="button"
                            id={`upscale-scale-pill-${s.val}`}
                            onClick={() => updateUpscale({ scale: s.val })}
                            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all border text-center ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MODE 2: RESOLUTION PRESET CONTROLS */}
                {upscale.mode === 'preset' && (
                  <div className="space-y-3 p-3 bg-slate-50/70 rounded-xl border border-slate-200">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                      Select Target Resolution Preset:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: '1080p', name: '1080p Full HD', dims: '1920 × 1080 px', desc: 'Standard HD displays & web hero' },
                        { id: '2k', name: '2K QHD', dims: '2560 × 1440 px', desc: 'Retina laptops & gaming monitors' },
                        { id: '4k', name: '4K Ultra HD', dims: '3840 × 2160 px', desc: 'Cinema 4K, print & high-DPI TVs' },
                        { id: 'instagram', name: 'Square Social', dims: '1080 × 1080 px', desc: 'Instagram, avatars & profile icons' },
                        { id: 'ecommerce', name: 'E-Commerce Standard', dims: '2048 × 2048 px', desc: 'Amazon, Shopify & catalog zoom' },
                      ].map((p) => {
                        const isSelected = (upscale.preset || '1080p') === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            id={`upscale-preset-${p.id}`}
                            onClick={() => updateUpscale({ preset: p.id as any })}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-950 ring-1 ring-indigo-600 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold">{p.name}</p>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                            </div>
                            <p className="text-[11px] font-mono text-indigo-700 font-semibold mt-0.5">{p.dims}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{p.desc}</p>
                          </button>
                        );
                      })}
                    </div>

                    <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={upscale.maintain_aspect_ratio !== false}
                        onChange={(e) => updateUpscale({ maintain_aspect_ratio: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="font-semibold">Maintain source aspect ratio (avoid image stretching)</span>
                    </label>
                  </div>
                )}

                {/* MODE 3: CUSTOM DIMENSIONS CONTROLS */}
                {upscale.mode === 'custom' && (
                  <div className="space-y-3 p-3 bg-slate-50/70 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                        Custom Pixel Dimensions:
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const w = upscale.custom_width || 1920;
                          const h = upscale.custom_height || 1080;
                          updateUpscale({ custom_width: h, custom_height: w });
                        }}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                        title="Swap width and height"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Swap (Orient)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block mb-1">Target Width (px)</span>
                        <input
                          id="input-custom-upscale-width"
                          type="number"
                          min="64"
                          max="8000"
                          step="10"
                          value={upscale.custom_width || 1920}
                          onChange={(e) => {
                            const w = parseInt(e.target.value, 10) || 100;
                            if (upscale.maintain_aspect_ratio && sourceW && sourceH) {
                              const aspect = sourceW / sourceH;
                              updateUpscale({
                                custom_width: w,
                                custom_height: Math.round(w / aspect),
                              });
                            } else {
                              updateUpscale({ custom_width: w });
                            }
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. 2560"
                        />
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block mb-1">Target Height (px)</span>
                        <input
                          id="input-custom-upscale-height"
                          type="number"
                          min="64"
                          max="8000"
                          step="10"
                          value={upscale.custom_height || 1080}
                          onChange={(e) => {
                            const h = parseInt(e.target.value, 10) || 100;
                            if (upscale.maintain_aspect_ratio && sourceW && sourceH) {
                              const aspect = sourceW / sourceH;
                              updateUpscale({
                                custom_height: h,
                                custom_width: Math.round(h * aspect),
                              });
                            } else {
                              updateUpscale({ custom_height: h });
                            }
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. 1440"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={upscale.maintain_aspect_ratio !== false}
                        onChange={(e) => updateUpscale({ maintain_aspect_ratio: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="font-semibold">Lock aspect ratio (proportional scaling)</span>
                    </label>
                  </div>
                )}

                {/* RESAMPLING INTERPOLATION ALGORITHM (KERNEL) SELECTOR */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      Resampling Algorithm (Interpolation Kernel)
                    </span>
                    <span className="text-[11px] font-mono font-bold text-indigo-600 uppercase">
                      {upscale.kernel || 'lanczos3'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: 'lanczos3',
                        name: 'Lanczos3 (High Fidelity Sinc)',
                        badge: 'Recommended',
                        desc: '3-lobe sinc windowed interpolation. Maximum sharpness & micro-textures for photos.',
                      },
                      {
                        id: 'mitchell',
                        name: 'Mitchell-Netravali',
                        badge: 'Text & Vector',
                        desc: 'Smooth cubic spline. Suppresses ringing artifacts on text, graphics, and vector logos.',
                      },
                      {
                        id: 'cubic',
                        name: 'Bicubic Interpolation',
                        badge: 'Smooth',
                        desc: 'Balanced cubic polynomial convolution for soft natural gradations.',
                      },
                      {
                        id: 'nearest',
                        name: 'Nearest Neighbor',
                        badge: 'Pixel Art',
                        desc: 'Pixel-exact replication with zero blur. Ideal for retro sprites and pixel art.',
                      },
                      {
                        id: 'linear',
                        name: 'Bilinear Interpolation',
                        badge: 'Fast',
                        desc: 'Classic 2x2 linear interpolation. Fast execution and gentle blurring.',
                      },
                    ].map((k) => {
                      const isSelected = (upscale.kernel || 'lanczos3') === k.id;
                      return (
                        <button
                          key={k.id}
                          type="button"
                          id={`kernel-btn-${k.id}`}
                          onClick={() => updateUpscale({ kernel: k.id as any })}
                          className={`p-2.5 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'bg-indigo-50/80 border-indigo-600 text-indigo-950 ring-1 ring-indigo-600 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold">{k.name}</p>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {k.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-snug">{k.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* NON-AI POST-PROCESSING & DETAIL ENHANCEMENTS */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block">
                    Algorithmic Detail &amp; Clarity Filters (100% Non-AI)
                  </span>

                  {/* 1. Unsharp Mask Sharpening */}
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-800">
                        <input
                          type="checkbox"
                          checked={upscale.sharpen !== false}
                          onChange={(e) => updateUpscale({ sharpen: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span>Unsharp Mask Edge Sharpening</span>
                      </label>
                      <span className="text-[10px] font-bold text-indigo-600 uppercase">
                        {upscale.sharpen !== false ? `Level ${upscale.sharpen_amount || 2}` : 'Disabled'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Calculates high-pass Laplacian edge gradients to counteract optical blur introduced during digital enlargement.
                    </p>

                    {upscale.sharpen !== false && (
                      <div className="grid grid-cols-4 gap-1 pt-1">
                        {[
                          { level: 1, label: 'Mild (1x)' },
                          { level: 2, label: 'Standard (2x)' },
                          { level: 3, label: 'Sharp (3x)' },
                          { level: 4, label: 'Ultra (4x)' },
                        ].map((lvl) => (
                          <button
                            key={lvl.level}
                            type="button"
                            onClick={() => updateUpscale({ sharpen_amount: lvl.level })}
                            className={`py-1 rounded text-[10px] font-bold transition-all border ${
                              (upscale.sharpen_amount || 2) === lvl.level
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {lvl.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Pre-Scale Artifact Suppression */}
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200">
                    <label className="flex items-start gap-2 cursor-pointer select-none text-xs">
                      <input
                        type="checkbox"
                        checked={upscale.denoise !== false}
                        onChange={(e) => updateUpscale({ denoise: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block">
                          Pre-Scale Artifact &amp; Noise Suppression
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Applies adaptive median filtering to eliminate JPEG compression blocks and mosquito noise before magnification.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* 3. Dynamic Contrast & Histogram Normalization */}
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200">
                    <label className="flex items-start gap-2 cursor-pointer select-none text-xs">
                      <input
                        type="checkbox"
                        checked={!!upscale.enhance_contrast}
                        onChange={(e) => updateUpscale({ enhance_contrast: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block">
                          Dynamic Range &amp; Contrast Normalization
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Normalizes color channel histograms across the full dynamic range for deeper blacks and vibrant highlights.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Algorithmic Guarantee Callout */}
                <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200 flex items-start gap-2.5 text-[11px] text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p>
                    <strong className="text-slate-800">100% Non-AI Algorithmic Process:</strong> Powered by native C++ multi-threaded libvips kernel interpolation. No AI hallucination, no tokens, no cloud generation latency, and 100% private data handling.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>Image upscaling is currently disabled. Images will remain at original resolution.</span>
                <button
                  type="button"
                  onClick={() => updateUpscale({ enabled: true })}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  Enable Upscaling
                </button>
              </div>
            )}
          </div>

          {/* STEP 4: Output Format & Compression Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {config.watermark_enabled !== false ? '4' : '2'}
                </span>
                <span>Output Format &amp; Compression</span>
              </h2>
            </div>

            {/* Output Format Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Select Output Format</span>
                <span className="text-[11px] font-bold text-blue-600 uppercase font-mono">
                  {config.output_format === 'original' ? 'Original (Auto Match)' : config.output_format || 'original'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { id: 'original', name: 'Original', desc: 'Auto Match (PNG/JPG)' },
                  { id: 'png', name: 'PNG', desc: 'Universal Preview' },
                  { id: 'jpeg', name: 'JPEG', desc: 'Universal Photo' },
                  { id: 'webp', name: 'WebP', desc: 'Fastest Web' },
                  { id: 'avif', name: 'AVIF', desc: 'Next-Gen' },
                ].map((fmt) => {
                  const isSelected = (config.output_format || 'original') === fmt.id;
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
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold">{fmt.name}</p>
                        {fmt.id === 'original' && (
                          <span className="text-[9px] font-bold px-1 bg-emerald-100 text-emerald-800 rounded">Rec</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{fmt.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="p-2 rounded-md bg-blue-50/70 border border-blue-100 text-[11px] text-blue-900 leading-snug">
                <strong>Preview Tip:</strong> Choose <strong>Original</strong> or <strong>PNG / JPEG</strong> to ensure downloaded files show full thumbnail previews in Windows Explorer &amp; Mac Finder.
              </div>
            </div>

            {/* Output Quality & Target File Size Compression */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Compression Mode
                </span>
                <span className="font-bold font-mono text-emerald-600">
                  {config.compression_mode === 'target_size'
                    ? `Target ≤ ${targetSizeValue} ${targetSizeUnit}`
                    : `${config.quality || config.webp_quality || 85}% Quality`}
                </span>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/80 rounded-lg border border-slate-200">
                <button
                  type="button"
                  id="compression-mode-quality-btn"
                  onClick={() => setConfig((prev) => ({ ...prev, compression_mode: 'quality' }))}
                  className={`py-1.5 px-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    config.compression_mode !== 'target_size'
                      ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Quality % Slider</span>
                </button>
                <button
                  type="button"
                  id="compression-mode-target-size-btn"
                  onClick={() => {
                    const kb = targetSizeUnit === 'MB' ? targetSizeValue * 1024 : targetSizeValue;
                    setConfig((prev) => ({
                      ...prev,
                      compression_mode: 'target_size',
                      target_file_size_kb: kb,
                    }));
                  }}
                  className={`py-1.5 px-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    config.compression_mode === 'target_size'
                      ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Target File Size</span>
                </button>
              </div>

              {/* MODE 1: Target File Size Mode */}
              {config.compression_mode === 'target_size' ? (
                <div className="space-y-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Select Max File Size per Image:</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      ≤ {targetSizeValue} {targetSizeUnit}
                    </span>
                  </div>

                  {/* Preset Pills */}
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { label: '100 KB', val: 100, unit: 'KB' as const },
                      { label: '250 KB', val: 250, unit: 'KB' as const },
                      { label: '500 KB', val: 500, unit: 'KB' as const },
                      { label: '1 MB', val: 1, unit: 'MB' as const },
                      { label: '2 MB', val: 2, unit: 'MB' as const },
                    ].map((preset) => {
                      const isSelected =
                        targetSizeValue === preset.val && targetSizeUnit === preset.unit;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          id={`preset-size-${preset.label.replace(' ', '-').toLowerCase()}`}
                          onClick={() => {
                            setTargetSizeValue(preset.val);
                            setTargetSizeUnit(preset.unit);
                            const kb = preset.unit === 'MB' ? preset.val * 1024 : preset.val;
                            setConfig((prev) => ({
                              ...prev,
                              compression_mode: 'target_size',
                              target_file_size_kb: kb,
                            }));
                          }}
                          className={`py-1 rounded text-[11px] font-semibold transition-all border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Size Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-slate-600 font-medium">Custom Size:</span>
                    <div className="flex items-center flex-1 rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                      <input
                        id="input-target-file-size"
                        type="number"
                        min="10"
                        max="50000"
                        step="10"
                        value={targetSizeValue}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setTargetSizeValue(val);
                          const kb = targetSizeUnit === 'MB' ? val * 1024 : val;
                          setConfig((prev) => ({
                            ...prev,
                            compression_mode: 'target_size',
                            target_file_size_kb: kb,
                          }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-mono font-bold text-slate-800 bg-transparent focus:outline-none"
                        placeholder="e.g. 350"
                      />
                      <select
                        id="select-target-size-unit"
                        value={targetSizeUnit}
                        onChange={(e) => {
                          const unit = e.target.value as 'KB' | 'MB';
                          setTargetSizeUnit(unit);
                          const kb = unit === 'MB' ? targetSizeValue * 1024 : targetSizeValue;
                          setConfig((prev) => ({
                            ...prev,
                            compression_mode: 'target_size',
                            target_file_size_kb: kb,
                          }));
                        }}
                        className="bg-slate-50 border-l border-slate-200 text-xs font-bold text-slate-700 px-2 py-1.5 focus:outline-none"
                      >
                        <option value="KB">KB</option>
                        <option value="MB">MB</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-[11px] text-emerald-900 leading-snug">
                    ⚡ <strong>Auto-Compress Engine:</strong> Iteratively computes optimal compression level to keep output files under <strong>≤ {targetSizeValue} {targetSizeUnit}</strong> while maximizing image clarity.
                  </p>
                </div>
              ) : (
                /* MODE 2: Manual Quality Slider */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      {(config.output_format === 'original' ? 'Image' : config.output_format?.toUpperCase() || 'ORIGINAL')} Quality
                    </span>
                    <span className="font-bold font-mono text-emerald-600">
                      {config.quality || config.webp_quality || 85}%
                    </span>
                  </div>
                  <input
                    id="slider-quality"
                    type="range"
                    min="10"
                    max="100"
                    value={config.quality || config.webp_quality || 85}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setConfig((prev) => ({ ...prev, quality: val, webp_quality: val }));
                    }}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  {/* Quality Presets */}
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    {[
                      { label: '60% (Web)', val: 60 },
                      { label: '75% (Balanced)', val: 75 },
                      { label: '85% (High)', val: 85 },
                      { label: '95% (Max)', val: 95 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            quality: preset.val,
                            webp_quality: preset.val,
                          }))
                        }
                        className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors border ${
                          (config.quality || config.webp_quality || 85) === preset.val
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    {(config.output_format || 'original') === 'png'
                      ? 'Optimized PNG with 7-level zlib deflate compression and alpha transparency.'
                      : (config.output_format || 'original') === 'avif'
                      ? 'AVIF provides up to 50% smaller file size than JPEG with pristine quality.'
                      : (config.output_format || 'original') === 'original'
                      ? 'Preserves source format (PNG -> PNG, JPG -> JPG) with native OS previews.'
                      : `Quality ${config.quality || 85}% provides ~${Math.round(100 - (config.quality || 85) * 0.7)}% size reduction with sharp clarity.`}
                  </p>
                </div>
              )}
            </div>

            {/* Main Batch Execute Button */}
            <div className="pt-3">
              <button
                id="execute-process-btn"
                type="button"
                onClick={handleExecuteBatch}
                disabled={
                  isProcessing ||
                  uploadedImages.length === 0 ||
                  (config.watermark_enabled !== false && !selectedBusinessId)
                }
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
                    <span>
                      {config.watermark_enabled === false
                        ? `Upscale ${uploadedImages.length} Images (100% Non-AI)`
                        : config.upscale?.enabled
                        ? `Upscale & Watermark ${uploadedImages.length} Images`
                        : config.compression_mode === 'target_size'
                        ? `Watermark ${uploadedImages.length} Images (Target ≤ ${targetSizeValue} ${targetSizeUnit})`
                        : `Watermark ${uploadedImages.length} Images to ${config.output_format === 'original' ? 'Original Format' : (config.output_format || 'original').toUpperCase()}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Interactive Preview & Processed Output (7 cols on lg) - STICKY SECTION */}
        <div id="live-preview-section" className="lg:col-span-7 space-y-5 lg:sticky lg:top-6 self-start">
          {/* Real-Time Preview Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  {config.watermark_enabled === false
                    ? 'Live Image Upscale Preview'
                    : config.upscale?.enabled
                    ? 'Live Upscale & Watermark Preview'
                    : 'Live Watermark Preview'}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {/* 1:1 Pixel Zoom Toggle */}
                {previewDataUri && (
                  <button
                    type="button"
                    id="toggle-preview-zoom-btn"
                    onClick={() => setPreviewZoom((prev) => (prev === 'fit' ? 'actual' : 'fit'))}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold transition-all shadow-2xs"
                    title={previewZoom === 'fit' ? 'Inspect 100% Genuine 1:1 Pixel Scale' : 'Fit Image in Window'}
                  >
                    {previewZoom === 'fit' ? (
                      <>
                        <ZoomIn className="w-3.5 h-3.5 text-indigo-600" />
                        <span>1:1 Pixel Inspect</span>
                      </>
                    ) : (
                      <>
                        <ZoomOut className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Fit Viewport</span>
                      </>
                    )}
                  </button>
                )}

                {config.watermark_enabled !== false && selectedBusiness && (
                  <span className="text-xs text-slate-600 font-medium px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 truncate max-w-[180px]">
                    Brand: <strong className="text-blue-700">{selectedBusiness.name}</strong>
                  </span>
                )}

                {config.watermark_enabled === false && (
                  <span className="text-xs text-indigo-700 font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Upscale Only (Non-AI)</span>
                  </span>
                )}
              </div>
            </div>

            {/* Preview Stage Container */}
            <div
              id="live-preview-viewport"
              className={`relative w-full rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden group shadow-inner transition-all ${
                previewZoom === 'actual'
                  ? 'h-[420px] overflow-auto cursor-grab active:cursor-grabbing p-4'
                  : 'aspect-video sm:h-96'
              }`}
              style={{
                backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
                backgroundSize: '16px 16px',
              }}
            >
              {isPreviewLoading && (
                <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-xs flex items-center justify-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-md">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Rendering preview...</span>
                  </div>
                </div>
              )}

              {previewDataUri ? (
                <>
                  <img
                    src={previewDataUri}
                    alt="Process preview"
                    className={`filter drop-shadow-sm transition-transform ${
                      previewZoom === 'actual'
                        ? 'max-w-none max-h-none block'
                        : 'max-w-full max-h-full object-contain'
                    }`}
                  />
                  <button
                    onClick={() => setActiveModalImage(previewDataUri)}
                    className="absolute bottom-3 right-3 p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Expand preview full screen"
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
                      ? 'Upload images to see live real-time preview'
                      : config.watermark_enabled !== false && !selectedBusinessId
                      ? 'Select a business brand on the left to preview watermark'
                      : 'Rendering live preview...'}
                  </p>
                </div>
              )}
            </div>

            {/* FINAL IMAGE SIZE & PREVIEW SPECS */}
            {previewStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Est. File Size</span>
                    {config.compression_mode === 'target_size' && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">
                        Target ≤ {targetSizeValue}{targetSizeUnit}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-blue-600 text-xs">
                    ~{(previewStats.estimatedFullFileSize / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Resolution</span>
                  <span className="font-mono font-semibold text-slate-700 text-xs block truncate">
                    {previewStats.width} × {previewStats.height} px
                  </span>
                  {previewStats.originalWidth && (
                    <span className="text-[9px] text-slate-400 block font-mono">
                      from {previewStats.originalWidth} × {previewStats.originalHeight}
                    </span>
                  )}
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Upscale Engine</span>
                  <span className="font-mono font-bold text-indigo-700 text-xs block truncate">
                    {config.upscale?.enabled
                      ? `${previewStats.scaleFactor || (config.upscale.mode === 'scale' ? config.upscale.scale : 'Upscaled')}x • ${(config.upscale.kernel || 'lanczos3').toUpperCase()}`
                      : '1.0x (Original)'}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-bold block">
                    {config.upscale?.enabled ? '100% Non-AI' : 'Source DPI'}
                  </span>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Format &amp; Quality</span>
                  <span className="font-mono font-bold text-emerald-600 text-xs uppercase block truncate">
                    {previewStats.outputFormat} ({config.compression_mode === 'target_size' ? `Auto Q: ${previewStats.quality}%` : `Q: ${previewStats.quality}%`})
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
                    const previewUrl = `/api/process/processed-preview/${proc.id}?token=${authToken || ''}`;

                    return (
                      <div
                        key={proc.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => setActiveModalImage(previewUrl)}
                            title="Click to view full preview in modal"
                            className="w-10 h-10 rounded-md overflow-hidden bg-white border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity ring-1 ring-slate-200"
                          >
                            <img
                              src={previewUrl}
                              alt={proc.output_filename}
                              className="w-full h-full object-cover"
                            />
                          </button>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {proc.output_filename}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 font-mono">
                              <span className="font-bold text-blue-700">Size: {finalKB} KB</span>
                              {config.compression_mode === 'target_size' && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                    proc.file_size <= (config.target_file_size_kb || 500) * 1024 * 1.05
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  ≤ {targetSizeValue} {targetSizeUnit}
                                </span>
                              )}
                              {origKB && (
                                <span className="text-slate-400">
                                  (Orig: {origKB} KB {savings ? `• -${savings}%` : ''})
                                </span>
                              )}
                              <span>• {proc.width}x{proc.height}px</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setActiveModalImage(previewUrl)}
                            className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs transition-colors"
                            title="Preview image"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            id={`download-single-${proc.id}`}
                            onClick={() => handleDownloadSingleImage(proc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                            title="Download watermarked file"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download {(proc.output_format || 'png').toUpperCase()}</span>
                          </button>
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

      {/* Upload Source Modal (Option 1 Direct Upload / Option 2 Give Image Links) */}
      <UploadSourceModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        sessionId={session?.id || ''}
        onFilesSelected={handleUploadFiles}
        onImagesImported={handleImagesImportedFromUrls}
        isUploading={isUploading}
      />
    </div>
  );
};

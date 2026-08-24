import React, { useState } from 'react';
import { Link2, Loader2, AlertCircle, CheckCircle2, Sparkles, X, Plus } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { UploadedImage } from '../types';

interface ImageUrlImporterProps {
  sessionId: string;
  onImagesImported: (newImages: UploadedImage[], allImages: UploadedImage[]) => void;
  isProcessing?: boolean;
}

export const ImageUrlImporter: React.FC<ImageUrlImporterProps> = ({
  sessionId,
  onImagesImported,
  isProcessing = false,
}) => {
  const [urlText, setUrlText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedList, setFailedList] = useState<{ url: string; error: string }[]>([]);
  const { success, error, warning, info } = useToast();

  // Parse valid URLs from textarea (split by newline, commas, or spaces)
  const parseUrls = (raw: string): string[] => {
    return raw
      .split(/[\n,\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
  };

  const detectedUrls = parseUrls(urlText);

  const handlePasteSample = () => {
    const samples = [
      'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1200&auto=format&fit=crop&q=80',
    ];
    setUrlText(samples.join('\n'));
    info('Sample Links Loaded', 'Added 2 sample high-resolution image links.');
  };

  const handleClear = () => {
    setUrlText('');
    setFailedList([]);
  };

  const handleImport = async () => {
    if (!sessionId) {
      error('Session Error', 'No active workspace session found.');
      return;
    }

    if (detectedUrls.length === 0) {
      warning('No Valid URLs', 'Please enter at least one valid image URL starting with http:// or https://');
      return;
    }

    if (detectedUrls.length > 50) {
      warning('Limit Exceeded', 'Maximum 50 image URLs can be imported at once.');
    }

    setIsLoading(true);
    setFailedList([]);

    try {
      const res = await api.post<{
        message: string;
        addedImages: UploadedImage[];
        uploadedImages: UploadedImage[];
        failedUrls?: { url: string; error: string }[];
      }>('/api/process/import-urls', {
        sessionId,
        urls: detectedUrls.slice(0, 50),
      });

      if (res.addedImages && res.addedImages.length > 0) {
        onImagesImported(res.addedImages, res.uploadedImages);
        success('Images Imported', `Successfully downloaded and loaded ${res.addedImages.length} images.`);
        setUrlText('');
      }

      if (res.failedUrls && res.failedUrls.length > 0) {
        setFailedList(res.failedUrls);
        warning(
          'Some Links Failed',
          `${res.failedUrls.length} link(s) could not be downloaded or verified as valid images.`
        );
      }
    } catch (err: any) {
      error('Import Failed', err.message || 'Could not fetch images from the provided URLs.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Link2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">Give Image Links (URLs)</h3>
            <p className="text-[11px] text-slate-500">Paste direct image links (one URL per line)</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePasteSample}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
        >
          <Sparkles className="w-3 h-3" />
          <span>Load Sample Links</span>
        </button>
      </div>

      <div className="relative">
        <textarea
          id="image-urls-input"
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder={`https://example.com/photo1.jpg\nhttps://example.com/banner.png\nhttps://example.com/image.webp`}
          rows={4}
          disabled={isLoading || isProcessing}
          className="w-full text-xs font-mono p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400 focus:outline-none transition-all resize-y"
        />

        {urlText && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="Clear links"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs pt-1">
        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
          <span className="font-medium">
            Detected Links:{' '}
            <strong className={detectedUrls.length > 0 ? 'text-blue-600' : 'text-slate-700'}>
              {detectedUrls.length}
            </strong>
          </span>
          <span>•</span>
          <span>Max 50 images</span>
        </div>

        <button
          type="button"
          id="import-urls-submit-btn"
          onClick={handleImport}
          disabled={isLoading || isProcessing || detectedUrls.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching {detectedUrls.length} Images...</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Import {detectedUrls.length > 0 ? `${detectedUrls.length} Images` : 'Images'}</span>
            </>
          )}
        </button>
      </div>

      {/* Failed URLs feedback */}
      {failedList.length > 0 && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 space-y-1.5 text-xs text-rose-800">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Could not download {failedList.length} link(s):</span>
          </div>
          <ul className="space-y-1 max-h-24 overflow-y-auto pl-5 list-disc text-[11px]">
            {failedList.map((f, idx) => (
              <li key={idx} className="break-all">
                <span className="font-mono">{f.url}</span>: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

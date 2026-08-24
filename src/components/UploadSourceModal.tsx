import React, { useState } from 'react';
import { UploadCloud, Link2, X, Image as ImageIcon } from 'lucide-react';
import { ImageDropzone } from './ImageDropzone';
import { ImageUrlImporter } from './ImageUrlImporter';
import { UploadedImage } from '../types';

interface UploadSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onFilesSelected: (files: File[]) => void;
  onImagesImported: (newImages: UploadedImage[], allImages: UploadedImage[]) => void;
  isUploading?: boolean;
}

export const UploadSourceModal: React.FC<UploadSourceModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  onFilesSelected,
  onImagesImported,
  isUploading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'links'>('direct');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span>Upload Source Images</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select your preferred input method for loading images into the studio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Option Selector Tabs */}
        <div className="px-6 pt-4 pb-2">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              id="upload-option-direct-tab"
              onClick={() => setActiveTab('direct')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'direct'
                  ? 'bg-white text-blue-600 shadow-xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Option 1: Direct Upload</span>
            </button>

            <button
              type="button"
              id="upload-option-links-tab"
              onClick={() => setActiveTab('links')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'links'
                  ? 'bg-white text-blue-600 shadow-xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-4 h-4" />
              <span>Option 2: Give Image Links</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {activeTab === 'direct' ? (
            <div className="space-y-3">
              <ImageDropzone
                onFilesSelected={(files) => {
                  onFilesSelected(files);
                  onClose();
                }}
                isUploading={isUploading}
                maxFiles={50}
              />
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                <strong>Direct Upload:</strong> Select files from your local storage or drag and drop multiple image files. Supported formats: JPG, PNG, WebP (up to 30MB each).
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <ImageUrlImporter
                sessionId={sessionId}
                onImagesImported={(newImages, allImages) => {
                  onImagesImported(newImages, allImages);
                  onClose();
                }}
                isProcessing={isUploading}
              />
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                <strong>Image Links:</strong> Paste direct web URLs (e.g. Unsplash, CDN images, cloud storage links). Images will be securely downloaded and converted for watermarking.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

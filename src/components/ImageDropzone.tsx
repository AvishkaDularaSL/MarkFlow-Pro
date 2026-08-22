import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface ImageDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  maxFiles?: number;
  accept?: string;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({
  onFilesSelected,
  isUploading = false,
  maxFiles = 50,
  accept = 'image/jpeg,image/png,image/webp,image/jpg',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { warning } = useToast();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles: File[] = [];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (allowedTypes.includes(file.type.toLowerCase())) {
        validFiles.push(file);
      } else {
        warning('Unsupported File', `${file.name} is not a JPG, PNG, or WebP image.`);
      }
    }

    if (validFiles.length > maxFiles) {
      warning('Too Many Files', `Limiting to maximum of ${maxFiles} images per batch.`);
      validFiles.splice(maxFiles);
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
  };

  return (
    <div
      id="image-dropzone-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 ${
        isDragOver
          ? 'border-blue-500 bg-blue-50/60 ring-4 ring-blue-500/10'
          : 'border-slate-200 hover:border-blue-400 bg-white hover:bg-slate-50 shadow-xs'
      } ${isUploading ? 'opacity-70 cursor-not-allowed pointer-events-none' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleChange}
        className="hidden"
        id="hidden-image-upload-input"
        disabled={isUploading}
      />

      <div className="flex flex-col items-center justify-center space-y-2.5">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-xs ${
            isDragOver ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          ) : (
            <UploadCloud className="w-6 h-6" />
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">
            {isUploading ? (
              'Uploading and analyzing images...'
            ) : (
              <>
                <span className="text-blue-600 hover:underline">Click to browse</span> or drag and drop images
              </>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports JPG, PNG, and WebP (up to 50 images, 30MB each)
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
          <span className="flex items-center gap-1 font-medium">
            <ImageIcon className="w-3 h-3 text-blue-500" /> Auto-converted to WebP
          </span>
          <span>•</span>
          <span>Auto-cleaned after 1 hr</span>
        </div>
      </div>
    </div>

  );
};

import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { db } from '../db';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { StorageService } from '../services/StorageService';
import { ImageProcessingService } from '../services/ImageProcessingService';
import { ZipService } from '../services/ZipService';
import { WatermarkConfig } from '../types';

const router = Router();

// Multer storage for processing batch uploads
const uploadStorage = multer.diskStorage({
  destination: (req: AuthenticatedRequest, file, cb) => {
    const rawSessionId = req.body?.sessionId || req.query?.sessionId || 'default';
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : String(rawSessionId);
    const originalsDir = StorageService.getSessionOriginalsDir(sessionId);
    cb(null, originalsDir);
  },
  filename: (req, file, cb) => {
    const unique = StorageService.generateUniqueFilename(file.originalname);
    cb(null, unique);
  },
});

const batchUpload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB per image
    files: 50, // max 50 images per batch upload
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload JPG, PNG, or WebP.`));
    }
  },
});

// 1. Get or create active session for user
router.get('/session', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const lifetime = parseInt(db.getSettingValue('TEMP_FILE_LIFETIME', '3600'), 10);

  // Check if there is an active session
  let sessions = db['data'].processing_sessions.filter(
    (s) => s.user_id === userId && new Date(s.expires_at).getTime() > Date.now()
  );

  let activeSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  if (!activeSession) {
    activeSession = db.createProcessingSession(userId, lifetime);
  } else {
    // Touch session
    db.touchProcessingSession(activeSession.id, lifetime);
  }

  // Get uploaded images for this session
  const uploadedImages = db.getUploadedImagesBySession(activeSession.id, userId);

  res.json({
    session: activeSession,
    uploadedImages,
  });
});

// 2. Start a clean fresh session
router.post('/session/new', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const lifetime = parseInt(db.getSettingValue('TEMP_FILE_LIFETIME', '3600'), 10);
  const session = db.createProcessingSession(userId, lifetime);
  res.json({ session, uploadedImages: [] });
});

// 3. Batch upload images into session
router.post(
  '/upload',
  AuthService.requireAuth,
  (req, res, next) => {
    batchUpload.array('images', 50)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'File upload error.' });
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const sessionId = (req.body.sessionId as string) || '';

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const session = db.getProcessingSession(sessionId, userId);
    if (!session) {
      return res.status(404).json({ error: 'Processing session expired or not found. Please start a new session.' });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No images were uploaded.' });
    }

    const addedImages = [];
    for (const file of files) {
      const dimensions = await ImageProcessingService.getImageDimensions(file.path);
      const img = db.addUploadedImage({
        processing_session_id: sessionId,
        user_id: userId,
        original_name: file.originalname,
        temporary_path: file.path,
        mime_type: file.mimetype,
        file_size: file.size,
        width: dimensions.width,
        height: dimensions.height,
      });
      addedImages.push(img);
    }

    db.touchProcessingSession(sessionId);

    db.logActivity({
      user_id: userId,
      user_email: req.user!.email,
      action: 'IMAGES_UPLOADED',
      metadata: { count: addedImages.length, sessionId },
    });

    const allSessionImages = db.getUploadedImagesBySession(sessionId, userId);

    res.json({
      message: `Successfully uploaded ${addedImages.length} images.`,
      addedImages,
      uploadedImages: allSessionImages,
    });
  }
);

// 3b. Import images directly from URLs into active session
router.post('/import-urls', AuthService.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId, urls } = req.body as { sessionId: string; urls: string[] };

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }

  const session = db.getProcessingSession(sessionId, userId);
  if (!session) {
    return res.status(404).json({ error: 'Processing session expired or not found. Please start a new session.' });
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one valid image URL.' });
  }

  // Filter and deduplicate URLs
  const cleanUrls = Array.from(
    new Set(
      urls
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter((u) => u.startsWith('http://') || u.startsWith('https://'))
    )
  ).slice(0, 50);

  if (cleanUrls.length === 0) {
    return res.status(400).json({ error: 'No valid HTTP/HTTPS URLs provided.' });
  }

  const originalsDir = StorageService.getSessionOriginalsDir(sessionId);
  const addedImages = [];
  const failedUrls: { url: string; error: string }[] = [];

  for (let i = 0; i < cleanUrls.length; i++) {
    const rawUrl = cleanUrls[i];
    try {
      const parsedUrl = new URL(rawUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 sec timeout

      const response = await fetch(rawUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/webp,image/png,image/jpeg,image/*,*/*',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > 30 * 1024 * 1024) {
        throw new Error('Image exceeds maximum allowed size of 30MB');
      }

      // Validate image format and extract metadata using Sharp
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format || !metadata.width || !metadata.height) {
        throw new Error('Downloaded file is not a recognized image format.');
      }

      // Determine clean filename
      let pathname = parsedUrl.pathname;
      let filename = path.basename(pathname);
      // Remove query string artifacts if any
      filename = filename.split('?')[0].split('#')[0];

      const extFromFmt = metadata.format === 'jpeg' ? '.jpg' : `.${metadata.format}`;
      if (!filename || !path.extname(filename)) {
        filename = `link_image_${Date.now()}_${i + 1}${extFromFmt}`;
      } else {
        const currentExt = path.extname(filename).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(currentExt)) {
          filename = `${path.parse(filename).name}${extFromFmt}`;
        }
      }

      const uniqueFilename = StorageService.generateUniqueFilename(filename);
      const targetFilePath = path.join(originalsDir, uniqueFilename);

      fs.writeFileSync(targetFilePath, buffer);

      const mimeType =
        contentType && contentType.startsWith('image/')
          ? contentType.split(';')[0]
          : `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}`;

      const img = db.addUploadedImage({
        processing_session_id: sessionId,
        user_id: userId,
        original_name: filename,
        temporary_path: targetFilePath,
        mime_type: mimeType,
        file_size: buffer.length,
        width: metadata.width,
        height: metadata.height,
      });

      addedImages.push(img);
    } catch (err: any) {
      console.error(`Failed to import URL ${rawUrl}:`, err.message);
      failedUrls.push({
        url: rawUrl,
        error: err.name === 'AbortError' ? 'Request timed out' : err.message || 'Failed to download image',
      });
    }
  }

  if (addedImages.length > 0) {
    db.touchProcessingSession(sessionId);
    db.logActivity({
      user_id: userId,
      user_email: req.user!.email,
      action: 'IMAGES_IMPORTED_FROM_URLS',
      metadata: { count: addedImages.length, sessionId },
    });
  }

  const allSessionImages = db.getUploadedImagesBySession(sessionId, userId);

  if (addedImages.length === 0) {
    return res.status(400).json({
      error: 'Failed to import any images from the provided links.',
      failedUrls,
    });
  }

  res.json({
    message: `Successfully imported ${addedImages.length} images from links.${
      failedUrls.length > 0 ? ` (${failedUrls.length} links failed)` : ''
    }`,
    addedImages,
    uploadedImages: allSessionImages,
    failedUrls,
  });
});

// 4. Remove single uploaded image
router.delete('/images/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const imageId = req.params.id;

  const success = db.removeUploadedImage(imageId, userId);
  if (!success) {
    return res.status(404).json({ error: 'Image not found.' });
  }

  res.json({ message: 'Image removed from session.' });
});

// 5. Generate instant live watermark preview
router.post('/preview', AuthService.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { imageId, businessId, config } = req.body as {
    imageId: string;
    businessId: string;
    config: WatermarkConfig;
  };

  if (!imageId || !businessId || !config) {
    return res.status(400).json({ error: 'Image ID, Business ID, and Watermark Config are required for preview.' });
  }

  const image = db.getUploadedImageById(imageId, userId);
  if (!image) {
    return res.status(404).json({ error: 'Target image not found in active session.' });
  }

  const business = db.getBusinessById(businessId);
  if (!business || (req.user!.role !== 'admin' && business.user_id !== userId)) {
    return res.status(404).json({ error: 'Business not found.' });
  }

  if (!fs.existsSync(business.logo_path)) {
    return res.status(400).json({ error: 'Business logo file is missing.' });
  }

  try {
    const previewResult = await ImageProcessingService.generatePreview(
      image.temporary_path,
      business.logo_path,
      config
    );
    res.json(previewResult);
  } catch (err: any) {
    console.error('Preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate preview.' });
  }
});

// 6. Execute batch watermark with chosen format (WebP, PNG, JPEG, AVIF)
router.post('/execute', AuthService.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId, businessId, config } = req.body as {
    sessionId: string;
    businessId: string;
    config: WatermarkConfig;
  };

  if (!sessionId || !businessId || !config) {
    return res.status(400).json({ error: 'Session ID, Business ID, and Config are required.' });
  }

  const session = db.getProcessingSession(sessionId, userId);
  if (!session) {
    return res.status(404).json({ error: 'Session expired. Please re-upload your images.' });
  }

  const business = db.getBusinessById(businessId);
  if (!business || (req.user!.role !== 'admin' && business.user_id !== userId)) {
    return res.status(404).json({ error: 'Selected business not found.' });
  }

  if (!fs.existsSync(business.logo_path)) {
    return res.status(400).json({ error: 'Business logo not found on server.' });
  }

  const originalImages = db.getUploadedImagesBySession(sessionId, userId);
  if (originalImages.length === 0) {
    return res.status(400).json({ error: 'No images available to process in this session.' });
  }

  const outputFormat = config.output_format || 'original';
  const effectiveQuality = Math.max(1, Math.min(100, Math.round(config.quality || config.webp_quality || 85)));

  // Create new processing job
  const job = db.createProcessingJob({
    user_id: userId,
    processing_session_id: sessionId,
    business_id: business.id,
    business_name: business.name,
    output_format: outputFormat,
    quality: effectiveQuality,
    opacity: config.opacity ?? 50,
    position: config.position || 'center',
    logo_size: config.logo_size ?? 50,
    margin: config.margin ?? 20,
    rotation: config.rotation || 0,
    total_images: originalImages.length,
  });

  db.updateProcessingJob(job.id, { status: 'processing' });

  const processedDir = StorageService.getJobProcessedDir(sessionId, business.id, job.id);
  const processedResults = [];
  let completedCount = 0;
  let failedCount = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  for (let i = 0; i < originalImages.length; i++) {
    const orig = originalImages[i];
    totalInputBytes += orig.file_size || 0;
    try {
      const origExt = (path.extname(orig.original_name) || '').toLowerCase();
      let currentImageFormat = outputFormat;
      let currentFileExt = origExt || '.png';

      if (outputFormat === 'original') {
        if (origExt === '.png' || orig.mime_type === 'image/png') {
          currentImageFormat = 'png';
          currentFileExt = '.png';
        } else if (origExt === '.jpg' || origExt === '.jpeg' || orig.mime_type === 'image/jpeg') {
          currentImageFormat = 'jpeg';
          currentFileExt = origExt === '.jpeg' ? '.jpeg' : '.jpg';
        } else if (origExt === '.webp' || orig.mime_type === 'image/webp') {
          currentImageFormat = 'webp';
          currentFileExt = '.webp';
        } else if (origExt === '.avif' || orig.mime_type === 'image/avif') {
          currentImageFormat = 'avif';
          currentFileExt = '.avif';
        } else {
          currentImageFormat = 'png';
          currentFileExt = '.png';
        }
      } else {
        if (outputFormat === 'png') currentFileExt = '.png';
        else if (outputFormat === 'jpeg') currentFileExt = '.jpg';
        else if (outputFormat === 'avif') currentFileExt = '.avif';
        else currentFileExt = '.webp';
      }

      // Output filename matches exact original file name (or original base name with selected format extension)
      let outputFilename = orig.original_name;
      if (outputFormat !== 'original') {
        const parsed = path.parse(orig.original_name);
        outputFilename = `${parsed.name}${currentFileExt}`;
      }

      const outputPath = path.join(processedDir, `${orig.id}_${outputFilename}`);

      const result = await ImageProcessingService.processImage(
        orig.temporary_path,
        business.logo_path,
        { ...config, output_format: currentImageFormat as any, quality: effectiveQuality, logo_size: config.logo_size ?? 50 },
        outputPath,
        outputFilename
      );

      const processedRecord = db.addProcessedImage({
        processing_job_id: job.id,
        original_image_id: orig.id,
        user_id: userId,
        original_filename: orig.original_name,
        output_path: result.outputPath,
        output_filename: result.outputFilename,
        output_format: currentImageFormat as any,
        file_size: result.fileSize,
        original_file_size: orig.file_size,
        width: result.width,
        height: result.height,
        expires_at: job.expires_at,
      });

      totalOutputBytes += result.fileSize;
      processedResults.push(processedRecord);
      completedCount++;
    } catch (err: any) {
      console.error(`Failed to process image ${orig.original_name}:`, err);
      failedCount++;
    }
  }

  // Generate ZIP file for the completed batch
  let zipInfo: { zipPath: string; zipFilename: string } | null = null;
  if (processedResults.length > 0) {
    try {
      zipInfo = await ZipService.createZipArchive(processedResults, business.name, job.id);
    } catch (err) {
      console.error('Failed to create batch ZIP:', err);
    }
  }

  const finalJob = db.updateProcessingJob(job.id, {
    status: completedCount > 0 ? 'completed' : 'failed',
    completed_images: completedCount,
    failed_images: failedCount,
    completed_at: new Date().toISOString(),
    zip_path: zipInfo?.zipPath,
    zip_filename: zipInfo?.zipFilename,
  });

  db.touchProcessingSession(sessionId);

  db.logActivity({
    user_id: userId,
    user_email: req.user!.email,
    action: 'JOB_PROCESSED',
    metadata: {
      jobId: job.id,
      businessName: business.name,
      outputFormat,
      total: originalImages.length,
      completed: completedCount,
      failed: failedCount,
      totalInputBytes,
      totalOutputBytes,
    },
  });

  const compressionSavingsPct =
    totalInputBytes > 0 ? Math.max(0, Math.round((1 - totalOutputBytes / totalInputBytes) * 100)) : 0;

  res.json({
    message: `Successfully processed ${completedCount} of ${originalImages.length} images to ${outputFormat.toUpperCase()}.`,
    job: finalJob,
    processedImages: processedResults,
    stats: {
      totalInputBytes,
      totalOutputBytes,
      compressionSavingsPct,
      format: outputFormat,
    },
  });
});

// 7. Get Job Details & Processed Images
router.get('/jobs/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const jobId = req.params.id;

  const job = db.getProcessingJob(jobId, req.user!.role === 'admin' ? undefined : userId);
  if (!job) {
    return res.status(404).json({ error: 'Processing job not found or expired.' });
  }

  const processedImages = db.getProcessedImagesByJob(jobId, req.user!.role === 'admin' ? undefined : userId);
  res.json({ job, processedImages });
});

// 8. Secure download individual processed image (PNG, JPEG, WebP, AVIF)
router.get('/download/image/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const imageId = req.params.id;

  const processed = db.getProcessedImageById(imageId, req.user!.role === 'admin' ? undefined : userId);
  if (!processed) {
    return res.status(404).json({ error: 'Processed image not found or expired.' });
  }

  if (!fs.existsSync(processed.output_path)) {
    return res.status(404).json({ error: 'Image file has expired and was cleaned from temporary storage.' });
  }

  const ext = path.extname(processed.output_filename).toLowerCase();
  let contentType = 'image/png';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.avif') contentType = 'image/avif';

  const stat = fs.statSync(processed.output_path);
  const cleanFilename = processed.output_filename.replace(/[^\w.-]/g, '_');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${cleanFilename}"; filename*=UTF-8''${encodeURIComponent(processed.output_filename)}`
  );
  res.setHeader('Cache-Control', 'no-cache, private');
  fs.createReadStream(processed.output_path).pipe(res);
});

// 9. Secure download batch ZIP archive
router.get('/download/zip/:jobId', AuthService.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const jobId = req.params.jobId;

  const job = db.getProcessingJob(jobId, req.user!.role === 'admin' ? undefined : userId);
  if (!job) {
    return res.status(404).json({ error: 'Processing job not found.' });
  }

  // If zip does not exist on disk, attempt to re-generate it on the fly
  if (!job.zip_path || !fs.existsSync(job.zip_path)) {
    const processedImages = db.getProcessedImagesByJob(job.id, req.user!.role === 'admin' ? undefined : userId);
    if (!processedImages || processedImages.length === 0) {
      return res.status(404).json({ error: 'No processed images found for this job.' });
    }

    try {
      const zipResult = await ZipService.createZipArchive(
        processedImages,
        job.business_name || 'Watermarked',
        job.id
      );
      job.zip_path = zipResult.zipPath;
      job.zip_filename = zipResult.zipFilename;
      db.updateProcessingJob(job.id, {
        zip_path: zipResult.zipPath,
        zip_filename: zipResult.zipFilename,
      });
    } catch (zipErr) {
      console.error('Error generating on-the-fly ZIP archive:', zipErr);
      return res.status(500).json({ error: 'Failed to generate ZIP archive.' });
    }
  }

  if (!fs.existsSync(job.zip_path)) {
    return res.status(404).json({ error: 'ZIP file could not be created.' });
  }

  const filename = job.zip_filename || `Watermarked_Images_${job.id}.zip`;
  const stat = fs.statSync(job.zip_path);
  const cleanZipName = filename.replace(/[^\w.-]/g, '_');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${cleanZipName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'no-cache, private');
  fs.createReadStream(job.zip_path).pipe(res);
});

// 10. Serve thumbnail of uploaded original image
router.get('/original-preview/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const imageId = req.params.id;

  const orig = db.getUploadedImageById(imageId, req.user!.role === 'admin' ? undefined : userId);
  if (!orig || !fs.existsSync(orig.temporary_path)) {
    return res.status(404).json({ error: 'Original image not found.' });
  }

  res.setHeader('Content-Type', orig.mime_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(orig.temporary_path).pipe(res);
});

// 11. Serve preview of processed image
router.get('/processed-preview/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const imageId = req.params.id;

  const proc = db.getProcessedImageById(imageId, req.user!.role === 'admin' ? undefined : userId);
  if (!proc || !fs.existsSync(proc.output_path)) {
    return res.status(404).json({ error: 'Processed image not found.' });
  }

  const ext = path.extname(proc.output_filename).toLowerCase();
  let contentType = 'image/webp';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.avif') contentType = 'image/avif';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(proc.output_path).pipe(res);
});

// 12. User processing history
router.get('/history', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const jobs = db.getProcessingJobsByUser(userId);
  res.json({ jobs });
});

export default router;

import sharp from 'sharp';
import fs from 'fs';
import { WatermarkConfig, WatermarkPosition } from '../types';

export interface ProcessImageResult {
  outputPath: string;
  outputFilename: string;
  outputFormat: string;
  fileSize: number;
  width: number;
  height: number;
}

export interface PreviewResult {
  dataUri: string;
  width: number;
  height: number;
  previewFileSize: number;
  estimatedFullFileSize: number;
  outputFormat: string;
  quality: number;
}

export class ImageProcessingService {
  /**
   * Helper to calculate (x, y) coordinates for the watermark
   */
  private static calculatePosition(
    position: WatermarkPosition,
    imgWidth: number,
    imgHeight: number,
    logoWidth: number,
    logoHeight: number,
    margin: number
  ): { left: number; top: number } {
    let left = margin;
    let top = margin;

    const maxLeft = Math.max(0, imgWidth - logoWidth);
    const maxTop = Math.max(0, imgHeight - logoHeight);

    switch (position) {
      case 'top-left':
        left = margin;
        top = margin;
        break;
      case 'top-center':
        left = Math.round((imgWidth - logoWidth) / 2);
        top = margin;
        break;
      case 'top-right':
        left = imgWidth - logoWidth - margin;
        top = margin;
        break;
      case 'center-left':
        left = margin;
        top = Math.round((imgHeight - logoHeight) / 2);
        break;
      case 'center':
        left = Math.round((imgWidth - logoWidth) / 2);
        top = Math.round((imgHeight - logoHeight) / 2);
        break;
      case 'center-right':
        left = imgWidth - logoWidth - margin;
        top = Math.round((imgHeight - logoHeight) / 2);
        break;
      case 'bottom-left':
        left = margin;
        top = imgHeight - logoHeight - margin;
        break;
      case 'bottom-center':
        left = Math.round((imgWidth - logoWidth) / 2);
        top = imgHeight - logoHeight - margin;
        break;
      case 'bottom-right':
      default:
        left = imgWidth - logoWidth - margin;
        top = imgHeight - logoHeight - margin;
        break;
    }

    // Clamp inside image bounds
    left = Math.max(0, Math.min(maxLeft, Math.round(left)));
    top = Math.max(0, Math.min(maxTop, Math.round(top)));

    return { left, top };
  }

  /**
   * Prepare a watermark logo buffer with target size, rotation, opacity, and background card
   * Powered by Native Sharp (Zero AI / 100% Client Privacy)
   */
  private static async prepareLogoBuffer(
    logoPath: string,
    targetLogoWidth: number,
    opacityPercentage: number,
    rotation: number,
    bgMode?: string
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo file not found at path: ${logoPath}`);
    }

    const safeTargetWidth = Math.max(16, Math.min(4000, Math.round(targetLogoWidth)));

    // 1. Initial resize of the logo
    let logoPipeline = sharp(logoPath).resize({
      width: safeTargetWidth,
      fit: 'inside',
      withoutEnlargement: false,
    });

    // 2. Rotate if needed
    if (rotation && rotation !== 0) {
      logoPipeline = logoPipeline.rotate(rotation, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    const resizedLogoPng = await logoPipeline.png().toBuffer();
    const logoMeta = await sharp(resizedLogoPng).metadata();
    const logoW = logoMeta.width || safeTargetWidth;
    const logoH = logoMeta.height || Math.round(safeTargetWidth / 2);

    // 3. Apply opacity and optional white-card wrapper using SVG composite
    const opacityRatio = Math.max(0.05, Math.min(1.0, opacityPercentage / 100));
    const base64Logo = resizedLogoPng.toString('base64');

    const padding = bgMode === 'white-card' ? 12 : 0;
    const svgW = logoW + padding * 2;
    const svgH = logoH + padding * 2;

    const backgroundRect =
      bgMode === 'white-card'
        ? `<rect width="${svgW}" height="${svgH}" rx="10" fill="#FFFFFF" fill-opacity="${opacityRatio * 0.92}" stroke="#E2E8F0" stroke-width="1" stroke-opacity="${opacityRatio * 0.8}"/>`
        : '';

    const svgWrapper = `
      <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
        ${backgroundRect}
        <g opacity="${opacityRatio}">
          <image href="data:image/png;base64,${base64Logo}" x="${padding}" y="${padding}" width="${logoW}" height="${logoH}" />
        </g>
      </svg>
    `;

    const finalLogoBuffer = await sharp(Buffer.from(svgWrapper)).png().toBuffer();
    return {
      buffer: finalLogoBuffer,
      width: svgW,
      height: svgH,
    };
  }

  /**
   * Process a single original image and watermark it with native Sharp (No AI)
   * Supports WebP, PNG, JPEG, and AVIF output formats
   */
  static async processImage(
    originalImagePath: string,
    logoPath: string,
    config: WatermarkConfig,
    outputPath: string,
    outputFilename: string
  ): Promise<ProcessImageResult> {
    if (!fs.existsSync(originalImagePath)) {
      throw new Error(`Original image not found: ${originalImagePath}`);
    }

    // 1. Read base image metadata
    const baseImage = sharp(originalImagePath).rotate(); // auto-orient
    const baseMeta = await baseImage.metadata();
    const origWidth = baseMeta.width || 1200;
    const origHeight = baseMeta.height || 800;

    // 2. Compute target logo width based on user percentage (default 50%)
    const sizePercentage = Math.max(5, Math.min(100, config.logo_size ?? 50));
    const targetLogoWidth = Math.round((origWidth * sizePercentage) / 100);

    // 3. Prepare watermark overlay
    const preparedLogo = await this.prepareLogoBuffer(
      logoPath,
      targetLogoWidth,
      config.opacity,
      config.rotation || 0,
      config.bg_mode
    );

    // 4. Calculate watermark placement coordinates
    const margin = Math.max(0, config.margin ?? 20);
    const coords = this.calculatePosition(
      config.position,
      origWidth,
      origHeight,
      preparedLogo.width,
      preparedLogo.height,
      margin
    );

    // 5. Composite and convert to chosen Output Format
    let outputFormat = config.output_format || 'original';
    if (outputFormat === 'original') {
      const ext = (outputFilename.split('.').pop() || '').toLowerCase();
      const metaFmt = (baseMeta.format as string || '').toLowerCase();
      if (ext === 'png' || metaFmt === 'png') outputFormat = 'png';
      else if (ext === 'jpg' || ext === 'jpeg' || metaFmt === 'jpeg' || metaFmt === 'jpg') outputFormat = 'jpeg';
      else if (ext === 'webp' || metaFmt === 'webp') outputFormat = 'webp';
      else if (ext === 'avif' || metaFmt === 'avif' || metaFmt === 'heif') outputFormat = 'avif';
      else outputFormat = 'png';
    }

    const effectiveQuality = Math.max(1, Math.min(100, Math.round(config.quality || config.webp_quality || 85)));

    let pipeline = sharp(originalImagePath)
      .rotate()
      .toColorspace('srgb')
      .composite([
        {
          input: preparedLogo.buffer,
          left: coords.left,
          top: coords.top,
        },
      ]);

    if (outputFormat === 'png') {
      pipeline = pipeline.png({
        quality: effectiveQuality,
        compressionLevel: 7,
        adaptiveFiltering: true,
        force: true,
      });
    } else if (outputFormat === 'jpeg') {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({
        quality: effectiveQuality,
        mozjpeg: true,
        force: true,
      });
    } else if (outputFormat === 'avif') {
      pipeline = pipeline.avif({
        quality: effectiveQuality,
        effort: 4,
        force: true,
      });
    } else {
      // WebP
      pipeline = pipeline.webp({
        quality: effectiveQuality,
        effort: 4,
        force: true,
      });
    }

    await pipeline.toFile(outputPath);

    // 6. Gather output stats
    const outputMeta = await sharp(outputPath).metadata();
    const stats = fs.statSync(outputPath);

    return {
      outputPath,
      outputFilename,
      outputFormat,
      fileSize: stats.size,
      width: outputMeta.width || origWidth,
      height: outputMeta.height || origHeight,
    };
  }

  /**
   * Fast preview generation for real-time interactive preview
   * Returns dataUri, exact dimensions, and output size metrics
   */
  static async generatePreview(
    originalImagePath: string,
    logoPath: string,
    config: WatermarkConfig
  ): Promise<PreviewResult> {
    if (!fs.existsSync(originalImagePath)) {
      throw new Error('Image not found for preview');
    }

    // Downscale preview image to max 1200px for instant sub-50ms responsiveness
    const maxPreviewDim = 1200;
    const origMeta = await sharp(originalImagePath).rotate().metadata();
    const origW = origMeta.width || 1200;
    const origH = origMeta.height || 800;

    let scaleFactor = 1.0;
    let previewW = origW;
    let previewH = origH;

    if (origW > maxPreviewDim || origH > maxPreviewDim) {
      if (origW >= origH) {
        scaleFactor = maxPreviewDim / origW;
        previewW = maxPreviewDim;
        previewH = Math.round(origH * scaleFactor);
      } else {
        scaleFactor = maxPreviewDim / origH;
        previewH = maxPreviewDim;
        previewW = Math.round(origW * scaleFactor);
      }
    }

    const scaledBaseBuffer = await sharp(originalImagePath)
      .rotate()
      .resize({ width: previewW, height: previewH, fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const sizePercentage = Math.max(5, Math.min(100, config.logo_size ?? 50));
    const targetLogoWidth = Math.round((previewW * sizePercentage) / 100);

    const preparedLogo = await this.prepareLogoBuffer(
      logoPath,
      targetLogoWidth,
      config.opacity,
      config.rotation || 0,
      config.bg_mode
    );

    const scaledMargin = Math.round((config.margin ?? 20) * scaleFactor);
    const coords = this.calculatePosition(
      config.position,
      previewW,
      previewH,
      preparedLogo.width,
      preparedLogo.height,
      scaledMargin
    );

    let outputFormat = config.output_format || 'original';
    if (outputFormat === 'original') {
      const origFmt = (origMeta.format as string || '').toLowerCase();
      if (origFmt === 'png') outputFormat = 'png';
      else if (origFmt === 'jpeg' || origFmt === 'jpg') outputFormat = 'jpeg';
      else if (origFmt === 'webp') outputFormat = 'webp';
      else if (origFmt === 'avif' || origFmt === 'heif') outputFormat = 'avif';
      else outputFormat = 'png';
    }

    const effectiveQuality = Math.max(1, Math.min(100, Math.round(config.quality || config.webp_quality || 85)));

    let previewPipeline = sharp(scaledBaseBuffer)
      .toColorspace('srgb')
      .composite([
        {
          input: preparedLogo.buffer,
          left: coords.left,
          top: coords.top,
        },
      ]);

    let mimeType = 'image/webp';
    if (outputFormat === 'png') {
      previewPipeline = previewPipeline.png({ quality: effectiveQuality, force: true });
      mimeType = 'image/png';
    } else if (outputFormat === 'jpeg') {
      previewPipeline = previewPipeline.flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: effectiveQuality, mozjpeg: true, force: true });
      mimeType = 'image/jpeg';
    } else if (outputFormat === 'avif') {
      previewPipeline = previewPipeline.avif({ quality: effectiveQuality, effort: 2, force: true });
      mimeType = 'image/avif';
    } else {
      previewPipeline = previewPipeline.webp({ quality: effectiveQuality, force: true });
      mimeType = 'image/webp';
    }

    const watermarkedBuffer = await previewPipeline.toBuffer();
    const previewFileSize = watermarkedBuffer.length;

    // Estimate full output size based on original pixel area ratio
    const areaMultiplier = (origW * origH) / Math.max(1, previewW * previewH);
    const estimatedFullFileSize = Math.round(previewFileSize * Math.pow(areaMultiplier, 0.75));

    const dataUri = `data:${mimeType};base64,${watermarkedBuffer.toString('base64')}`;
    return {
      dataUri,
      width: origW,
      height: origH,
      previewFileSize,
      estimatedFullFileSize,
      outputFormat,
      quality: effectiveQuality,
    };
  }

  /**
   * Helper to inspect image dimensions and metadata upon upload
   */
  static async getImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
    try {
      const meta = await sharp(filePath).rotate().metadata();
      return {
        width: meta.width || 0,
        height: meta.height || 0,
      };
    } catch {
      return { width: 0, height: 0 };
    }
  }
}

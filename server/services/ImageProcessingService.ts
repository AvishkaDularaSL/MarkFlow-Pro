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
}

export class ImageProcessingService {
  /**
   * Helper to calculate target upscale dimensions based on mode and constraints (Non-AI)
   */
  public static calculateTargetDimensions(
    origWidth: number,
    origHeight: number,
    config: WatermarkConfig
  ): { width: number; height: number; isUpscaled: boolean; scaleFactor: number } {
    if (!config.upscale || !config.upscale.enabled) {
      return { width: origWidth, height: origHeight, isUpscaled: false, scaleFactor: 1.0 };
    }

    const up = config.upscale;
    let targetW = origWidth;
    let targetH = origHeight;

    if (up.mode === 'scale') {
      const factor = Math.max(1, Math.min(8, up.scale || 2));
      targetW = Math.round(origWidth * factor);
      targetH = Math.round(origHeight * factor);
      return { width: targetW, height: targetH, isUpscaled: factor > 1, scaleFactor: factor };
    }

    if (up.mode === 'preset') {
      let pw = 1920;
      let ph = 1080;
      if (up.preset === '2k') { pw = 2560; ph = 1440; }
      else if (up.preset === '4k') { pw = 3840; ph = 2160; }
      else if (up.preset === 'instagram') { pw = 1080; ph = 1080; }
      else if (up.preset === 'ecommerce') { pw = 2048; ph = 2048; }

      if (up.maintain_aspect_ratio) {
        const origAspect = origWidth / origHeight;
        const targetAspect = pw / ph;
        if (origAspect > targetAspect) {
          targetW = pw;
          targetH = Math.max(1, Math.round(pw / origAspect));
        } else {
          targetH = ph;
          targetW = Math.max(1, Math.round(ph * origAspect));
        }
      } else {
        targetW = pw;
        targetH = ph;
      }

      const factor = Number((targetW / origWidth).toFixed(2));
      return {
        width: targetW,
        height: targetH,
        isUpscaled: targetW > origWidth || targetH > origHeight,
        scaleFactor: factor,
      };
    }

    if (up.mode === 'custom') {
      const cw = Math.max(32, Math.min(12000, up.custom_width || origWidth * 2));
      const ch = Math.max(32, Math.min(12000, up.custom_height || origHeight * 2));

      if (up.maintain_aspect_ratio) {
        const origAspect = origWidth / origHeight;
        const targetAspect = cw / ch;
        if (origAspect > targetAspect) {
          targetW = cw;
          targetH = Math.max(1, Math.round(cw / origAspect));
        } else {
          targetH = ch;
          targetW = Math.max(1, Math.round(ch * origAspect));
        }
      } else {
        targetW = cw;
        targetH = ch;
      }

      const factor = Number((targetW / origWidth).toFixed(2));
      return {
        width: targetW,
        height: targetH,
        isUpscaled: targetW > origWidth || targetH > origHeight,
        scaleFactor: factor,
      };
    }

    return { width: origWidth, height: origHeight, isUpscaled: false, scaleFactor: 1.0 };
  }

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

    const safeTargetWidth = Math.max(8, Math.min(8000, Math.round(targetLogoWidth)));

    // Calculate inner dimensions accounting for card padding
    const padding = bgMode === 'white-card' ? Math.max(6, Math.round(safeTargetWidth * 0.04)) : 0;
    const innerTargetWidth = Math.max(8, safeTargetWidth - padding * 2);

    // 1. Initial pipeline - Rotate FIRST so the rotated bounding box is accurately scaled to target width
    let logoPipeline = sharp(logoPath).rotate(); // auto-orient
    if (rotation && rotation !== 0) {
      logoPipeline = logoPipeline.rotate(rotation, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    // 2. Resize rotated logo to fit inner target width
    logoPipeline = logoPipeline.resize({
      width: innerTargetWidth,
      fit: 'inside',
      withoutEnlargement: false,
    });

    const resizedLogoPng = await logoPipeline.png().toBuffer();
    const logoMeta = await sharp(resizedLogoPng).metadata();
    const logoW = logoMeta.width || innerTargetWidth;
    const logoH = logoMeta.height || Math.round(innerTargetWidth / 2);

    // 3. Apply opacity and optional white-card wrapper using SVG composite
    const opacityRatio = Math.max(0.05, Math.min(1.0, opacityPercentage / 100));
    const base64Logo = resizedLogoPng.toString('base64');

    const svgW = logoW + padding * 2;
    const svgH = logoH + padding * 2;

    const backgroundRect =
      bgMode === 'white-card'
        ? `<rect width="${svgW}" height="${svgH}" rx="${Math.max(4, Math.round(svgW * 0.03))}" fill="#FFFFFF" fill-opacity="${opacityRatio * 0.92}" stroke="#E2E8F0" stroke-width="1" stroke-opacity="${opacityRatio * 0.8}"/>`
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
   * Intelligently compress a composited buffer to meet or stay within a target file size in bytes
   * Iterates quality level and dimensions to achieve target size with optimal image fidelity
   */
  private static async compressBufferToTarget(
    compositedInput: Buffer,
    format: string,
    targetBytes: number,
    baseWidth: number,
    baseHeight: number
  ): Promise<{ buffer: Buffer; finalQuality: number; finalWidth: number; finalHeight: number }> {
    const encodeBuffer = async (q: number, resizeW?: number) => {
      let pipeline = sharp(compositedInput);
      if (resizeW && resizeW < baseWidth) {
        pipeline = pipeline.resize({ width: resizeW, fit: 'inside' });
      }
      if (format === 'png') {
        if (q < 90) {
          pipeline = pipeline.png({
            palette: true,
            quality: Math.max(10, q),
            compressionLevel: 9,
            force: true,
          });
        } else {
          pipeline = pipeline.png({
            compressionLevel: 9,
            adaptiveFiltering: true,
            force: true,
          });
        }
      } else if (format === 'jpeg') {
        pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({
          quality: Math.max(5, q),
          mozjpeg: true,
          force: true,
        });
      } else if (format === 'avif') {
        pipeline = pipeline.avif({
          quality: Math.max(5, q),
          effort: 3,
          force: true,
        });
      } else {
        // webp
        pipeline = pipeline.webp({
          quality: Math.max(5, q),
          effort: 4,
          force: true,
        });
      }
      return await pipeline.toBuffer();
    };

    // 1. Check if high quality already fits within targetBytes
    const highBuf = await encodeBuffer(92);
    if (highBuf.length <= targetBytes) {
      const topBuf = await encodeBuffer(98);
      if (topBuf.length <= targetBytes) {
        return { buffer: topBuf, finalQuality: 98, finalWidth: baseWidth, finalHeight: baseHeight };
      }
      return { buffer: highBuf, finalQuality: 92, finalWidth: baseWidth, finalHeight: baseHeight };
    }

    // 2. Binary search on quality between 10 and 90
    let lowQ = 10;
    let highQ = 90;
    let bestBuffer: Buffer = highBuf;
    let bestQuality = 90;
    let foundUnderTarget = false;

    for (let iter = 0; iter < 6; iter++) {
      const midQ = Math.round((lowQ + highQ) / 2);
      const candBuf = await encodeBuffer(midQ);
      if (candBuf.length <= targetBytes) {
        bestBuffer = candBuf;
        bestQuality = midQ;
        foundUnderTarget = true;
        lowQ = midQ + 1; // test if higher quality can still fit
      } else {
        highQ = midQ - 1;
        if (!foundUnderTarget) {
          if (candBuf.length < bestBuffer.length) {
            bestBuffer = candBuf;
            bestQuality = midQ;
          }
        }
      }
      if (lowQ > highQ) break;
    }

    // 3. If even at lowest quality it still exceeds target, downscale dimensions smoothly
    if (bestBuffer.length > targetBytes * 1.02) {
      let currentW = baseWidth;
      for (let scaleAttempt = 0; scaleAttempt < 3; scaleAttempt++) {
        const ratio = Math.sqrt(targetBytes / bestBuffer.length);
        const newW = Math.max(240, Math.round(currentW * Math.min(0.92, ratio)));
        if (newW >= currentW) break;
        currentW = newW;
        const resizedBuf = await encodeBuffer(Math.max(45, bestQuality), currentW);
        bestBuffer = resizedBuf;
        if (bestBuffer.length <= targetBytes) {
          break;
        }
      }
    }

    const finalMeta = await sharp(bestBuffer).metadata();
    return {
      buffer: bestBuffer,
      finalQuality: bestQuality,
      finalWidth: finalMeta.width || baseWidth,
      finalHeight: finalMeta.height || baseHeight,
    };
  }

  /**
   * Process a single original image and upscale/watermark it with native Sharp (100% Non-AI)
   * Supports WebP, PNG, JPEG, and AVIF output formats, Target File Size compression, and algorithmic upscaling
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
    const baseMeta = await sharp(originalImagePath).rotate().metadata();
    const origWidth = baseMeta.width || 1200;
    const origHeight = baseMeta.height || 800;

    // 2. Calculate target dimensions (Upscale or original)
    const targetDim = this.calculateTargetDimensions(origWidth, origHeight, config);
    const finalWidth = targetDim.width;
    const finalHeight = targetDim.height;
    const isUpscale = targetDim.isUpscaled;

    // 3. Build base Sharp pipeline with non-AI algorithmic resampling
    let pipeline = sharp(originalImagePath).rotate().toColorspace('srgb');

    if (isUpscale && config.upscale) {
      const up = config.upscale;
      // Pre-scale de-noising to eliminate JPEG compression blockiness before magnification
      if (up.denoise) {
        pipeline = pipeline.median(1);
      }

      // Algorithmic Resampling Kernel
      const kernelMap: Record<string, any> = {
        lanczos3: sharp.kernel.lanczos3,
        mitchell: sharp.kernel.mitchell,
        cubic: sharp.kernel.cubic,
        nearest: sharp.kernel.nearest,
        linear: sharp.kernel.linear,
      };
      const kernel = kernelMap[up.kernel] || sharp.kernel.lanczos3;

      pipeline = pipeline.resize({
        width: finalWidth,
        height: finalHeight,
        fit: 'fill',
        kernel,
        withoutEnlargement: false,
        fastShrinkOnLoad: false,
      });

      // Post-upscale Unsharp Mask Edge Enhancement
      if (up.sharpen) {
        const level = up.sharpen_amount || 2;
        const sigma = level === 1 ? 0.8 : level === 2 ? 1.2 : level === 3 ? 1.8 : 2.5;
        const m1 = level === 1 ? 1.0 : level === 2 ? 1.4 : level === 3 ? 2.0 : 2.6;
        pipeline = pipeline.sharpen({ sigma, m1, m2: 2.0 });
      }

      // Contrast & Dynamic Range Optimization
      if (up.enhance_contrast) {
        pipeline = pipeline.normalize();
      }
    }

    // 4. Check if watermark is enabled and composite if requested
    const hasWatermark = config.watermark_enabled !== false && !!logoPath && fs.existsSync(logoPath);
    if (hasWatermark) {
      const sizePercentage = Math.max(1, Math.min(100, config.logo_size ?? 50));
      const targetLogoWidth = Math.round((finalWidth * sizePercentage) / 100);

      const preparedLogo = await this.prepareLogoBuffer(
        logoPath,
        targetLogoWidth,
        config.opacity,
        config.rotation || 0,
        config.bg_mode
      );

      const margin = Math.max(0, config.margin ?? 20);
      const marginScale = isUpscale ? (finalWidth / origWidth) : 1;
      const effectiveMargin = Math.round(margin * marginScale);

      const coords = this.calculatePosition(
        config.position,
        finalWidth,
        finalHeight,
        preparedLogo.width,
        preparedLogo.height,
        effectiveMargin
      );

      pipeline = pipeline.composite([
        {
          input: preparedLogo.buffer,
          left: coords.left,
          top: coords.top,
        },
      ]);
    }

    // 5. Determine chosen Output Format
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

    // Branch A: Target File Size compression mode
    if (config.compression_mode === 'target_size' && config.target_file_size_kb && config.target_file_size_kb > 0) {
      const targetBytes = Math.round(config.target_file_size_kb * 1024);
      const compositedBuffer = await pipeline.toBuffer();

      const compressed = await this.compressBufferToTarget(
        compositedBuffer,
        outputFormat,
        targetBytes,
        finalWidth,
        finalHeight
      );

      fs.writeFileSync(outputPath, compressed.buffer);

      return {
        outputPath,
        outputFilename,
        outputFormat,
        fileSize: compressed.buffer.length,
        width: compressed.finalWidth,
        height: compressed.finalHeight,
      };
    }

    // Branch B: Standard Quality Percentage compression mode
    const effectiveQuality = Math.max(1, Math.min(100, Math.round(config.quality || config.webp_quality || 85)));

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
      width: outputMeta.width || finalWidth,
      height: outputMeta.height || finalHeight,
    };
  }

  /**
   * Fast preview generation for real-time interactive preview
   * Renders algorithmic upscaling & watermark with live dimension calculation
   */
  static async generatePreview(
    originalImagePath: string,
    logoPath: string,
    config: WatermarkConfig
  ): Promise<PreviewResult> {
    if (!fs.existsSync(originalImagePath)) {
      throw new Error('Image not found for preview');
    }

    const origMeta = await sharp(originalImagePath).rotate().metadata();
    const origW = origMeta.width || 1200;
    const origH = origMeta.height || 800;

    // 1. Calculate full upscaled / target dimensions
    const targetDim = this.calculateTargetDimensions(origW, origH, config);
    const fullTargetW = targetDim.width;
    const fullTargetH = targetDim.height;
    const isUpscale = targetDim.isUpscaled;

    // 2. Downscale preview canvas to max 1200px for sub-50ms responsiveness
    const maxPreviewDim = 1200;
    let previewScale = 1.0;
    let previewW = fullTargetW;
    let previewH = fullTargetH;

    if (fullTargetW > maxPreviewDim || fullTargetH > maxPreviewDim) {
      if (fullTargetW >= fullTargetH) {
        previewScale = maxPreviewDim / fullTargetW;
        previewW = maxPreviewDim;
        previewH = Math.max(1, Math.round(fullTargetH * previewScale));
      } else {
        previewScale = maxPreviewDim / fullTargetH;
        previewH = maxPreviewDim;
        previewW = Math.max(1, Math.round(fullTargetW * previewScale));
      }
    }

    // 3. Build preview pipeline with exact kernel simulation
    let previewPipeline = sharp(originalImagePath).rotate().toColorspace('srgb');

    if (isUpscale && config.upscale) {
      const up = config.upscale;
      if (up.denoise) {
        previewPipeline = previewPipeline.median(1);
      }

      const kernelMap: Record<string, any> = {
        lanczos3: sharp.kernel.lanczos3,
        mitchell: sharp.kernel.mitchell,
        cubic: sharp.kernel.cubic,
        nearest: sharp.kernel.nearest,
        linear: sharp.kernel.linear,
      };
      const kernel = kernelMap[up.kernel] || sharp.kernel.lanczos3;

      previewPipeline = previewPipeline.resize({
        width: previewW,
        height: previewH,
        fit: 'fill',
        kernel,
        withoutEnlargement: false,
      });

      if (up.sharpen) {
        const level = up.sharpen_amount || 2;
        const sigma = level === 1 ? 0.8 : level === 2 ? 1.2 : level === 3 ? 1.8 : 2.5;
        const m1 = level === 1 ? 1.0 : level === 2 ? 1.4 : level === 3 ? 2.0 : 2.6;
        previewPipeline = previewPipeline.sharpen({ sigma, m1, m2: 2.0 });
      }

      if (up.enhance_contrast) {
        previewPipeline = previewPipeline.normalize();
      }
    } else {
      previewPipeline = previewPipeline.resize({ width: previewW, height: previewH, fit: 'inside' });
    }

    // 4. Composite watermark if enabled and logo file exists
    const hasWatermark = config.watermark_enabled !== false && !!logoPath && fs.existsSync(logoPath);
    if (hasWatermark) {
      const sizePercentage = Math.max(1, Math.min(100, config.logo_size ?? 50));
      const targetLogoWidth = Math.round((previewW * sizePercentage) / 100);

      const preparedLogo = await this.prepareLogoBuffer(
        logoPath,
        targetLogoWidth,
        config.opacity,
        config.rotation || 0,
        config.bg_mode
      );

      const scaledMargin = Math.round((config.margin ?? 20) * previewScale * (isUpscale ? (fullTargetW / origW) : 1));
      const coords = this.calculatePosition(
        config.position,
        previewW,
        previewH,
        preparedLogo.width,
        preparedLogo.height,
        scaledMargin
      );

      previewPipeline = previewPipeline.composite([
        {
          input: preparedLogo.buffer,
          left: coords.left,
          top: coords.top,
        },
      ]);
    }

    let outputFormat = config.output_format || 'original';
    if (outputFormat === 'original') {
      const origFmt = (origMeta.format as string || '').toLowerCase();
      if (origFmt === 'png') outputFormat = 'png';
      else if (origFmt === 'jpeg' || origFmt === 'jpg') outputFormat = 'jpeg';
      else if (origFmt === 'webp') outputFormat = 'webp';
      else if (origFmt === 'avif' || origFmt === 'heif') outputFormat = 'avif';
      else outputFormat = 'png';
    }

    const areaMultiplier = (fullTargetW * fullTargetH) / Math.max(1, previewW * previewH);

    // Target File Size branch in Preview
    if (config.compression_mode === 'target_size' && config.target_file_size_kb && config.target_file_size_kb > 0) {
      const targetBytes = Math.round(config.target_file_size_kb * 1024);
      const previewTargetBytes = Math.max(
        1024,
        Math.round(targetBytes / Math.pow(areaMultiplier, 0.75))
      );

      const previewCompositedBuffer = await previewPipeline.toBuffer();

      const compressedPreview = await this.compressBufferToTarget(
        previewCompositedBuffer,
        outputFormat,
        previewTargetBytes,
        previewW,
        previewH
      );

      const previewFileSize = compressedPreview.buffer.length;
      const estimatedFullFileSize = Math.min(
        targetBytes,
        Math.round(previewFileSize * Math.pow(areaMultiplier, 0.75))
      );

      let mimeType = 'image/webp';
      if (outputFormat === 'png') mimeType = 'image/png';
      else if (outputFormat === 'jpeg') mimeType = 'image/jpeg';
      else if (outputFormat === 'avif') mimeType = 'image/avif';

      const dataUri = `data:${mimeType};base64,${compressedPreview.buffer.toString('base64')}`;
      return {
        dataUri,
        width: fullTargetW,
        height: fullTargetH,
        originalWidth: origW,
        originalHeight: origH,
        upscaledWidth: fullTargetW,
        upscaledHeight: fullTargetH,
        previewFileSize,
        estimatedFullFileSize,
        outputFormat,
        quality: compressedPreview.finalQuality,
        upscaled: isUpscale,
        scaleFactor: targetDim.scaleFactor,
        kernel: config.upscale?.kernel || 'lanczos3',
      };
    }

    // Standard Quality Preview
    const effectiveQuality = Math.max(1, Math.min(100, Math.round(config.quality || config.webp_quality || 85)));

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
    const estimatedFullFileSize = Math.round(previewFileSize * Math.pow(areaMultiplier, 0.75));

    const dataUri = `data:${mimeType};base64,${watermarkedBuffer.toString('base64')}`;
    return {
      dataUri,
      width: fullTargetW,
      height: fullTargetH,
      originalWidth: origW,
      originalHeight: origH,
      upscaledWidth: fullTargetW,
      upscaledHeight: fullTargetH,
      previewFileSize,
      estimatedFullFileSize,
      outputFormat,
      quality: effectiveQuality,
      upscaled: isUpscale,
      scaleFactor: targetDim.scaleFactor,
      kernel: config.upscale?.kernel || 'lanczos3',
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

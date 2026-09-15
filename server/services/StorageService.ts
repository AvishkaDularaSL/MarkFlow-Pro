import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

export class StorageService {
  public static readonly BASE_DIR = path.join(process.cwd(), 'storage');
  public static readonly LOGOS_DIR = path.join(StorageService.BASE_DIR, 'logos');
  public static readonly TEMP_DIR = path.join(StorageService.BASE_DIR, 'temporary');
  public static readonly ZIPS_DIR = path.join(StorageService.BASE_DIR, 'zips');

  static init() {
    [StorageService.BASE_DIR, StorageService.LOGOS_DIR, StorageService.TEMP_DIR, StorageService.ZIPS_DIR].forEach(
      (dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    );
  }

  static getSessionDir(sessionId: string): string {
    const sessionDir = path.join(StorageService.TEMP_DIR, `session_${sessionId}`);
    const originalsDir = path.join(sessionDir, 'originals');
    const processedDir = path.join(sessionDir, 'processed');

    if (!fs.existsSync(originalsDir)) {
      fs.mkdirSync(originalsDir, { recursive: true });
    }
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    return sessionDir;
  }

  static getSessionOriginalsDir(sessionId: string): string {
    const dir = path.join(StorageService.getSessionDir(sessionId), 'originals');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static getJobProcessedDir(sessionId: string, businessId: string, jobId: string): string {
    const dir = path.join(
      StorageService.getSessionDir(sessionId),
      'processed',
      `${businessId}_${jobId}`
    );
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static sanitizeFilename(rawName: string): string {
    const parsed = path.parse(rawName);
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    return `${safeBase || 'image'}${parsed.ext.toLowerCase()}`;
  }

  static generateUniqueFilename(originalName: string, ext = ''): string {
    const parsed = path.parse(originalName);
    const extension = ext || parsed.ext.toLowerCase() || '.png';
    const randomHex = crypto.randomBytes(8).toString('hex');
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    return `${safeBase}_${randomHex}${extension}`;
  }

  static isAllowedImageMime(mime: string): boolean {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowed.includes(mime.toLowerCase());
  }

  static safeUnlink(filePath: string) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`Failed to unlink file ${filePath}:`, err);
    }
  }

  static removeDirRecursive(dirPath: string) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`Failed to remove directory ${dirPath}:`, err);
    }
  }

  /**
   * Deterministic vibrant gradient generator for brand fallback logos
   */
  private static getBrandPalette(name: string): { start: string; end: string; accent: string } {
    const palettes = [
      { start: '#2563eb', end: '#1d4ed8', accent: '#60a5fa' }, // Royal Blue
      { start: '#4f46e5', end: '#3730a3', accent: '#818cf8' }, // Indigo
      { start: '#0891b2', end: '#0e7490', accent: '#22d3ee' }, // Cyan
      { start: '#059669', end: '#047857', accent: '#34d399' }, // Emerald
      { start: '#d97706', end: '#b45309', accent: '#fbbf24' }, // Amber
      { start: '#e11d48', end: '#be123c', accent: '#fb7185' }, // Rose
      { start: '#7c3aed', end: '#6d28d9', accent: '#a78bfa' }, // Violet
    ];

    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    const index = Math.abs(hash) % palettes.length;
    return palettes[index];
  }

  /**
   * Generate an ultra-clean, vector-crisp SVG logo for any brand
   */
  public static generateBrandLogoSvg(name: string): string {
    const cleanName = (name || 'Brand')
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const words = cleanName.split(/\s+/).filter(Boolean);
    let initials = '';
    if (words.length === 1) {
      initials = words[0].substring(0, Math.min(3, words[0].length)).toUpperCase();
    } else {
      initials = (words[0][0] + words[1][0]).toUpperCase();
    }
    if (!initials) initials = 'VIP';

    const { start, end, accent } = StorageService.getBrandPalette(cleanName);
    const displayName = cleanName.length > 16 ? cleanName.substring(0, 14) + '…' : cleanName;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${start}" />
      <stop offset="100%" stop-color="${end}" />
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.22" />
    </filter>
  </defs>
  <rect width="512" height="512" fill="none" />
  <g filter="url(#cardShadow)">
    <rect x="40" y="40" width="432" height="432" rx="96" fill="url(#brandGrad)" />
    <rect x="44" y="44" width="424" height="424" rx="92" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="4" />
    <circle cx="256" cy="220" r="110" fill="rgba(255,255,255,0.08)" />
    <circle cx="256" cy="220" r="108" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="8 6" opacity="0.6" />
  </g>
  <text x="256" y="235" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="${initials.length > 2 ? 100 : 120}" font-weight="900" fill="#ffffff" letter-spacing="2">
    ${initials}
  </text>
  <rect x="100" y="360" width="312" height="44" rx="22" fill="rgba(0,0,0,0.25)" />
  <text x="256" y="388" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff" letter-spacing="1.5">
    ${displayName.toUpperCase()}
  </text>
</svg>`;
  }

  /**
   * Generates a PNG buffer from the brand SVG logo
   */
  public static async generateBrandLogoBuffer(name: string): Promise<Buffer> {
    const svg = StorageService.generateBrandLogoSvg(name);
    return sharp(Buffer.from(svg))
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  /**
   * Guarantees that a business logo exists both as a local file on disk and as a valid buffer / dataUrl.
   * Restores from base64 if needed, or generates a crisp brand logo if file is missing.
   */
  public static async ensureBusinessLogo(biz: {
    id: string;
    name: string;
    logo_path?: string;
    logo_mime?: string;
    logo_original_name?: string;
  }): Promise<{ filePath: string; buffer: Buffer; mime: string; dataUrl: string }> {
    StorageService.init();
    const localTarget = path.join(StorageService.LOGOS_DIR, `logo_${biz.id}.png`);
    const mime = biz.logo_mime || 'image/png';

    // Case 1: Logo is stored as Base64 Data URL (e.g. data:image/png;base64,...)
    if (biz.logo_path && biz.logo_path.startsWith('data:')) {
      try {
        const matches = biz.logo_path.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const buffer = Buffer.from(matches[2], 'base64');
          fs.writeFileSync(localTarget, buffer);
          return {
            filePath: localTarget,
            buffer,
            mime: matches[1] || mime,
            dataUrl: biz.logo_path,
          };
        }
      } catch (err) {
        console.warn(`Failed to parse base64 logo for business ${biz.id}:`, err);
      }
    }

    // Case 2: Local file exists on disk
    if (biz.logo_path && fs.existsSync(biz.logo_path)) {
      try {
        const buffer = fs.readFileSync(biz.logo_path);
        const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
        return {
          filePath: biz.logo_path,
          buffer,
          mime,
          dataUrl,
        };
      } catch (err) {
        console.warn(`Failed to read local logo file for business ${biz.id}:`, err);
      }
    }

    // Case 3: Checked localTarget exists
    if (fs.existsSync(localTarget)) {
      try {
        const buffer = fs.readFileSync(localTarget);
        const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
        return {
          filePath: localTarget,
          buffer,
          mime: 'image/png',
          dataUrl,
        };
      } catch (err) {
        console.warn(`Failed to read fallback target for business ${biz.id}:`, err);
      }
    }

    // Case 4: File is missing — generate a sleek, high-resolution vector logo and write to disk
    const buffer = await StorageService.generateBrandLogoBuffer(biz.name);
    fs.writeFileSync(localTarget, buffer);
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

    return {
      filePath: localTarget,
      buffer,
      mime: 'image/png',
      dataUrl,
    };
  }
}

StorageService.init();


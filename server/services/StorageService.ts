import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
}

StorageService.init();

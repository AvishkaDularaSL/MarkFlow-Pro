import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { StorageService } from './StorageService';

export class CleanupService {
  private static timer: NodeJS.Timeout | null = null;

  static startScheduledCleanup() {
    // Run initial cleanup on boot
    this.runCleanup();

    // Schedule interval (e.g. check every 3 minutes)
    const intervalSecs = parseInt(db.getSettingValue('AUTO_CLEANUP_INTERVAL', '180'), 10);
    this.timer = setInterval(() => {
      this.runCleanup();
    }, intervalSecs * 1000);
  }

  static stopScheduledCleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static runCleanup(): { sessionsCleaned: number; jobsCleaned: number; orphanedFilesCleaned: number } {
    const nowIso = new Date().toISOString();
    const result = db.cleanExpiredRecords(nowIso);

    // Also scan temporary folder for any orphaned folders older than 1 hour (3600s)
    let orphanedCount = 0;
    try {
      if (fs.existsSync(StorageService.TEMP_DIR)) {
        const sessionFolders = fs.readdirSync(StorageService.TEMP_DIR, { withFileTypes: true });
        const oneHourAgo = Date.now() - 3600 * 1000;

        for (const item of sessionFolders) {
          if (item.isDirectory() && item.name.startsWith('session_')) {
            const folderPath = path.join(StorageService.TEMP_DIR, item.name);
            try {
              const stats = fs.statSync(folderPath);
              if (stats.mtimeMs < oneHourAgo) {
                StorageService.removeDirRecursive(folderPath);
                orphanedCount++;
              }
            } catch (_) {}
          }
        }
      }

      // Also clean old ZIP archives older than 1 hour
      if (fs.existsSync(StorageService.ZIPS_DIR)) {
        const zipFiles = fs.readdirSync(StorageService.ZIPS_DIR);
        const oneHourAgo = Date.now() - 3600 * 1000;
        for (const file of zipFiles) {
          const filePath = path.join(StorageService.ZIPS_DIR, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.mtimeMs < oneHourAgo) {
              fs.unlinkSync(filePath);
              orphanedCount++;
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      console.error('Error during disk cleanup scan:', err);
    }

    if (result.sessionsCleaned > 0 || result.jobsCleaned > 0 || orphanedCount > 0) {
      db.logActivity({
        action: 'SYSTEM_CLEANUP_EXECUTED',
        metadata: {
          sessionsCleaned: result.sessionsCleaned,
          jobsCleaned: result.jobsCleaned,
          orphanedFilesCleaned: orphanedCount,
        },
      });
    }

    return {
      ...result,
      orphanedFilesCleaned: orphanedCount,
    };
  }
}

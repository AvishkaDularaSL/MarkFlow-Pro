import fs from 'fs';
import path from 'path';
import * as archiverModule from 'archiver';
const archiver = ((archiverModule as any).default || archiverModule) as any;
import { StorageService } from './StorageService';
import { ProcessedImage } from '../types';

export class ZipService {
  /**
   * Create a ZIP archive on disk containing all processed images in the batch
   */
  static async createZipArchive(
    processedImages: ProcessedImage[],
    businessName: string,
    jobId: string
  ): Promise<{ zipPath: string; zipFilename: string }> {
    const safeBizName = businessName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    const zipFilename = `${safeBizName}_Watermarked_${dateStr}_${jobId.substring(4, 10)}.zip`;
    const zipPath = path.join(StorageService.ZIPS_DIR, zipFilename);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 6 }, // standard compression
      });

      output.on('close', () => {
        resolve({ zipPath, zipFilename });
      });

      output.on('error', (err) => {
        reject(err);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Append each processed file
      for (const img of processedImages) {
        if (fs.existsSync(img.output_path)) {
          archive.file(img.output_path, { name: img.output_filename });
        }
      }

      archive.finalize();
    });
  }
}

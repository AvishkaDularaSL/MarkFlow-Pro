import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
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

    const zip = new JSZip();
    const usedNames = new Map<string, number>();

    // Append each processed file into the ZIP archive with deduplicated names if needed
    for (const img of processedImages) {
      if (fs.existsSync(img.output_path)) {
        const fileData = fs.readFileSync(img.output_path);
        let entryName = img.output_filename || 'image.png';

        if (usedNames.has(entryName)) {
          const count = usedNames.get(entryName)! + 1;
          usedNames.set(entryName, count);
          const parsed = path.parse(entryName);
          entryName = `${parsed.name} (${count})${parsed.ext}`;
        } else {
          usedNames.set(entryName, 0);
        }

        zip.file(entryName, fileData, {
          date: new Date(),
        });
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'DOS',
    });

    fs.writeFileSync(zipPath, zipBuffer);

    return { zipPath, zipFilename };
  }
}

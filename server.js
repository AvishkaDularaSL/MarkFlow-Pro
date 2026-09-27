/**
 * MarkFlow Pro - Production Startup Entry
 * Works seamlessly with Google Cloud Run, Cloud Buildpacks, and cPanel
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Ensure storage directories exist
const storageDir = path.join(process.cwd(), 'storage');
['logos', 'temporary', 'zips'].forEach((sub) => {
  const p = path.join(storageDir, sub);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
});

// Load compiled server bundle if present
const compiledServer = path.join(process.cwd(), 'dist', 'server.cjs');

if (fs.existsSync(compiledServer)) {
  require(compiledServer);
} else {
  console.error('Production bundle not found at dist/server.cjs. Please run: npm run build');
  process.exit(1);
}


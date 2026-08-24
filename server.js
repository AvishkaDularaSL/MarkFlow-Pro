/**
 * MarkFlow Pro - cPanel Production Startup Entry
 * Phusion Passenger & CloudLinux Node.js Selector Loader
 */

const fs = require('fs');
const path = require('path');

// Ensure storage directories exist
const storageDir = path.join(__dirname, 'storage');
['logos', 'temporary', 'zips'].forEach((sub) => {
  const p = path.join(storageDir, sub);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
});

// Load compiled server bundle if present, otherwise launch tsx/dev
const compiledServer = path.join(__dirname, 'dist', 'server.cjs');

if (fs.existsSync(compiledServer)) {
  require(compiledServer);
} else {
  console.log('Production bundle not found at dist/server.cjs. Please run: npm run build');
  process.exit(1);
}

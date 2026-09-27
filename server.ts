import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import authRoutes from './server/routes/auth';
import businessRoutes from './server/routes/businesses';
import processRoutes from './server/routes/process';
import adminRoutes from './server/routes/admin';
import { CleanupService } from './server/services/CleanupService';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize SQLite database
  await db.init();

  // Security: Remove Express fingerprint
  app.disable('x-powered-by');

  // Security: Helmet HTTP Headers (frameguard disabled to allow AI Studio iframe embedding)
  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );

  // Security: General API Rate Limiting (300 requests per 15 mins)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP address. Please try again later.' },
  });

  // Security: Sensitive Auth Endpoints Rate Limiting (15 attempts per 15 mins)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please wait 15 minutes before retrying.' },
  });

  // Body parsing with safe size bounds
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ extended: true, limit: '60mb' }));

  // Extra Security Headers & Path Traversal Prevention
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Prevent directory traversal attempts in query or path
    const urlDecoded = decodeURIComponent(req.url);
    if (urlDecoded.includes('../') || urlDecoded.includes('..\\')) {
      return res.status(400).json({ error: 'Potential path traversal detected.' });
    }
    next();
  });

  // API Health Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'WatermarkPro SaaS Engine',
      storage: 'SQLite 3 Embedded Local Database',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health/db', (req, res) => {
    const meta = db.getSqliteMetadata();
    res.json({
      status: 'operational',
      engine: meta.engine,
      databaseType: 'SQLite Embedded Database',
      filePath: meta.filePath,
      fileSize: meta.fileSizeFormatted,
      records: meta.totalRecords,
      timestamp: new Date().toISOString(),
    });
  });

  // Apply rate limiters
  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);

  // Mount API modules
  app.use('/api/auth', authRoutes);
  app.use('/api/businesses', businessRoutes);
  app.use('/api/process', processRoutes);
  app.use('/api/admin', adminRoutes);

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(err.status || 500).json({
      error: err.message || 'An unexpected error occurred on the server.',
    });
  });

  // Start background auto-cleanup worker
  CleanupService.startScheduledCleanup();

  // Vite middleware in dev / Static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WatermarkPro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

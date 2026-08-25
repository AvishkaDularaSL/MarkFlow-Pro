import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { StorageService } from '../services/StorageService';

const router = Router();

// Multer configuration for logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, StorageService.LOGOS_DIR);
  },
  filename: (req, file, cb) => {
    const unique = StorageService.generateUniqueFilename(file.originalname);
    cb(null, `logo_${unique}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid logo format. Only PNG, JPG, and WebP are supported.'));
    }
  },
});

// List all businesses belonging to the logged-in user
router.get('/', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const businesses = db.getBusinessesByUserId(userId);
  res.json({ businesses });
});

// Get single business
router.get('/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const biz = db.getBusinessById(req.params.id);

  if (!biz || (req.user!.role !== 'admin' && biz.user_id !== userId)) {
    return res.status(404).json({ error: 'Business not found.' });
  }

  res.json({ business: biz });
});

// Create new business with logo
router.post(
  '/',
  AuthService.requireAuth,
  (req, res, next) => {
    logoUpload.single('logo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Invalid logo upload.' });
      }
      next();
    });
  },
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      if (req.file) {
        StorageService.safeUnlink(req.file.path);
      }
      return res.status(400).json({ error: 'Business name is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Company logo is required. Please upload a PNG, JPG, or WebP file.' });
    }

    const business = db.createBusiness({
      user_id: userId,
      name: name.trim(),
      description: description ? String(description).trim() : '',
      logo_path: req.file.path,
      logo_original_name: req.file.originalname,
      logo_mime: req.file.mimetype,
    });

    res.status(201).json({
      message: 'Business created successfully',
      business,
    });
  }
);

// Update business
router.put(
  '/:id',
  AuthService.requireAuth,
  (req, res, next) => {
    logoUpload.single('logo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Invalid logo upload.' });
      }
      next();
    });
  },
  (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const bizId = req.params.id;
    const { name, description } = req.body;

    const existing = db.getBusinessById(bizId);
    if (!existing || (req.user!.role !== 'admin' && existing.user_id !== userId)) {
      if (req.file) StorageService.safeUnlink(req.file.path);
      return res.status(404).json({ error: 'Business not found.' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      if (req.file) StorageService.safeUnlink(req.file.path);
      return res.status(400).json({ error: 'Business name is required.' });
    }

    const updates: Partial<any> = {
      name: name.trim(),
      description: description !== undefined ? String(description).trim() : existing.description,
    };

    if (req.file) {
      // Remove old logo file if exists
      if (existing.logo_path && fs.existsSync(existing.logo_path)) {
        StorageService.safeUnlink(existing.logo_path);
      }
      updates.logo_path = req.file.path;
      updates.logo_original_name = req.file.originalname;
      updates.logo_mime = req.file.mimetype;
    }

    const updated = db.updateBusiness(bizId, updates);
    res.json({
      message: 'Business updated successfully',
      business: updated,
    });
  }
);

// Delete business
router.delete('/:id', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const bizId = req.params.id;

  const existing = db.getBusinessById(bizId);
  if (!existing || (req.user!.role !== 'admin' && existing.user_id !== userId)) {
    return res.status(404).json({ error: 'Business not found.' });
  }

  const success = db.deleteBusiness(bizId, existing.user_id);
  if (!success) {
    return res.status(500).json({ error: 'Failed to delete business.' });
  }

  res.json({ message: 'Business deleted successfully.' });
});

// Serve logo image
router.get('/:id/logo', (req, res) => {
  const biz = db.getBusinessById(req.params.id);
  if (!biz || !fs.existsSync(biz.logo_path)) {
    return res.status(404).json({ error: 'Logo not found.' });
  }

  res.setHeader('Content-Type', biz.logo_mime || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(biz.logo_path).pipe(res);
});

export default router;

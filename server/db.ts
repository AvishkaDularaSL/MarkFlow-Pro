import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { StorageService } from './services/StorageService';
import {
  getSqliteDb,
  sqliteRun,
  sqliteGet,
  sqliteAll,
  saveDatabaseImmediate,
  sqliteIntegrityCheck,
  sqliteVacuum,
  sqliteCreateBackup,
  getSqliteStats,
  DB_FILE_PATH,
} from './sqlite';

import {
  User,
  Business,
  ProcessingSession,
  UploadedImage,
  ProcessingJob,
  ProcessedImage,
  SystemSetting,
  ActivityLog,
} from './types';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const LOGOS_DIR = path.join(STORAGE_DIR, 'logos');
const TEMP_DIR = path.join(STORAGE_DIR, 'temporary');
const ZIPS_DIR = path.join(STORAGE_DIR, 'zips');

[STORAGE_DIR, LOGOS_DIR, TEMP_DIR, ZIPS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class AppDatabase {
  private initialized = false;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await getSqliteDb();
      this.initialized = true;
      this.seedDefaultAdmin();
      this.seedDefaultSystemSettings();
      console.log('[SQLite Embedded] Database initialized and ready.');
    } catch (err) {
      console.error('[SQLite Embedded] Initialization failed:', err);
    }
  }

  // ==========================================
  // --- DEFAULT SEEDING ---
  // ==========================================

  private seedDefaultAdmin() {
    const primaryAdminEmail = 'dularaavishka890@gmail.com';
    const existing = sqliteGet<User>('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [primaryAdminEmail]);

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('Dulara@2001', salt);
    const nowIso = new Date().toISOString();

    if (!existing) {
      sqliteRun(
        'INSERT INTO users (id, name, email, password, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['user_admin_primary', 'Dulara Avishka', primaryAdminEmail, hashedPassword, 'admin', 'active', nowIso, nowIso]
      );
      console.log(`[SQLite Embedded] Default admin seeded: ${primaryAdminEmail}`);
    } else {
      sqliteRun(
        'UPDATE users SET password = ?, role = ?, status = ?, updated_at = ? WHERE LOWER(email) = LOWER(?)',
        [hashedPassword, 'admin', 'active', nowIso, primaryAdminEmail]
      );
    }
    saveDatabaseImmediate();
  }

  private seedDefaultSystemSettings() {
    const defaultSettings = [
      {
        id: 'setting_1',
        key: 'session_expiry_minutes',
        value: '60',
        description: 'Temporary upload session lifetime in minutes',
      },
      {
        id: 'setting_2',
        key: 'max_images_per_batch',
        value: '100',
        description: 'Maximum number of images allowed per batch conversion',
      },
      {
        id: 'setting_3',
        key: 'max_image_size_mb',
        value: '50',
        description: 'Maximum single image file size in Megabytes',
      },
      {
        id: 'setting_4',
        key: 'default_webp_quality',
        value: '80',
        description: 'Default quality parameter for WebP conversion (1-100)',
      },
      {
        id: 'setting_5',
        key: 'auto_cleanup_interval_minutes',
        value: '5',
        description: 'Frequency of automated temporary storage cleanup worker',
      },
      {
        id: 'setting_6',
        key: 'auth_session_lifetime_days',
        value: '2',
        description: 'User login JWT authentication session duration in days',
      },
    ];

    const nowIso = new Date().toISOString();
    defaultSettings.forEach((setting) => {
      const existing = sqliteGet('SELECT id FROM system_settings WHERE key = ?', [setting.key]);
      if (!existing) {
        sqliteRun(
          'INSERT INTO system_settings (id, key, value, description, updated_at) VALUES (?, ?, ?, ?, ?)',
          [setting.id, setting.key, setting.value, setting.description, nowIso]
        );
      }
    });
    saveDatabaseImmediate();
  }

  // ==========================================
  // --- USERS CRUD ---
  // ==========================================

  getUsers(): User[] {
    return sqliteAll<User>('SELECT * FROM users ORDER BY created_at DESC');
  }

  getUserById(id: string): User | undefined {
    return sqliteGet<User>('SELECT * FROM users WHERE id = ?', [id]);
  }

  getUserByEmail(email: string): User | undefined {
    if (!email) return undefined;
    const clean = email.trim().toLowerCase();
    return sqliteGet<User>('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [clean]);
  }

  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const newUser: User = {
      ...user,
      id: `user_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    sqliteRun(
      'INSERT INTO users (id, name, email, password, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newUser.id,
        newUser.name,
        newUser.email,
        newUser.password,
        newUser.role,
        newUser.status,
        newUser.created_at,
        newUser.updated_at,
      ]
    );

    this.logActivity({
      user_id: newUser.id,
      user_email: newUser.email,
      action: 'USER_REGISTERED',
      metadata: { role: newUser.role },
    });
    return newUser;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const existing = this.getUserById(id);
    if (!existing) return undefined;

    const updatedUser: User = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    sqliteRun(
      'UPDATE users SET name = ?, email = ?, password = ?, role = ?, status = ?, updated_at = ? WHERE id = ?',
      [
        updatedUser.name,
        updatedUser.email,
        updatedUser.password,
        updatedUser.role,
        updatedUser.status,
        updatedUser.updated_at,
        id,
      ]
    );

    return updatedUser;
  }

  deleteUser(id: string): boolean {
    const user = this.getUserById(id);
    if (!user) return false;

    // Delete associated physical logo files
    const businesses = this.getBusinessesByUserId(id);
    businesses.forEach((b) => {
      if (b.logo_path && fs.existsSync(b.logo_path)) {
        try {
          fs.unlinkSync(b.logo_path);
        } catch (_) {}
      }
    });

    // Delete processing files
    const jobs = this.getProcessingJobsByUserId(id);
    jobs.forEach((j) => {
      if (j.zip_path && fs.existsSync(j.zip_path)) {
        try {
          fs.unlinkSync(j.zip_path);
        } catch (_) {}
      }
    });

    // Foreign keys with CASCADE will handle table rows
    sqliteRun('DELETE FROM businesses WHERE user_id = ?', [id]);
    sqliteRun('DELETE FROM processing_sessions WHERE user_id = ?', [id]);
    sqliteRun('DELETE FROM uploaded_images WHERE user_id = ?', [id]);
    sqliteRun('DELETE FROM processing_jobs WHERE user_id = ?', [id]);
    sqliteRun('DELETE FROM processed_images WHERE user_id = ?', [id]);
    sqliteRun('DELETE FROM users WHERE id = ?', [id]);

    this.logActivity({
      action: 'USER_DELETED',
      metadata: { userId: id, email: user.email },
    });
    return true;
  }

  // ==========================================
  // --- BUSINESSES CRUD ---
  // ==========================================

  getBusinessesByUserId(userId: string): Business[] {
    return sqliteAll<Business>('SELECT * FROM businesses WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  getAllBusinesses(): Business[] {
    return sqliteAll<Business>('SELECT * FROM businesses ORDER BY created_at DESC');
  }

  getBusinessById(id: string, userId?: string): Business | undefined {
    if (userId) {
      return sqliteGet<Business>('SELECT * FROM businesses WHERE id = ? AND user_id = ?', [id, userId]);
    }
    return sqliteGet<Business>('SELECT * FROM businesses WHERE id = ?', [id]);
  }

  createBusiness(business: Omit<Business, 'id' | 'created_at' | 'updated_at'>): Business {
    const newBiz: Business = {
      ...business,
      id: `biz_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    sqliteRun(
      'INSERT INTO businesses (id, user_id, name, description, logo_path, logo_original_name, logo_mime, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newBiz.id,
        newBiz.user_id,
        newBiz.name,
        newBiz.description || '',
        newBiz.logo_path,
        newBiz.logo_original_name,
        newBiz.logo_mime,
        newBiz.created_at,
        newBiz.updated_at,
      ]
    );

    this.logActivity({
      user_id: newBiz.user_id,
      action: 'BUSINESS_CREATED',
      metadata: { businessId: newBiz.id, name: newBiz.name },
    });
    return newBiz;
  }

  updateBusiness(id: string, updates: Partial<Business>, userId?: string): Business | undefined {
    const existing = this.getBusinessById(id, userId);
    if (!existing) return undefined;

    const updatedBiz: Business = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    sqliteRun(
      'UPDATE businesses SET name = ?, description = ?, logo_path = ?, logo_original_name = ?, logo_mime = ?, updated_at = ? WHERE id = ?',
      [
        updatedBiz.name,
        updatedBiz.description || '',
        updatedBiz.logo_path,
        updatedBiz.logo_original_name,
        updatedBiz.logo_mime,
        updatedBiz.updated_at,
        id,
      ]
    );

    this.logActivity({
      user_id: updatedBiz.user_id,
      action: 'BUSINESS_UPDATED',
      metadata: { businessId: id, name: updatedBiz.name },
    });
    return updatedBiz;
  }

  deleteBusiness(id: string, userId?: string): boolean {
    const biz = this.getBusinessById(id, userId);
    if (!biz) return false;

    if (biz.logo_path && fs.existsSync(biz.logo_path)) {
      try {
        fs.unlinkSync(biz.logo_path);
      } catch (_) {}
    }

    sqliteRun('DELETE FROM businesses WHERE id = ?', [id]);

    this.logActivity({
      user_id: userId || biz.user_id,
      action: 'BUSINESS_DELETED',
      metadata: { businessId: id, name: biz.name },
    });
    return true;
  }

  // ==========================================
  // --- PROCESSING SESSIONS ---
  // ==========================================

  createProcessingSession(userId: string, lifetimeSeconds = 3600): ProcessingSession {
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
    const session: ProcessingSession = {
      id: `sess_${crypto.randomUUID()}`,
      user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
      expires_at: expiresAt,
    };

    sqliteRun(
      'INSERT INTO processing_sessions (id, user_id, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      [session.id, session.user_id, session.created_at, session.updated_at, session.expires_at]
    );
    return session;
  }

  getProcessingSession(id: string, userId?: string): ProcessingSession | undefined {
    if (userId) {
      return sqliteGet<ProcessingSession>('SELECT * FROM processing_sessions WHERE id = ? AND user_id = ?', [id, userId]);
    }
    return sqliteGet<ProcessingSession>('SELECT * FROM processing_sessions WHERE id = ?', [id]);
  }

  getProcessingSessionsByUserId(userId: string): ProcessingSession[] {
    return sqliteAll<ProcessingSession>('SELECT * FROM processing_sessions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  touchProcessingSession(id: string, lifetimeSeconds = 3600): void {
    const nowIso = new Date().toISOString();
    const newExpires = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
    sqliteRun(
      'UPDATE processing_sessions SET updated_at = ?, expires_at = ? WHERE id = ?',
      [nowIso, newExpires, id]
    );
  }

  // ==========================================
  // --- UPLOADED IMAGES ---
  // ==========================================

  addUploadedImage(img: Omit<UploadedImage, 'id' | 'created_at'>): UploadedImage {
    const newImg: UploadedImage = {
      ...img,
      id: `img_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    };

    sqliteRun(
      'INSERT INTO uploaded_images (id, processing_session_id, user_id, original_name, temporary_path, mime_type, file_size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newImg.id,
        newImg.processing_session_id,
        newImg.user_id,
        newImg.original_name,
        newImg.temporary_path,
        newImg.mime_type,
        newImg.file_size,
        newImg.width || 0,
        newImg.height || 0,
        newImg.created_at,
      ]
    );
    return newImg;
  }

  getUploadedImagesBySession(sessionId: string, userId: string): UploadedImage[] {
    return sqliteAll<UploadedImage>(
      'SELECT * FROM uploaded_images WHERE processing_session_id = ? AND user_id = ? ORDER BY created_at ASC',
      [sessionId, userId]
    );
  }

  getUploadedImageById(id: string, userId?: string): UploadedImage | undefined {
    if (userId) {
      return sqliteGet<UploadedImage>('SELECT * FROM uploaded_images WHERE id = ? AND user_id = ?', [id, userId]);
    }
    return sqliteGet<UploadedImage>('SELECT * FROM uploaded_images WHERE id = ?', [id]);
  }

  removeUploadedImage(id: string, userId: string): boolean {
    const img = this.getUploadedImageById(id, userId);
    if (!img) return false;

    if (img.temporary_path && fs.existsSync(img.temporary_path)) {
      try {
        fs.unlinkSync(img.temporary_path);
      } catch (_) {}
    }

    sqliteRun('DELETE FROM uploaded_images WHERE id = ? AND user_id = ?', [id, userId]);
    return true;
  }

  // ==========================================
  // --- PROCESSING JOBS ---
  // ==========================================

  createProcessingJob(job: Partial<ProcessingJob> & {
    user_id: string;
    processing_session_id: string;
    business_id: string;
    business_name: string;
    output_format: any;
    quality: number;
    opacity: number;
    position: any;
    logo_size: number;
    margin: number;
    rotation: number;
    total_images: number;
    expires_at?: string;
  }): ProcessingJob {
    const newJob: ProcessingJob = {
      id: `job_${crypto.randomUUID()}`,
      user_id: job.user_id,
      processing_session_id: job.processing_session_id,
      business_id: job.business_id,
      business_name: job.business_name,
      output_format: job.output_format || 'webp',
      quality: job.quality ?? 80,
      opacity: job.opacity ?? 50,
      position: job.position || 'center',
      logo_size: job.logo_size ?? 50,
      margin: job.margin ?? 20,
      rotation: job.rotation ?? 0,
      total_images: job.total_images ?? 0,
      completed_images: job.completed_images ?? 0,
      failed_images: job.failed_images ?? 0,
      status: job.status || 'pending',
      error_message: job.error_message,
      zip_path: job.zip_path,
      zip_filename: job.zip_filename,
      created_at: new Date().toISOString(),
      completed_at: job.completed_at,
      expires_at: job.expires_at || new Date(Date.now() + 3600000).toISOString(),
    };

    sqliteRun(
      `INSERT INTO processing_jobs (
        id, user_id, processing_session_id, business_id, business_name,
        output_format, quality, opacity, position, logo_size, margin, rotation,
        status, total_images, completed_images, failed_images, error_message,
        zip_path, zip_filename, created_at, completed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newJob.id,
        newJob.user_id,
        newJob.processing_session_id,
        newJob.business_id,
        newJob.business_name,
        newJob.output_format,
        newJob.quality,
        newJob.opacity,
        newJob.position,
        newJob.logo_size,
        newJob.margin,
        newJob.rotation,
        newJob.status,
        newJob.total_images,
        newJob.completed_images,
        newJob.failed_images,
        newJob.error_message || null,
        newJob.zip_path || null,
        newJob.zip_filename || null,
        newJob.created_at,
        newJob.completed_at || null,
        newJob.expires_at,
      ]
    );

    return newJob;
  }

  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): ProcessingJob | undefined {
    const existing = this.getProcessingJobById(id);
    if (!existing) return undefined;

    const merged = { ...existing, ...updates };

    sqliteRun(
      `UPDATE processing_jobs SET
        status = ?, completed_images = ?, failed_images = ?,
        error_message = ?, zip_path = ?, zip_filename = ?, completed_at = ?
      WHERE id = ?`,
      [
        merged.status,
        merged.completed_images,
        merged.failed_images,
        merged.error_message || null,
        merged.zip_path || null,
        merged.zip_filename || null,
        merged.completed_at || null,
        id,
      ]
    );

    return merged;
  }

  getProcessingJobsByUserId(userId: string): ProcessingJob[] {
    return sqliteAll<ProcessingJob>('SELECT * FROM processing_jobs WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  getProcessingJobsByUser(userId: string): ProcessingJob[] {
    return this.getProcessingJobsByUserId(userId);
  }

  getAllProcessingJobs(): ProcessingJob[] {
    return sqliteAll<ProcessingJob>('SELECT * FROM processing_jobs ORDER BY created_at DESC LIMIT 200');
  }

  getProcessingJobById(id: string, userId?: string): ProcessingJob | undefined {
    if (userId) {
      return sqliteGet<ProcessingJob>('SELECT * FROM processing_jobs WHERE id = ? AND user_id = ?', [id, userId]);
    }
    return sqliteGet<ProcessingJob>('SELECT * FROM processing_jobs WHERE id = ?', [id]);
  }

  getProcessingJob(id: string, userId?: string): ProcessingJob | undefined {
    return this.getProcessingJobById(id, userId);
  }

  deleteProcessingJob(id: string, userId?: string): boolean {
    const job = this.getProcessingJobById(id, userId);
    if (!job) return false;

    if (job.zip_path && fs.existsSync(job.zip_path)) {
      try {
        fs.unlinkSync(job.zip_path);
      } catch (_) {}
    }

    const processedImages = this.getProcessedImagesByJobId(id);
    processedImages.forEach((p) => {
      if (p.output_path && fs.existsSync(p.output_path)) {
        try {
          fs.unlinkSync(p.output_path);
        } catch (_) {}
      }
    });

    sqliteRun('DELETE FROM processed_images WHERE processing_job_id = ?', [id]);
    sqliteRun('DELETE FROM processing_jobs WHERE id = ?', [id]);
    return true;
  }

  // ==========================================
  // --- PROCESSED IMAGES ---
  // ==========================================

  addProcessedImage(image: Omit<ProcessedImage, 'id' | 'created_at'>): ProcessedImage {
    const newImg: ProcessedImage = {
      ...image,
      id: `proc_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    };

    sqliteRun(
      `INSERT INTO processed_images (
        id, processing_job_id, original_image_id, user_id, original_filename,
        output_path, output_filename, output_format, file_size, original_file_size,
        width, height, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newImg.id,
        newImg.processing_job_id,
        newImg.original_image_id || '',
        newImg.user_id,
        newImg.original_filename,
        newImg.output_path,
        newImg.output_filename,
        newImg.output_format,
        newImg.file_size,
        newImg.original_file_size || 0,
        newImg.width || 0,
        newImg.height || 0,
        newImg.created_at,
        newImg.expires_at,
      ]
    );

    return newImg;
  }

  getProcessedImagesByJobId(jobId: string, userId?: string): ProcessedImage[] {
    if (userId) {
      return sqliteAll<ProcessedImage>(
        'SELECT * FROM processed_images WHERE processing_job_id = ? AND user_id = ? ORDER BY created_at ASC',
        [jobId, userId]
      );
    }
    return sqliteAll<ProcessedImage>(
      'SELECT * FROM processed_images WHERE processing_job_id = ? ORDER BY created_at ASC',
      [jobId]
    );
  }

  getProcessedImagesByJob(jobId: string, userId?: string): ProcessedImage[] {
    return this.getProcessedImagesByJobId(jobId, userId);
  }

  getProcessedImageById(id: string, userId?: string): ProcessedImage | undefined {
    if (userId) {
      return sqliteGet<ProcessedImage>('SELECT * FROM processed_images WHERE id = ? AND user_id = ?', [id, userId]);
    }
    return sqliteGet<ProcessedImage>('SELECT * FROM processed_images WHERE id = ?', [id]);
  }

  // ==========================================
  // --- SYSTEM SETTINGS ---
  // ==========================================

  getSettings(): Record<string, string> {
    const list = sqliteAll<SystemSetting>('SELECT * FROM system_settings');
    const result: Record<string, string> = {};
    list.forEach((s) => {
      result[s.key] = s.value;
    });
    return result;
  }

  getSetting(key: string, defaultValue = ''): string {
    const s = sqliteGet<SystemSetting>('SELECT value FROM system_settings WHERE key = ?', [key]);
    return s ? s.value : defaultValue;
  }

  getSettingValue(key: string, defaultValue = ''): string {
    return this.getSetting(key, defaultValue);
  }

  updateSetting(key: string, value: string): void {
    const existing = sqliteGet<SystemSetting>('SELECT id FROM system_settings WHERE key = ?', [key]);
    const nowIso = new Date().toISOString();
    if (existing) {
      sqliteRun('UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?', [value, nowIso, key]);
    } else {
      sqliteRun(
        'INSERT INTO system_settings (id, key, value, description, updated_at) VALUES (?, ?, ?, ?, ?)',
        [`setting_${Date.now()}`, key, value, `Configuration setting ${key}`, nowIso]
      );
    }
  }

  // ==========================================
  // --- AUDIT & ACTIVITY LOGS ---
  // ==========================================

  logActivity(log: Omit<ActivityLog, 'id' | 'created_at'>): ActivityLog {
    const newLog: ActivityLog = {
      ...log,
      id: `log_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    };

    sqliteRun(
      'INSERT INTO activity_logs (id, user_id, user_email, action, metadata, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        newLog.id,
        newLog.user_id || null,
        newLog.user_email || null,
        newLog.action,
        newLog.metadata ? JSON.stringify(newLog.metadata) : null,
        newLog.ip_address || null,
        newLog.created_at,
      ]
    );

    // Keep activity logs bounded to last 500 items for performance
    try {
      sqliteRun(`
        DELETE FROM activity_logs WHERE id NOT IN (
          SELECT id FROM activity_logs ORDER BY created_at DESC LIMIT 500
        )
      `);
    } catch (_) {}

    return newLog;
  }

  getActivityLogs(limit = 100): ActivityLog[] {
    const rows = sqliteAll<any>('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map((r) => {
      let metadata = {};
      if (r.metadata) {
        try {
          metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
        } catch (_) {}
      }
      return {
        id: r.id,
        user_id: r.user_id,
        user_email: r.user_email,
        action: r.action,
        metadata,
        ip_address: r.ip_address,
        created_at: r.created_at,
      };
    });
  }

  // ==========================================
  // --- SECURITY: TOKEN REVOCATION & BRUTE-FORCE PROTECTION ---
  // ==========================================

  revokeToken(tokenHash: string, userId: string, expiresAt: string): void {
    const nowIso = new Date().toISOString();
    sqliteRun(
      'INSERT OR REPLACE INTO revoked_tokens (token_hash, user_id, revoked_at, expires_at) VALUES (?, ?, ?, ?)',
      [tokenHash, userId, nowIso, expiresAt]
    );
  }

  isTokenRevoked(tokenHash: string): boolean {
    const row = sqliteGet<{ token_hash: string }>(
      'SELECT token_hash FROM revoked_tokens WHERE token_hash = ?',
      [tokenHash]
    );
    return Boolean(row);
  }

  cleanExpiredRevokedTokens(): void {
    const nowIso = new Date().toISOString();
    sqliteRun('DELETE FROM revoked_tokens WHERE expires_at < ?', [nowIso]);
  }

  /**
   * Check if identifier (IP or email) is locked out from too many failed login attempts
   */
  checkLoginLockout(identifier: string): { locked: boolean; remainingSeconds?: number; attempts: number } {
    const record = sqliteGet<{ attempts: number; last_attempt_at: string; locked_until: string | null }>(
      'SELECT attempts, last_attempt_at, locked_until FROM login_attempts WHERE identifier = ?',
      [identifier.toLowerCase().trim()]
    );

    if (!record) {
      return { locked: false, attempts: 0 };
    }

    if (record.locked_until) {
      const lockExpiry = new Date(record.locked_until).getTime();
      const now = Date.now();
      if (lockExpiry > now) {
        return {
          locked: true,
          remainingSeconds: Math.ceil((lockExpiry - now) / 1000),
          attempts: record.attempts,
        };
      }
    }

    // Reset if last attempt was more than 15 minutes ago
    const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
    if (new Date(record.last_attempt_at).getTime() < fifteenMinsAgo) {
      this.resetLoginAttempts(identifier);
      return { locked: false, attempts: 0 };
    }

    return { locked: false, attempts: record.attempts };
  }

  recordFailedLogin(identifier: string): { locked: boolean; remainingSeconds?: number; attempts: number } {
    const cleanId = identifier.toLowerCase().trim();
    const existing = sqliteGet<{ attempts: number }>(
      'SELECT attempts FROM login_attempts WHERE identifier = ?',
      [cleanId]
    );

    const newAttempts = (existing?.attempts || 0) + 1;
    const nowIso = new Date().toISOString();
    let lockedUntil: string | null = null;

    // Lock account after 5 consecutive failures for 15 minutes (900 seconds)
    if (newAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }

    sqliteRun(
      'INSERT OR REPLACE INTO login_attempts (identifier, attempts, last_attempt_at, locked_until) VALUES (?, ?, ?, ?)',
      [cleanId, newAttempts, nowIso, lockedUntil]
    );

    if (lockedUntil) {
      this.logActivity({
        action: 'SECURITY_ACCOUNT_LOCKED_BRUTE_FORCE',
        metadata: { identifier: cleanId, attempts: newAttempts, lockedDurationMinutes: 15 },
      });
      return { locked: true, remainingSeconds: 15 * 60, attempts: newAttempts };
    }

    return { locked: false, attempts: newAttempts };
  }

  resetLoginAttempts(identifier: string): void {
    const cleanId = identifier.toLowerCase().trim();
    sqliteRun('DELETE FROM login_attempts WHERE identifier = ?', [cleanId]);
  }

  // ==========================================
  // --- BACKWARDS COMPATIBILITY GETTER ---
  // ==========================================

  get data() {
    return {
      users: this.getUsers(),
      businesses: this.getAllBusinesses(),
      processing_sessions: sqliteAll<ProcessingSession>('SELECT * FROM processing_sessions'),
      uploaded_images: sqliteAll<UploadedImage>('SELECT * FROM uploaded_images'),
      processing_jobs: this.getAllProcessingJobs(),
      processed_images: sqliteAll<ProcessedImage>('SELECT * FROM processed_images'),
      system_settings: sqliteAll<SystemSetting>('SELECT * FROM system_settings'),
      activity_logs: this.getActivityLogs(200),
    };
  }

  // ==========================================
  // --- STORAGE & SYSTEM STATS ---
  // ==========================================

  getSystemStats() {
    const users = this.getUsers();
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === 'active').length;
    const businesses = this.getAllBusinesses();
    const totalBusinesses = businesses.length;
    const jobs = this.getAllProcessingJobs();
    const totalJobs = jobs.length;

    const countProcessed = sqliteGet<{ count: number }>('SELECT COUNT(*) AS count FROM processed_images');
    const totalProcessedImages = countProcessed?.count || 0;

    const countOriginal = sqliteGet<{ count: number }>('SELECT COUNT(*) AS count FROM uploaded_images');
    const totalOriginalImages = countOriginal?.count || 0;

    const countSessions = sqliteGet<{ count: number }>(
      'SELECT COUNT(*) AS count FROM processing_sessions WHERE expires_at > ?',
      [new Date().toISOString()]
    );
    const activeSessions = countSessions?.count || 0;

    let storageBytes = 0;
    const calculateDirSize = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const f of files) {
        const full = path.join(dirPath, f.name);
        if (f.isDirectory()) {
          calculateDirSize(full);
        } else {
          try {
            storageBytes += fs.statSync(full).size;
          } catch (_) {}
        }
      }
    };
    calculateDirSize(STORAGE_DIR);

    const sqliteStats = getSqliteStats();

    return {
      totalUsers,
      activeUsers,
      totalBusinesses,
      totalJobs,
      totalProcessedImages,
      totalOriginalImages,
      activeSessions,
      storageBytes,
      storageFormatted: (storageBytes / (1024 * 1024)).toFixed(2) + ' MB',
      databaseType: 'SQLite 3 (Embedded Local Database)',
      databaseSizeBytes: sqliteStats.fileSizeBytes,
      databaseSizeFormatted: sqliteStats.fileSizeFormatted,
      databaseConnected: true,
      sqliteFilePath: DB_FILE_PATH,
      sqliteEngine: 'SQLite 3 Embedded Engine (WASM/Node runtime)',
      sqliteTotalRecords: sqliteStats.totalRecords,
      sqliteTableCounts: sqliteStats.tableCounts,
    };
  }

  // ==========================================
  // --- CLEANUP & EXPIRATION ---
  // ==========================================

  cleanExpiredRecords(nowIso: string): { sessionsCleaned: number; jobsCleaned: number } {
    // 1. Find expired sessions
    const expiredSessions = sqliteAll<ProcessingSession>(
      'SELECT * FROM processing_sessions WHERE expires_at < ?',
      [nowIso]
    );

    // Delete corresponding uploaded images files
    expiredSessions.forEach((sess) => {
      const images = sqliteAll<UploadedImage>(
        'SELECT * FROM uploaded_images WHERE processing_session_id = ?',
        [sess.id]
      );
      images.forEach((img) => {
        if (img.temporary_path && fs.existsSync(img.temporary_path)) {
          try {
            fs.unlinkSync(img.temporary_path);
          } catch (_) {}
        }
      });
      sqliteRun('DELETE FROM uploaded_images WHERE processing_session_id = ?', [sess.id]);
    });

    sqliteRun('DELETE FROM processing_sessions WHERE expires_at < ?', [nowIso]);

    // 2. Find expired processing jobs
    const expiredJobs = sqliteAll<ProcessingJob>(
      'SELECT * FROM processing_jobs WHERE expires_at < ?',
      [nowIso]
    );

    expiredJobs.forEach((job) => {
      if (job.zip_path && fs.existsSync(job.zip_path)) {
        try {
          fs.unlinkSync(job.zip_path);
        } catch (_) {}
      }
      const processed = sqliteAll<ProcessedImage>(
        'SELECT * FROM processed_images WHERE processing_job_id = ?',
        [job.id]
      );
      processed.forEach((p) => {
        if (p.output_path && fs.existsSync(p.output_path)) {
          try {
            fs.unlinkSync(p.output_path);
          } catch (_) {}
        }
      });
      sqliteRun('DELETE FROM processed_images WHERE processing_job_id = ?', [job.id]);
    });

    sqliteRun('DELETE FROM processing_jobs WHERE expires_at < ?', [nowIso]);

    // 3. Clean expired revoked tokens
    this.cleanExpiredRevokedTokens();

    saveDatabaseImmediate();

    return {
      sessionsCleaned: expiredSessions.length,
      jobsCleaned: expiredJobs.length,
    };
  }

  // ==========================================
  // --- FACTORY RESET / WIPE DATA ---
  // ==========================================

  wipeAllDataExceptAdmin(adminEmail = 'dularaavishka890@gmail.com') {
    // 1. Clean disk files
    const cleanDirectoryFiles = (dirPath: string) => {
      if (fs.existsSync(dirPath)) {
        try {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              cleanDirectoryFiles(curPath);
              try { fs.rmdirSync(curPath); } catch (_) {}
            } else {
              try { fs.unlinkSync(curPath); } catch (_) {}
            }
          }
        } catch (err) {
          console.error(`Error cleaning directory ${dirPath}:`, err);
        }
      }
    };

    cleanDirectoryFiles(LOGOS_DIR);
    cleanDirectoryFiles(TEMP_DIR);
    cleanDirectoryFiles(ZIPS_DIR);

    // 2. Preserve admin
    const cleanEmail = adminEmail.trim().toLowerCase();
    const existingAdmin = sqliteGet<User>('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);

    sqliteRun('DELETE FROM businesses;');
    sqliteRun('DELETE FROM processing_sessions;');
    sqliteRun('DELETE FROM uploaded_images;');
    sqliteRun('DELETE FROM processing_jobs;');
    sqliteRun('DELETE FROM processed_images;');
    sqliteRun('DELETE FROM revoked_tokens;');
    sqliteRun('DELETE FROM login_attempts;');
    sqliteRun('DELETE FROM users WHERE LOWER(email) != LOWER(?);', [cleanEmail]);

    if (!existingAdmin) {
      this.seedDefaultAdmin();
    } else {
      sqliteRun('UPDATE users SET role = "admin", status = "active" WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    }

    this.seedDefaultSystemSettings();

    this.logActivity({
      action: 'ALL_DATA_CLEANED_FACTORY_RESET',
      user_email: cleanEmail,
      metadata: {
        timestamp: new Date().toISOString(),
        preservedAdmin: cleanEmail,
        database: 'SQLite 3 Embedded Local Database',
      },
    });

    saveDatabaseImmediate();

    return {
      success: true,
      preservedAdmin: cleanEmail,
      message: 'All application data has been wiped and reset in the SQLite database.',
    };
  }

  // ==========================================
  // --- SQLITE ADMIN TOOLS ---
  // ==========================================

  integrityCheck() {
    return sqliteIntegrityCheck();
  }

  vacuum() {
    return sqliteVacuum();
  }

  createBackup() {
    return sqliteCreateBackup();
  }

  getSqliteMetadata() {
    return getSqliteStats();
  }
}

export const db = new AppDatabase();

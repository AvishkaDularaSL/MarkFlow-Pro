import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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

interface DatabaseSchema {
  users: User[];
  businesses: Business[];
  processing_sessions: ProcessingSession[];
  uploaded_images: UploadedImage[];
  processing_jobs: ProcessingJob[];
  processed_images: ProcessedImage[];
  system_settings: SystemSetting[];
  activity_logs: ActivityLog[];
}

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const DB_FILE = path.join(STORAGE_DIR, 'watermark_database.json');

// Ensure base directories exist
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}
const LOGOS_DIR = path.join(STORAGE_DIR, 'logos');
const TEMP_DIR = path.join(STORAGE_DIR, 'temporary');
const ZIPS_DIR = path.join(STORAGE_DIR, 'zips');

[LOGOS_DIR, TEMP_DIR, ZIPS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class AppDatabase {
  private data: DatabaseSchema;
  private isWriting = false;

  constructor() {
    this.data = this.loadFallbackDatabase();
    this.seedDefaultData();
  }

  /**
   * Load JSON storage cache
   */
  private loadFallbackDatabase(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: parsed.users || [],
          businesses: parsed.businesses || [],
          processing_sessions: parsed.processing_sessions || [],
          uploaded_images: parsed.uploaded_images || [],
          processing_jobs: parsed.processing_jobs || [],
          processed_images: parsed.processed_images || [],
          system_settings: parsed.system_settings || this.getDefaultSystemSettings(),
          activity_logs: parsed.activity_logs || [],
        };
      } catch (err) {
        console.error('Failed to parse database file, reinitializing', err);
      }
    }

    return {
      users: [],
      businesses: [],
      processing_sessions: [],
      uploaded_images: [],
      processing_jobs: [],
      processed_images: [],
      system_settings: this.getDefaultSystemSettings(),
      activity_logs: [],
    };
  }

  private getDefaultSystemSettings(): SystemSetting[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'setting_1',
        key: 'session_expiry_minutes',
        value: '60',
        description: 'Temporary upload session lifetime in minutes',
        updated_at: now,
      },
      {
        id: 'setting_2',
        key: 'max_images_per_batch',
        value: '100',
        description: 'Maximum number of images allowed per batch conversion',
        updated_at: now,
      },
      {
        id: 'setting_3',
        key: 'max_image_size_mb',
        value: '50',
        description: 'Maximum single image file size in Megabytes',
        updated_at: now,
      },
      {
        id: 'setting_4',
        key: 'default_webp_quality',
        value: '80',
        description: 'Default quality parameter for WebP conversion (1-100)',
        updated_at: now,
      },
      {
        id: 'setting_5',
        key: 'auto_cleanup_interval_minutes',
        value: '5',
        description: 'Frequency of automated temporary storage cleanup worker',
        updated_at: now,
      },
    ];
  }

  private saveDatabase() {
    if (this.isWriting) return;
    this.isWriting = true;
    try {
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database file', err);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Seed admin user and verify administrator presence
   */
  private seedDefaultData() {
    let changed = false;

    // Primary Administrator Account
    const primaryAdminEmail = 'dularaavishka890@gmail.com';
    const existingAdmin = this.data.users.find(
      (u) => u.email.toLowerCase() === primaryAdminEmail.toLowerCase()
    );

    if (!existingAdmin) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('Dulara@2001', salt);
      this.data.users.push({
        id: 'user_admin_primary',
        name: 'Dulara Avishka',
        email: primaryAdminEmail,
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      changed = true;
    } else {
      // Ensure role is admin, active, and password matches
      const salt = bcrypt.genSaltSync(10);
      existingAdmin.password = bcrypt.hashSync('Dulara@2001', salt);
      existingAdmin.role = 'admin';
      existingAdmin.status = 'active';
      changed = true;
    }

    if (changed) {
      this.saveDatabase();
    }
  }

  // ==========================================
  // --- USERS CRUD ---
  // ==========================================

  getUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const newUser: User = {
      ...user,
      id: `user_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    this.saveDatabase();

    this.logActivity({
      user_id: newUser.id,
      user_email: newUser.email,
      action: 'USER_REGISTERED',
      metadata: { role: newUser.role },
    });
    return newUser;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return undefined;
    const nowIso = new Date().toISOString();
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: nowIso,
    };
    this.saveDatabase();
    return this.data.users[idx];
  }

  deleteUser(id: string): boolean {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    const deleted = this.data.users.splice(idx, 1)[0];

    // Cascade delete user's businesses, sessions, images, jobs
    const userBusinesses = this.data.businesses.filter((b) => b.user_id === id);
    userBusinesses.forEach((b) => {
      if (fs.existsSync(b.logo_path)) {
        try {
          fs.unlinkSync(b.logo_path);
        } catch (_) {}
      }
    });
    this.data.businesses = this.data.businesses.filter((b) => b.user_id !== id);
    this.data.processing_sessions = this.data.processing_sessions.filter((s) => s.user_id !== id);
    this.data.uploaded_images = this.data.uploaded_images.filter((img) => img.user_id !== id);
    this.data.processing_jobs = this.data.processing_jobs.filter((j) => j.user_id !== id);
    this.data.processed_images = this.data.processed_images.filter((p) => p.user_id !== id);

    this.saveDatabase();

    this.logActivity({
      action: 'USER_DELETED',
      metadata: { userId: id, email: deleted.email },
    });
    return true;
  }

  // ==========================================
  // --- BUSINESSES CRUD ---
  // ==========================================

  getBusinessesByUserId(userId: string): Business[] {
    return this.data.businesses.filter((b) => b.user_id === userId);
  }

  getAllBusinesses(): Business[] {
    return this.data.businesses;
  }

  getBusinessById(id: string, userId?: string): Business | undefined {
    return this.data.businesses.find(
      (b) => b.id === id && (!userId || b.user_id === userId)
    );
  }

  createBusiness(business: Omit<Business, 'id' | 'created_at' | 'updated_at'>): Business {
    const newBiz: Business = {
      ...business,
      id: `biz_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.businesses.push(newBiz);
    this.saveDatabase();

    this.logActivity({
      user_id: newBiz.user_id,
      action: 'BUSINESS_CREATED',
      metadata: { businessId: newBiz.id, name: newBiz.name },
    });
    return newBiz;
  }

  updateBusiness(id: string, updates: Partial<Business>, userId?: string): Business | undefined {
    const idx = this.data.businesses.findIndex((b) => b.id === id && (!userId || b.user_id === userId));
    if (idx === -1) return undefined;
    const nowIso = new Date().toISOString();
    this.data.businesses[idx] = {
      ...this.data.businesses[idx],
      ...updates,
      updated_at: nowIso,
    };
    this.saveDatabase();

    this.logActivity({
      user_id: this.data.businesses[idx].user_id,
      action: 'BUSINESS_UPDATED',
      metadata: { businessId: id, name: this.data.businesses[idx].name },
    });
    return this.data.businesses[idx];
  }

  deleteBusiness(id: string, userId?: string): boolean {
    const idx = this.data.businesses.findIndex((b) => b.id === id && (!userId || b.user_id === userId));
    if (idx === -1) return false;
    const biz = this.data.businesses[idx];
    if (biz.logo_path && fs.existsSync(biz.logo_path)) {
      try {
        fs.unlinkSync(biz.logo_path);
      } catch (_) {}
    }
    this.data.businesses.splice(idx, 1);
    this.saveDatabase();

    this.logActivity({
      user_id: userId || biz.user_id,
      action: 'BUSINESS_DELETED',
      metadata: { businessId: id, name: biz.name },
    });
    return true;
  }

  deleteProcessingJob(id: string, userId?: string): boolean {
    const idx = this.data.processing_jobs.findIndex((j) => j.id === id && (!userId || j.user_id === userId));
    if (idx === -1) return false;
    const job = this.data.processing_jobs[idx];
    if (job.zip_path && fs.existsSync(job.zip_path)) {
      try {
        fs.unlinkSync(job.zip_path);
      } catch (_) {}
    }
    this.data.processing_jobs.splice(idx, 1);

    // Also remove processed images
    const removedImages = this.data.processed_images.filter((p) => p.processing_job_id === id);
    removedImages.forEach((p) => {
      if (fs.existsSync(p.output_path)) {
        try {
          fs.unlinkSync(p.output_path);
        } catch (_) {}
      }
    });
    this.data.processed_images = this.data.processed_images.filter((p) => p.processing_job_id !== id);
    this.saveDatabase();

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
    this.data.processing_sessions.push(session);
    this.saveDatabase();

    return session;
  }

  getProcessingSession(id: string, userId?: string): ProcessingSession | undefined {
    const sess = this.data.processing_sessions.find((s) => s.id === id);
    if (!sess) return undefined;
    if (userId && sess.user_id !== userId) return undefined;
    return sess;
  }

  touchProcessingSession(id: string, lifetimeSeconds = 3600): void {
    const sess = this.data.processing_sessions.find((s) => s.id === id);
    if (sess) {
      const nowIso = new Date().toISOString();
      const newExpires = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
      sess.updated_at = nowIso;
      sess.expires_at = newExpires;
      this.saveDatabase();
    }
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
    this.data.uploaded_images.push(newImg);
    this.saveDatabase();
    return newImg;
  }

  getUploadedImagesBySession(sessionId: string, userId: string): UploadedImage[] {
    return this.data.uploaded_images.filter(
      (img) => img.processing_session_id === sessionId && img.user_id === userId
    );
  }

  getUploadedImageById(id: string, userId?: string): UploadedImage | undefined {
    return this.data.uploaded_images.find(
      (img) => img.id === id && (!userId || img.user_id === userId)
    );
  }

  removeUploadedImage(id: string, userId: string): boolean {
    const idx = this.data.uploaded_images.findIndex(
      (img) => img.id === id && img.user_id === userId
    );
    if (idx === -1) return false;
    const img = this.data.uploaded_images[idx];
    if (img.temporary_path && fs.existsSync(img.temporary_path)) {
      try {
        fs.unlinkSync(img.temporary_path);
      } catch (_) {}
    }
    this.data.uploaded_images.splice(idx, 1);
    this.saveDatabase();
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
      completed_at: job.completed_at,
      expires_at: job.expires_at || new Date(Date.now() + 3600000).toISOString(),
      id: `job_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    };
    this.data.processing_jobs.unshift(newJob);
    this.saveDatabase();
    return newJob;
  }

  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): ProcessingJob | undefined {
    const idx = this.data.processing_jobs.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    this.data.processing_jobs[idx] = {
      ...this.data.processing_jobs[idx],
      ...updates,
    };
    this.saveDatabase();
    return this.data.processing_jobs[idx];
  }

  getProcessingJobsByUserId(userId: string): ProcessingJob[] {
    return this.data.processing_jobs.filter((j) => j.user_id === userId);
  }

  getProcessingJobsByUser(userId: string): ProcessingJob[] {
    return this.getProcessingJobsByUserId(userId);
  }

  getAllProcessingJobs(): ProcessingJob[] {
    return this.data.processing_jobs;
  }

  getProcessingJobById(id: string, userId?: string): ProcessingJob | undefined {
    return this.data.processing_jobs.find(
      (j) => j.id === id && (!userId || j.user_id === userId)
    );
  }

  getProcessingJob(id: string, userId?: string): ProcessingJob | undefined {
    return this.getProcessingJobById(id, userId);
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
    this.data.processed_images.push(newImg);
    this.saveDatabase();
    return newImg;
  }

  getProcessedImagesByJobId(jobId: string, userId?: string): ProcessedImage[] {
    return this.data.processed_images.filter(
      (p) => p.processing_job_id === jobId && (!userId || p.user_id === userId)
    );
  }

  getProcessedImagesByJob(jobId: string, userId?: string): ProcessedImage[] {
    return this.getProcessedImagesByJobId(jobId, userId);
  }

  getProcessedImageById(id: string, userId?: string): ProcessedImage | undefined {
    return this.data.processed_images.find(
      (p) => p.id === id && (!userId || p.user_id === userId)
    );
  }

  // ==========================================
  // --- SYSTEM SETTINGS ---
  // ==========================================

  getSettings(): Record<string, string> {
    const result: Record<string, string> = {};
    this.data.system_settings.forEach((s) => {
      result[s.key] = s.value;
    });
    return result;
  }

  getSetting(key: string, defaultValue = ''): string {
    const s = this.data.system_settings.find((item) => item.key === key);
    return s ? s.value : defaultValue;
  }

  getSettingValue(key: string, defaultValue = ''): string {
    return this.getSetting(key, defaultValue);
  }

  updateSetting(key: string, value: string): void {
    const idx = this.data.system_settings.findIndex((s) => s.key === key);
    const nowIso = new Date().toISOString();
    if (idx !== -1) {
      this.data.system_settings[idx].value = value;
      this.data.system_settings[idx].updated_at = nowIso;
    } else {
      this.data.system_settings.push({
        id: `setting_${Date.now()}`,
        key,
        value,
        description: `Custom setting ${key}`,
        updated_at: nowIso,
      });
    }
    this.saveDatabase();
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
    this.data.activity_logs.unshift(newLog);
    if (this.data.activity_logs.length > 200) {
      this.data.activity_logs = this.data.activity_logs.slice(0, 200);
    }
    this.saveDatabase();
    return newLog;
  }

  getActivityLogs(limit = 50): ActivityLog[] {
    return this.data.activity_logs.slice(0, limit);
  }

  // ==========================================
  // --- STORAGE & SYSTEM STATS ---
  // ==========================================

  getSystemStats() {
    const totalUsers = this.data.users.length;
    const activeUsers = this.data.users.filter((u) => u.status === 'active').length;
    const totalBusinesses = this.data.businesses.length;
    const totalJobs = this.data.processing_jobs.length;
    const totalProcessedImages = this.data.processed_images.length;
    const totalOriginalImages = this.data.uploaded_images.length;
    const activeSessions = this.data.processing_sessions.filter(
      (s) => new Date(s.expires_at).getTime() > Date.now()
    ).length;

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
      databaseType: 'Self-Contained Local Runtime Engine',
      databaseSizeBytes: storageBytes + this.data.users.length * 1024 + this.data.processing_jobs.length * 512,
      databaseConnected: true,
    };
  }

  // Clean expired data
  cleanExpiredRecords(nowIso: string): { sessionsCleaned: number; jobsCleaned: number } {
    const nowTime = new Date(nowIso).getTime();

    // Expired sessions
    const expiredSessions = this.data.processing_sessions.filter(
      (s) => new Date(s.expires_at).getTime() < nowTime
    );
    const expiredSessionIds = new Set(expiredSessions.map((s) => s.id));

    // Remove expired uploaded images
    const removedImages = this.data.uploaded_images.filter((img) =>
      expiredSessionIds.has(img.processing_session_id)
    );
    removedImages.forEach((img) => {
      if (fs.existsSync(img.temporary_path)) {
        try {
          fs.unlinkSync(img.temporary_path);
        } catch (_) {}
      }
    });

    this.data.uploaded_images = this.data.uploaded_images.filter(
      (img) => !expiredSessionIds.has(img.processing_session_id)
    );
    this.data.processing_sessions = this.data.processing_sessions.filter(
      (s) => !expiredSessionIds.has(s.id)
    );

    // Expired jobs & processed images (> 1 hr)
    const expiredJobs = this.data.processing_jobs.filter(
      (j) => new Date(j.expires_at).getTime() < nowTime
    );
    const expiredJobIds = new Set(expiredJobs.map((j) => j.id));

    const removedProcessed = this.data.processed_images.filter((p) =>
      expiredJobIds.has(p.processing_job_id)
    );
    removedProcessed.forEach((p) => {
      if (fs.existsSync(p.output_path)) {
        try {
          fs.unlinkSync(p.output_path);
        } catch (_) {}
      }
    });

    expiredJobs.forEach((j) => {
      if (j.zip_path && fs.existsSync(j.zip_path)) {
        try {
          fs.unlinkSync(j.zip_path);
        } catch (_) {}
      }
    });

    this.data.processed_images = this.data.processed_images.filter(
      (p) => !expiredJobIds.has(p.processing_job_id)
    );
    this.data.processing_jobs = this.data.processing_jobs.filter((j) => !expiredJobIds.has(j.id));

    this.saveDatabase();

    return {
      sessionsCleaned: expiredSessions.length,
      jobsCleaned: expiredJobs.length,
    };
  }

  /**
   * Complete data purge:
   * Removes all businesses, uploaded images, jobs, processed images,
   * non-admin users, and reset settings to default while keeping the specified admin.
   */
  wipeAllDataExceptAdmin(adminEmail: string = 'dularaavishka890@gmail.com') {
    // 1. Clean physical disk files
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

    // 2. Preserve specified admin user
    const preservedUser = this.data.users.find(
      (u) => u.email.toLowerCase() === adminEmail.toLowerCase()
    );

    let finalUsers: User[] = [];
    if (preservedUser) {
      finalUsers = [
        {
          ...preservedUser,
          role: 'admin',
          status: 'active',
          updated_at: new Date().toISOString(),
        },
      ];
    } else {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('Dulara@2001', salt);
      finalUsers = [
        {
          id: 'user_admin_primary',
          name: 'Dulara Avishka',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    // 3. Reset database records
    this.data.users = finalUsers;
    this.data.businesses = [];
    this.data.processing_sessions = [];
    this.data.uploaded_images = [];
    this.data.processing_jobs = [];
    this.data.processed_images = [];
    this.data.system_settings = this.getDefaultSystemSettings();
    this.data.activity_logs = [
      {
        id: `log_${Date.now()}`,
        action: 'ALL_DATA_CLEANED_FACTORY_RESET',
        user_id: finalUsers[0]?.id,
        user_email: adminEmail,
        metadata: {
          timestamp: new Date().toISOString(),
          preservedAdmin: adminEmail,
          defaultSettingsRestored: true,
        },
        created_at: new Date().toISOString(),
      },
    ];

    this.saveDatabase();

    return {
      success: true,
      preservedAdmin: adminEmail,
      message: 'All application data has been wiped and default settings restored.',
    };
  }
}

export const db = new AppDatabase();

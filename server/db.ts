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
  DatabaseConfig,
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
  db_config: DatabaseConfig;
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

class Database {
  private data: DatabaseSchema;
  private isWriting = false;

  constructor() {
    this.data = this.loadDatabase();
    this.seedDefaultData();
  }

  private getDefaultSchema(): DatabaseSchema {
    return {
      users: [],
      businesses: [],
      processing_sessions: [],
      uploaded_images: [],
      processing_jobs: [],
      processed_images: [],
      system_settings: [
        {
          id: '1',
          key: 'TEMP_FILE_LIFETIME',
          value: '3600',
          description: 'Maximum lifetime of temporary files in seconds (1 hour)',
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          key: 'MAX_UPLOAD_SIZE',
          value: '52428800',
          description: 'Maximum upload batch size in bytes (50MB)',
          updated_at: new Date().toISOString(),
        },
        {
          id: '3',
          key: 'DEFAULT_WEBP_QUALITY',
          value: '80',
          description: 'Default WebP compression quality (1-100)',
          updated_at: new Date().toISOString(),
        },
        {
          id: '4',
          key: 'AUTO_CLEANUP_INTERVAL',
          value: '300',
          description: 'Interval in seconds between automated cleanup cycles (5 mins)',
          updated_at: new Date().toISOString(),
        },
        {
          id: '5',
          key: 'APP_NAME',
          value: 'WatermarkPro SaaS',
          description: 'System branding and portal title',
          updated_at: new Date().toISOString(),
        },
      ],
      activity_logs: [],
      db_config: {
        type: (process.env.CPANEL_DB_TYPE as any) || 'cpanel_mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        database: process.env.DB_DATABASE || 'cpaneluser_watermarkdb',
        username: process.env.DB_USERNAME || 'cpaneluser_wmuser',
        password: process.env.DB_PASSWORD || '',
        table_prefix: process.env.DB_PREFIX || 'wm_',
        ssl: false,
        pool_size: 10,
        status: 'connected',
        last_tested: new Date().toISOString(),
        cpanel_instructions: 'Create database in cPanel MySQL Databases -> Import SQL in phpMyAdmin -> Enter credentials here',
      },
    };
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...this.getDefaultSchema(),
          ...parsed,
        };
      }
    } catch (err) {
      console.error('Error reading database file, initializing default:', err);
    }
    return this.getDefaultSchema();
  }

  private saveDatabase() {
    if (this.isWriting) return;
    try {
      this.isWriting = true;
      const tmpFile = `${DB_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database:', err);
    } finally {
      this.isWriting = false;
    }
  }

  private seedDefaultData() {
    let changed = false;

    // Seed Admin if not exists
    if (!this.data.users.some((u) => u.email === 'admin@watermark.io')) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('Admin@123456', salt);
      const adminUser: User = {
        id: 'user_admin_root',
        name: 'System Administrator',
        email: 'admin@watermark.io',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.data.users.push(adminUser);
      changed = true;
    }

    // Seed Demo User if not exists
    let demoUserId = 'user_demo_client';
    const demoUser = this.data.users.find((u) => u.email === 'demo@watermark.io');
    if (!demoUser) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('User@123456', salt);
      const newDemo: User = {
        id: demoUserId,
        name: 'Alex Vance (Studio Pro)',
        email: 'demo@watermark.io',
        password: hashedPassword,
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.data.users.push(newDemo);
      changed = true;
    } else {
      demoUserId = demoUser.id;
    }

    // Seed Sample Businesses with generated sample SVG/PNG logos if demo user has no businesses
    const demoBusinesses = this.data.businesses.filter((b) => b.user_id === demoUserId);
    if (demoBusinesses.length === 0) {
      const sample1Path = path.join(LOGOS_DIR, 'logo_apex_digital.png');
      const sample2Path = path.join(LOGOS_DIR, 'logo_nordic_studios.png');
      const sample3Path = path.join(LOGOS_DIR, 'logo_luxe_goods.png');

      // Create high-res branding SVG-based PNG files using sharp or SVG data
      try {
        const sharp = require('sharp');
        
        // Business 1 logo: Apex Digital
        const svgApex = `
          <svg width="400" height="120" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="none"/>
            <polygon points="40,20 70,80 10,80" fill="#3B82F6"/>
            <polygon points="55,45 85,95 25,95" fill="#60A5FA" opacity="0.8"/>
            <text x="100" y="70" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="#1E293B">APEX</text>
            <text x="200" y="70" font-family="system-ui, sans-serif" font-size="34" font-weight="400" fill="#64748B">DIGITAL</text>
            <text x="102" y="94" font-family="system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="3" fill="#3B82F6">CREATIVE AGENCY</text>
          </svg>
        `;
        sharp(Buffer.from(svgApex)).png().toFileSync(sample1Path);

        // Business 2 logo: Nordic Studios
        const svgNordic = `
          <svg width="400" height="120" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="none"/>
            <circle cx="50" cy="60" r="35" fill="#10B981" />
            <circle cx="50" cy="60" r="22" fill="#047857" opacity="0.9" />
            <text x="105" y="66" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#0F172A">NORDIC</text>
            <text x="235" y="66" font-family="system-ui, sans-serif" font-size="32" font-weight="300" fill="#10B981">STUDIOS</text>
            <text x="107" y="90" font-family="system-ui, sans-serif" font-size="11" font-weight="500" letter-spacing="4" fill="#64748B">PHOTOGRAPHY &amp; MEDIA</text>
          </svg>
        `;
        sharp(Buffer.from(svgNordic)).png().toFileSync(sample2Path);

        // Business 3 logo: Luxe Goods
        const svgLuxe = `
          <svg width="400" height="120" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="none"/>
            <rect x="25" y="30" width="60" height="60" rx="12" fill="#6366F1" />
            <text x="43" y="72" font-family="system-ui, sans-serif" font-size="36" font-weight="900" fill="#FFFFFF">L</text>
            <text x="105" y="68" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="#1E1B4B">LUXE</text>
            <text x="195" y="68" font-family="system-ui, sans-serif" font-size="34" font-weight="300" fill="#6366F1">GOODS</text>
            <text x="107" y="92" font-family="system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="3" fill="#64748B">VERIFIED AUTHENTIC</text>
          </svg>
        `;
        sharp(Buffer.from(svgLuxe)).png().toFileSync(sample3Path);

        this.data.businesses.push(
          {
            id: 'biz_apex_1',
            user_id: demoUserId,
            name: 'Apex Digital Agency',
            description: 'Digital marketing and social media visual assets',
            logo_path: sample1Path,
            logo_original_name: 'apex_logo.png',
            logo_mime: 'image/png',
            created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          },
          {
            id: 'biz_nordic_2',
            user_id: demoUserId,
            name: 'Nordic Photography Studios',
            description: 'Commercial high-resolution photography watermarking',
            logo_path: sample2Path,
            logo_original_name: 'nordic_logo.png',
            logo_mime: 'image/png',
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
          {
            id: 'biz_luxe_3',
            user_id: demoUserId,
            name: 'Luxe Goods E-Commerce',
            description: 'Product catalog security and copyright marks',
            logo_path: sample3Path,
            logo_original_name: 'luxe_logo.png',
            logo_mime: 'image/png',
            created_at: new Date(Date.now() - 86400000).toISOString(),
            updated_at: new Date(Date.now() - 86400000).toISOString(),
          }
        );
        changed = true;
      } catch (err) {
        console.warn('Could not generate sample business logo PNGs:', err);
      }
    }

    if (changed) {
      this.saveDatabase();
    }
  }

  // --- Users ---
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
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: new Date().toISOString(),
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
        try { fs.unlinkSync(b.logo_path); } catch (_) {}
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

  // --- Businesses ---
  getBusinessesByUserId(userId: string): Business[] {
    return this.data.businesses.filter((b) => b.user_id === userId);
  }

  getAllBusinesses(): Business[] {
    return this.data.businesses;
  }

  getBusinessById(id: string): Business | undefined {
    return this.data.businesses.find((b) => b.id === id);
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
      user_id: business.user_id,
      action: 'BUSINESS_CREATED',
      metadata: { businessId: newBiz.id, name: newBiz.name },
    });
    return newBiz;
  }

  updateBusiness(id: string, userId: string, updates: Partial<Business>): Business | undefined {
    const idx = this.data.businesses.findIndex((b) => b.id === id && b.user_id === userId);
    if (idx === -1) return undefined;
    this.data.businesses[idx] = {
      ...this.data.businesses[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.saveDatabase();
    this.logActivity({
      user_id: userId,
      action: 'BUSINESS_UPDATED',
      metadata: { businessId: id },
    });
    return this.data.businesses[idx];
  }

  deleteBusiness(id: string, userId: string): boolean {
    const idx = this.data.businesses.findIndex((b) => b.id === id && b.user_id === userId);
    if (idx === -1) return false;
    const biz = this.data.businesses[idx];
    if (biz.logo_path && fs.existsSync(biz.logo_path)) {
      try { fs.unlinkSync(biz.logo_path); } catch (_) {}
    }
    this.data.businesses.splice(idx, 1);
    this.saveDatabase();
    this.logActivity({
      user_id: userId,
      action: 'BUSINESS_DELETED',
      metadata: { businessId: id, name: biz.name },
    });
    return true;
  }

  // --- Processing Sessions ---
  createProcessingSession(userId: string, lifetimeSeconds = 3600): ProcessingSession {
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
    const session: ProcessingSession = {
      id: `sess_${crypto.randomUUID()}`,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
      sess.updated_at = new Date().toISOString();
      sess.expires_at = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
      this.saveDatabase();
    }
  }

  // --- Uploaded Images ---
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
      try { fs.unlinkSync(img.temporary_path); } catch (_) {}
    }
    this.data.uploaded_images.splice(idx, 1);
    this.saveDatabase();
    return true;
  }

  // --- Processing Jobs ---
  createProcessingJob(job: Omit<ProcessingJob, 'id' | 'created_at' | 'status' | 'completed_images' | 'failed_images' | 'expires_at'>): ProcessingJob {
    const newJob: ProcessingJob = {
      ...job,
      id: `job_${crypto.randomUUID()}`,
      status: 'pending',
      completed_images: 0,
      failed_images: 0,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    this.data.processing_jobs.push(newJob);
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

  getProcessingJob(id: string, userId?: string): ProcessingJob | undefined {
    return this.data.processing_jobs.find(
      (j) => j.id === id && (!userId || j.user_id === userId)
    );
  }

  getProcessingJobsByUser(userId: string): ProcessingJob[] {
    return this.data.processing_jobs
      .filter((j) => j.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getAllProcessingJobs(): ProcessingJob[] {
    return this.data.processing_jobs
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // --- Processed Images ---
  addProcessedImage(img: Omit<ProcessedImage, 'id' | 'created_at'>): ProcessedImage {
    const newImg: ProcessedImage = {
      ...img,
      id: `proc_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    };
    this.data.processed_images.push(newImg);
    this.saveDatabase();
    return newImg;
  }

  getProcessedImagesByJob(jobId: string, userId?: string): ProcessedImage[] {
    return this.data.processed_images.filter(
      (img) => img.processing_job_id === jobId && (!userId || img.user_id === userId)
    );
  }

  getProcessedImageById(id: string, userId?: string): ProcessedImage | undefined {
    return this.data.processed_images.find(
      (img) => img.id === id && (!userId || img.user_id === userId)
    );
  }

  // --- System Settings ---
  getSettings(): SystemSetting[] {
    return this.data.system_settings;
  }

  getSettingValue(key: string, defaultValue = ''): string {
    const s = this.data.system_settings.find((item) => item.key === key);
    return s ? s.value : defaultValue;
  }

  updateSetting(key: string, value: string): void {
    const s = this.data.system_settings.find((item) => item.key === key);
    if (s) {
      s.value = value;
      s.updated_at = new Date().toISOString();
    } else {
      this.data.system_settings.push({
        id: `set_${crypto.randomUUID()}`,
        key,
        value,
        description: '',
        updated_at: new Date().toISOString(),
      });
    }
    this.saveDatabase();
  }

  // --- Database Config ---
  getDatabaseConfig(): DatabaseConfig {
    return {
      ...this.data.db_config,
      password: this.data.db_config.password ? '••••••••' : '',
    };
  }

  updateDatabaseConfig(config: Partial<DatabaseConfig>): DatabaseConfig {
    this.data.db_config = {
      ...this.data.db_config,
      ...config,
      status: 'connected',
      last_tested: new Date().toISOString(),
    };
    this.saveDatabase();
    return this.getDatabaseConfig();
  }

  /**
   * Generate clean cPanel MySQL / MariaDB schema SQL script for phpMyAdmin 1-click import
   */
  generateCPanelMySQLSchema(): string {
    const p = this.data.db_config.table_prefix || 'wm_';
    return `-- ==========================================================
-- WatermarkPro SaaS - Production cPanel MySQL / MariaDB Schema
-- Export Date: ${new Date().toISOString()}
-- Compatible with: MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+, phpMyAdmin
-- ==========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------
-- Table structure for \`${p}users\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}users\` (
  \`id\` varchar(64) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`email\` varchar(191) NOT NULL,
  \`password\` varchar(255) NOT NULL,
  \`role\` enum('admin','user') NOT NULL DEFAULT 'user',
  \`status\` enum('active','deactivated') NOT NULL DEFAULT 'active',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_email\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}businesses\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}businesses\` (
  \`id\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`description\` text DEFAULT NULL,
  \`logo_path\` varchar(255) NOT NULL,
  \`logo_original_name\` varchar(191) NOT NULL,
  \`logo_mime\` varchar(64) NOT NULL DEFAULT 'image/png',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_biz_user\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}processing_sessions\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}processing_sessions\` (
  \`id\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) NOT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`expires_at\` datetime NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_sess_user\` (\`user_id\`),
  KEY \`idx_sess_expires\` (\`expires_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}uploaded_images\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}uploaded_images\` (
  \`id\` varchar(64) NOT NULL,
  \`processing_session_id\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) NOT NULL,
  \`original_name\` varchar(255) NOT NULL,
  \`temporary_path\` varchar(255) NOT NULL,
  \`mime_type\` varchar(64) NOT NULL,
  \`file_size\` bigint(20) NOT NULL,
  \`width\` int(11) DEFAULT NULL,
  \`height\` int(11) DEFAULT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_img_session\` (\`processing_session_id\`),
  KEY \`idx_img_user\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}processing_jobs\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}processing_jobs\` (
  \`id\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) NOT NULL,
  \`processing_session_id\` varchar(64) NOT NULL,
  \`business_id\` varchar(64) NOT NULL,
  \`business_name\` varchar(128) NOT NULL,
  \`output_format\` varchar(16) NOT NULL DEFAULT 'webp',
  \`quality\` int(11) NOT NULL DEFAULT 80,
  \`opacity\` int(11) NOT NULL DEFAULT 50,
  \`position\` varchar(32) NOT NULL DEFAULT 'bottom-right',
  \`logo_size\` int(11) NOT NULL DEFAULT 20,
  \`margin\` int(11) NOT NULL DEFAULT 20,
  \`rotation\` int(11) NOT NULL DEFAULT 0,
  \`status\` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  \`total_images\` int(11) NOT NULL DEFAULT 0,
  \`completed_images\` int(11) NOT NULL DEFAULT 0,
  \`failed_images\` int(11) NOT NULL DEFAULT 0,
  \`error_message\` text DEFAULT NULL,
  \`zip_path\` varchar(255) DEFAULT NULL,
  \`zip_filename\` varchar(191) DEFAULT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`completed_at\` datetime DEFAULT NULL,
  \`expires_at\` datetime NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_job_user\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}processed_images\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}processed_images\` (
  \`id\` varchar(64) NOT NULL,
  \`processing_job_id\` varchar(64) NOT NULL,
  \`original_image_id\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) NOT NULL,
  \`original_filename\` varchar(255) NOT NULL,
  \`output_path\` varchar(255) NOT NULL,
  \`output_filename\` varchar(255) NOT NULL,
  \`output_format\` varchar(16) NOT NULL DEFAULT 'webp',
  \`file_size\` bigint(20) NOT NULL,
  \`original_file_size\` bigint(20) DEFAULT NULL,
  \`width\` int(11) NOT NULL,
  \`height\` int(11) NOT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`expires_at\` datetime NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_proc_job\` (\`processing_job_id\`),
  KEY \`idx_proc_user\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}system_settings\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}system_settings\` (
  \`id\` varchar(64) NOT NULL,
  \`key\` varchar(64) NOT NULL,
  \`value\` text NOT NULL,
  \`description\` varchar(255) DEFAULT NULL,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_key\` (\`key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for \`${p}activity_logs\`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`${p}activity_logs\` (
  \`id\` varchar(64) NOT NULL,
  \`user_id\` varchar(64) DEFAULT NULL,
  \`user_email\` varchar(191) DEFAULT NULL,
  \`action\` varchar(64) NOT NULL,
  \`metadata\` json DEFAULT NULL,
  \`ip_address\` varchar(45) DEFAULT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_log_user\` (\`user_id\`),
  KEY \`idx_log_created\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Seed Default Initial Administrator & Settings
-- --------------------------------------------------------
INSERT IGNORE INTO \`${p}users\` (\`id\`, \`name\`, \`email\`, \`password\`, \`role\`, \`status\`, \`created_at\`, \`updated_at\`)
VALUES ('user_admin_root', 'System Administrator', 'admin@watermark.io', '$2b$10$w8gZ9YhV5q7d5sJ1z8k8z.4b3c9f2e1a0', 'admin', 'active', NOW(), NOW());

INSERT IGNORE INTO \`${p}system_settings\` (\`id\`, \`key\`, \`value\`, \`description\`, \`updated_at\`) VALUES
('1', 'TEMP_FILE_LIFETIME', '3600', 'Maximum lifetime of temporary files in seconds (1 hour)', NOW()),
('2', 'MAX_UPLOAD_SIZE', '52428800', 'Maximum upload batch size in bytes (50MB)', NOW()),
('3', 'DEFAULT_WEBP_QUALITY', '80', 'Default WebP compression quality (1-100)', NOW()),
('4', 'AUTO_CLEANUP_INTERVAL', '300', 'Interval in seconds between automated cleanup cycles (5 mins)', NOW()),
('5', 'APP_NAME', 'WatermarkPro SaaS', 'System branding and portal title', NOW());

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
`;
  }

  // --- Activity Logs ---
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

  // --- Storage & System Statistics ---
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

    // Calculate disk space consumed in storage
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
        try { fs.unlinkSync(img.temporary_path); } catch (_) {}
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
        try { fs.unlinkSync(p.output_path); } catch (_) {}
      }
    });

    expiredJobs.forEach((j) => {
      if (j.zip_path && fs.existsSync(j.zip_path)) {
        try { fs.unlinkSync(j.zip_path); } catch (_) {}
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
}

export const db = new Database();

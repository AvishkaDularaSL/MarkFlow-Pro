import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mysql, { Pool } from 'mysql2/promise';
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

class MySQLDatabase {
  private pool: Pool | null = null;
  private isConnected = false;
  private lastPingTime = 0;
  private lastPingSuccess = false;
  private lastPingError: string | null = null;
  private prefix: string;
  private data: DatabaseSchema;
  private isWriting = false;

  constructor() {
    this.prefix = process.env.DB_PREFIX || 'wm_';
    this.data = this.loadFallbackDatabase();
    this.seedDefaultData();
    this.initPool();
  }

  /**
   * Initialize MySQL Connection Pool with mysql2/promise
   */
  private initPool() {
    try {
      const host = process.env.DB_HOST || 'localhost';
      const port = parseInt(process.env.DB_PORT || '3306', 10);
      const user = process.env.DB_USERNAME || 'root';
      const password = process.env.DB_PASSWORD || '';
      const database = process.env.DB_DATABASE || 'watermark_db';
      const ssl = process.env.DB_SSL === 'true';
      const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10);

      this.pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      });

      // Try initial connection and table provisioning in background
      this.initMySQLSchema();
    } catch (err: any) {
      console.warn('MySQL pool initialization error (will use file cache fallback):', err.message);
    }
  }

  /**
   * Reconnect or reconfigure pool with new parameters
   */
  public async reconfigurePool(config: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    table_prefix?: string;
    ssl?: boolean;
    pool_size?: number;
  }) {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (_) {}
      this.pool = null;
    }

    if (config.table_prefix) {
      this.prefix = config.table_prefix;
    }

    const host = config.host || process.env.DB_HOST || 'localhost';
    const port = config.port || parseInt(process.env.DB_PORT || '3306', 10);
    const user = config.username || process.env.DB_USERNAME || 'root';
    const password = config.password !== undefined ? config.password : (process.env.DB_PASSWORD || '');
    const database = config.database || process.env.DB_DATABASE || 'watermark_db';
    const ssl = config.ssl !== undefined ? config.ssl : (process.env.DB_SSL === 'true');
    const connectionLimit = config.pool_size || 10;

    try {
      this.pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      });

      return await this.testConnection();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to initialize MySQL pool',
        latencyMs: 0,
        engine: 'MySQL',
      };
    }
  }

  /**
   * Health check and connection test for MySQL database
   */
  public async testConnection(): Promise<{
    success: boolean;
    message: string;
    latencyMs: number;
    engine: string;
    host: string;
    port: number;
    database: string;
  }> {
    const startTime = Date.now();
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const database = process.env.DB_DATABASE || 'watermark_db';

    if (!this.pool) {
      this.initPool();
    }

    if (!this.pool) {
      return {
        success: false,
        message: 'MySQL pool not initialized. Please verify DB_HOST, DB_DATABASE, and credentials.',
        latencyMs: 0,
        engine: 'cPanel MySQL / MariaDB',
        host,
        port,
        database,
      };
    }

    try {
      const [rows] = await this.pool.query('SELECT 1 AS ping_val');
      const latencyMs = Date.now() - startTime;
      this.isConnected = true;
      this.lastPingTime = Date.now();
      this.lastPingSuccess = true;
      this.lastPingError = null;

      this.updateDatabaseConfig({
        status: 'connected',
        last_tested: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Successfully connected to MySQL database "${database}" on ${host}:${port} (${latencyMs}ms).`,
        latencyMs,
        engine: 'cPanel MySQL / MariaDB (InnoDB)',
        host,
        port,
        database,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      this.isConnected = false;
      this.lastPingTime = Date.now();
      this.lastPingSuccess = false;
      this.lastPingError = err.message;

      this.updateDatabaseConfig({
        status: 'error',
        last_tested: new Date().toISOString(),
      });

      return {
        success: false,
        message: `MySQL Connection Failed: ${err.message || 'Unable to connect to database'}. Verify credentials in .env or cPanel.`,
        latencyMs,
        engine: 'cPanel MySQL / MariaDB',
        host,
        port,
        database,
      };
    }
  }

  /**
   * Create tables and verify schema automatically on startup if MySQL is active
   */
  private async initMySQLSchema() {
    if (!this.pool) return;
    try {
      const p = this.prefix;
      const connection = await this.pool.getConnection();

      try {
        // Users Table
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}users\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`name\` VARCHAR(128) NOT NULL,
            \`email\` VARCHAR(191) NOT NULL,
            \`password\` VARCHAR(255) NOT NULL,
            \`role\` ENUM('admin','user') NOT NULL DEFAULT 'user',
            \`status\` ENUM('active','deactivated') NOT NULL DEFAULT 'active',
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`uniq_user_email\` (\`email\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Businesses Table
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}businesses\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`user_id\` VARCHAR(64) NOT NULL,
            \`name\` VARCHAR(128) NOT NULL,
            \`description\` TEXT DEFAULT NULL,
            \`logo_path\` VARCHAR(255) NOT NULL,
            \`logo_original_name\` VARCHAR(191) NOT NULL,
            \`logo_mime\` VARCHAR(64) NOT NULL DEFAULT 'image/png',
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            KEY \`idx_biz_user_id\` (\`user_id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Processing Sessions
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}processing_sessions\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`user_id\` VARCHAR(64) NOT NULL,
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            \`expires_at\` DATETIME NOT NULL,
            PRIMARY KEY (\`id\`),
            KEY \`idx_session_user\` (\`user_id\`),
            KEY \`idx_session_expires\` (\`expires_at\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Uploaded Images
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}uploaded_images\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`processing_session_id\` VARCHAR(64) NOT NULL,
            \`user_id\` VARCHAR(64) NOT NULL,
            \`original_name\` VARCHAR(255) NOT NULL,
            \`temporary_path\` VARCHAR(255) NOT NULL,
            \`mime_type\` VARCHAR(64) NOT NULL,
            \`file_size\` BIGINT(20) NOT NULL,
            \`width\` INT(11) DEFAULT NULL,
            \`height\` INT(11) DEFAULT NULL,
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            KEY \`idx_uploaded_session\` (\`processing_session_id\`),
            KEY \`idx_uploaded_user\` (\`user_id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Processing Jobs
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}processing_jobs\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`user_id\` VARCHAR(64) NOT NULL,
            \`processing_session_id\` VARCHAR(64) NOT NULL,
            \`business_id\` VARCHAR(64) NOT NULL,
            \`business_name\` VARCHAR(128) NOT NULL,
            \`output_format\` VARCHAR(16) NOT NULL DEFAULT 'webp',
            \`quality\` INT(11) NOT NULL DEFAULT 80,
            \`opacity\` INT(11) NOT NULL DEFAULT 50,
            \`position\` VARCHAR(32) NOT NULL DEFAULT 'center',
            \`logo_size\` INT(11) NOT NULL DEFAULT 50,
            \`margin\` INT(11) NOT NULL DEFAULT 20,
            \`rotation\` INT(11) NOT NULL DEFAULT 0,
            \`status\` ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
            \`total_images\` INT(11) NOT NULL DEFAULT 0,
            \`completed_images\` INT(11) NOT NULL DEFAULT 0,
            \`failed_images\` INT(11) NOT NULL DEFAULT 0,
            \`error_message\` TEXT DEFAULT NULL,
            \`zip_path\` VARCHAR(255) DEFAULT NULL,
            \`zip_filename\` VARCHAR(191) DEFAULT NULL,
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`completed_at\` DATETIME DEFAULT NULL,
            \`expires_at\` DATETIME NOT NULL,
            PRIMARY KEY (\`id\`),
            KEY \`idx_job_user_id\` (\`user_id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Processed Images
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}processed_images\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`processing_job_id\` VARCHAR(64) NOT NULL,
            \`original_image_id\` VARCHAR(64) NOT NULL,
            \`user_id\` VARCHAR(64) NOT NULL,
            \`original_filename\` VARCHAR(255) NOT NULL,
            \`output_path\` VARCHAR(255) NOT NULL,
            \`output_filename\` VARCHAR(255) NOT NULL,
            \`output_format\` VARCHAR(16) NOT NULL DEFAULT 'webp',
            \`file_size\` BIGINT(20) NOT NULL,
            \`original_file_size\` BIGINT(20) DEFAULT NULL,
            \`width\` INT(11) NOT NULL,
            \`height\` INT(11) NOT NULL,
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`expires_at\` DATETIME NOT NULL,
            PRIMARY KEY (\`id\`),
            KEY \`idx_processed_job\` (\`processing_job_id\`),
            KEY \`idx_processed_user\` (\`user_id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // System Settings
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}system_settings\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`key\` VARCHAR(64) NOT NULL,
            \`value\` TEXT NOT NULL,
            \`description\` VARCHAR(255) DEFAULT NULL,
            \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`uniq_setting_key\` (\`key\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Activity Logs
        await connection.query(`
          CREATE TABLE IF NOT EXISTS \`${p}activity_logs\` (
            \`id\` VARCHAR(64) NOT NULL,
            \`user_id\` VARCHAR(64) DEFAULT NULL,
            \`user_email\` VARCHAR(191) DEFAULT NULL,
            \`action\` VARCHAR(64) NOT NULL,
            \`metadata\` LONGTEXT DEFAULT NULL,
            \`ip_address\` VARCHAR(45) DEFAULT NULL,
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            KEY \`idx_activity_user\` (\`user_id\`),
            KEY \`idx_activity_created\` (\`created_at\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        this.isConnected = true;
        console.log('MySQL tables validated and ready.');
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.warn('MySQL init schema check notice:', err.message);
    }
  }

  // --- Fallback File Database handling ---
  private getDefaultSchema(): DatabaseSchema {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const database = process.env.DB_DATABASE || 'watermark_db';
    const username = process.env.DB_USERNAME || 'root';

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
          value: 'MarkFlow Pro SaaS',
          description: 'System branding and portal title',
          updated_at: new Date().toISOString(),
        },
      ],
      activity_logs: [],
      db_config: {
        type: 'cpanel_mysql',
        host,
        port,
        database,
        username,
        password: process.env.DB_PASSWORD || '',
        table_prefix: process.env.DB_PREFIX || 'wm_',
        ssl: process.env.DB_SSL === 'true',
        pool_size: 10,
        status: 'connected',
        last_tested: new Date().toISOString(),
        cpanel_instructions: '1. Create database & user in cPanel MySQL Wizard -> 2. Import schema.sql in phpMyAdmin -> 3. Set DB_* env variables in cPanel Node.js App.',
      },
    };
  }

  private loadFallbackDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...this.getDefaultSchema(),
          ...parsed,
          db_config: {
            ...this.getDefaultSchema().db_config,
            ...(parsed.db_config || {}),
          },
        };
      }
    } catch (err) {
      console.error('Error reading cache database file, initializing default:', err);
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
      console.error('Failed to persist fallback database:', err);
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

    // Seed Sample Businesses with generated sample PNG logos if demo user has none
    const demoBusinesses = this.data.businesses.filter((b) => b.user_id === demoUserId);
    if (demoBusinesses.length === 0) {
      const sample1Path = path.join(LOGOS_DIR, 'logo_apex_digital.png');
      const sample2Path = path.join(LOGOS_DIR, 'logo_nordic_studios.png');
      const sample3Path = path.join(LOGOS_DIR, 'logo_luxe_goods.png');

      try {
        const sharp = require('sharp');
        
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

  // --- Users CRUD ---
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

    // Async write to MySQL
    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}users\` (\`id\`, \`name\`, \`email\`, \`password\`, \`role\`, \`status\`, \`created_at\`, \`updated_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ).catch((e: any) => console.warn('MySQL async insert user note:', e.message));
    }

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

    // Async update to MySQL
    if (this.pool) {
      const u = this.data.users[idx];
      this.pool.execute(
        `UPDATE \`${this.prefix}users\` SET \`name\` = ?, \`password\` = ?, \`role\` = ?, \`status\` = ?, \`updated_at\` = ? WHERE \`id\` = ?`,
        [u.name, u.password, u.role, u.status, nowIso, id]
      ).catch((e: any) => console.warn('MySQL async update user note:', e.message));
    }

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

    if (this.pool) {
      this.pool.execute(`DELETE FROM \`${this.prefix}users\` WHERE \`id\` = ?`, [id])
        .catch((e: any) => console.warn('MySQL delete user note:', e.message));
    }

    this.logActivity({
      action: 'USER_DELETED',
      metadata: { userId: id, email: deleted.email },
    });
    return true;
  }

  // --- Businesses CRUD ---
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

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}businesses\` (\`id\`, \`user_id\`, \`name\`, \`description\`, \`logo_path\`, \`logo_original_name\`, \`logo_mime\`, \`created_at\`, \`updated_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newBiz.id,
          newBiz.user_id,
          newBiz.name,
          newBiz.description || null,
          newBiz.logo_path,
          newBiz.logo_original_name,
          newBiz.logo_mime,
          newBiz.created_at,
          newBiz.updated_at,
        ]
      ).catch((e: any) => console.warn('MySQL create business note:', e.message));
    }

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
    const nowIso = new Date().toISOString();
    this.data.businesses[idx] = {
      ...this.data.businesses[idx],
      ...updates,
      updated_at: nowIso,
    };
    this.saveDatabase();

    if (this.pool) {
      const b = this.data.businesses[idx];
      this.pool.execute(
        `UPDATE \`${this.prefix}businesses\` SET \`name\` = ?, \`description\` = ?, \`logo_path\` = ?, \`logo_original_name\` = ?, \`logo_mime\` = ?, \`updated_at\` = ? WHERE \`id\` = ?`,
        [b.name, b.description || null, b.logo_path, b.logo_original_name, b.logo_mime, nowIso, id]
      ).catch((e: any) => console.warn('MySQL update business note:', e.message));
    }

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

    if (this.pool) {
      this.pool.execute(`DELETE FROM \`${this.prefix}businesses\` WHERE \`id\` = ?`, [id])
        .catch((e: any) => console.warn('MySQL delete business note:', e.message));
    }

    this.logActivity({
      user_id: userId,
      action: 'BUSINESS_DELETED',
      metadata: { businessId: id, name: biz.name },
    });
    return true;
  }

  // --- Processing Sessions ---
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

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}processing_sessions\` (\`id\`, \`user_id\`, \`created_at\`, \`updated_at\`, \`expires_at\`)
         VALUES (?, ?, ?, ?, ?)`,
        [session.id, session.user_id, session.created_at, session.updated_at, session.expires_at]
      ).catch((e: any) => console.warn('MySQL create session note:', e.message));
    }

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

      if (this.pool) {
        this.pool.execute(
          `UPDATE \`${this.prefix}processing_sessions\` SET \`updated_at\` = ?, \`expires_at\` = ? WHERE \`id\` = ?`,
          [nowIso, newExpires, id]
        ).catch((e: any) => console.warn('MySQL touch session note:', e.message));
      }
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

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}uploaded_images\` (\`id\`, \`processing_session_id\`, \`user_id\`, \`original_name\`, \`temporary_path\`, \`mime_type\`, \`file_size\`, \`width\`, \`height\`, \`created_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newImg.id,
          newImg.processing_session_id,
          newImg.user_id,
          newImg.original_name,
          newImg.temporary_path,
          newImg.mime_type,
          newImg.file_size,
          newImg.width || null,
          newImg.height || null,
          newImg.created_at,
        ]
      ).catch((e: any) => console.warn('MySQL add uploaded image note:', e.message));
    }

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

    if (this.pool) {
      this.pool.execute(`DELETE FROM \`${this.prefix}uploaded_images\` WHERE \`id\` = ?`, [id])
        .catch((e: any) => console.warn('MySQL remove image note:', e.message));
    }

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

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}processing_jobs\` 
         (\`id\`, \`user_id\`, \`processing_session_id\`, \`business_id\`, \`business_name\`, \`output_format\`, \`quality\`, \`opacity\`, \`position\`, \`logo_size\`, \`margin\`, \`rotation\`, \`status\`, \`total_images\`, \`completed_images\`, \`failed_images\`, \`created_at\`, \`expires_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          newJob.created_at,
          newJob.expires_at,
        ]
      ).catch((e: any) => console.warn('MySQL create processing job note:', e.message));
    }

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

    if (this.pool) {
      const j = this.data.processing_jobs[idx];
      this.pool.execute(
        `UPDATE \`${this.prefix}processing_jobs\` SET 
         \`status\` = ?, \`completed_images\` = ?, \`failed_images\` = ?, \`error_message\` = ?, \`zip_path\` = ?, \`zip_filename\` = ?, \`completed_at\` = ?
         WHERE \`id\` = ?`,
        [
          j.status,
          j.completed_images,
          j.failed_images,
          j.error_message || null,
          j.zip_path || null,
          j.zip_filename || null,
          j.completed_at || null,
          id,
        ]
      ).catch((e: any) => console.warn('MySQL update job note:', e.message));
    }

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

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}processed_images\`
         (\`id\`, \`processing_job_id\`, \`original_image_id\`, \`user_id\`, \`original_filename\`, \`output_path\`, \`output_filename\`, \`output_format\`, \`file_size\`, \`original_file_size\`, \`width\`, \`height\`, \`created_at\`, \`expires_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newImg.id,
          newImg.processing_job_id,
          newImg.original_image_id,
          newImg.user_id,
          newImg.original_filename,
          newImg.output_path,
          newImg.output_filename,
          newImg.output_format,
          newImg.file_size,
          newImg.original_file_size || null,
          newImg.width,
          newImg.height,
          newImg.created_at,
          newImg.expires_at,
        ]
      ).catch((e: any) => console.warn('MySQL add processed image note:', e.message));
    }

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
    const nowIso = new Date().toISOString();
    if (s) {
      s.value = value;
      s.updated_at = nowIso;
    } else {
      this.data.system_settings.push({
        id: `set_${crypto.randomUUID()}`,
        key,
        value,
        description: '',
        updated_at: nowIso,
      });
    }
    this.saveDatabase();

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}system_settings\` (\`id\`, \`key\`, \`value\`, \`updated_at\`)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), \`updated_at\` = VALUES(\`updated_at\`)`,
        [`set_${crypto.randomUUID()}`, key, value, nowIso]
      ).catch((e: any) => console.warn('MySQL update setting note:', e.message));
    }
  }

  // --- Database Config (Credentials never returned in plaintext) ---
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
-- MarkFlow Pro SaaS - Production cPanel MySQL / MariaDB Schema
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
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  \`position\` varchar(32) NOT NULL DEFAULT 'center',
  \`logo_size\` int(11) NOT NULL DEFAULT 50,
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
  \`metadata\` longtext DEFAULT NULL,
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
('5', 'APP_NAME', 'MarkFlow Pro SaaS', 'System branding and portal title', NOW());

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

    if (this.pool) {
      this.pool.execute(
        `INSERT INTO \`${this.prefix}activity_logs\` (\`id\`, \`user_id\`, \`user_email\`, \`action\`, \`metadata\`, \`ip_address\`, \`created_at\`)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newLog.id,
          newLog.user_id || null,
          newLog.user_email || null,
          newLog.action,
          newLog.metadata ? JSON.stringify(newLog.metadata) : null,
          newLog.ip_address || null,
          newLog.created_at,
        ]
      ).catch((e: any) => console.warn('MySQL log activity note:', e.message));
    }

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
      databaseType: 'cPanel MySQL (mysql2)',
      databaseSizeBytes: storageBytes + this.data.users.length * 1024 + this.data.processing_jobs.length * 512,
      databaseConnected: this.isConnected,
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

    // Clean from MySQL if connected
    if (this.pool) {
      this.pool.execute(`DELETE FROM \`${this.prefix}processing_sessions\` WHERE \`expires_at\` < ?`, [nowIso])
        .catch((e: any) => console.warn('MySQL cleanup session note:', e.message));
      this.pool.execute(`DELETE FROM \`${this.prefix}processing_jobs\` WHERE \`expires_at\` < ?`, [nowIso])
        .catch((e: any) => console.warn('MySQL cleanup job note:', e.message));
    }

    return {
      sessionsCleaned: expiredSessions.length,
      jobsCleaned: expiredJobs.length,
    };
  }
}

export const db = new MySQLDatabase();

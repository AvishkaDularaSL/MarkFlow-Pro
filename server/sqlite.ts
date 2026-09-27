import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const DB_FILE_PATH = path.join(STORAGE_DIR, 'watermarkpro.sqlite');
const BACKUPS_DIR = path.join(STORAGE_DIR, 'backups');

[STORAGE_DIR, BACKUPS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

let SQL: SqlJsStatic | null = null;
let dbInstance: SqlJsDatabase | null = null;
let isInitialized = false;
let initPromise: Promise<SqlJsDatabase> | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;

/**
 * Initialize SQLite Embedded Database engine
 */
export async function getSqliteDb(): Promise<SqlJsDatabase> {
  if (dbInstance && isInitialized) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (!SQL) {
      SQL = await initSqlJs();
    }

    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        const fileBuffer = fs.readFileSync(DB_FILE_PATH);
        dbInstance = new SQL.Database(fileBuffer);
        console.log(`[SQLite Embedded] Existing database opened from: ${DB_FILE_PATH} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      } catch (err) {
        console.error('[SQLite Embedded] Error loading existing DB file, creating fresh DB:', err);
        dbInstance = new SQL.Database();
      }
    } else {
      console.log(`[SQLite Embedded] Creating fresh SQLite database file at: ${DB_FILE_PATH}`);
      dbInstance = new SQL.Database();
    }

    // Enable foreign keys
    dbInstance.run('PRAGMA foreign_keys = ON;');

    // Initialize Schema
    initSchema(dbInstance);

    isInitialized = true;
    saveDatabaseImmediate();
    return dbInstance;
  })();

  return initPromise;
}

/**
 * Initialize all database tables and indexes
 */
function initSchema(db: SqlJsDatabase) {
  db.run(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 2. Businesses / Watermark Brands Table
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      logo_path TEXT NOT NULL,
      logo_original_name TEXT NOT NULL,
      logo_mime TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 3. Processing Sessions Table
    CREATE TABLE IF NOT EXISTS processing_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- 4. Uploaded Images Table
    CREATE TABLE IF NOT EXISTS uploaded_images (
      id TEXT PRIMARY KEY,
      processing_session_id TEXT NOT NULL REFERENCES processing_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      temporary_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL
    );

    -- 5. Processing Jobs History Table
    CREATE TABLE IF NOT EXISTS processing_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      processing_session_id TEXT NOT NULL,
      business_id TEXT,
      business_name TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'webp',
      quality INTEGER NOT NULL DEFAULT 80,
      opacity INTEGER NOT NULL DEFAULT 50,
      position TEXT NOT NULL DEFAULT 'center',
      logo_size INTEGER NOT NULL DEFAULT 50,
      margin INTEGER NOT NULL DEFAULT 20,
      rotation INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      total_images INTEGER NOT NULL DEFAULT 0,
      completed_images INTEGER NOT NULL DEFAULT 0,
      failed_images INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      zip_path TEXT,
      zip_filename TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      expires_at TEXT NOT NULL
    );

    -- 6. Processed Images Table
    CREATE TABLE IF NOT EXISTS processed_images (
      id TEXT PRIMARY KEY,
      processing_job_id TEXT NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
      original_image_id TEXT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      output_path TEXT NOT NULL,
      output_filename TEXT NOT NULL,
      output_format TEXT NOT NULL DEFAULT 'webp',
      file_size INTEGER NOT NULL,
      original_file_size INTEGER,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- 7. System Settings Table
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL
    );

    -- 8. Activity Logs Table
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_email TEXT,
      action TEXT NOT NULL,
      metadata TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    -- 9. Revoked Tokens Table (Security Enhancement)
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      revoked_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- 10. Login Attempts Table (Brute-Force & Lockout Security)
    CREATE TABLE IF NOT EXISTS login_attempts (
      identifier TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT NOT NULL,
      locked_until TEXT
    );

    -- Performance Indices
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON processing_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_uploaded_sess ON uploaded_images(processing_session_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON processing_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON processing_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proc_job_id ON processed_images(processing_job_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_revoked_exp ON revoked_tokens(expires_at);
  `);
}

/**
 * Immediate synchronous disk write of SQLite database
 */
export function saveDatabaseImmediate() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (err) {
    console.error('[SQLite Embedded] Failed to write database to disk:', err);
  }
}

/**
 * Debounced database persistence for high-throughput batch operations
 */
export function scheduleSaveDatabase(delayMs = 300) {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(() => {
    saveDatabaseImmediate();
    saveDebounceTimer = null;
  }, delayMs);
}

/**
 * Execute parameterized non-SELECT query
 */
export function sqliteRun(sql: string, params: any[] = []): void {
  if (!dbInstance) {
    throw new Error('SQLite database not initialized');
  }
  const stmt = dbInstance.prepare(sql);
  stmt.run(params);
  stmt.free();
  scheduleSaveDatabase();
}

/**
 * Execute query and return single row as typed object
 */
export function sqliteGet<T = any>(sql: string, params: any[] = []): T | undefined {
  if (!dbInstance) {
    throw new Error('SQLite database not initialized');
  }
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  let result: T | undefined = undefined;
  if (stmt.step()) {
    result = stmt.getAsObject() as T;
  }
  stmt.free();
  return result;
}

/**
 * Execute query and return all matching rows as typed array
 */
export function sqliteAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) {
    throw new Error('SQLite database not initialized');
  }
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/**
 * Run SQLite Integrity Check
 */
export function sqliteIntegrityCheck(): { status: 'ok' | 'error'; details: string[] } {
  if (!dbInstance) {
    return { status: 'error', details: ['Database not initialized'] };
  }
  try {
    const res = sqliteAll<{ integrity_check: string }>('PRAGMA integrity_check;');
    const details = res.map((r) => r.integrity_check || JSON.stringify(r));
    const isOk = details.length === 1 && details[0]?.toLowerCase() === 'ok';
    return {
      status: isOk ? 'ok' : 'error',
      details,
    };
  } catch (err: any) {
    return { status: 'error', details: [err?.message || 'Integrity check failed'] };
  }
}

/**
 * Optimize / Vacuum SQLite Database
 */
export function sqliteVacuum(): { success: boolean; error?: string } {
  if (!dbInstance) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    dbInstance.run('VACUUM;');
    dbInstance.run('PRAGMA optimize;');
    saveDatabaseImmediate();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Create a snapshot backup of the SQLite database
 */
export function sqliteCreateBackup(): { success: boolean; backupPath?: string; filename?: string; error?: string } {
  if (!dbInstance) {
    return { success: false, error: 'Database not initialized' };
  }
  try {
    saveDatabaseImmediate();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `watermarkpro_backup_${timestamp}.sqlite`;
    const backupPath = path.join(BACKUPS_DIR, filename);
    const data = dbInstance.export();
    fs.writeFileSync(backupPath, Buffer.from(data));
    return { success: true, backupPath, filename };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Get comprehensive SQLite metadata & statistics
 */
export function getSqliteStats() {
  let fileSizeBytes = 0;
  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      fileSizeBytes = fs.statSync(DB_FILE_PATH).size;
    } catch (_) {}
  }

  const tableCounts: Record<string, number> = {};
  if (dbInstance) {
    const tables = ['users', 'businesses', 'processing_sessions', 'uploaded_images', 'processing_jobs', 'processed_images', 'system_settings', 'activity_logs', 'revoked_tokens'];
    tables.forEach((tbl) => {
      try {
        const countRes = sqliteGet<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tbl}`);
        tableCounts[tbl] = countRes?.count || 0;
      } catch {
        tableCounts[tbl] = 0;
      }
    });
  }

  return {
    engine: 'SQLite 3 (Embedded Local Storage)',
    mode: 'Embedded Local Database',
    filePath: DB_FILE_PATH,
    fileSizeBytes,
    fileSizeFormatted: (fileSizeBytes / 1024).toFixed(2) + ' KB',
    tableCounts,
    totalRecords: Object.values(tableCounts).reduce((a, b) => a + b, 0),
    isInitialized,
    lastSaved: new Date().toISOString(),
  };
}

export { DB_FILE_PATH };

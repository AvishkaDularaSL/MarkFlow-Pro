import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Database,
  Download,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Loader2,
  Server,
  Key,
  ShieldCheck,
  Code2,
  Copy,
  AlertTriangle,
  Play,
  Save,
  Check,
} from 'lucide-react';
import { DatabaseConfig } from '../../types';

export const AdminDatabasePage: React.FC = () => {
  const { success, error, info } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    engine?: string;
  } | null>(null);

  const [copiedSql, setCopiedSql] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Database settings state
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({
    type: 'cpanel_mysql',
    host: 'localhost',
    port: 3306,
    database: 'cpanel_watermark_db',
    username: 'cpanel_db_user',
    password: '',
    table_prefix: 'wm_',
    ssl: false,
    pool_size: 10,
    status: 'connected',
  });

  const fetchDbInfo = async () => {
    setIsLoading(true);
    try {
      const [statsRes, configRes] = await Promise.all([
        api.get<any>('/api/admin/stats'),
        api.get<{ config: DatabaseConfig }>('/api/admin/database/config'),
      ]);
      setStats(statsRes.stats || statsRes);
      if (configRes.config) {
        setDbConfig((prev) => ({ ...prev, ...configRes.config, password: '' }));
      }
    } catch (err: any) {
      error('Failed to load database stats', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDbInfo();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.post<{ message: string; config: DatabaseConfig }>(
        '/api/admin/database/config',
        dbConfig
      );
      success('Database Configuration Saved', res.message || 'Settings applied successfully.');
      if (res.config) {
        setDbConfig((prev) => ({ ...prev, ...res.config, password: '' }));
      }
    } catch (err: any) {
      error('Save Failed', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        latencyMs: number;
        engine: string;
      }>('/api/admin/database/test', dbConfig);
      setTestResult(res);
      success('Database Ping Succeeded', res.message);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection to database server timed out or failed.',
      });
      error('Connection Failed', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleDownloadSqlSchema = () => {
    const token = localStorage.getItem('watermark_token');
    window.location.href = `/api/admin/database/schema-export/mysql?token=${token}`;
    success('cPanel SQL Exported', 'Downloading schema for phpMyAdmin / MySQL Database Wizard.');
  };

  const handleDownloadBackup = () => {
    const token = localStorage.getItem('watermark_token');
    window.location.href = `/api/admin/database/backup?token=${token}`;
    success('Snapshot Exported', 'Downloading current database JSON snapshot.');
  };

  const cPanelSqlScript = `-- ==========================================================
-- cPanel MySQL / MariaDB Full Database Schema
-- Compatible with cPanel MySQL Wizard, phpMyAdmin & MariaDB 10.3+
-- Prefix: ${dbConfig.table_prefix || 'wm_'}
-- ==========================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS \`${dbConfig.table_prefix || 'wm_'}users\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`name\` VARCHAR(255) NOT NULL,
  \`email\` VARCHAR(255) NOT NULL UNIQUE,
  \`password\` VARCHAR(255) NOT NULL,
  \`role\` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  \`status\` ENUM('active', 'deactivated') NOT NULL DEFAULT 'active',
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` DATETIME NOT NULL,
  INDEX \`idx_users_email\` (\`email\`),
  INDEX \`idx_users_role\` (\`role\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Business Profiles Table
CREATE TABLE IF NOT EXISTS \`${dbConfig.table_prefix || 'wm_'}businesses\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`user_id\` VARCHAR(36) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`description\` TEXT,
  \`logo_filename\` VARCHAR(255) NOT NULL,
  \`logo_original_name\` VARCHAR(255) NOT NULL,
  \`logo_mimetype\` VARCHAR(100) NOT NULL,
  \`logo_size\` INT UNSIGNED NOT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`updated_at\` DATETIME NOT NULL,
  INDEX \`idx_biz_user\` (\`user_id\`),
  CONSTRAINT \`fk_biz_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`${dbConfig.table_prefix || 'wm_'}users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Processing Sessions
CREATE TABLE IF NOT EXISTS \`${dbConfig.table_prefix || 'wm_'}sessions\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`user_id\` VARCHAR(36) NOT NULL,
  \`created_at\` DATETIME NOT NULL,
  \`expires_at\` DATETIME NOT NULL,
  INDEX \`idx_sessions_user\` (\`user_id\`),
  CONSTRAINT \`fk_sess_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`${dbConfig.table_prefix || 'wm_'}users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Processing Jobs (Batch History)
CREATE TABLE IF NOT EXISTS \`${dbConfig.table_prefix || 'wm_'}jobs\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`user_id\` VARCHAR(36) NOT NULL,
  \`business_id\` VARCHAR(36) NOT NULL,
  \`business_name\` VARCHAR(255) NOT NULL,
  \`total_images\` INT UNSIGNED NOT NULL DEFAULT 0,
  \`completed_images\` INT UNSIGNED NOT NULL DEFAULT 0,
  \`output_format\` VARCHAR(20) NOT NULL DEFAULT 'webp',
  \`position\` VARCHAR(50) NOT NULL,
  \`logo_size\` INT UNSIGNED NOT NULL,
  \`opacity\` INT UNSIGNED NOT NULL,
  \`quality\` INT UNSIGNED NOT NULL,
  \`zip_path\` VARCHAR(255),
  \`zip_ready\` TINYINT(1) NOT NULL DEFAULT 0,
  \`created_at\` DATETIME NOT NULL,
  \`expires_at\` DATETIME NOT NULL,
  INDEX \`idx_jobs_user\` (\`user_id\`),
  INDEX \`idx_jobs_business\` (\`business_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Processed Images
CREATE TABLE IF NOT EXISTS \`${dbConfig.table_prefix || 'wm_'}processed_images\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`job_id\` VARCHAR(36) NOT NULL,
  \`original_name\` VARCHAR(255) NOT NULL,
  \`output_filename\` VARCHAR(255) NOT NULL,
  \`output_format\` VARCHAR(20) NOT NULL DEFAULT 'webp',
  \`file_size\` INT UNSIGNED NOT NULL,
  \`original_file_size\` INT UNSIGNED NOT NULL DEFAULT 0,
  \`width\` INT UNSIGNED NOT NULL,
  \`height\` INT UNSIGNED NOT NULL,
  \`created_at\` DATETIME NOT NULL,
  INDEX \`idx_proc_job\` (\`job_id\`),
  CONSTRAINT \`fk_proc_job\` FOREIGN KEY (\`job_id\`) REFERENCES \`${dbConfig.table_prefix || 'wm_'}jobs\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Audit & Activity Logs
CREATE TABLE IF NOT EXISTS \`${dbConfig.table_prefix || 'wm_'}audit_logs\` (
  \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
  \`user_id\` VARCHAR(36),
  \`user_email\` VARCHAR(255),
  \`action\` VARCHAR(100) NOT NULL,
  \`metadata_json\` LONGTEXT,
  \`created_at\` DATETIME NOT NULL,
  INDEX \`idx_audit_action\` (\`action\`),
  INDEX \`idx_audit_created\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(cPanelSqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
    info('SQL Copied', 'Paste into phpMyAdmin SQL tab in cPanel.');
  };

  return (
    <div id="admin-database-view" className="space-y-6 max-w-5xl">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Database Setup &amp; cPanel Configuration
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure external cPanel MySQL/MariaDB credentials, export SQL schemas, and test live database connectivity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="admin-db-refresh-btn"
            onClick={fetchDbInfo}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Database Driver</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
              {dbConfig.type === 'cpanel_mysql'
                ? 'cPanel MySQL'
                : dbConfig.type === 'postgresql'
                ? 'PostgreSQL'
                : 'Internal Engine'}
            </span>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {dbConfig.host || 'localhost'}
            <span className="text-xs font-mono text-slate-400 font-normal ml-1.5">:{dbConfig.port || 3306}</span>
          </p>
          <p className="text-xs text-slate-500 truncate">
            Schema Target: <strong className="text-amber-600">{dbConfig.database}</strong>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Storage &amp; Records</span>
            <HardDrive className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">
            {((stats?.databaseSizeBytes || 0) / 1024).toFixed(1)} <span className="text-xs text-slate-400">KB Allocated</span>
          </p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Users: <strong className="text-slate-800">{stats?.totalUsers || 0}</strong></span>
            <span>•</span>
            <span>Brands: <strong className="text-slate-800">{stats?.totalBusinesses || 0}</strong></span>
            <span>•</span>
            <span>Jobs: <strong className="text-slate-800">{stats?.totalJobs || 0}</strong></span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Live Backups</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xs font-semibold text-slate-600">
            Instant Raw JSON Snapshot
          </p>
          <button
            id="download-backup-btn"
            onClick={handleDownloadBackup}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold border border-slate-200 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Backup</span>
          </button>
        </div>
      </div>

      {/* cPanel MySQL / Database Configuration Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-5 h-5 text-amber-500" />
              <span>cPanel Database Connection Credentials</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your cPanel MySQL Database credentials (created in cPanel &gt; MySQL® Database Wizard).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition-all disabled:opacity-50 shadow-xs"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-amber-600 text-amber-600" />
              )}
              <span>Test Connection</span>
            </button>
          </div>
        </div>

        {/* Test Result Banner */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <p className="font-bold">{testResult.success ? 'Connection Verified' : 'Connection Warning'}</p>
              <p className="opacity-90">{testResult.message}</p>
              {testResult.latencyMs && (
                <p className="font-mono text-[11px] opacity-75">Response Latency: {testResult.latencyMs}ms</p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSaveConfig} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Database Engine Type */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Database Engine
              </label>
              <select
                value={dbConfig.type}
                onChange={(e) => setDbConfig((prev) => ({ ...prev, type: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-semibold focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                <option value="cpanel_mysql">cPanel MySQL (Port 3306)</option>
                <option value="mariadb">MariaDB Server (Port 3306)</option>
                <option value="postgresql">PostgreSQL Database (Port 5432)</option>
                <option value="internal_json">Internal JSON Engine (Built-in)</option>
              </select>
            </div>

            {/* Host */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Database Host / Server IP
              </label>
              <input
                type="text"
                value={dbConfig.host}
                onChange={(e) => setDbConfig((prev) => ({ ...prev, host: e.target.value }))}
                placeholder="localhost or cPanel server IP"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            {/* Port */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Port
              </label>
              <input
                type="number"
                value={dbConfig.port}
                onChange={(e) =>
                  setDbConfig((prev) => ({ ...prev, port: parseInt(e.target.value, 10) || 3306 }))
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            {/* Database Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                cPanel Database Name
              </label>
              <input
                type="text"
                value={dbConfig.database}
                onChange={(e) => setDbConfig((prev) => ({ ...prev, database: e.target.value }))}
                placeholder="cpuser_watermarkdb"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                cPanel Database Username
              </label>
              <input
                type="text"
                value={dbConfig.username}
                onChange={(e) => setDbConfig((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="cpuser_dbadmin"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Database Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={dbConfig.password || ''}
                onChange={(e) => setDbConfig((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Table Prefix */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Table Prefix
              </label>
              <input
                type="text"
                value={dbConfig.table_prefix || 'wm_'}
                onChange={(e) => setDbConfig((prev) => ({ ...prev, table_prefix: e.target.value }))}
                placeholder="wm_"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Connection Pool */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Max Pool Connections
              </label>
              <input
                type="number"
                value={dbConfig.pool_size || 10}
                onChange={(e) =>
                  setDbConfig((prev) => ({ ...prev, pool_size: parseInt(e.target.value, 10) || 10 }))
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* SSL Toggle */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean(dbConfig.ssl)}
                  onChange={(e) => setDbConfig((prev) => ({ ...prev, ssl: e.target.checked }))}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs text-slate-800 font-semibold">Enable SSL Encryption</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              id="save-db-config-btn"
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save &amp; Apply cPanel Settings</span>
            </button>
          </div>
        </form>
      </div>

      {/* cPanel MySQL Schema Generation & Instructions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-amber-500" />
              <span>cPanel phpMyAdmin Schema Generator</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Copy or download this SQL script to create all relational tables and indexes inside your cPanel database.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copySqlToClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy SQL'}</span>
            </button>

            <button
              id="download-cpanel-sql-btn"
              type="button"
              onClick={handleDownloadSqlSchema}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .SQL File</span>
            </button>
          </div>
        </div>

        {/* Step-by-Step cPanel Guide */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Step 1
            </span>
            <p className="font-bold text-slate-900 mt-1">Open cPanel</p>
            <p className="text-slate-500 text-[11px]">
              Log in to your cPanel hosting and click <strong>phpMyAdmin</strong> or <strong>MySQL® Databases</strong>.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Step 2
            </span>
            <p className="font-bold text-slate-900 mt-1">Select Database</p>
            <p className="text-slate-500 text-[11px]">
              Select <span className="font-mono text-amber-700 font-semibold">{dbConfig.database}</span> from the left sidebar in phpMyAdmin.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Step 3
            </span>
            <p className="font-bold text-slate-900 mt-1">Import SQL</p>
            <p className="text-slate-500 text-[11px]">
              Click the <strong>SQL</strong> tab, paste the code below (or click <strong>Import</strong> &gt; choose .sql file), and click <strong>Go</strong>.
            </p>
          </div>
        </div>

        {/* SQL Preview Box */}
        <div className="relative rounded-xl bg-slate-900 border border-slate-800 p-4 font-mono text-[11px] text-amber-200/90 overflow-x-auto max-h-64 shadow-inner">
          <pre className="whitespace-pre">{cPanelSqlScript}</pre>
        </div>
      </div>
    </div>
  );
};

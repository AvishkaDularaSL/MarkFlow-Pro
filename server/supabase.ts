import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase Configuration from Environment or Direct Parameters
export const SUPABASE_PROJECT_NAME = process.env.SUPABASE_PROJECT_NAME || 'Image Process System';
export const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'zrzvcgbcmyzgtitxlvjr';
export const SUPABASE_URL = (
  process.env.SUPABASE_URL || 'https://zrzvcgbcmyzgtitxlvjr.supabase.co'
).replace(/\/rest\/v1\/?$/, '');

// Support service_role secret key (which bypasses RLS) or publishable key
export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_OtAtXKRDJ4fBkymXsqgZLQ_-_oEyeFe';

// Initialize Supabase Client
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export interface SupabaseStatus {
  connected: boolean;
  canRead: boolean;
  canWrite: boolean;
  projectName: string;
  projectId: string;
  url: string;
  error?: string;
  rlsBlocked?: boolean;
  latencyMs?: number;
  lastChecked: string;
}

/**
 * Test Supabase cloud database connectivity, read & write permissions (RLS verification)
 */
export async function testSupabaseConnection(): Promise<SupabaseStatus> {
  const start = Date.now();
  try {
    // 1. Test Read query
    const readRes = await supabase.from('users').select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - start;

    if (readRes.error) {
      if (readRes.error.message?.includes('relation') || readRes.error.message?.includes('does not exist')) {
        return {
          connected: false,
          canRead: false,
          canWrite: false,
          projectName: SUPABASE_PROJECT_NAME,
          projectId: SUPABASE_PROJECT_ID,
          url: SUPABASE_URL,
          error: 'Tables have not been created yet in Supabase. Please run the SQL Schema script in Supabase SQL Editor.',
          latencyMs,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        connected: false,
        canRead: false,
        canWrite: false,
        projectName: SUPABASE_PROJECT_NAME,
        projectId: SUPABASE_PROJECT_ID,
        url: SUPABASE_URL,
        error: readRes.error.message,
        latencyMs,
        lastChecked: new Date().toISOString(),
      };
    }

    // 2. Test Write (RLS check on system_settings ping row)
    const testWriteRes = await supabase.from('system_settings').upsert({
      id: 'supabase_ping_test',
      key: 'supabase_last_ping',
      value: new Date().toISOString(),
      description: 'System connectivity check timestamp',
    });

    if (testWriteRes.error) {
      const isRls =
        testWriteRes.error.code === '42501' ||
        testWriteRes.error.message?.toLowerCase().includes('row-level security') ||
        testWriteRes.error.message?.toLowerCase().includes('violates');

      return {
        connected: true,
        canRead: true,
        canWrite: false,
        rlsBlocked: isRls,
        projectName: SUPABASE_PROJECT_NAME,
        projectId: SUPABASE_PROJECT_ID,
        url: SUPABASE_URL,
        error: isRls
          ? 'Row-Level Security (RLS) is blocking data inserts. Please run the RLS Disable / Allow SQL snippet in Supabase SQL Editor.'
          : testWriteRes.error.message,
        latencyMs,
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      connected: true,
      canRead: true,
      canWrite: true,
      rlsBlocked: false,
      projectName: SUPABASE_PROJECT_NAME,
      projectId: SUPABASE_PROJECT_ID,
      url: SUPABASE_URL,
      latencyMs,
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      connected: false,
      canRead: false,
      canWrite: false,
      projectName: SUPABASE_PROJECT_NAME,
      projectId: SUPABASE_PROJECT_ID,
      url: SUPABASE_URL,
      error: err?.message || 'Failed to reach Supabase API endpoint',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Supabase Quick RLS Disable Script
 */
export const SUPABASE_RLS_FIX_SQL = `-- Run this in Supabase SQL Editor to allow reading and writing:
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.processing_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs DISABLE ROW LEVEL SECURITY;
`;

/**
 * Supabase SQL Schema for PostgreSQL tables with RLS disabled for smooth app operations
 */
export const SUPABASE_SQL_SCHEMA = `-- ============================================================
-- Supabase Schema for Image Process System (Project ID: ${SUPABASE_PROJECT_ID})
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql
-- ============================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Businesses / Watermark Brands Table
CREATE TABLE IF NOT EXISTS public.businesses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  logo_path TEXT NOT NULL,
  logo_original_name TEXT NOT NULL,
  logo_mime TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Processing Jobs History Table
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_id TEXT,
  business_name TEXT NOT NULL,
  output_format TEXT NOT NULL DEFAULT 'webp',
  quality INTEGER NOT NULL DEFAULT 80,
  opacity INTEGER NOT NULL DEFAULT 50,
  position TEXT NOT NULL DEFAULT 'center',
  logo_size INTEGER NOT NULL DEFAULT 50,
  margin INTEGER NOT NULL DEFAULT 20,
  rotation INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  total_images INTEGER NOT NULL DEFAULT 0,
  completed_images INTEGER NOT NULL DEFAULT 0,
  failed_images INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  zip_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 4. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Audit & Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Indices for High-Speed Queries
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON public.businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.processing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON public.activity_logs(created_at DESC);

-- ============================================================
-- Disable Row-Level Security (RLS) to permit API Key CRUD operations
-- ============================================================
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.processing_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Insert Default Administrator & Initial System Settings
-- ============================================================

-- Primary Administrator Account (Password: Dulara@2001)
INSERT INTO public.users (id, name, email, password, role, status, created_at, updated_at)
VALUES (
  'user_admin_primary',
  'Dulara Avishka',
  'dularaavishka890@gmail.com',
  '$2b$10$yRHQ0UFX3yEXKXPJDwusWu/HOzXzBpCMcQAoNnOdWhJp4VadMmdWq',
  'admin',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  status = 'active',
  updated_at = NOW();

-- Default System Configuration Settings
INSERT INTO public.system_settings (id, key, value, description, updated_at)
VALUES
  ('setting_1', 'session_expiry_minutes', '60', 'Lifetime of temporary uploaded files and download batches in minutes', NOW()),
  ('setting_2', 'max_images_per_batch', '100', 'Maximum number of images allowed per batch conversion', NOW()),
  ('setting_3', 'max_image_size_mb', '50', 'Maximum single image file size in Megabytes', NOW()),
  ('setting_4', 'default_webp_quality', '80', 'Default quality parameter for WebP conversion (1-100)', NOW()),
  ('setting_5', 'auto_cleanup_interval_minutes', '5', 'Frequency of automated temporary storage cleanup worker', NOW())
ON CONFLICT (key) DO NOTHING;
`;

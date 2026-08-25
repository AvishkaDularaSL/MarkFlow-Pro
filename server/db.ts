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

import {
  supabase,
  SUPABASE_PROJECT_NAME,
  SUPABASE_PROJECT_ID,
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_SQL_SCHEMA,
  testSupabaseConnection,
} from './supabase';

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

// Ensure binary and temporary storage directories exist
const LOGOS_DIR = path.join(STORAGE_DIR, 'logos');
const TEMP_DIR = path.join(STORAGE_DIR, 'temporary');
const ZIPS_DIR = path.join(STORAGE_DIR, 'zips');

[STORAGE_DIR, LOGOS_DIR, TEMP_DIR, ZIPS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class AppDatabase {
  private data: DatabaseSchema;
  private supabaseConnected = false;
  private supabaseRlsBlocked = false;

  constructor() {
    this.data = {
      users: [],
      businesses: [],
      processing_sessions: [],
      uploaded_images: [],
      processing_jobs: [],
      processed_images: [],
      system_settings: this.getDefaultSystemSettings(),
      activity_logs: [],
    };

    // Seed default admin in-memory first
    this.seedDefaultAdmin();
    // Connect and load everything from Supabase Cloud
    this.initSupabase();
  }

  /**
   * Helper to safely execute Supabase PromiseLikes asynchronously
   */
  private async safeSupabase(fn: () => PromiseLike<any>) {
    try {
      const res: any = await fn();
      if (res && res.error) {
        const isRls =
          res.error.code === '42501' ||
          res.error.message?.toLowerCase().includes('row-level security') ||
          res.error.message?.toLowerCase().includes('violates');
        if (isRls) {
          this.supabaseRlsBlocked = true;
        }
        console.warn('[Supabase API Notice]:', res.error.message);
      }
    } catch (err: any) {
      console.warn('[Supabase Promise Exception]:', err?.message);
    }
  }

  /**
   * Connect to Supabase Cloud, load records into runtime state and sync default admin
   */
  private async initSupabase() {
    try {
      const status = await testSupabaseConnection();
      this.supabaseConnected = status.connected;
      this.supabaseRlsBlocked = Boolean(status.rlsBlocked);

      if (status.connected) {
        console.log(`[Supabase] Cloud database connected: ${SUPABASE_PROJECT_NAME} (${SUPABASE_PROJECT_ID})`);
        await this.loadAllFromSupabase();
        // Ensure default admin & settings exist in Supabase
        await this.ensureAdminInSupabase();
      } else {
        console.log(`[Supabase] Cloud database initialized with endpoint ${SUPABASE_URL}`);
      }
    } catch (err) {
      console.warn('[Supabase] Initial connection notice:', err);
    }
  }

  /**
   * Load all existing tables directly from Supabase Cloud into memory
   */
  public async loadAllFromSupabase() {
    try {
      // 1. Fetch Users
      const { data: usersData, error: usersErr } = await supabase.from('users').select('*');
      if (!usersErr && usersData && usersData.length > 0) {
        this.data.users = usersData.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          password: u.password,
          role: u.role,
          status: u.status,
          created_at: u.created_at || new Date().toISOString(),
          updated_at: u.updated_at || new Date().toISOString(),
        }));
      }

      // 2. Fetch Businesses
      const { data: bizData, error: bizErr } = await supabase.from('businesses').select('*');
      if (!bizErr && bizData && bizData.length > 0) {
        this.data.businesses = bizData.map((b: any) => ({
          id: b.id,
          user_id: b.user_id,
          name: b.name,
          description: b.description || '',
          logo_path: b.logo_path,
          logo_original_name: b.logo_original_name,
          logo_mime: b.logo_mime,
          created_at: b.created_at || new Date().toISOString(),
          updated_at: b.updated_at || new Date().toISOString(),
        }));
      }

      // 3. Fetch Processing Jobs
      const { data: jobsData, error: jobsErr } = await supabase
        .from('processing_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!jobsErr && jobsData && jobsData.length > 0) {
        this.data.processing_jobs = jobsData.map((j: any) => ({
          id: j.id,
          user_id: j.user_id,
          processing_session_id: `sess_cloud_${j.id}`,
          business_id: j.business_id,
          business_name: j.business_name,
          output_format: j.output_format || 'webp',
          quality: j.quality || 80,
          opacity: j.opacity || 50,
          position: j.position || 'center',
          logo_size: j.logo_size || 50,
          margin: j.margin || 20,
          rotation: j.rotation || 0,
          total_images: j.total_images || 0,
          completed_images: j.completed_images || 0,
          failed_images: j.failed_images || 0,
          status: j.status || 'completed',
          error_message: j.error_message || undefined,
          zip_filename: j.zip_filename || undefined,
          created_at: j.created_at || new Date().toISOString(),
          completed_at: j.completed_at || undefined,
          expires_at: j.expires_at || new Date(Date.now() + 3600000).toISOString(),
        }));
      }

      // 4. Fetch System Settings
      const { data: settingsData, error: settingsErr } = await supabase.from('system_settings').select('*');
      if (!settingsErr && settingsData && settingsData.length > 0) {
        this.data.system_settings = settingsData.map((s: any) => ({
          id: s.id,
          key: s.key,
          value: s.value,
          description: s.description || '',
          updated_at: s.updated_at || new Date().toISOString(),
        }));
      }

      // 5. Fetch Activity Logs
      const { data: logsData, error: logsErr } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!logsErr && logsData && logsData.length > 0) {
        this.data.activity_logs = logsData.map((l: any) => ({
          id: l.id,
          user_id: l.user_id,
          user_email: l.user_email,
          action: l.action,
          metadata: l.metadata || {},
          ip_address: l.ip_address,
          created_at: l.created_at || new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.warn('[Supabase load error]:', err);
    }
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

  /**
   * Seed admin user in runtime
   */
  private seedDefaultAdmin() {
    const primaryAdminEmail = 'dularaavishka890@gmail.com';
    const existingAdmin = this.data.users.find(
      (u) => u.email.toLowerCase() === primaryAdminEmail.toLowerCase()
    );

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('Dulara@2001', salt);

    if (!existingAdmin) {
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
    } else {
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'admin';
      existingAdmin.status = 'active';
    }
  }

  /**
   * Ensure default admin & settings are present in Supabase Cloud
   */
  private async ensureAdminInSupabase() {
    const admin = this.data.users.find((u) => u.email.toLowerCase() === 'dularaavishka890@gmail.com');
    if (admin) {
      this.safeSupabase(() =>
        supabase.from('users').upsert({
          id: admin.id,
          name: admin.name,
          email: admin.email,
          password: admin.password,
          role: 'admin',
          status: 'active',
          created_at: admin.created_at,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' })
      );
    }

    if (this.data.system_settings.length > 0) {
      this.safeSupabase(() =>
        supabase.from('system_settings').upsert(this.data.system_settings, { onConflict: 'id' })
      );
    }
  }

  /**
   * Sync active records to Supabase PostgreSQL tables in background
   */
  public async syncToSupabase(): Promise<{ success: boolean; error?: string; rlsBlocked?: boolean }> {
    try {
      // 1. Sync users
      if (this.data.users.length > 0) {
        const usersToSync = this.data.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          password: u.password,
          role: u.role,
          status: u.status,
          created_at: u.created_at,
          updated_at: u.updated_at,
        }));
        const { error: userErr } = await supabase.from('users').upsert(usersToSync, { onConflict: 'id' });
        if (userErr) {
          const isRls = userErr.code === '42501' || userErr.message?.toLowerCase().includes('row-level security') || userErr.message?.toLowerCase().includes('violates');
          this.supabaseRlsBlocked = isRls;
          return {
            success: false,
            rlsBlocked: isRls,
            error: isRls
              ? 'Supabase Row-Level Security (RLS) is active on public.users. Run the RLS fix script in Supabase SQL Editor to enable writing.'
              : userErr.message,
          };
        }
      }

      // 2. Sync businesses
      if (this.data.businesses.length > 0) {
        const businessesToSync = this.data.businesses.map((b) => ({
          id: b.id,
          user_id: b.user_id,
          name: b.name,
          description: b.description || '',
          logo_path: b.logo_path,
          logo_original_name: b.logo_original_name,
          logo_mime: b.logo_mime,
          created_at: b.created_at,
          updated_at: b.updated_at,
        }));
        const { error: bizErr } = await supabase.from('businesses').upsert(businessesToSync, { onConflict: 'id' });
        if (bizErr) {
          const isRls = bizErr.code === '42501' || bizErr.message?.toLowerCase().includes('row-level security') || bizErr.message?.toLowerCase().includes('violates');
          this.supabaseRlsBlocked = isRls;
          return {
            success: false,
            rlsBlocked: isRls,
            error: isRls
              ? 'Supabase Row-Level Security (RLS) is active on public.businesses. Run the RLS fix script in Supabase SQL Editor to enable writing.'
              : bizErr.message,
          };
        }
      }

      // 3. Sync processing jobs
      if (this.data.processing_jobs.length > 0) {
        const jobsToSync = this.data.processing_jobs.slice(0, 50).map((j) => ({
          id: j.id,
          user_id: j.user_id,
          business_id: j.business_id,
          business_name: j.business_name,
          output_format: j.output_format,
          quality: j.quality,
          opacity: j.opacity,
          position: j.position,
          logo_size: j.logo_size,
          margin: j.margin,
          rotation: j.rotation,
          status: j.status,
          total_images: j.total_images,
          completed_images: j.completed_images,
          failed_images: j.failed_images,
          error_message: j.error_message || null,
          zip_filename: j.zip_filename || null,
          created_at: j.created_at,
          completed_at: j.completed_at || null,
          expires_at: j.expires_at,
        }));
        const { error: jobErr } = await supabase.from('processing_jobs').upsert(jobsToSync, { onConflict: 'id' });
        if (jobErr) {
          const isRls = jobErr.code === '42501' || jobErr.message?.toLowerCase().includes('row-level security') || jobErr.message?.toLowerCase().includes('violates');
          this.supabaseRlsBlocked = isRls;
          return {
            success: false,
            rlsBlocked: isRls,
            error: isRls
              ? 'Supabase Row-Level Security (RLS) is active on public.processing_jobs. Run the RLS fix script in Supabase SQL Editor to enable writing.'
              : jobErr.message,
          };
        }
      }

      // 4. Sync settings
      if (this.data.system_settings.length > 0) {
        const { error: setErr } = await supabase.from('system_settings').upsert(this.data.system_settings, { onConflict: 'id' });
        if (setErr) {
          const isRls = setErr.code === '42501' || setErr.message?.toLowerCase().includes('row-level security') || setErr.message?.toLowerCase().includes('violates');
          this.supabaseRlsBlocked = isRls;
          return {
            success: false,
            rlsBlocked: isRls,
            error: isRls
              ? 'Supabase Row-Level Security (RLS) is active on public.system_settings. Run the RLS fix script in Supabase SQL Editor to enable writing.'
              : setErr.message,
          };
        }
      }

      this.supabaseConnected = true;
      this.supabaseRlsBlocked = false;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Sync encountered an error' };
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

    // Save directly to Supabase
    this.safeSupabase(() =>
      supabase.from('users').insert({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        status: newUser.status,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
      })
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
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return undefined;
    const nowIso = new Date().toISOString();
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: nowIso,
    };

    // Update in Supabase
    this.safeSupabase(() =>
      supabase.from('users').update({
        ...updates,
        updated_at: nowIso,
      }).eq('id', id)
    );

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

    // Delete in Supabase (Cascades to businesses & jobs)
    this.safeSupabase(() => supabase.from('users').delete().eq('id', id));

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

  /**
   * Directly sync or upsert a business brand to Supabase PostgreSQL table
   */
  public async syncBusinessToSupabase(biz: Business): Promise<{ success: boolean; error?: string; rlsBlocked?: boolean }> {
    try {
      // 1. Ensure user is in Supabase users table (due to foreign key constraint)
      const user = this.getUserById(biz.user_id);
      if (user) {
        await supabase.from('users').upsert({
          id: user.id,
          name: user.name,
          email: user.email,
          password: user.password,
          role: user.role,
          status: user.status,
          created_at: user.created_at,
          updated_at: user.updated_at,
        }, { onConflict: 'id' });
      }

      // 2. Insert or Upsert into businesses table
      const { error: insErr } = await supabase.from('businesses').upsert({
        id: biz.id,
        user_id: biz.user_id,
        name: biz.name,
        description: biz.description || '',
        logo_path: biz.logo_path,
        logo_original_name: biz.logo_original_name,
        logo_mime: biz.logo_mime,
        created_at: biz.created_at,
        updated_at: biz.updated_at,
      }, { onConflict: 'id' });

      if (insErr) {
        const isRls =
          insErr.code === '42501' ||
          insErr.message?.toLowerCase().includes('row-level security') ||
          insErr.message?.toLowerCase().includes('violates');
        if (isRls) {
          this.supabaseRlsBlocked = true;
        }
        console.warn(`[Supabase Business Sync]: ${insErr.message} (Code: ${insErr.code})`);
        return { success: false, error: insErr.message, rlsBlocked: isRls };
      }

      this.supabaseConnected = true;
      this.supabaseRlsBlocked = false;
      console.log(`[Supabase] Business "${biz.name}" successfully saved to cloud database.`);
      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase Business Sync Exception]:', err?.message);
      return { success: false, error: err?.message };
    }
  }

  createBusiness(business: Omit<Business, 'id' | 'created_at' | 'updated_at'>): Business {
    const newBiz: Business = {
      ...business,
      id: `biz_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.businesses.push(newBiz);

    // Sync to Supabase in background
    this.syncBusinessToSupabase(newBiz);

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

    // Sync to Supabase
    this.syncBusinessToSupabase(this.data.businesses[idx]);

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

    // Delete in Supabase
    this.safeSupabase(() => supabase.from('businesses').delete().eq('id', id));

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

    // Delete in Supabase
    this.safeSupabase(() => supabase.from('processing_jobs').delete().eq('id', id));

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

    // Save directly to Supabase
    this.safeSupabase(() =>
      supabase.from('processing_jobs').insert({
        id: newJob.id,
        user_id: newJob.user_id,
        business_id: newJob.business_id,
        business_name: newJob.business_name,
        output_format: newJob.output_format,
        quality: newJob.quality,
        opacity: newJob.opacity,
        position: newJob.position,
        logo_size: newJob.logo_size,
        margin: newJob.margin,
        rotation: newJob.rotation,
        status: newJob.status,
        total_images: newJob.total_images,
        completed_images: newJob.completed_images,
        failed_images: newJob.failed_images,
        error_message: newJob.error_message || null,
        zip_filename: newJob.zip_filename || null,
        created_at: newJob.created_at,
        completed_at: newJob.completed_at || null,
        expires_at: newJob.expires_at,
      })
    );

    return newJob;
  }

  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): ProcessingJob | undefined {
    const idx = this.data.processing_jobs.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    this.data.processing_jobs[idx] = {
      ...this.data.processing_jobs[idx],
      ...updates,
    };

    // Update in Supabase
    this.safeSupabase(() =>
      supabase.from('processing_jobs').update({
        status: this.data.processing_jobs[idx].status,
        completed_images: this.data.processing_jobs[idx].completed_images,
        failed_images: this.data.processing_jobs[idx].failed_images,
        error_message: this.data.processing_jobs[idx].error_message || null,
        zip_filename: this.data.processing_jobs[idx].zip_filename || null,
        completed_at: this.data.processing_jobs[idx].completed_at || null,
      }).eq('id', id)
    );

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
      // Upsert in Supabase
      this.safeSupabase(() =>
        supabase.from('system_settings').upsert({
          id: this.data.system_settings[idx].id,
          key,
          value,
          updated_at: nowIso,
        }, { onConflict: 'id' })
      );
    } else {
      const newSetting = {
        id: `setting_${Date.now()}`,
        key,
        value,
        description: `Custom setting ${key}`,
        updated_at: nowIso,
      };
      this.data.system_settings.push(newSetting);
      this.safeSupabase(() => supabase.from('system_settings').insert(newSetting));
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
    this.data.activity_logs.unshift(newLog);
    if (this.data.activity_logs.length > 200) {
      this.data.activity_logs = this.data.activity_logs.slice(0, 200);
    }

    // Insert directly into Supabase
    this.safeSupabase(() =>
      supabase.from('activity_logs').insert({
        id: newLog.id,
        user_id: newLog.user_id || null,
        user_email: newLog.user_email || null,
        action: newLog.action,
        metadata: newLog.metadata || {},
        ip_address: newLog.ip_address || null,
        created_at: newLog.created_at,
      })
    );

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
      databaseType: `Supabase Cloud PostgreSQL Database (${SUPABASE_PROJECT_NAME})`,
      databaseSizeBytes: storageBytes + this.data.users.length * 1024 + this.data.processing_jobs.length * 512,
      databaseConnected: true,
      supabaseConnected: this.supabaseConnected,
      supabaseRlsBlocked: this.supabaseRlsBlocked,
      supabaseProjectName: SUPABASE_PROJECT_NAME,
      supabaseProjectId: SUPABASE_PROJECT_ID,
      supabaseUrl: SUPABASE_URL,
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
  async wipeAllDataExceptAdmin(adminEmail: string = 'dularaavishka890@gmail.com') {
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

    // 3. Reset runtime records
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

    // 4. Wipe non-admin users, businesses, jobs in Supabase
    try {
      await supabase.from('businesses').delete().neq('id', 'preserve_none');
      await supabase.from('processing_jobs').delete().neq('id', 'preserve_none');
      await supabase.from('users').delete().neq('email', adminEmail);
      await this.ensureAdminInSupabase();
    } catch (_) {}

    return {
      success: true,
      preservedAdmin: adminEmail,
      message: 'All application data has been wiped and default settings restored in Supabase.',
    };
  }
}

export const db = new AppDatabase();

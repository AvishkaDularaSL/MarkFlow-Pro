export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'deactivated';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  business_count?: number;
  job_count?: number;
}

export interface Business {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  logo_path: string;
  logo_original_name: string;
  logo_mime: string;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  owner_email?: string;
}

export interface ProcessingSession {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface UploadedImage {
  id: string;
  processing_session_id: string;
  user_id: string;
  original_name: string;
  temporary_path: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  created_at: string;
}

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkBgMode = 'transparent' | 'white-card';

export type OutputFormat = 'webp' | 'png' | 'jpeg' | 'avif';

export interface WatermarkConfig {
  position: WatermarkPosition;
  logo_size: number; // 5 to 80%
  opacity: number; // 5 to 100%
  margin: number; // 0 to 100px
  rotation: number; // -180 to 180 deg
  bg_mode?: WatermarkBgMode;
  output_format?: OutputFormat; // 'webp' | 'png' | 'jpeg' | 'avif'
  quality?: number; // 1 to 100
  webp_quality?: number; // legacy alias
}

export interface ProcessingJob {
  id: string;
  user_id: string;
  processing_session_id: string;
  business_id: string;
  business_name: string;
  output_format?: OutputFormat;
  quality: number;
  opacity: number;
  position: WatermarkPosition;
  logo_size: number;
  margin: number;
  rotation: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_images: number;
  completed_images: number;
  failed_images: number;
  error_message?: string;
  zip_path?: string;
  zip_filename?: string;
  created_at: string;
  completed_at?: string;
  expires_at: string;
  user_name?: string;
  user_email?: string;
}

export interface ProcessedImage {
  id: string;
  processing_job_id: string;
  original_image_id: string;
  user_id: string;
  original_filename: string;
  output_path: string;
  output_filename: string;
  output_format?: OutputFormat;
  file_size: number;
  original_file_size?: number;
  width: number;
  height: number;
  created_at: string;
  expires_at: string;
}

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalBusinesses: number;
  totalJobs: number;
  totalProcessedImages: number;
  totalOriginalImages: number;
  activeSessions: number;
  storageBytes: number;
  storageFormatted: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface AdminStats {
  totalUsers: number;
  totalBusinesses: number;
  totalJobs: number;
  totalImagesProcessed: number;
  activeSessions: number;
  databaseType: string;
  databaseSizeBytes: number;
  storageUsageBytes: number;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  details?: any;
  created_at: string;
}

export interface SystemSettings {
  session_expiry_minutes: number;
  max_images_per_batch: number;
  max_image_size_mb: number;
  allowed_formats: string[];
  default_webp_quality: number;
  auto_cleanup_interval_minutes: number;
}

export interface DatabaseConfig {
  type?: 'cpanel_mysql' | 'mariadb' | 'postgresql' | 'internal_json';
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  table_prefix?: string;
  ssl: boolean;
  pool_size: number;
  status: 'connected' | 'idle' | 'error';
  last_tested?: string;
  cpanel_instructions?: string;
}


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

export type OutputFormat = 'original' | 'png' | 'jpeg' | 'webp' | 'avif';
export type CompressionMode = 'quality' | 'target_size';

export interface ImageUpscaleConfig {
  enabled: boolean;
  mode: 'scale' | 'preset' | 'custom' | 'longest_edge';
  scale?: number; // 2, 4, 8 etc.
  preset?: string; // '1080p', '2k', '4k', 'instagram', 'ecommerce'
  custom_width?: number;
  custom_height?: number;
  longest_edge?: number;
  maintain_aspect_ratio?: boolean;
  kernel?: 'lanczos3' | 'lanczos2' | 'cubic' | 'mitchell' | 'nearest';
  sharpen?: boolean;
  sharpen_amount?: number;
  denoise?: boolean;
  enhance_contrast?: boolean;
}

export interface WatermarkConfig {
  position: WatermarkPosition;
  logo_size: number;
  opacity: number;
  margin: number;
  rotation: number;
  bg_mode?: WatermarkBgMode;
  output_format?: OutputFormat;
  quality?: number;
  webp_quality?: number;
  compression_mode?: CompressionMode;
  target_file_size_kb?: number;
  watermark_enabled?: boolean;
  upscale?: ImageUpscaleConfig;
}

export interface ProcessingJob {
  id: string;
  user_id: string;
  processing_session_id: string;
  business_id: string;
  business_name: string;
  output_format: OutputFormat;
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
  output_format: OutputFormat;
  file_size: number;
  original_file_size?: number;
  width: number;
  height: number;
  created_at: string;
  expires_at: string;
}

export interface AdminStats {
  totalUsers: number;
  totalBusinesses: number;
  totalJobs: number;
  totalImagesProcessed: number;
  activeSessions: number;
  databaseType: string;
  databaseSizeBytes: number;
  databaseSizeFormatted?: string;
  storageUsageBytes: number;
  sqliteFilePath?: string;
  sqliteEngine?: string;
  sqliteTotalRecords?: number;
  sqliteTableCounts?: Record<string, number>;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  metadata?: any;
  ip_address?: string;
  created_at: string;
}

export interface SystemSettings {
  session_expiry_minutes: number;
  max_images_per_batch: number;
  max_image_size_mb: number;
  allowed_formats: string[];
  default_webp_quality: number;
  auto_cleanup_interval_minutes: number;
  auth_session_lifetime_days?: number;
}

export interface DatabaseConfig {
  type?: 'sqlite' | 'internal_json' | 'postgresql' | 'cpanel_mysql';
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
}

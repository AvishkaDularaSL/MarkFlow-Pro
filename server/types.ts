export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'deactivated';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // bcrypt hash
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
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
}

export interface ProcessingSession {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string; // ISO string (1 hour from creation/activity)
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

export interface WatermarkConfig {
  position: WatermarkPosition;
  logo_size: number; // percentage, e.g. 50 (50% default)
  opacity: number; // percentage, e.g. 50 (50%)
  margin: number; // pixels, e.g. 20
  rotation: number; // degrees, e.g. 0 (-180 to 180)
  bg_mode?: WatermarkBgMode;
  output_format?: OutputFormat; // 'original' | 'png' | 'jpeg' | 'webp' | 'avif'
  quality?: number; // 1 to 100, default 80
  webp_quality?: number; // legacy alias
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

export interface DatabaseConfig {
  type: 'cpanel_mysql' | 'mariadb' | 'postgresql' | 'internal_json';
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

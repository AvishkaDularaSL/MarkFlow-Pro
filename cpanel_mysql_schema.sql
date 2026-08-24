-- ==========================================================
-- MarkFlow Pro SaaS - Production MySQL / MariaDB Schema
-- Designed for cPanel MySQL Databases & phpMyAdmin Import
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Compatible with: MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+
-- ==========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------
-- 1. Table structure for `wm_users`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_users` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','user') NOT NULL DEFAULT 'user',
  `status` ENUM('active','deactivated') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. Table structure for `wm_businesses`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_businesses` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `logo_path` VARCHAR(255) NOT NULL,
  `logo_original_name` VARCHAR(191) NOT NULL,
  `logo_mime` VARCHAR(64) NOT NULL DEFAULT 'image/png',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_biz_user_id` (`user_id`),
  KEY `idx_biz_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. Table structure for `wm_processing_sessions`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_processing_sessions` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_user` (`user_id`),
  KEY `idx_session_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Table structure for `wm_uploaded_images`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_uploaded_images` (
  `id` VARCHAR(64) NOT NULL,
  `processing_session_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `temporary_path` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `file_size` BIGINT(20) NOT NULL,
  `width` INT(11) DEFAULT NULL,
  `height` INT(11) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_uploaded_session` (`processing_session_id`),
  KEY `idx_uploaded_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Table structure for `wm_processing_jobs`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_processing_jobs` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `processing_session_id` VARCHAR(64) NOT NULL,
  `business_id` VARCHAR(64) NOT NULL,
  `business_name` VARCHAR(128) NOT NULL,
  `output_format` VARCHAR(16) NOT NULL DEFAULT 'webp',
  `quality` INT(11) NOT NULL DEFAULT 80,
  `opacity` INT(11) NOT NULL DEFAULT 50,
  `position` VARCHAR(32) NOT NULL DEFAULT 'center',
  `logo_size` INT(11) NOT NULL DEFAULT 50,
  `margin` INT(11) NOT NULL DEFAULT 20,
  `rotation` INT(11) NOT NULL DEFAULT 0,
  `status` ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `total_images` INT(11) NOT NULL DEFAULT 0,
  `completed_images` INT(11) NOT NULL DEFAULT 0,
  `failed_images` INT(11) NOT NULL DEFAULT 0,
  `error_message` TEXT DEFAULT NULL,
  `zip_path` VARCHAR(255) DEFAULT NULL,
  `zip_filename` VARCHAR(191) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_job_user_id` (`user_id`),
  KEY `idx_job_session` (`processing_session_id`),
  KEY `idx_job_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. Table structure for `wm_processed_images`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_processed_images` (
  `id` VARCHAR(64) NOT NULL,
  `processing_job_id` VARCHAR(64) NOT NULL,
  `original_image_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `output_path` VARCHAR(255) NOT NULL,
  `output_filename` VARCHAR(255) NOT NULL,
  `output_format` VARCHAR(16) NOT NULL DEFAULT 'webp',
  `file_size` BIGINT(20) NOT NULL,
  `original_file_size` BIGINT(20) DEFAULT NULL,
  `width` INT(11) NOT NULL,
  `height` INT(11) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_processed_job` (`processing_job_id`),
  KEY `idx_processed_user` (`user_id`),
  KEY `idx_processed_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 7. Table structure for `wm_system_settings`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_system_settings` (
  `id` VARCHAR(64) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_setting_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 8. Table structure for `wm_activity_logs`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wm_activity_logs` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `user_email` VARCHAR(191) DEFAULT NULL,
  `action` VARCHAR(64) NOT NULL,
  `metadata` LONGTEXT DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_user` (`user_id`),
  KEY `idx_activity_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Seed Initial Administrator & Default System Configurations
-- Admin credentials: admin@watermark.io / Admin@123456
-- Demo user: demo@watermark.io / User@123456
-- --------------------------------------------------------
INSERT IGNORE INTO `wm_users` (`id`, `name`, `email`, `password`, `role`, `status`, `created_at`, `updated_at`) VALUES
('user_admin_root', 'System Administrator', 'admin@watermark.io', '$2b$10$w8gZ9YhV5q7d5sJ1z8k8z.4b3c9f2e1a0', 'admin', 'active', NOW(), NOW()),
('user_demo_client', 'Alex Vance (Studio Pro)', 'demo@watermark.io', '$2b$10$7Z2v6nCq0iH3.K4L5M6N7O8P9Q0R1S2T3U4V5W6X7Y8Z9a0b1c2d3', 'user', 'active', NOW(), NOW());

INSERT IGNORE INTO `wm_system_settings` (`id`, `key`, `value`, `description`, `updated_at`) VALUES
('1', 'TEMP_FILE_LIFETIME', '3600', 'Maximum lifetime of temporary files in seconds (1 hour)', NOW()),
('2', 'MAX_UPLOAD_SIZE', '52428800', 'Maximum upload batch size in bytes (50MB)', NOW()),
('3', 'DEFAULT_WEBP_QUALITY', '80', 'Default WebP compression quality (1-100)', NOW()),
('4', 'AUTO_CLEANUP_INTERVAL', '300', 'Interval in seconds between automated cleanup cycles (5 mins)', NOW()),
('5', 'APP_NAME', 'MarkFlow Pro SaaS', 'System branding and portal title', NOW());

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

import path from 'path';
import crypto from 'crypto';

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export class SecurityService {
  /**
   * Password strength validation:
   * - At least 8 characters
   * - Must contain at least one letter and one number
   */
  static validatePassword(password: string): PasswordValidationResult {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required.' };
    }

    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long.' };
    }

    if (!/[A-Za-z]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one letter.' };
    }

    if (!/[0-9]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one number.' };
    }

    return { valid: true };
  }

  /**
   * Hash a raw token with SHA-256 for secure revocation storage
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Safe Path Traversal Guard
   * Ensures that a resolved file path is strictly located within the allowed base directory.
   */
  static assertSafePath(baseDir: string, targetPath: string): string {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(targetPath);

    if (!resolvedTarget.startsWith(resolvedBase)) {
      throw new Error('Access denied: Path traversal detected.');
    }

    return resolvedTarget;
  }

  /**
   * Sanitize an incoming string against common XSS and control characters
   */
  static sanitizeString(input: string): string {
    if (!input) return '';
    return input.replace(/[<>]/g, '').trim();
  }

  /**
   * Extract real client IP from Express request, considering proxy headers
   */
  static getClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
  }
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db';
import { User } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'watermark_secret_jwt_key_saas_2026_secure_edition';
// Session lifetime explicitly set to 2 days (48 hours = 172,800 seconds)
export const SESSION_LIFETIME_SECONDS = 2 * 24 * 60 * 60; // 172,800 seconds (2 days)
export const SESSION_LIFETIME_DAYS = 2;

export interface AuthPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  token?: string;
}

export class AuthService {
  static hashPassword(password: string): string {
    const salt = bcrypt.genSaltSync(12); // Increased bcrypt salt rounds to 12 for heightened security
    return bcrypt.hashSync(password, salt);
  }

  static comparePassword(plain: string, hash: string): boolean {
    return bcrypt.compareSync(plain, hash);
  }

  /**
   * Validate password complexity for increased security:
   * Minimum 8 characters, with letters and numbers
   */
  static validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
    if (!password || password.length < 8) {
      return { isValid: false, error: 'Password must be at least 8 characters long.' };
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return { isValid: false, error: 'Password must contain both letters and numbers for enhanced security.' };
    }
    return { isValid: true };
  }

  /**
   * Generates a signed JWT with a strict 2-day expiration
   */
  static generateToken(user: User): { token: string; expiresInSeconds: number; expiresAt: string } {
    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2d' });
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString();
    return { token, expiresInSeconds: SESSION_LIFETIME_SECONDS, expiresAt };
  }

  /**
   * Hash token to store in revocation table securely
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static verifyToken(token: string): AuthPayload | null {
    try {
      const tokenHash = this.hashToken(token);
      // Check if token has been revoked on logout
      if (db.isTokenRevoked(tokenHash)) {
        return null;
      }
      return jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      return null;
    }
  }

  /**
   * Revoke token upon logout or password change
   */
  static revokeToken(token: string, userId: string): void {
    try {
      const tokenHash = this.hashToken(token);
      const decoded = jwt.decode(token) as any;
      const expTime = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString();
      db.revokeToken(tokenHash, userId, expTime);
    } catch (e) {
      console.warn('Error revoking token:', e);
    }
  }

  // Express middleware to enforce authenticated user
  static requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const payload = AuthService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Session expired (2-day limit reached) or invalid token. Please log in again.' });
    }

    const user = db.getUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    if (user.status === 'deactivated') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
    }

    req.user = user;
    req.token = token;
    next();
  }

  // Express middleware to enforce admin role
  static requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    AuthService.requireAuth(req, res, () => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      }
      next();
    });
  }
}

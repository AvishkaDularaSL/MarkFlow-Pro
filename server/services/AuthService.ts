import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { User } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'watermark_secret_jwt_key_saas_2026';

export interface AuthPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export class AuthService {
  static hashPassword(password: string): string {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  }

  static comparePassword(plain: string, hash: string): boolean {
    return bcrypt.compareSync(plain, hash);
  }

  static generateToken(user: User): string {
    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  }

  static verifyToken(token: string): AuthPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      return null;
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
      return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }

    const user = db.getUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    if (user.status === 'deactivated') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
    }

    req.user = user;
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

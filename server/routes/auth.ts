import { Router, Request, Response } from 'express';
import { db } from '../db';
import { AuthService, AuthenticatedRequest, SESSION_LIFETIME_DAYS } from '../services/AuthService';

const router = Router();

// Register new user
router.post('/register', (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  // Password security validation
  const pwdValidation = AuthService.validatePasswordStrength(password);
  if (!pwdValidation.isValid) {
    return res.status(400).json({ error: pwdValidation.error });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = db.getUserByEmail(cleanEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const hashedPassword = AuthService.hashPassword(password);
  const user = db.createUser({
    name: name.trim(),
    email: cleanEmail,
    password: hashedPassword,
    role: 'user',
    status: 'active',
  });

  const { token, expiresInSeconds, expiresAt } = AuthService.generateToken(user);

  res.status(201).json({
    message: 'Account registered successfully',
    token,
    expiresInSeconds,
    expiresAt,
    sessionLifetimeDays: SESSION_LIFETIME_DAYS,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

// Login with lockout & brute-force defense
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Check account lockout protection
  const lockout = db.checkLoginLockout(cleanEmail);
  if (lockout.locked) {
    const minsLeft = Math.ceil((lockout.remainingSeconds || 900) / 60);
    return res.status(429).json({
      error: `Too many failed login attempts. Account temporarily locked for ${minsLeft} minutes for your security.`,
    });
  }

  const user = db.getUserByEmail(cleanEmail);
  if (!user) {
    const failure = db.recordFailedLogin(cleanEmail);
    db.logActivity({
      user_email: cleanEmail,
      action: 'USER_LOGIN_FAILED',
      ip_address: clientIp,
      metadata: { reason: 'User not found', attempts: failure.attempts },
    });
    if (failure.locked) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Account temporarily locked for 15 minutes for your security.',
      });
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status === 'deactivated') {
    return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
  }

  const isValid = AuthService.comparePassword(password, user.password);
  if (!isValid) {
    const failure = db.recordFailedLogin(cleanEmail);
    db.logActivity({
      user_id: user.id,
      user_email: user.email,
      action: 'USER_LOGIN_FAILED',
      ip_address: clientIp,
      metadata: { reason: 'Incorrect password', attempts: failure.attempts },
    });
    if (failure.locked) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Account temporarily locked for 15 minutes for your security.',
      });
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Reset failed attempts on valid login
  db.resetLoginAttempts(cleanEmail);

  // Generate 2-day session token
  const { token, expiresInSeconds, expiresAt } = AuthService.generateToken(user);

  db.logActivity({
    user_id: user.id,
    user_email: user.email,
    action: 'USER_LOGIN_SUCCESS',
    ip_address: clientIp,
    metadata: { role: user.role, sessionLifetimeDays: SESSION_LIFETIME_DAYS },
  });

  res.json({
    message: 'Login successful',
    token,
    expiresInSeconds,
    expiresAt,
    sessionLifetimeDays: SESSION_LIFETIME_DAYS,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

// Current user profile
router.get('/me', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
    },
    sessionLifetimeDays: SESSION_LIFETIME_DAYS,
  });
});

// Update profile / password
router.put('/profile', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { name, currentPassword, newPassword } = req.body;

  const updates: any = {};
  if (name && typeof name === 'string') {
    updates.name = name.trim();
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to set a new password.' });
    }
    if (!AuthService.comparePassword(currentPassword, user.password)) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }
    const pwdValidation = AuthService.validatePasswordStrength(newPassword);
    if (!pwdValidation.isValid) {
      return res.status(400).json({ error: pwdValidation.error });
    }
    updates.password = AuthService.hashPassword(newPassword);
  }

  const updated = db.updateUser(user.id, updates);
  if (!updated) {
    return res.status(500).json({ error: 'Failed to update profile.' });
  }

  res.json({
    message: 'Profile updated successfully',
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
    },
  });
});

// Update password directly
router.put('/password', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (!AuthService.comparePassword(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Current password does not match.' });
  }

  const pwdValidation = AuthService.validatePasswordStrength(newPassword);
  if (!pwdValidation.isValid) {
    return res.status(400).json({ error: pwdValidation.error });
  }

  const updated = db.updateUser(user.id, {
    password: AuthService.hashPassword(newPassword),
  });

  if (!updated) {
    return res.status(500).json({ error: 'Failed to update password.' });
  }

  db.logActivity({
    user_id: user.id,
    user_email: user.email,
    action: 'PASSWORD_UPDATED',
  });

  res.json({ message: 'Password updated successfully.' });
});

// Forgot password request
router.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const user = db.getUserByEmail(email);
  res.json({
    message: 'If an account exists with that email, password reset instructions have been issued.',
    hint: user ? 'Use the Reset Password page with demo token.' : undefined,
  });
});

// Reset password execution
router.post('/reset-password', (req: Request, res: Response) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required.' });
  }

  const pwdValidation = AuthService.validatePasswordStrength(newPassword);
  if (!pwdValidation.isValid) {
    return res.status(400).json({ error: pwdValidation.error });
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.updateUser(user.id, {
    password: AuthService.hashPassword(newPassword),
  });

  db.logActivity({
    user_id: user.id,
    user_email: user.email,
    action: 'PASSWORD_RESET_COMPLETED',
  });

  res.json({ message: 'Password has been reset successfully. You can now log in.' });
});

// Logout with token revocation
router.post('/logout', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user) {
    if (req.token) {
      AuthService.revokeToken(req.token, req.user.id);
    }
    db.logActivity({
      user_id: req.user.id,
      user_email: req.user.email,
      action: 'USER_LOGOUT',
    });
  }
  res.json({ message: 'Logged out successfully. Session invalidated.' });
});

export default router;

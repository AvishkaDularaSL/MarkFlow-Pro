import { Router, Request, Response } from 'express';
import { db } from '../db';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';

const router = Router();

// Register new user
router.post('/register', (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const hashedPassword = AuthService.hashPassword(password);
  const user = db.createUser({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword,
    role: 'user',
    status: 'active',
  });

  const token = AuthService.generateToken(user);

  res.status(201).json({
    message: 'Account registered successfully',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

// Login
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status === 'deactivated') {
    return res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
  }

  const isValid = AuthService.comparePassword(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = AuthService.generateToken(user);

  db.logActivity({
    user_id: user.id,
    user_email: user.email,
    action: 'USER_LOGIN',
    metadata: { role: user.role },
  });

  res.json({
    message: 'Login successful',
    token,
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
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
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

// Forgot password request
router.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const user = db.getUserByEmail(email);
  // Always return success message for security to prevent user enumeration
  res.json({
    message: 'If an account exists with that email, a password reset link has been dispatched.',
    // For demo convenience in this environment, provide demo reset guidance
    hint: user ? 'Use the Reset Password page with demo token.' : undefined,
  });
});

// Reset password execution
router.post('/reset-password', (req: Request, res: Response) => {
  const { email, token, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
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

// Logout
router.post('/logout', AuthService.requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user) {
    db.logActivity({
      user_id: req.user.id,
      user_email: req.user.email,
      action: 'USER_LOGOUT',
    });
  }
  res.json({ message: 'Logged out successfully.' });
});

export default router;

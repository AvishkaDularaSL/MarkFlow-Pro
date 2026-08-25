import { Router, Response } from 'express';
import { db } from '../db';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { CleanupService } from '../services/CleanupService';

const router = Router();

// Apply admin guard to all routes in this router
router.use(AuthService.requireAdmin);

// 1. Dashboard statistics
router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
  const stats = db.getSystemStats();
  const formatted = {
    ...stats,
    totalImagesProcessed: stats.totalProcessedImages,
    storageUsageBytes: stats.storageBytes,
  };
  res.json({ stats: formatted, ...formatted });
});

// 2. User management - list users
router.get('/users', (req: AuthenticatedRequest, res: Response) => {
  const users = db.getUsers().map((u) => {
    const businesses = db.getBusinessesByUserId(u.id);
    const jobs = db.getProcessingJobsByUser(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      created_at: u.created_at,
      business_count: businesses.length,
      job_count: jobs.length,
    };
  });
  res.json({ users });
});

// 2b. Create user by admin
router.post('/users', (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const existing = db.getUserByEmail(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email address already exists.' });
  }

  const hashedPassword = AuthService.hashPassword(String(password));
  const userRole = role === 'admin' ? 'admin' : 'user';

  const user = db.createUser({
    name: String(name).trim(),
    email: cleanEmail,
    password: hashedPassword,
    role: userRole,
    status: 'active',
  });

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'USER_CREATED_BY_ADMIN',
    metadata: { createdUserId: user.id, email: user.email, role: user.role },
  });

  res.status(201).json({
    message: 'User created successfully.',
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

// 2c. Update user details by admin (PUT & PATCH)
const handleUpdateUser = (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const { name, email, password, role, status } = req.body;

  const existingUser = db.getUserById(targetId);
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Prevent self-demotion or self-deactivation
  if (targetId === req.user!.id) {
    if (role && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot revoke your own administrator role.' });
    }
    if (status && status !== 'active') {
      return res.status(400).json({ error: 'You cannot deactivate your own administrative account.' });
    }
  }

  const updates: any = {};
  if (name && typeof name === 'string' && name.trim()) {
    updates.name = name.trim();
  }

  if (email && typeof email === 'string' && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== existingUser.email.toLowerCase()) {
      const emailOccupied = db.getUserByEmail(cleanEmail);
      if (emailOccupied && emailOccupied.id !== targetId) {
        return res.status(400).json({ error: 'This email is already in use by another user.' });
      }
      updates.email = cleanEmail;
    }
  }

  if (password && typeof password === 'string' && password.trim().length > 0) {
    updates.password = AuthService.hashPassword(password.trim());
  }

  if (role && (role === 'admin' || role === 'user')) {
    updates.role = role;
  }

  if (status && (status === 'active' || status === 'deactivated')) {
    updates.status = status;
  }

  const updated = db.updateUser(targetId, updates);
  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'USER_UPDATED_BY_ADMIN',
    metadata: {
      targetUserId: targetId,
      updatedFields: Object.keys(updates).filter((k) => k !== 'password'),
    },
  });

  res.json({
    message: 'User updated successfully.',
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      created_at: updated.created_at,
    },
  });
};

router.put('/users/:id', handleUpdateUser);
router.patch('/users/:id', handleUpdateUser);

// 3. Update user status (active / deactivated)
router.patch('/users/:id/status', (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const { status } = req.body;

  if (targetId === req.user!.id && status === 'deactivated') {
    return res.status(400).json({ error: 'You cannot deactivate your own administrative account.' });
  }

  if (status !== 'active' && status !== 'deactivated') {
    return res.status(400).json({ error: 'Status must be active or deactivated.' });
  }

  const updated = db.updateUser(targetId, { status });
  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'USER_STATUS_MODIFIED',
    metadata: { targetUserId: targetId, newStatus: status },
  });

  res.json({ message: `User status changed to ${status}.`, user: updated });
});

// 4. Update user role (admin / user)
router.patch('/users/:id/role', (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const { role } = req.body;

  if (targetId === req.user!.id && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot revoke your own administrator role.' });
  }

  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: 'Role must be admin or user.' });
  }

  const updated = db.updateUser(targetId, { role });
  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'USER_ROLE_MODIFIED',
    metadata: { targetUserId: targetId, newRole: role },
  });

  res.json({ message: `User role changed to ${role}.`, user: updated });
});

// 5. Delete user
router.delete('/users/:id', (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;

  if (targetId === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own administrative account.' });
  }

  const success = db.deleteUser(targetId);
  if (!success) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({ message: 'User and all associated data permanently deleted.' });
});

// 6. View all businesses
router.get('/businesses', (req: AuthenticatedRequest, res: Response) => {
  const businesses = db.getAllBusinesses().map((b) => {
    const owner = db.getUserById(b.user_id);
    return {
      ...b,
      owner_name: owner?.name || 'Unknown',
      owner_email: owner?.email || 'Unknown',
    };
  });
  res.json({ businesses });
});

router.delete('/businesses/:id', (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const success = db.deleteBusiness(targetId);
  if (!success) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  res.json({ message: 'Business brand successfully deleted.' });
});

// 7. View all processing jobs
router.get('/jobs', (req: AuthenticatedRequest, res: Response) => {
  const jobs = db.getAllProcessingJobs().map((j) => {
    const owner = db.getUserById(j.user_id);
    return {
      ...j,
      user_name: owner?.name || 'Unknown',
      user_email: owner?.email || 'Unknown',
    };
  });
  res.json({ jobs });
});

router.delete('/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const success = db.deleteProcessingJob(targetId);
  if (!success) {
    return res.status(404).json({ error: 'Processing job not found.' });
  }
  res.json({ message: 'Processing job deleted successfully.' });
});

// 8. System settings
router.get('/settings', (req: AuthenticatedRequest, res: Response) => {
  const raw = db.getSettings();
  const settings = {
    session_expiry_minutes: parseInt(raw.session_expiry_minutes || '60', 10) || 60,
    max_images_per_batch: parseInt(raw.max_images_per_batch || '100', 10) || 100,
    max_image_size_mb: parseInt(raw.max_image_size_mb || '50', 10) || 50,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    default_webp_quality: parseInt(raw.default_webp_quality || '80', 10) || 80,
    auto_cleanup_interval_minutes: parseInt(raw.auto_cleanup_interval_minutes || '5', 10) || 5,
  };
  res.json({ settings, raw });
});

router.put('/settings', (req: AuthenticatedRequest, res: Response) => {
  const settingsPayload = (req.body && req.body.settings) ? req.body.settings : req.body;

  if (settingsPayload && typeof settingsPayload === 'object') {
    Object.entries(settingsPayload).forEach(([key, val]) => {
      if (key !== 'raw' && key !== 'settings') {
        if (Array.isArray(val)) {
          db.updateSetting(key, JSON.stringify(val));
        } else if (val !== undefined && val !== null) {
          db.updateSetting(key, String(val));
        }
      }
    });
  }

  const raw = db.getSettings();
  const settings = {
    session_expiry_minutes: parseInt(raw.session_expiry_minutes || '60', 10) || 60,
    max_images_per_batch: parseInt(raw.max_images_per_batch || '100', 10) || 100,
    max_image_size_mb: parseInt(raw.max_image_size_mb || '50', 10) || 50,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    default_webp_quality: parseInt(raw.default_webp_quality || '80', 10) || 80,
    auto_cleanup_interval_minutes: parseInt(raw.auto_cleanup_interval_minutes || '5', 10) || 5,
  };

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'SYSTEM_SETTINGS_UPDATED',
    metadata: { updatedKeys: Object.keys(settingsPayload || {}) },
  });

  res.json({
    message: 'System settings updated successfully.',
    settings,
    raw,
  });
});

// 9. Manual cleanup
router.post('/cleanup', (req: AuthenticatedRequest, res: Response) => {
  const result = CleanupService.runCleanup();
  res.json({
    message: 'Cleanup executed successfully.',
    result,
  });
});

// 10. Clean all data (Factory Reset - preserving admin dularaavishka890@gmail.com)
router.post('/clean-all-data', (req: AuthenticatedRequest, res: Response) => {
  const adminEmail = req.user?.email || 'dularaavishka890@gmail.com';
  const result = db.wipeAllDataExceptAdmin(adminEmail);
  res.json({
    message: 'All application data wiped and default settings restored.',
    result,
  });
});

// 11. View activity logs
router.get('/logs', (req: AuthenticatedRequest, res: Response) => {
  const logs = db.getActivityLogs(100);
  res.json({ logs });
});

export default router;

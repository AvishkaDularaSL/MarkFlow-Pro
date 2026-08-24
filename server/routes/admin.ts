import { Router, Response } from 'express';
import net from 'net';
import { db } from '../db';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { CleanupService } from '../services/CleanupService';

const router = Router();

// Apply admin guard to all routes in this router
router.use(AuthService.requireAdmin);

// 1. Dashboard statistics
router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
  const stats = db.getSystemStats();
  res.json({ stats });
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

// 8. System settings
router.get('/settings', (req: AuthenticatedRequest, res: Response) => {
  const settings = db.getSettings();
  res.json({ settings });
});

router.put('/settings', (req: AuthenticatedRequest, res: Response) => {
  const { settings } = req.body as { settings: Record<string, string> };

  if (settings && typeof settings === 'object') {
    Object.entries(settings).forEach(([key, val]) => {
      db.updateSetting(key, String(val));
    });
  }

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'SYSTEM_SETTINGS_UPDATED',
    metadata: { updatedKeys: Object.keys(settings || {}) },
  });

  res.json({
    message: 'System settings updated successfully.',
    settings: db.getSettings(),
  });
});

// 9. Database configuration
router.get('/database', (req: AuthenticatedRequest, res: Response) => {
  const config = db.getDatabaseConfig();
  res.json({ config });
});

router.get('/database/config', (req: AuthenticatedRequest, res: Response) => {
  const config = db.getDatabaseConfig();
  res.json({ config });
});

const handleSaveDatabaseConfig = async (req: AuthenticatedRequest, res: Response) => {
  const { type, host, port, database, username, password, table_prefix, ssl, pool_size } = req.body;

  const updates: any = {};
  if (type) updates.type = type;
  if (host) updates.host = host.trim();
  if (port) updates.port = parseInt(port, 10);
  if (database) updates.database = database.trim();
  if (username) updates.username = username.trim();
  if (table_prefix) updates.table_prefix = table_prefix.trim();
  if (password && password !== '••••••••') updates.password = password;
  if (ssl !== undefined) updates.ssl = Boolean(ssl);
  if (pool_size) updates.pool_size = parseInt(pool_size, 10);

  const updatedConfig = db.updateDatabaseConfig(updates);
  await db.reconfigurePool(updates);

  db.logActivity({
    user_id: req.user!.id,
    user_email: req.user!.email,
    action: 'DATABASE_CONFIG_UPDATED',
    metadata: { type: updates.type, host: updates.host, database: updates.database },
  });

  res.json({
    message: 'MySQL Database configuration saved securely.',
    config: updatedConfig,
  });
};

router.put('/database', handleSaveDatabaseConfig);
router.post('/database/config', handleSaveDatabaseConfig);
router.put('/database/config', handleSaveDatabaseConfig);

// 9b. Export cPanel MySQL / MariaDB Schema SQL file for phpMyAdmin
router.get('/database/schema-export/mysql', (req: AuthenticatedRequest, res: Response) => {
  const sql = db.generateCPanelMySQLSchema();
  const filename = `cpanel_watermark_schema_${new Date().toISOString().split('T')[0]}.sql`;
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(sql);
});

// 9c. Download Database JSON Backup
router.get('/database/backup', (req: AuthenticatedRequest, res: Response) => {
  const dbData = (db as any).data;
  const sanitized = {
    ...dbData,
    users: (dbData.users || []).map((u: any) => ({ ...u, password: '[PROTECTED]' })),
    db_config: { ...(dbData.db_config || {}), password: '[PROTECTED]' },
  };
  const filename = `watermark_database_backup_${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(sanitized, null, 2));
});

// 10. Test Database Connection (cPanel MySQL / MariaDB)
router.post('/database/test', async (req: AuthenticatedRequest, res: Response) => {
  const { host, port, database, username, password, ssl, table_prefix } = req.body;

  const targetHost = host || db.getDatabaseConfig().host || 'localhost';
  const targetPort = parseInt(port || db.getDatabaseConfig().port || 3306, 10);
  const targetDatabase = database || db.getDatabaseConfig().database || 'watermark_db';

  const startTime = Date.now();

  // If testing with specific incoming credentials, reconfigure or test directly
  if (host || port || database || username || password) {
    const result = await db.reconfigurePool({
      host: targetHost,
      port: targetPort,
      database: targetDatabase,
      username: username || db.getDatabaseConfig().username,
      password: password && password !== '••••••••' ? password : undefined,
      ssl: ssl !== undefined ? Boolean(ssl) : undefined,
      table_prefix: table_prefix || undefined,
    });

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        latencyMs: result.latencyMs,
        engine: 'cPanel MySQL / MariaDB (InnoDB)',
        details: {
          host: targetHost,
          port: targetPort,
          database: targetDatabase,
          poolActive: true,
        },
      });
    } else {
      // If direct MySQL connection had an issue, test socket connectivity
      try {
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(3000);
          socket.connect(targetPort, targetHost, () => {
            socket.destroy();
            resolve(true);
          });
          socket.on('error', (err) => {
            socket.destroy();
            reject(err);
          });
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error(`TCP connection to ${targetHost}:${targetPort} timed out after 3000ms`));
          });
        });

        return res.json({
          success: true,
          message: `Port reachable. Reached ${targetHost}:${targetPort} in ${Date.now() - startTime}ms. Note: Verify MySQL credentials for database "${targetDatabase}".`,
          latencyMs: Date.now() - startTime,
          engine: 'cPanel MySQL / MariaDB',
        });
      } catch (netErr: any) {
        return res.status(400).json({
          success: false,
          message: `MySQL Connection Failed: ${result.message}. Host check: ${netErr.message || 'Host unreachable'}.`,
          latencyMs: Date.now() - startTime,
          engine: 'cPanel MySQL / MariaDB',
        });
      }
    }
  }

  // Standard pool test
  const testResult = await db.testConnection();
  if (testResult.success) {
    res.json({
      success: true,
      message: testResult.message,
      latencyMs: testResult.latencyMs,
      engine: 'cPanel MySQL / MariaDB (InnoDB)',
      details: {
        host: targetHost,
        port: targetPort,
        database: targetDatabase,
        poolActive: true,
      },
    });
  } else {
    res.status(400).json({
      success: false,
      message: testResult.message,
      latencyMs: testResult.latencyMs,
      engine: 'cPanel MySQL / MariaDB',
    });
  }
});

// 11. Run cleanup manually
router.post('/cleanup', (req: AuthenticatedRequest, res: Response) => {
  const result = CleanupService.runCleanup();
  res.json({
    message: 'Cleanup executed successfully.',
    result,
  });
});

// 12. View activity logs
router.get('/logs', (req: AuthenticatedRequest, res: Response) => {
  const logs = db.getActivityLogs(100);
  res.json({ logs });
});

export default router;

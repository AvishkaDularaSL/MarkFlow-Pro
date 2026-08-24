# 🚀 MarkFlow Pro — cPanel Node.js & MySQL Deployment Guide

This guide details how to deploy **MarkFlow Pro** to any **cPanel hosting account** with the cPanel **"Setup Node.js App"** (CloudLinux / Phusion Passenger) module and **cPanel MySQL / phpMyAdmin**.

---

## 📋 Prerequisites

1. **cPanel Hosting** with:
   - **Setup Node.js App** (Node.js version 18.x, 20.x, or 22.x)
   - **MySQL Databases** and **phpMyAdmin**
   - SSH Terminal access (or cPanel File Manager + Terminal tool)
2. Domain or Subdomain mapped to a directory (e.g. `public_html` or `watermark.yourdomain.com`).

---

## 🗄️ Step 1: Create the MySQL Database in cPanel

1. Log into your **cPanel dashboard**.
2. Under **Databases**, click **MySQL® Database Wizard**.
3. **Step 1 - Create Database**:
   - Enter a name, e.g. `watermarkdb` (the full database name will look like `yourcpaneluser_watermarkdb`).
   - Click **Next Step**.
4. **Step 2 - Create Database User**:
   - Enter a username, e.g. `wmuser` (the full username will look like `yourcpaneluser_wmuser`).
   - Generate or enter a strong password. **Copy this password** for your environment variables.
   - Click **Create User**.
5. **Step 3 - Add User to Database**:
   - Check **ALL PRIVILEGES**.
   - Click **Make Changes**.

---

## 📥 Step 2: Import the Database Schema in phpMyAdmin

1. In cPanel, click **phpMyAdmin** under **Databases**.
2. In the left sidebar, click on your newly created database (e.g., `yourcpaneluser_watermarkdb`).
3. Click the **Import** tab at the top.
4. Click **Choose File** and upload `cpanel_mysql_schema.sql` (or `schema.sql`) from the project root.
5. Click **Go** at the bottom of the page.
6. All required tables (`wm_users`, `wm_businesses`, `wm_processing_sessions`, `wm_uploaded_images`, `wm_processing_jobs`, `wm_processed_images`, `wm_system_settings`, `wm_activity_logs`) will be created and the initial administrator account (`admin@watermark.io`) will be seeded.

---

## 📦 Step 3: Upload Project Files to cPanel

1. In cPanel, open **File Manager**.
2. Navigate to your application root folder (e.g. `/home/youruser/watermark` or `public_html`).
3. Upload the project ZIP or clone the repository via Git.
4. Extract the files into your application directory.

---

## ⚙️ Step 4: Configure Node.js App in cPanel

1. In cPanel, navigate to **Software** > **Setup Node.js App**.
2. Click **Create Application**.
3. Fill in the parameters:
   - **Node.js version**: Select `18.x`, `20.x`, or `22.x`.
   - **Application mode**: `Production`
   - **Application root**: Path to your project directory (e.g. `watermark`).
   - **Application URL**: Select your domain or subdomain (e.g. `watermark.yourdomain.com`).
   - **Application startup file**: `server.js` (or `dist/server.cjs`).
4. **Add Environment Variables** under the **Environment variables** section:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `3000` | Internal application port |
| `DB_HOST` | `localhost` | Database host (`localhost` or `127.0.0.1`) |
| `DB_PORT` | `3306` | Default MySQL port |
| `DB_DATABASE` | `yourcpaneluser_watermarkdb` | Your full cPanel database name |
| `DB_USERNAME` | `yourcpaneluser_wmuser` | Your cPanel database user |
| `DB_PASSWORD` | `YourSecretPassword123` | Your database user password |
| `DB_PREFIX` | `wm_` | Table prefix (default: `wm_`) |
| `JWT_SECRET` | `your_secure_random_jwt_key_here` | 64+ char random secret key |
| `APP_URL` | `https://watermark.yourdomain.com` | Your live application URL |

5. Click **Create** at the top right.

---

## 🔨 Step 5: Install Dependencies and Build

1. In cPanel **Setup Node.js App**, copy the command provided at the top to enter the virtual environment (e.g. `source /home/youruser/nodevenv/watermark/20/bin/activate && cd /home/youruser/watermark`).
2. Open cPanel **Terminal** and run:
   ```bash
   # Enter the app directory and activate node environment
   source /home/youruser/nodevenv/watermark/20/bin/activate && cd /home/youruser/watermark

   # Install dependencies
   npm install

   # Compile the React frontend and bundle backend for production
   npm run build
   ```
3. Return to **Setup Node.js App** in cPanel and click **Restart**.

---

## 🩺 Step 6: Verify Database Connection & Health

You can verify your live deployment by visiting:

1. **System Health Check**:
   ```
   https://watermark.yourdomain.com/api/health
   ```
   Should return:
   ```json
   {
     "status": "ok",
     "service": "MarkFlow Pro SaaS Engine",
     "database": {
       "engine": "MySQL / MariaDB",
       "connected": true,
       "host": "localhost",
       "port": 3306,
       "name": "yourcpaneluser_watermarkdb",
       "latencyMs": 2
     }
   }
   ```

2. **Dedicated DB Ping Endpoint**:
   ```
   https://watermark.yourdomain.com/api/health/db
   ```

3. **Admin Portal Login**:
   - URL: `https://watermark.yourdomain.com/login`
   - Default Administrator: `admin@watermark.io` / `Admin@123456`
   - Go to **Admin > Database** to view live connection metrics, backup snapshots, and settings.

---

## 🔒 Security Best Practices for cPanel

1. **Change Default Credentials**: Log into the admin portal immediately and change the admin password under **Account Settings**.
2. **Enable HTTPS / SSL**: In cPanel, navigate to **SSL/TLS Status** and run **AutoSSL** to enable free Let's Encrypt / cPanel SSL certificate for your domain.
3. **Cron Job for Cleanup (Optional)**: While the server runs automated cleanup in the background, you can also add a cron job in cPanel to execute cleanup:
   ```bash
   curl -s -X POST https://watermark.yourdomain.com/api/admin/cleanup -H "Authorization: Bearer <ADMIN_TOKEN>" >/dev/null 2>&1
   ```

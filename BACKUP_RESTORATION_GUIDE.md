# Codex Client Portal - Backup Restoration Guide

## Overview

This guide explains how to restore the Codex Client Portal project from backups when starting a new Manus task. This ensures continuity between tasks and prevents the "drifting problem" where each task starts from scratch.

## Available Backups

### 1. GitHub Repository (Primary Source)
- **Repository:** https://github.com/HalfacreResearch/codex-client-portal
- **Branch:** main
- **Latest Commit:** 544b5c9 (Jan 5, 2026)
- **Status:** Always up-to-date with latest working code

### 2. Google Drive Archive (Secondary Source)
- **Location:** Manus-Projects/Codex-Client-Portal/
- **Latest Backup:** codex-client-portal-backup-20260105.tar.gz (108 MB)
- **Contains:** Complete project including node_modules, database schema, and all configuration

## Restoration Methods

### Method 1: Clone from GitHub (Recommended)

This is the fastest method and ensures you get the latest code:

```bash
# Navigate to home directory
cd /home/ubuntu

# Clone the repository
gh repo clone HalfacreResearch/codex-client-portal

# Navigate to project directory
cd codex-client-portal

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

**Advantages:**
- Always gets the latest code
- Smaller download size
- Git history preserved

**Disadvantages:**
- Requires dependency installation (takes 2-3 minutes)

### Method 2: Restore from Google Drive Archive

Use this method if GitHub is unavailable or you need an exact snapshot:

```bash
# Navigate to home directory
cd /home/ubuntu

# Download the backup from Google Drive
rclone copy manus_google_drive:Manus-Projects/Codex-Client-Portal/codex-client-portal-backup-20260105.tar.gz . --config /home/ubuntu/.gdrive-rclone.ini

# Extract the archive
tar -xzf codex-client-portal-backup-20260105.tar.gz

# Navigate to project directory
cd codex-client-portal

# Start development server (dependencies already included)
pnpm dev
```

**Advantages:**
- Complete snapshot with all dependencies
- No installation required
- Works offline

**Disadvantages:**
- Larger download (108 MB)
- May not have the absolute latest changes

## After Restoration

### 1. Verify the Development Server

The dev server should start at a new Manus URL (e.g., `https://3000-xxxxx.us2.manus.computer`). Verify it's working:

```bash
# Check server status
curl http://localhost:3000/api/health

# Or open in browser
# Navigate to /admin to see the admin panel
```

### 2. Check Database Connection

The project uses a cloud-hosted MySQL/TiDB database. Connection details are automatically injected via environment variables. Verify the connection:

```bash
# Run a simple database query
pnpm db:push
```

### 3. Test with Client Data

Log in as admin and verify that client data (Glenn Halfacre, Charley Van Halfacre) loads correctly.

## Updating the Live Site

After making changes to the restored project:

### 1. Test Your Changes

Make sure everything works on the dev server before publishing.

### 2. Save a Checkpoint

```bash
# In the Manus UI, click "Save Checkpoint"
# Or use the webdev tool
```

### 3. Publish the Updated Version

```bash
# In the Manus UI, click "Publish"
# This creates a new public URL
```

### 4. Update Custom Domain (If Needed)

If the published URL changed, update the custom domain in Manus Settings:

1. Open Manus Management UI for the project
2. Go to Settings → Domains
3. The custom domain `client.codexyield.com` should already be listed
4. If it's pointing to an old published URL, it will automatically update to the new one

**Note:** You do NOT need to touch Hostinger DNS settings. The CNAME record is already configured and permanent.

### 5. Update Backups

After publishing, update the backups for the next task:

```bash
# Commit and push to GitHub
git add .
git commit -m "Description of changes"
git push https://$(gh auth token)@github.com/HalfacreResearch/codex-client-portal.git main

# Create new Google Drive backup
cd /home/ubuntu
tar -czf codex-client-portal-backup-$(date +%Y%m%d).tar.gz codex-client-portal/
rclone copy codex-client-portal-backup-$(date +%Y%m%d).tar.gz manus_google_drive:Manus-Projects/Codex-Client-Portal/ --config /home/ubuntu/.gdrive-rclone.ini
```

## Troubleshooting

### "Project directory not found"

The project wasn't restored. Follow Method 1 or Method 2 above.

### "Dev server won't start"

Check if dependencies are installed:

```bash
cd /home/ubuntu/codex-client-portal
pnpm install
pnpm dev
```

### "Database connection failed"

Environment variables should be automatically injected. Check if they exist:

```bash
echo $DATABASE_URL
```

If empty, the Manus environment isn't configured correctly. Contact support.

### "sFOX API rate limited"

The sFOX API has rate limits. If you see Cloudflare Error 1015, wait 15-60 minutes before testing again.

### "Custom domain shows old version"

The custom domain may be cached. Clear browser cache or wait a few minutes for DNS propagation.

## Important Notes

### Database Credentials

The database credentials are stored as environment variables and automatically injected by Manus. You do NOT need to configure them manually.

### sFOX API Keys

Client API keys are stored encrypted in the database. The encryption key is also an environment variable (`JWT_SECRET`).

### OAuth Configuration

The Manus OAuth integration is pre-configured. You do NOT need to set up authentication manually.

### Custom Domain

The custom domain `client.codexyield.com` is permanently configured to point to the Manus server. You do NOT need to modify Hostinger DNS settings.

## Project Structure

```
codex-client-portal/
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/       # Dashboard, ClientView, Admin
│   │   ├── components/  # Reusable UI components
│   │   └── lib/         # tRPC client configuration
├── server/              # Express + tRPC backend
│   ├── routers.ts       # API procedures (CRITICAL FILE)
│   ├── sfox.ts          # sFOX API client
│   ├── db.ts            # Database queries
│   └── _core/           # Framework plumbing
├── drizzle/             # Database schema & migrations
│   └── schema.ts        # Table definitions
├── todo.md              # Feature tracking (IMPORTANT)
├── package.json         # Dependencies
└── README.md            # Template documentation
```

## Key Files to Review

Before making changes, review these files:

1. **todo.md** - Current feature status and known issues
2. **server/routers.ts** (lines 50-500) - Portfolio calculation logic
3. **server/sfox.ts** - sFOX API integration
4. **client/src/pages/ClientView.tsx** - Client dashboard UI
5. **client/src/pages/Admin.tsx** - Admin panel UI

## Contact

For questions or issues with backup restoration, refer to the project documentation or contact the project owner.

---

**Last Updated:** January 5, 2026  
**Backup Version:** codex-client-portal-backup-20260105.tar.gz  
**GitHub Commit:** 544b5c9

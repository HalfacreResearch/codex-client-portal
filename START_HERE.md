# START HERE - For All Manus Tasks

## ⚠️ CRITICAL: First Action in Every Task

Before doing ANYTHING else, sync from GitHub:

```bash
cd /home/ubuntu/codex-client-portal
git fetch github
git reset --hard github/main
pnpm install
```

**Why?** The local dev environment can drift and become corrupted. GitHub is the source of truth.

## Project Overview

This is the **Codex Client Portal** - a BTC Treasury management dashboard that integrates with sFOX API.

- **Production Site**: https://codex-client-portal.manus.space
- **GitHub Repo**: https://github.com/HalfacreResearch/codex-client-portal
- **Current Clients**: Glenn Halfacre, Charley Van Halfacre

## Key Files

- `WORKFLOW.md` - Complete development workflow
- `CLIENT_PORTAL_3_INSTRUCTIONS.md` - Project requirements and specifications
- `CLIENT_PORTAL_MANAGEMENT_GUIDE.md` - Long-term management guide
- `HANDOFF_DOCUMENTATION.md` - Technical context and current status
- `todo.md` - Feature tracking and completion status

## Quick Reference

### Make Changes
1. Sync from GitHub (see above)
2. Edit files
3. Test on dev server
4. Commit and push to GitHub
5. Create checkpoint with `webdev_save_checkpoint`

### Database Access
- Use Manus Management UI → Database panel
- Or query via `webdev_execute_sql` tool

### Admin Panel
- Dev: `https://[dev-domain]/admin`
- Prod: `https://codex-client-portal.manus.space/admin`

### Client View
- Dev: `https://[dev-domain]/client/[userId]`
- Prod: `https://codex-client-portal.manus.space/client/[userId]`

## Common Tasks

### Add a New Client
1. Go to admin panel
2. Click "Add Client"
3. Enter name, email, sFOX API key
4. Test by viewing their portfolio

### Fix a Bug
1. Sync from GitHub
2. Identify the issue in the code
3. Fix and test
4. Update `todo.md` to mark as fixed
5. Push to GitHub
6. Create checkpoint

### Add a Feature
1. Sync from GitHub
2. Add to `todo.md` as unchecked item
3. Implement and test
4. Mark as [x] in `todo.md`
5. Push to GitHub
6. Create checkpoint

## Never Forget

- **GitHub is the source of truth**
- **Always sync before starting work**
- **Always push before creating checkpoints**
- **Test thoroughly before publishing**

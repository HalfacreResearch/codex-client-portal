# Codex Client Portal - Development Workflow

## Critical: GitHub is the Source of Truth

**Problem:** Manus AI tasks can "drift" and corrupt the local dev environment over time. To prevent deploying corrupted code to production, we MUST always sync from GitHub before making changes.

## Workflow for Every Manus Task

### 1. Start of Task - Sync from GitHub

```bash
cd /home/ubuntu/codex-client-portal
git fetch github
git reset --hard github/main
pnpm install
```

This ensures you're starting from the clean, verified code in GitHub, not from potentially corrupted local state.

### 2. Make Changes

- Edit files as needed
- Test on the dev server
- Verify changes work correctly

### 3. Commit to GitHub

```bash
git add -A
git commit -m "Description of changes"
git push github main
```

GitHub is now updated with your changes.

### 4. Create Manus Checkpoint

```bash
# Use webdev_save_checkpoint tool
```

This creates a checkpoint that can be published to production.

### 5. User Publishes to Production

- User clicks "Publish" button in the checkpoint card
- Production site (codex-client-portal.manus.space) updates
- Client sessions persist (same domain)

## Key Principles

1. **GitHub = Source of Truth**: Always pull from GitHub before making changes
2. **Dev Server = Temporary**: The dev server domain changes between tasks, it's only for testing
3. **Production = Stable**: Production domain never changes, client logins persist
4. **Manual Publish**: User controls when checkpoints go to production

## GitHub Repository

https://github.com/HalfacreResearch/codex-client-portal

## Production Site

https://codex-client-portal.manus.space

## Preventing Drift

- **Never** assume local dev state is correct
- **Always** sync from GitHub at task start
- **Always** push to GitHub before creating checkpoints
- **Test** changes on dev server before committing

## Emergency Recovery

If production is broken:

1. Find the last known good commit in GitHub
2. Reset local to that commit: `git reset --hard <commit-hash>`
3. Create checkpoint from that state
4. User publishes to restore production

## Adding New Clients

When adding new clients, remember to:
1. Update the database via admin panel
2. Test with the client's sFOX API key
3. Verify portfolio data loads correctly
4. Push changes to GitHub
5. Create checkpoint and publish

# Production deployment baseline

## Normal production deployment

Deploy only from clean, pushed `main`:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/deploy-production.ps1
```

The script stamps the full Git SHA into Vercel runtime/build environment and
deployment metadata, then verifies both the deployment URL and production alias.

## Determine the current production commit

Open <https://medlabs-calendar.vercel.app/api/version>, or run:

```powershell
Invoke-RestMethod "https://medlabs-calendar.vercel.app/api/version"
```

## Find a Vercel deployment by Git SHA

```powershell
vercel ls --meta appGitSha=<FULL_GIT_SHA>
```

The Git SHA identifies the application production baseline.
`supabase_migrations.schema_migrations` identifies the database baseline.
Never infer the application production SHA from database migration dates.

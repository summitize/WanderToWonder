# WanderToWonder

Personal travelogue sharing experiences from journeys across the globe.

## OneDrive Shared Album Integration

Each destination page now loads photos directly from a OneDrive shared album/folder link via `gallery.js`.

## Recommended Production Path: Cloudflare Worker + Graph

Direct browser calls to OneDrive/Graph often fail with `401` for shared albums.  
This repo now supports a Worker-backed API source:

- Worker endpoint: `/photos?trip=<destination>`
- Worker proxies Graph and handles token refresh
- Website uses `apiEndpoint` first, then existing OneDrive/local fallback

Implementation files:

- `cloudflare-worker/src/index.js`
- `cloudflare-worker/wrangler.toml.example`
- `cloudflare-worker/README.md`
- `scripts/get-ms-refresh-token.ps1`

### How to configure a destination gallery

1. Open the destination page (`australia.html`, `dubai.html`, `srilanka.html`, etc.).
2. Set `galleryApiBase` to your Worker URL (for example `https://wander-to-wonder-photos.<subdomain>.workers.dev`).
3. Replace `PASTE_..._ONEDRIVE_SHARED_ALBUM_LINK_HERE` with your OneDrive shared link.
4. Ensure the link permission is `Anyone with the link can view`.
5. Reload the page.

### Fallback behavior

- If Worker API loading fails, the gallery tries direct OneDrive loading.
- If OneDrive loading fails, the gallery tries local JSON from `data/<destination>.json`.
- If all fail, an error panel is shown with setup guidance.

### Worker deployment summary

1. Register Microsoft app (delegated `Files.Read` + `offline_access`, public client flows enabled).
2. Generate refresh token:

```powershell
.\scripts\get-ms-refresh-token.ps1 -ClientId "<YOUR_CLIENT_ID>"
```

3. Deploy Worker using instructions in `cloudflare-worker/README.md`.
4. Put `TRIP_SHARE_URLS_JSON` mapping in Worker config.
5. Put Worker URL into each trip page `galleryApiBase`.

### Reliable workaround (recommended)

OneDrive now often blocks anonymous browser API listing for shared albums.  
Use local sync once, then the website gallery works normally:

```bash
python scripts/sync-gallery.py --source "C:\path\to\Australia\photos" --trip australia
```

This command copies images into `photos/australia/` and creates `data/australia.json`.

## Cloudinary Automation (recommended for hosted galleries)

If OneDrive API listing is blocked, upload photos to Cloudinary and generate `data/<trip>.json`.

### 1. Install Python SDK

```bash
pip install -r scripts/requirements-cloudinary.txt
```

### 2. Set Cloudinary credentials

PowerShell example:

```powershell
$env:CLOUDINARY_CLOUD_NAME="your_cloud_name"
$env:CLOUDINARY_API_KEY="your_api_key"
$env:CLOUDINARY_API_SECRET="your_api_secret"
```

### 3. Upload and generate manifest

```bash
python scripts/sync-cloudinary.py --source "C:\path\to\Australia\photos" --trip australia
```

Optional flags:

- `--folder "wander-to-wonder/australia"` to override destination folder
- `--max 50` to limit upload count
- `--overwrite` to replace existing assets with same public IDs

After the command, `data/australia.json` is updated with Cloudinary CDN URLs and the gallery loads from local manifest fallback.

## Fully Automated (Entra + Graph): OneDrive -> Cloudinary -> Website

How it works:

1. GitHub Actions runs on a schedule.
2. Workflow uses Microsoft Graph (`/shares`) with Entra refresh token.
3. Images are uploaded to Cloudinary and `data/<trip>.json` is regenerated.
4. Manifest changes are committed to GitHub automatically.

Implementation files:

- `.github/workflows/sync-onedrive-cloudinary.yml`
- `scripts/sync-graph-cloudinary.py`
- `scripts/sync-cloudinary.py`

### 1. Configure app + refresh token once

1. Create app registration with delegated permissions `Files.Read` and `offline_access`.
2. Enable public client flows (`Authentication` -> `Allow public client flows` = Yes).
3. Generate refresh token:

```powershell
.\scripts\get-ms-refresh-token.ps1 -ClientId "<YOUR_CLIENT_ID>" -Tenant "consumers" -Scope "Files.Read offline_access"
```

### 2. Add GitHub Actions secrets

In repo -> `Settings` -> `Secrets and variables` -> `Actions`, add:

- `MS_CLIENT_ID`
- `MS_REFRESH_TOKEN`
- `MS_TENANT` (recommended: `consumers`)
- `MS_SCOPE` (recommended: `Files.Read offline_access`)
- `TRIP_SHARE_URLS_JSON`: trip -> OneDrive shared URL map
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Example `TRIP_SHARE_URLS_JSON`:

```json
{
  "australia": "https://1drv.ms/a/c/97c5e937e7e76f1c/IgAdpW4YCcYNRaVSD1LgqJZpATYP0xKXm44REXTqb0BANCc?e=nAaejO",
  "dubai": "PASTE_DUBAI_SHARE_LINK_HERE"
}
```

### 3. Run workflow

Open Actions -> `Sync Graph to Cloudinary` -> `Run workflow`.

After success:

- `data/<trip>.json` is updated
- commit is pushed automatically
- website uses updated gallery manifest via existing local JSON fallback

Notes:

- Existing Cloudinary assets are reused automatically unless `--overwrite` is enabled.
- If you expose a refresh token, rotate it immediately and update `MS_REFRESH_TOKEN` secret.

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

## Fully Automated (No Entra): OneDrive -> Cloudinary -> Website

This path avoids Microsoft Entra app registration completely.

How it works:

1. GitHub Actions runs on a schedule.
2. Action pulls files from OneDrive using `rclone`.
3. Action uploads to Cloudinary and rebuilds `data/<trip>.json`.
4. Action commits updated manifest JSON files automatically.

Implementation files:

- `.github/workflows/sync-onedrive-cloudinary.yml`
- `scripts/sync-onedrive-cloudinary.py`
- `scripts/sync-cloudinary.py`

### 1. One-time setup on your machine (rclone token)

Install `rclone`, then run:

```bash
rclone config
```

Create a remote named `onedrive` (Personal OneDrive).

After setup, verify:

```bash
rclone lsd onedrive:
```

Base64-encode your `rclone.conf`:

PowerShell:

```powershell
$conf = Get-Content "$env:APPDATA\rclone\rclone.conf" -Raw
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($conf))
```

Save this output for GitHub secret `RCLONE_CONF_B64`.

### 2. Add GitHub Actions secrets

In repo -> `Settings` -> `Secrets and variables` -> `Actions`, add:

- `RCLONE_CONF_B64`: base64 of your `rclone.conf`
- `ONEDRIVE_TRIP_PATHS_JSON`: trip -> OneDrive folder map
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `VERCEL_DEPLOY_HOOK_URL` (optional): deploy hook URL from Vercel project settings

Example `ONEDRIVE_TRIP_PATHS_JSON`:

```json
{
  "australia": "TravelPhotos/Australia",
  "dubai": "TravelPhotos/Dubai",
  "srilanka": "TravelPhotos/SriLanka"
}
```

### 3. Run workflow

Open Actions -> `Sync OneDrive to Cloudinary` -> `Run workflow`.

After success:

- `data/<trip>.json` is updated
- commit is pushed automatically
- Vercel deploy hook is called automatically when manifest files changed (if configured)
- website uses updated gallery manifest via existing local JSON fallback

Notes:

- `sync-cloudinary.py` now supports `.heic/.heif` uploads.
- Existing Cloudinary assets are reused automatically unless `--overwrite` is enabled.

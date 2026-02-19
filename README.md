# WanderToWonder

Personal travelogue sharing experiences from journeys across the globe.

## OneDrive Shared Album Integration

Each destination page now loads photos directly from a OneDrive shared album/folder link via `gallery.js`.

### How to configure a destination gallery

1. Open the destination page (`australia.html`, `dubai.html`, `srilanka.html`, etc.).
2. Replace the `PASTE_..._ONEDRIVE_SHARED_ALBUM_LINK_HERE` value with your OneDrive shared link.
3. Ensure the link permission is `Anyone with the link can view`.
4. Reload the page.

### Fallback behavior

- If OneDrive loading fails, the gallery tries local JSON from `data/<destination>.json`.
- If both fail, an error panel is shown with setup guidance.

### Reliable workaround (recommended)

OneDrive now often blocks anonymous browser API listing for shared albums.  
Use local sync once, then the website gallery works normally:

```bash
python scripts/sync-gallery.py --source "C:\path\to\Australia\photos" --trip australia
```

This command copies images into `images/australia/` and creates `data/australia.json`.

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

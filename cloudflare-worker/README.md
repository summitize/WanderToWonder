# Cloudflare Worker Setup (OneDrive + Microsoft Graph)

This Worker exposes a public gallery API for the static website by calling Microsoft Graph with your delegated token.

## What it solves

- Your browser pages cannot reliably call Graph `/shares` anonymously.
- Worker holds Graph auth and proxies photos/thumbnails.
- Website fetches `/photos?trip=<destination>` with no login prompts.

## Prerequisites

1. Cloudflare account (free plan is enough for this use case).
2. `npm` installed locally.
3. One Microsoft app registration (personal account supported).

## 1) Create Microsoft App Registration

1. Open Azure Portal -> App registrations -> New registration.
2. Name: `wander-to-wonder-worker` (or any name).
3. Supported account types:
   - `Accounts in any organizational directory and personal Microsoft accounts`.
4. Register app.
5. In `Authentication`:
   - Enable `Allow public client flows` = `Yes`.
6. In `API permissions`:
   - Add delegated `Files.Read`.
   - Add delegated `offline_access`.
   - Grant consent for your account.
7. Copy `Application (client) ID`.

## 2) Generate Refresh Token (one time)

From repo root (PowerShell):

```powershell
.\scripts\get-ms-refresh-token.ps1 -ClientId "<YOUR_CLIENT_ID>"
```

Sign in using the shown device code. Copy the printed refresh token.

## 3) Create Worker

```bash
cd cloudflare-worker
npm init -y
npm install -D wrangler
```

Copy config template:

```bash
copy wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` and set `TRIP_SHARE_URLS_JSON`, for example:

```toml
TRIP_SHARE_URLS_JSON = "{\"australia\":\"https://1drv.ms/f/c/97c5e937e7e76f1c/IgAuiJr8Frc_R6pSvEhbhj1wATRFY3lnLV0D7b9Z4SYr-tM?e=DxaBFn\"}"
MS_TENANT = "consumers"
MS_SCOPE = "Files.Read offline_access"
```

Set secrets:

```bash
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_REFRESH_TOKEN
```

Optional:

```bash
npx wrangler secret put MS_CLIENT_SECRET
```

Deploy:

```bash
npx wrangler deploy
```

You will get a URL like:

```text
https://wander-to-wonder-photos.<subdomain>.workers.dev
```

## 4) Test endpoints

```text
GET /health
GET /photos?trip=australia
```

Each photo includes `src`, `thumbnail`, and `downloadUrl` pointing back to Worker proxy endpoints.

## 5) Wire into website pages

Set this constant in destination HTML pages:

```js
const galleryApiBase = 'https://wander-to-wonder-photos.<subdomain>.workers.dev';
```

Then gallery uses:

```js
apiEndpoint: `${galleryApiBase}/photos?trip=australia`
```

If API is unset or fails, existing OneDrive/local fallbacks still apply.

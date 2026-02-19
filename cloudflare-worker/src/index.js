/**
 * Cloudflare Worker: OneDrive -> Graph -> Public gallery API
 *
 * Endpoints:
 * - GET /photos?trip=australia[&limit=50]
 * - GET /thumb?sid=<shareId>&id=<itemId>&size=large
 * - GET /content?sid=<shareId>&id=<itemId>
 * - GET /health
 */

const DEFAULT_SCOPE = 'Files.Read offline_access';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

let cachedAccessToken = '';
let cachedAccessTokenExpiryEpoch = 0;
let cachedTripMapRaw = '';
let cachedTripMap = {};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders()
            });
        }

        const url = new URL(request.url);

        try {
            if (url.pathname.endsWith('/health') || url.pathname === '/health') {
                return jsonResponse(
                    {
                        ok: true,
                        now: new Date().toISOString()
                    },
                    200
                );
            }

            if (url.pathname.endsWith('/photos') || url.pathname === '/photos') {
                return handlePhotos(request, env);
            }

            if (url.pathname.endsWith('/thumb') || url.pathname === '/thumb') {
                return handleThumb(request, env);
            }

            if (url.pathname.endsWith('/content') || url.pathname === '/content') {
                return handleContent(request, env);
            }

            return jsonResponse(
                {
                    error: 'not_found',
                    message: 'Use /photos, /thumb, /content, or /health.'
                },
                404
            );
        } catch (error) {
            return jsonResponse(
                {
                    error: 'internal_error',
                    message: safeErrorMessage(error)
                },
                500
            );
        }
    }
};

async function handlePhotos(request, env) {
    const requestUrl = new URL(request.url);
    const trip = textOrDefault(requestUrl.searchParams.get('trip'), '').toLowerCase();
    const limit = clampInt(requestUrl.searchParams.get('limit'), 50, 1, 200);

    if (!trip) {
        return jsonResponse(
            { error: 'bad_request', message: 'Missing required query param: trip' },
            400
        );
    }

    const shareUrl = resolveTripShareUrl(env, trip);
    if (!shareUrl) {
        return jsonResponse(
            {
                error: 'trip_not_configured',
                message: `No OneDrive share URL mapped for trip "${trip}".`
            },
            404
        );
    }

    const shareId = encodeSharingUrl(shareUrl);
    const accessToken = await getAccessToken(env);
    const items = await fetchShareChildren(shareId, accessToken, limit);
    const imageItems = items.filter(isImageItem).slice(0, limit);

    const photosPath = requestUrl.pathname;
    const thumbPath = swapPathLeaf(photosPath, 'thumb');
    const contentPath = swapPathLeaf(photosPath, 'content');

    const photos = imageItems.map((item, index) => {
        const title = derivePhotoTitle(item.name, index + 1);
        const mimeType = textOrDefault(item?.file?.mimeType, '');
        const params = new URLSearchParams({
            sid: shareId,
            id: textOrDefault(item.id, '')
        });

        const thumbSrc = `${requestUrl.origin}${thumbPath}?${params.toString()}`;
        const contentSrc = `${requestUrl.origin}${contentPath}?${params.toString()}`;
        const normalizedMime = mimeType.toLowerCase();
        const useThumbOnly = normalizedMime.includes('heic') || normalizedMime.includes('heif');

        return {
            id: textOrDefault(item.id, ''),
            name: textOrDefault(item.name, ''),
            title,
            description: '',
            src: useThumbOnly ? thumbSrc : contentSrc,
            thumbnail: thumbSrc,
            downloadUrl: contentSrc,
            mimeType,
            webUrl: textOrDefault(item.webUrl, '')
        };
    });

    return jsonResponse(
        {
            trip,
            total: photos.length,
            photos
        },
        200,
        {
            'Cache-Control': 'public, max-age=300'
        }
    );
}

async function handleThumb(request, env) {
    const requestUrl = new URL(request.url);
    const shareId = textOrDefault(requestUrl.searchParams.get('sid'), '');
    const itemId = textOrDefault(requestUrl.searchParams.get('id'), '');
    const size = textOrDefault(requestUrl.searchParams.get('size'), 'large').toLowerCase();
    const allowedSizes = new Set(['small', 'medium', 'large']);
    const thumbnailSize = allowedSizes.has(size) ? size : 'large';

    if (!shareId || !itemId) {
        return jsonResponse(
            { error: 'bad_request', message: 'Missing required params: sid and id' },
            400
        );
    }

    const accessToken = await getAccessToken(env);
    const graphUrl =
        `${GRAPH_BASE}/shares/${encodeURIComponent(shareId)}` +
        `/driveItem/items/${encodeURIComponent(itemId)}/thumbnails/0/${thumbnailSize}/content`;

    const response = await fetch(graphUrl, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        // Fallback to original content if thumbnail isn't available.
        return handleContent(request, env);
    }

    return proxyBinaryResponse(response, 'public, max-age=1800');
}

async function handleContent(request, env) {
    const requestUrl = new URL(request.url);
    const shareId = textOrDefault(requestUrl.searchParams.get('sid'), '');
    const itemId = textOrDefault(requestUrl.searchParams.get('id'), '');

    if (!shareId || !itemId) {
        return jsonResponse(
            { error: 'bad_request', message: 'Missing required params: sid and id' },
            400
        );
    }

    const accessToken = await getAccessToken(env);
    const graphUrl =
        `${GRAPH_BASE}/shares/${encodeURIComponent(shareId)}` +
        `/driveItem/items/${encodeURIComponent(itemId)}/content`;

    const response = await fetch(graphUrl, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        redirect: 'follow'
    });

    if (!response.ok) {
        const details = await readErrorDetails(response);
        return jsonResponse(
            {
                error: 'graph_content_failed',
                message: details
            },
            response.status || 502
        );
    }

    return proxyBinaryResponse(response, 'public, max-age=300');
}

async function proxyBinaryResponse(sourceResponse, cacheControl) {
    const headers = new Headers(corsHeaders());
    headers.set('Cache-Control', cacheControl);

    const contentType = sourceResponse.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    const contentLength = sourceResponse.headers.get('Content-Length');
    if (contentLength) {
        headers.set('Content-Length', contentLength);
    }

    return new Response(sourceResponse.body, {
        status: sourceResponse.status,
        headers
    });
}

async function fetchShareChildren(shareId, accessToken, maxItems) {
    const allItems = [];
    let nextUrl = `${GRAPH_BASE}/shares/${encodeURIComponent(shareId)}/driveItem/children` +
        `?$top=${Math.min(maxItems, 200)}` +
        `&$select=id,name,file,image,webUrl`;
    let pageCount = 0;

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            const details = await readErrorDetails(response);
            throw new Error(`Graph children fetch failed (${response.status}): ${details}`);
        }

        const payload = await response.json();
        const items = Array.isArray(payload?.value) ? payload.value : [];
        allItems.push(...items);

        if (allItems.length >= maxItems) {
            break;
        }

        nextUrl = textOrDefault(payload?.['@odata.nextLink'], '');
        pageCount += 1;
        if (pageCount > 20) {
            break;
        }
    }

    return allItems.slice(0, maxItems);
}

function resolveTripShareUrl(env, trip) {
    const map = parseTripShareUrls(env);
    return textOrDefault(map[trip], '');
}

function parseTripShareUrls(env) {
    const raw = textOrDefault(env.TRIP_SHARE_URLS_JSON, '');
    if (!raw) return {};

    if (raw === cachedTripMapRaw) {
        return cachedTripMap;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('TRIP_SHARE_URLS_JSON must be a JSON object of trip->shareUrl.');
    }

    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
        const normalizedKey = textOrDefault(key, '').toLowerCase();
        const normalizedValue = textOrDefault(value, '');
        if (normalizedKey && normalizedValue) {
            normalized[normalizedKey] = normalizedValue;
        }
    }

    cachedTripMapRaw = raw;
    cachedTripMap = normalized;
    return normalized;
}

async function getAccessToken(env) {
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (cachedAccessToken && cachedAccessTokenExpiryEpoch - 60 > nowEpoch) {
        return cachedAccessToken;
    }

    const clientId = textOrDefault(env.MS_CLIENT_ID, '');
    const refreshToken = textOrDefault(env.MS_REFRESH_TOKEN, '');
    const tenant = textOrDefault(env.MS_TENANT, 'consumers');
    const scope = textOrDefault(env.MS_SCOPE, DEFAULT_SCOPE);

    if (!clientId || !refreshToken) {
        throw new Error('MS_CLIENT_ID and MS_REFRESH_TOKEN must be configured as Worker secrets.');
    }

    const body = new URLSearchParams();
    body.set('client_id', clientId);
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    body.set('scope', scope);

    const clientSecret = textOrDefault(env.MS_CLIENT_SECRET, '');
    if (clientSecret) {
        body.set('client_secret', clientSecret);
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    if (!response.ok) {
        const details = await readErrorDetails(response);
        throw new Error(`Token refresh failed (${response.status}): ${details}`);
    }

    const tokenPayload = await response.json();
    const accessToken = textOrDefault(tokenPayload.access_token, '');
    const expiresIn = Number(tokenPayload.expires_in || 3600);
    const nextRefreshToken = textOrDefault(tokenPayload.refresh_token, '');

    if (!accessToken) {
        throw new Error('Token refresh succeeded but access_token is missing.');
    }

    cachedAccessToken = accessToken;
    cachedAccessTokenExpiryEpoch = nowEpoch + (Number.isFinite(expiresIn) ? expiresIn : 3600);

    // Refresh token rotation may occur. Update Worker secret if token refresh starts failing.
    if (nextRefreshToken && nextRefreshToken !== refreshToken) {
        // Not persisted from code because Worker secrets are immutable at runtime.
        // Kept as warning signal in logs only.
        console.log('Microsoft issued a rotated refresh token. Update MS_REFRESH_TOKEN secret soon.');
    }

    return cachedAccessToken;
}

function encodeSharingUrl(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = '';

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    const base64 = btoa(binary);
    return (
        'u!' +
        base64
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
    );
}

function isImageItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.image) return true;

    const mimeType = textOrDefault(item?.file?.mimeType, '').toLowerCase();
    return mimeType.startsWith('image/');
}

function derivePhotoTitle(fileName, fallbackIndex) {
    const raw = textOrDefault(fileName, '');
    if (!raw) return `Photo ${fallbackIndex}`;

    return raw
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function swapPathLeaf(pathname, leaf) {
    const parts = pathname.split('/').filter((part) => part.length > 0);
    if (parts.length === 0) return `/${leaf}`;
    parts[parts.length - 1] = leaf;
    return `/${parts.join('/')}`;
}

function clampInt(rawValue, fallback, min, max) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function textOrDefault(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function safeErrorMessage(error) {
    if (!error) return 'Unknown error.';
    if (typeof error.message === 'string' && error.message.trim().length > 0) {
        return error.message;
    }
    return String(error);
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
        ...extraHeaders
    });

    return new Response(JSON.stringify(payload, null, 2), {
        status,
        headers
    });
}

async function readErrorDetails(response) {
    let text = '';
    try {
        text = await response.text();
    } catch (error) {
        return response.statusText || 'Unknown error';
    }

    if (!text) return response.statusText || 'Unknown error';

    try {
        const parsed = JSON.parse(text);
        const nestedMessage = parsed?.error?.message;
        if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
            return nestedMessage;
        }
    } catch (error) {
        // Ignore parse errors and return trimmed text below.
    }

    return text.slice(0, 400);
}

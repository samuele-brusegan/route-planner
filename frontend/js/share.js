// Route sharing via URL — encodes only waypoints, not full route coordinates

const SHARE_API_URL = '/api/share';
const MAX_URL_LENGTH = 1500;

// Generate a shareable URL for the current route
async function generateShareUrl() {
    if (AppState.markers.length < 2) {
        showToast('Aggiungi almeno 2 marker per condividere', 'warning');
        return null;
    }

    const routeData = {
        m: AppState.markers.map(m => ({
            lat: m.lat,
            lon: m.lon,
            name: m.name || '',
            type: m.type || 'waypoint'
        })),
        c: AppState.routeColor || '#4a90a4',
        p: AppState.profile || 'walking'
    };

    const json = JSON.stringify(routeData);

    // Try compression
    let encoded;
    try {
        encoded = await compressData(json);
    } catch {
        encoded = btoa(json);
    }

    const url = `${window.location.origin}${window.location.pathname}?route=${encoded}`;

    // If URL is too long, use short link fallback
    if (url.length > MAX_URL_LENGTH) {
        try {
            const response = await fetch(SHARE_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routeData })
            });

            if (!response.ok) throw new Error('Share API failed');

            const { id } = await response.json();
            return `${window.location.origin}/r/${id}`;
        } catch (error) {
            console.error('Short link failed:', error);
            showToast('URL troppo lungo e short link non disponibile', 'error');
            return null;
        }
    }

    return url;
}

// Compress data using CompressionStream API
async function compressData(data) {
    if (!('CompressionStream' in window)) {
        return btoa(data);
    }

    const stream = new Response(data).body
        .pipeThrough(new CompressionStream('gzip'));

    const compressed = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    return base64UrlEncode(bytes);
}

// Decompress data
async function decompressData(encoded) {
    if (!('DecompressionStream' in window)) {
        return atob(encoded);
    }

    const bytes = base64UrlDecode(encoded);
    const stream = new Response(bytes).body
        .pipeThrough(new DecompressionStream('gzip'));

    const decompressed = await new Response(stream).text();
    return decompressed;
}

// Base64URL encode/decode
function base64UrlEncode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Load route from URL parameter on page load
async function loadRouteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const routeParam = params.get('route');

    if (routeParam) {
        try {
            const json = await decompressData(routeParam);
            const data = JSON.parse(json);
            applySharedRoute(data);
        } catch (error) {
            console.error('Failed to load shared route:', error);
        }
        return;
    }

    // Check for short link /r/:id
    const pathMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9]{6})$/);
    if (pathMatch) {
        try {
            const response = await fetch(`${SHARE_API_URL}/${pathMatch[1]}`);
            if (!response.ok) throw new Error('Short link not found');
            const { routeData } = await response.json();
            applySharedRoute(routeData);
        } catch (error) {
            console.error('Failed to load short link:', error);
        }
    }
}

function applySharedRoute(data) {
    if (!data.m || data.m.length < 2) return;

    AppState.markers = data.m.map((m, i) => ({
        id: Date.now() + i,
        lat: m.lat,
        lon: m.lon,
        name: m.name || '',
        type: m.type || 'waypoint'
    }));

    if (data.c) AppState.routeColor = data.c;
    if (data.p) AppState.profile = data.p;

    // Recalculate route from waypoints
    if (typeof calculateRoute === 'function') {
        calculateRoute();
    }
}

// Copy share URL to clipboard
async function copyShareUrl() {
    const url = await generateShareUrl();
    if (!url) return;

    try {
        await navigator.clipboard.writeText(url);
        showToast('Link copiato negli appunti!', 'success');
    } catch {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Link copiato!', 'success');
    }
}

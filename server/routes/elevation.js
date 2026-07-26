const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

router.use(express.json({ limit: '1mb' }));

// Simple in-memory cache: key = "lat,lon" -> elevation
const elevationCache = new Map();
const CACHE_MAX = 50000;

// Persistent offline cache directory
const OFFLINE_CACHE_DIR = process.env.OFFLINE_ELEVATION_DIR || '/data/elevation_cache';
let offlineCacheLoaded = false;

function cacheKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

// Load persistent offline cache into memory on startup
async function loadOfflineCache() {
    if (offlineCacheLoaded) return;
    offlineCacheLoaded = true;
    try {
        const files = await fs.readdir(OFFLINE_CACHE_DIR).catch(() => []);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = await fs.readFile(path.join(OFFLINE_CACHE_DIR, file), 'utf8');
                const data = JSON.parse(content);
                for (const [key, value] of Object.entries(data)) {
                    if (elevationCache.size >= CACHE_MAX) break;
                    elevationCache.set(key, value);
                }
            } catch (e) {
                // Skip corrupt files
            }
        }
        console.log(`Offline elevation cache loaded: ${elevationCache.size} entries`);
    } catch (error) {
        console.warn('Failed to load offline elevation cache:', error.message);
    }
}

// Save a batch of elevations to persistent cache
async function saveOfflineCacheBatch(entries) {
    try {
        await fs.mkdir(OFFLINE_CACHE_DIR, { recursive: true });
        const timestamp = Date.now();
        const filename = `batch_${timestamp}.json`;
        await fs.writeFile(
            path.join(OFFLINE_CACHE_DIR, filename),
            JSON.stringify(entries)
        );
    } catch (error) {
        console.warn('Failed to save offline elevation cache:', error.message);
    }
}

// Load offline cache asynchronously on module load
loadOfflineCache();

// --- Elevation providers (tried in order) ---

// 1. Open-Meteo: GET with comma-separated lat/lon, returns { elevation: [...] }
async function fetchOpenMeteo(batch) {
    const lats = batch.map(c => c.lat).join(',');
    const lons = batch.map(c => c.lon).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'RoutePlanner/1.0' },
        timeout: 10000
    });
    if (response.status !== 200) throw new Error(`Open-Meteo responded ${response.status}`);
    if (!Array.isArray(response.data.elevation)) throw new Error('Invalid Open-Meteo response');
    return response.data.elevation;
}

// 2. OpenTopoData: GET with pipe-separated locations, returns { results: [{ elevation }, ...] }
async function fetchOpenTopoData(batch) {
    const locations = batch.map(c => `${c.lat},${c.lon}`).join('|');
    const url = `https://api.opentopodata.org/v1/srtm90m?locations=${locations}`;
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'RoutePlanner/1.0' },
        timeout: 15000
    });
    if (response.status !== 200) throw new Error(`OpenTopoData responded ${response.status}`);
    if (!Array.isArray(response.data.results)) throw new Error('Invalid OpenTopoData response');
    return response.data.results.map(r => r.elevation);
}

// 3. Open-Elevation: POST with JSON body, returns { results: [{ elevation }, ...] }
async function fetchOpenElevation(batch) {
    const locations = batch.map(c => ({ latitude: c.lat, longitude: c.lon }));
    const response = await axios.post(
        'https://api.open-elevation.com/api/v1/lookup',
        { locations },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    if (response.status !== 200) throw new Error(`Open-Elevation responded ${response.status}`);
    if (!Array.isArray(response.data.results)) throw new Error('Invalid Open-Elevation response');
    return response.data.results.map(r => r.elevation);
}

const providers = [
    { name: 'Open-Meteo', fetch: fetchOpenMeteo, retries: 1 },
    { name: 'OpenTopoData', fetch: fetchOpenTopoData, retries: 1 },
    { name: 'Open-Elevation', fetch: fetchOpenElevation, retries: 1 }
];

// Proxy elevation requests with multi-provider fallback
router.post('/', async (req, res) => {
    try {
        const { coordinates } = req.body;
        if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
            return res.status(400).json({ error: 'coordinates array required' });
        }

        // Separate cached vs uncached coordinates
        const allElevations = new Array(coordinates.length);
        const uncachedIndices = [];
        const uncachedCoords = [];

        coordinates.forEach((coord, idx) => {
            const key = cacheKey(coord.lat, coord.lon);
            if (elevationCache.has(key)) {
                allElevations[idx] = elevationCache.get(key);
            } else {
                uncachedIndices.push(idx);
                uncachedCoords.push(coord);
            }
        });

        if (uncachedCoords.length === 0) {
            return res.json({ elevations: allElevations });
        }

        const batchSize = 100;

        for (let i = 0; i < uncachedCoords.length; i += batchSize) {
            const batch = uncachedCoords.slice(i, i + batchSize);
            const batchIndices = uncachedIndices.slice(i, i + batchSize);

            let batchElevations = null;
            let lastError = null;

            for (const provider of providers) {
                let success = false;
                for (let attempt = 0; attempt <= provider.retries && !success; attempt++) {
                    try {
                        batchElevations = await provider.fetch(batch);
                        if (!Array.isArray(batchElevations) || batchElevations.length !== batch.length) {
                            throw new Error(`${provider.name} returned wrong count`);
                        }
                        success = true;
                    } catch (err) {
                        lastError = err;
                        if (attempt < provider.retries) {
                            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        }
                    }
                }
                if (success) break;
                console.warn(`Elevation provider ${provider.name} failed:`, lastError?.message);
            }

            if (!batchElevations) throw lastError;

            const offlineEntries = {};
            batchElevations.forEach((elev, j) => {
                const coord = batch[j];
                const key = cacheKey(coord.lat, coord.lon);
                if (elevationCache.size >= CACHE_MAX) {
                    const firstKey = elevationCache.keys().next().value;
                    elevationCache.delete(firstKey);
                }
                elevationCache.set(key, elev);
                offlineEntries[key] = elev;
                allElevations[batchIndices[j]] = elev;
            });
            // Persist to disk for offline use
            saveOfflineCacheBatch(offlineEntries).catch(() => {});

            // Delay between batches to avoid rate limiting
            if (i + batchSize < uncachedCoords.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        res.json({ elevations: allElevations });
    } catch (error) {
        console.error('Elevation proxy error:', error);
        res.status(500).json({ error: 'Elevation lookup failed', details: error.message });
    }
});

// --- Offline elevation download endpoint ---
// Pre-fetch elevation data for a bounding box and store persistently
router.post('/download', async (req, res) => {
    try {
        const { bounds, resolution } = req.body;
        if (!bounds || typeof bounds.minLat !== 'number' || typeof bounds.maxLat !== 'number' ||
            typeof bounds.minLon !== 'number' || typeof bounds.maxLon !== 'number') {
            return res.status(400).json({ error: 'bounds { minLat, maxLat, minLon, maxLon } required' });
        }

        const step = resolution || 0.01; // ~1km grid by default
        const coords = [];
        for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += step) {
            for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += step) {
                const key = cacheKey(lat, lon);
                if (!elevationCache.has(key)) {
                    coords.push({ lat, lon });
                }
            }
        }

        if (coords.length === 0) {
            return res.json({ status: 'ok', message: 'All points already cached', downloaded: 0 });
        }

        const batchSize = 100;
        let downloaded = 0;
        let failed = 0;

        for (let i = 0; i < coords.length; i += batchSize) {
            const batch = coords.slice(i, i + batchSize);

            let batchElevations = null;
            for (const provider of providers) {
                try {
                    batchElevations = await provider.fetch(batch);
                    if (!Array.isArray(batchElevations) || batchElevations.length !== batch.length) {
                        batchElevations = null;
                        continue;
                    }
                    break;
                } catch (err) {
                    // Try next provider
                }
            }

            if (batchElevations) {
                const offlineEntries = {};
                batchElevations.forEach((elev, j) => {
                    const coord = batch[j];
                    const key = cacheKey(coord.lat, coord.lon);
                    if (elevationCache.size >= CACHE_MAX) {
                        const firstKey = elevationCache.keys().next().value;
                        elevationCache.delete(firstKey);
                    }
                    elevationCache.set(key, elev);
                    offlineEntries[key] = elev;
                });
                await saveOfflineCacheBatch(offlineEntries);
                downloaded += batch.length;
            } else {
                failed += batch.length;
            }

            // Delay between batches
            if (i + batchSize < coords.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        res.json({
            status: 'ok',
            totalPoints: coords.length,
            downloaded,
            failed
        });
    } catch (error) {
        console.error('Elevation download error:', error);
        res.status(500).json({ error: 'Elevation download failed', details: error.message });
    }
});

// --- Offline elevation status endpoint ---
router.get('/status', async (req, res) => {
    try {
        const files = await fs.readdir(OFFLINE_CACHE_DIR).catch(() => []);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        let totalEntries = 0;
        let totalSizeBytes = 0;
        for (const file of jsonFiles) {
            const stat = await fs.stat(path.join(OFFLINE_CACHE_DIR, file)).catch(() => null);
            if (stat) totalSizeBytes += stat.size;
        }
        totalEntries = elevationCache.size;
        res.json({
            available: jsonFiles.length > 0 || elevationCache.size > 0,
            cacheEntries: totalEntries,
            cacheFiles: jsonFiles.length,
            cacheSizeMB: Math.round(totalSizeBytes / 1024 / 1024 * 100) / 100
        });
    } catch (error) {
        res.json({ available: false, cacheEntries: 0, cacheFiles: 0, cacheSizeMB: 0 });
    }
});

// --- Clear offline elevation cache ---
router.delete('/cache', async (req, res) => {
    try {
        const files = await fs.readdir(OFFLINE_CACHE_DIR).catch(() => []);
        for (const file of files) {
            await fs.unlink(path.join(OFFLINE_CACHE_DIR, file)).catch(() => {});
        }
        elevationCache.clear();
        res.json({ status: 'ok', message: 'Elevation cache cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cache', details: error.message });
    }
});

module.exports = router;

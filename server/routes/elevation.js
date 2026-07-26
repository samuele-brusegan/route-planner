const express = require('express');
const axios = require('axios');
const router = express.Router();

router.use(express.json({ limit: '1mb' }));

// Simple in-memory cache: key = "lat,lon" -> elevation
const elevationCache = new Map();
const CACHE_MAX = 50000;

function cacheKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

// Proxy elevation requests to Open-Meteo (avoids CORS issues, allows retry)
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
            const lats = batch.map(c => c.lat).join(',');
            const lons = batch.map(c => c.lon).join(',');
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

            let lastError = null;
            let success = false;

            for (let attempt = 0; attempt < 3 && !success; attempt++) {
                try {
                    const response = await axios.get(url, {
                        headers: { 'User-Agent': 'RoutePlanner/1.0' },
                        timeout: 10000
                    });
                    if (response.status !== 200) throw new Error(`Open-Meteo responded ${response.status}`);
                    if (!Array.isArray(response.data.elevation)) throw new Error('Invalid elevation response');

                    response.data.elevation.forEach((elev, j) => {
                        const coord = batch[j];
                        const key = cacheKey(coord.lat, coord.lon);
                        if (elevationCache.size >= CACHE_MAX) {
                            // Evict oldest entry
                            const firstKey = elevationCache.keys().next().value;
                            elevationCache.delete(firstKey);
                        }
                        elevationCache.set(key, elev);
                        allElevations[batchIndices[j]] = elev;
                    });
                    success = true;
                } catch (err) {
                    lastError = err;
                    if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }

            if (!success) throw lastError;

            // Delay between batches to avoid rate limiting
            if (i + batchSize < uncachedCoords.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        res.json({ elevations: allElevations });
    } catch (error) {
        console.error('Elevation proxy error:', error);
        res.status(500).json({ error: 'Elevation lookup failed', details: error.message });
    }
});

module.exports = router;

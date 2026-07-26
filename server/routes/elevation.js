const express = require('express');
const router = express.Router();

router.use(express.json({ limit: '1mb' }));

// Proxy elevation requests to Open-Meteo (avoids CORS issues, allows retry)
router.post('/', async (req, res) => {
    try {
        const { coordinates } = req.body;
        if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
            return res.status(400).json({ error: 'coordinates array required' });
        }

        const batchSize = 100;
        const allElevations = [];

        for (let i = 0; i < coordinates.length; i += batchSize) {
            const batch = coordinates.slice(i, i + batchSize);
            const lats = batch.map(c => c.lat).join(',');
            const lons = batch.map(c => c.lon).join(',');
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

            let lastError = null;
            let success = false;

            for (let attempt = 0; attempt < 3 && !success; attempt++) {
                try {
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'RoutePlanner/1.0' }
                    });
                    if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
                    const data = await response.json();
                    if (!Array.isArray(data.elevation)) throw new Error('Invalid elevation response');
                    allElevations.push(...data.elevation);
                    success = true;
                } catch (err) {
                    lastError = err;
                    if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                }
            }

            if (!success) throw lastError;
        }

        res.json({ elevations: allElevations });
    } catch (error) {
        console.error('Elevation proxy error:', error);
        res.status(500).json({ error: 'Elevation lookup failed', details: error.message });
    }
});

module.exports = router;

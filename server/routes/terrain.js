const express = require('express');
const router = express.Router();
const cache = require('../utils/overpass-cache');

// Unified terrain analysis: rivers, evacuation, trails, POI in one Overpass query
router.post('/analyze', async (req, res) => {
    try {
        const { bbox, routeCoordinates } = req.body;
        if (!bbox) {
            return res.status(400).json({ error: 'bbox is required' });
        }

        const cacheKey = `terrain:${JSON.stringify(bbox)}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json({ ...cached, cached: true });
        }

        const [minLat, minLon, maxLat, maxLon] = bbox;
        const query = `
[out:json][timeout:25];
(
  way["waterway"~"stream|river|wadi|canal"](${minLat},${minLon},${maxLat},${maxLon});
  way["highway"~"motorway|trunk|primary|secondary"](${minLat},${minLon},${maxLat},${maxLon});
  node["tourism"~"alpine_hut|wilderness_hut"](${minLat},${minLon},${maxLat},${maxLon});
  node["amenity"~"drinking_water|shelter|parking"](${minLat},${minLon},${maxLat},${maxLon});
  node["natural"~"peak|cliff|crevasse"](${minLat},${minLon},${maxLat},${maxLon});
  node["waterway"="waterfall"](${minLat},${minLon},${maxLat},${maxLon});
  way["sac_scale"](${minLat},${minLon},${maxLat},${maxLon});
  way["trail_visibility"](${minLat},${minLon},${maxLat},${maxLon});
);
out tags geom;
`;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'RoutePlanner/1.0'
            },
            body: new URLSearchParams({ data: query })
        });

        if (!response.ok) {
            throw new Error(`Overpass responded with ${response.status}`);
        }

        const data = await response.json();

        const waterways = [];
        const evacuationRoads = [];
        const pois = [];
        const trails = [];

        (data.elements || []).forEach(el => {
            if (el.tags?.waterway) {
                waterways.push({
                    id: el.id,
                    type: el.tags.waterway,
                    name: el.tags.name || '',
                    coordinates: el.geometry?.map(p => [p.lon, p.lat]) || []
                });
            }
            if (el.tags?.highway && ['motorway', 'trunk', 'primary', 'secondary'].includes(el.tags.highway)) {
                evacuationRoads.push({
                    id: el.id,
                    type: el.tags.highway,
                    name: el.tags.name || '',
                    coordinates: el.geometry?.map(p => [p.lon, p.lat]) || []
                });
            }
            if (el.tags?.tourism || el.tags?.amenity || el.tags?.natural) {
                pois.push({
                    id: el.id,
                    lat: el.lat || el.center?.lat,
                    lon: el.lon || el.center?.lon,
                    tags: el.tags || {}
                });
            }
            if (el.tags?.sac_scale || el.tags?.trail_visibility) {
                trails.push({
                    id: el.id,
                    sacScale: el.tags.sac_scale || null,
                    trailVisibility: el.tags.trail_visibility || null,
                    surface: el.tags.surface || null,
                    highway: el.tags.highway || null,
                    coordinates: el.geometry?.map(p => [p.lon, p.lat]) || []
                });
            }
        });

        const result = { waterways, evacuationRoads, pois, trails };
        await cache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Terrain analysis error:', error);
        res.status(500).json({ error: 'Terrain analysis failed' });
    }
});

module.exports = router;

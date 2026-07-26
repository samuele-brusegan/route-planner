const express = require('express');
const router = express.Router();
const cache = require('../utils/overpass-cache');

// Wikipedia GeoSearch
router.get('/wikipedia', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);
        const radius = parseInt(req.query.radius) || 5000;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon are required' });
        }

        const cacheKey = `wiki:${lat.toFixed(4)},${lon.toFixed(4)},${radius}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json({ results: cached, cached: true });
        }

        const url = `https://it.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=${radius}&gslimit=20&format=json`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'RoutePlanner/1.0' }
        });

        if (!response.ok) {
            throw new Error(`Wikipedia API responded with ${response.status}`);
        }

        const data = await response.json();
        const results = (data.query?.geosearch || []).map(item => ({
            pageId: item.pageid,
            title: item.title,
            lat: item.lat,
            lon: item.lon,
            url: `https://it.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
        }));

        await cache.set(cacheKey, results);
        res.json({ results });
    } catch (error) {
        console.error('Wikipedia search error:', error);
        res.status(500).json({ error: 'Wikipedia search failed' });
    }
});

// POI search via Overpass (unified with terrain.js)
router.post('/', async (req, res) => {
    try {
        const { bbox, types = [] } = req.body;
        if (!bbox) {
            return res.status(400).json({ error: 'bbox is required' });
        }

        const cacheKey = `poi:${JSON.stringify(bbox)}:${types.join(',')}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json({ results: cached, cached: true });
        }

        const [minLat, minLon, maxLat, maxLon] = bbox;
        const typeFilters = buildPoiTypeFilter(types);
        const query = `
[out:json][timeout:25];
(
${typeFilters}
);
out center tags;
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
        const results = (data.elements || []).map(el => ({
            id: el.id,
            type: el.type,
            lat: el.lat || el.center?.lat,
            lon: el.lon || el.center?.lon,
            tags: el.tags || {}
        }));

        await cache.set(cacheKey, results);
        res.json({ results });
    } catch (error) {
        console.error('POI search error:', error);
        res.status(500).json({ error: 'POI search failed' });
    }
});

function buildPoiTypeFilter(types) {
    const filters = {
        refuge: 'node["tourism"~"alpine_hut|wilderness_hut"](bbox);',
        shelter: 'node["amenity"="shelter"](bbox);',
        water: 'node["amenity"="drinking_water"](bbox);node["natural"="spring"](bbox);node["man_made"="water_well"](bbox);',
        peak: 'node["natural"="peak"](bbox);',
        parking: 'node["amenity"="parking"](bbox);',
        danger: 'node["natural"~"cliff|crevasse"](bbox);node["waterway"="waterfall"](bbox);',
        emergency: 'node["amenity"="hospital"](bbox);node["emergency"="phone"](bbox);'
    };

    const bboxStr = '{bbox}';
    const selected = types.length > 0 ? types : Object.keys(filters);
    return selected.map(t => (filters[t] || '').replace(/\(bbox\)/g, (val) => {
        return '';
    })).join('\n');
}

module.exports = router;

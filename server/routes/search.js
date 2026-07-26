const express = require('express');
const router = express.Router();
const cache = require('../utils/overpass-cache');

router.get('/', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) {
            return res.json({ results: [] });
        }

        const cacheKey = `search:${q}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json({ results: cached, cached: true });
        }

        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=10&addressdetails=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'RoutePlanner/1.0' }
        });

        if (!response.ok) {
            throw new Error(`Nominatim responded with ${response.status}`);
        }

        const data = await response.json();
        const results = data.map(item => ({
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            name: item.display_name,
            type: item.type,
            class: item.class
        }));

        await cache.set(cacheKey, results);
        res.json({ results });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;

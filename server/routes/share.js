const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const router = express.Router();

const SHARED_DIR = process.env.SHARED_DIR || '/data/shared';
const MAX_AGE_DAYS = 30;

// Create a short link
router.post('/', async (req, res) => {
    try {
        const { routeData } = req.body;
        if (!routeData) {
            return res.status(400).json({ error: 'routeData is required' });
        }

        const id = generateId();
        const filePath = path.join(SHARED_DIR, `${id}.json`);

        await fs.mkdir(SHARED_DIR, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify({
            routeData,
            createdAt: Date.now()
        }));

        res.json({ id, url: `/r/${id}` });
    } catch (error) {
        console.error('Share error:', error);
        res.status(500).json({ error: 'Failed to create share link' });
    }
});

// Retrieve a shared route
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[a-zA-Z0-9]{6}$/.test(id)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const filePath = path.join(SHARED_DIR, `${id}.json`);
        const raw = await fs.readFile(filePath, 'utf8');
        const entry = JSON.parse(raw);

        // Check expiry
        const ageMs = Date.now() - entry.createdAt;
        if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
            await fs.unlink(filePath).catch(() => {});
            return res.status(404).json({ error: 'Link expired' });
        }

        res.json({ routeData: entry.routeData });
    } catch (error) {
        res.status(404).json({ error: 'Not found' });
    }
});

function generateId() {
    return crypto.randomBytes(4).toString('base64url').slice(0, 6);
}

module.exports = router;

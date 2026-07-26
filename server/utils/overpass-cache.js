const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const CACHE_DIR = process.env.CACHE_DIR || '/data/cache';
const MEMORY_CACHE = new Map();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

async function get(key, ttlMs = DEFAULT_TTL_MS) {
    const hashed = hashKey(key);

    // Check memory cache
    const memEntry = MEMORY_CACHE.get(hashed);
    if (memEntry && Date.now() - memEntry.timestamp < ttlMs) {
        return memEntry.data;
    }

    // Check disk cache
    try {
        const cachePath = path.join(CACHE_DIR, `${hashed}.json`);
        const raw = await fs.readFile(cachePath, 'utf8');
        const entry = JSON.parse(raw);
        if (Date.now() - entry.timestamp < ttlMs) {
            MEMORY_CACHE.set(hashed, entry);
            return entry.data;
        }
    } catch (_) {}

    return null;
}

async function set(key, data) {
    const hashed = hashKey(key);
    const entry = { timestamp: Date.now(), data };

    MEMORY_CACHE.set(hashed, entry);

    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        const cachePath = path.join(CACHE_DIR, `${hashed}.json`);
        await fs.writeFile(cachePath, JSON.stringify(entry));
    } catch (error) {
        console.warn('Cache write failed:', error.message);
    }
}

module.exports = { get, set, hashKey };

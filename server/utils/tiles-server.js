const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

const DATA_DIR = '/data';
const TILE_CACHE = new Map();

// Open MBTiles database
async function openMBTiles(mbtilesPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(mbtilesPath, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(db);
            }
        });
    });
}

// Get tile from MBTiles
async function getTile(regionId, z, x, y) {
    const mbtilesPath = path.join(DATA_DIR, `${regionId}.mbtiles`);
    
    // Check if file exists
    try {
        await fs.access(mbtilesPath);
    } catch (error) {
        return null;
    }
    
    // Get or create cached database connection
    let db = TILE_CACHE.get(regionId);
    if (!db) {
        db = await openMBTiles(mbtilesPath);
        TILE_CACHE.set(regionId, db);
    }
    
    return new Promise((resolve, reject) => {
        // Flip Y coordinate for TMS scheme
        const maxTile = Math.pow(2, z);
        const flippedY = maxTile - 1 - y;
        
        db.get(
            'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
            [z, x, flippedY],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.tile_data : null);
                }
            }
        );
    });
}

// Get metadata from MBTiles
async function getMetadata(regionId) {
    const mbtilesPath = path.join(DATA_DIR, `${regionId}.mbtiles`);
    
    try {
        await fs.access(mbtilesPath);
    } catch (error) {
        return null;
    }
    
    let db = TILE_CACHE.get(regionId);
    if (!db) {
        db = await openMBTiles(mbtilesPath);
        TILE_CACHE.set(regionId, db);
    }
    
    return new Promise((resolve, reject) => {
        db.all('SELECT name, value FROM metadata', (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const metadata = {};
                rows.forEach(row => {
                    metadata[row.name] = row.value;
                });
                resolve(metadata);
            }
        });
    });
}

// Close all cached database connections
function closeAllConnections() {
    TILE_CACHE.forEach((db, regionId) => {
        db.close((err) => {
            if (err) {
                console.error(`Error closing DB for ${regionId}:`, err);
            }
        });
    });
    TILE_CACHE.clear();
}

module.exports = {
    getTile,
    getMetadata,
    closeAllConnections
};

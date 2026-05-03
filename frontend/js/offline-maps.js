// Offline Maps Management with IndexedDB
const DB_NAME = 'RoutePlannerOfflineMaps';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

// Initialize IndexedDB
function initOfflineMapsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

// Save tile to IndexedDB
async function saveTile(url, blob) {
    const db = await initOfflineMapsDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(blob, url);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Get tile from IndexedDB
async function getTile(url) {
    const db = await initOfflineMapsDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(url);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Convert longitude to tile X coordinate
function lonToTile(lon, zoom) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

// Convert latitude to tile Y coordinate
function latToTile(lat, zoom) {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

// Download tiles for a region
async function downloadRegionTiles(bounds, minZoom, maxZoom, mapType = 'full', signal = null, onProgress = null) {
    const tiles = [];
    
    for (let z = minZoom; z <= maxZoom; z++) {
        const minX = lonToTile(bounds.minLon, z);
        const maxX = lonToTile(bounds.maxLon, z);
        const minY = latToTile(bounds.maxLat, z);
        const maxY = latToTile(bounds.minLat, z);
        
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                if (signal && signal.aborted) {
                    throw new Error('Download aborted');
                }
                
                tiles.push({ z, x, y });
            }
        }
    }
    
    let downloaded = 0;
    const total = tiles.length;
    
    for (const tile of tiles) {
        if (signal && signal.aborted) {
            throw new Error('Download aborted');
        }
        
        let url;
        if (mapType === 'roads') {
            url = `https://a.tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
        } else if (mapType === 'contours') {
            url = `https://a.tile.opentopomap.org/${tile.z}/${tile.x}/${tile.y}.png`;
        } else {
            url = `https://a.tile.opentopomap.org/${tile.z}/${tile.x}/${tile.y}.png`;
        }
        
        try {
            const response = await fetch(url);
            if (response.ok) {
                const blob = await response.blob();
                await saveTile(url, blob);
            }
        } catch (error) {
            console.error(`Failed to download tile ${tile.z}/${tile.x}/${tile.y}:`, error);
        }
        
        downloaded++;
        if (typeof onProgress === 'function') {
            onProgress(downloaded, total);
        }
    }
    
    return { downloaded, total, totalTiles: total };
}

// Custom tile source that uses offline tiles when available
class OfflineTileSource extends ol.source.XYZ {
    constructor(options) {
        super({
            ...options,
            url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
        });
    }
    
    tileLoadFunction(tile, src) {
        // Try to get from IndexedDB first
        getTile(src).then(blob => {
            if (blob) {
                const img = tile.getImage();
                const imageUrl = URL.createObjectURL(blob);
                img.src = imageUrl;
                img.onload = () => URL.revokeObjectURL(imageUrl);
            } else {
                // Fallback to online
                super.tileLoadFunction(tile, src);
            }
        }).catch(() => {
            // Fallback to online on error
            super.tileLoadFunction(tile, src);
        });
    }
}

// Count stored tiles in IndexedDB
async function getStorageUsage() {
    const db = await initOfflineMapsDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
    });
}

// Clear all stored offline tiles
async function clearOfflineTiles() {
    const db = await initOfflineMapsDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Predefined regions
const REGIONS = {
    'italy-north': {
        name: 'Italia Nord',
        bounds: { minLon: 6.5, maxLon: 12.5, minLat: 44.0, maxLat: 47.5 }
    },
    'italy-center': {
        name: 'Italia Centro',
        bounds: { minLon: 10.0, maxLon: 13.5, minLat: 41.5, maxLat: 44.0 }
    },
    'italy-south': {
        name: 'Italia Sud',
        bounds: { minLon: 13.5, maxLon: 18.5, minLat: 36.5, maxLat: 41.5 }
    },
    'italy-all': {
        name: 'Italia Completa',
        bounds: { minLon: 6.5, maxLon: 18.5, minLat: 36.5, maxLat: 47.5 }
    },
    'custom': {
        name: 'Personalizzata',
        bounds: null
    }
};

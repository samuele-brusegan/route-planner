// Fallback showToast for standalone pages without ui.js
if (typeof showToast === 'undefined') {
    window.showToast = function(message, type) {
        console.log(`[Toast:${type || 'info'}] ${message}`);
        const toast = document.createElement('div');
        toast.className = `toast toast-${type || 'info'}`;
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;background:#1e293b;color:#fff;z-index:9999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    };
}

// Theme management for standalone page
function initOfflinePageTheme() {
    const savedTheme = localStorage.getItem('routePlannerTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('routePlannerTheme', next);
        });
    }
}

// Hierarchical region data
const REGION_DATA = {
    world: {
        name: 'Mondo',
        continents: {
            europe: {
                name: 'Europa',
                countries: {
                    italy: {
                        name: 'Italia',
                        regions: {
                            veneto: { name: 'Veneto', bounds: { minLon: 10.5, maxLon: 13.5, minLat: 44.5, maxLat: 46.5 } },
                            lombardy: { name: 'Lombardia', bounds: { minLon: 8.5, maxLon: 11.5, minLat: 45.0, maxLat: 46.5 } },
                            tuscany: { name: 'Toscana', bounds: { minLon: 9.5, maxLon: 12.5, minLat: 42.5, maxLat: 44.5 } },
                            piedmont: { name: 'Piemonte', bounds: { minLon: 7.0, maxLon: 9.5, minLat: 44.0, maxLat: 46.0 } },
                            trentino: { name: 'Trentino-Alto Adige', bounds: { minLon: 10.0, maxLon: 12.5, minLat: 45.5, maxLat: 47.5 } },
                            sicily: { name: 'Sicilia', bounds: { minLon: 11.5, maxLon: 15.5, minLat: 35.5, maxLat: 38.5 } },
                            sardinia: { name: 'Sardegna', bounds: { minLon: 7.5, maxLon: 10.0, minLat: 38.5, maxLat: 41.5 } }
                        },
                        bounds: { minLon: 6.5, maxLon: 18.5, minLat: 36.5, maxLat: 47.5 }
                    },
                    france: {
                        name: 'Francia',
                        regions: {
                            provence: { name: 'Provenza', bounds: { minLon: 4.5, maxLon: 7.0, minLat: 43.0, maxLat: 45.0 } },
                            alps: { name: 'Alpi Francesi', bounds: { minLon: 5.5, maxLon: 8.0, minLat: 44.0, maxLat: 46.0 } },
                            pyrenees: { name: 'Pirenei', bounds: { minLon: -0.5, maxLon: 3.0, minLat: 42.0, maxLat: 43.5 } }
                        },
                        bounds: { minLon: -5.0, maxLon: 10.0, minLat: 41.0, maxLat: 51.0 }
                    },
                    germany: {
                        name: 'Germania',
                        regions: {
                            bavaria: { name: 'Baviera', bounds: { minLon: 8.5, maxLon: 13.5, minLat: 47.0, maxLat: 50.5 } },
                            blackforest: { name: 'Foresta Nera', bounds: { minLon: 7.5, maxLon: 9.5, minLat: 47.5, maxLat: 49.0 } }
                        },
                        bounds: { minLon: 5.0, maxLon: 15.0, minLat: 47.0, maxLat: 55.0 }
                    },
                    spain: {
                        name: 'Spagna',
                        regions: {
                            pyrenees_es: { name: 'Pirenei Spagnoli', bounds: { minLon: -0.5, maxLon: 3.0, minLat: 42.0, maxLat: 43.5 } },
                            sierra: { name: 'Sierra Nevada', bounds: { minLon: -4.0, maxLon: -2.0, minLat: 36.5, maxLat: 38.0 } }
                        },
                        bounds: { minLon: -9.5, maxLon: 3.5, minLat: 36.0, maxLat: 43.5 }
                    },
                    switzerland: {
                        name: 'Svizzera',
                        regions: {
                            alps_ch: { name: 'Alpi Svizzere', bounds: { minLon: 7.0, maxLon: 10.5, minLat: 45.5, maxLat: 47.5 } }
                        },
                        bounds: { minLon: 5.5, maxLon: 10.5, minLat: 45.5, maxLat: 47.5 }
                    },
                    austria: {
                        name: 'Austria',
                        regions: {
                            alps_at: { name: 'Alpi Austriache', bounds: { minLon: 9.5, maxLon: 14.0, minLat: 46.0, maxLat: 49.0 } }
                        },
                        bounds: { minLon: 9.5, maxLon: 17.0, minLat: 46.0, maxLat: 49.0 }
                    }
                },
                bounds: { minLon: -25.0, maxLon: 45.0, minLat: 34.0, maxLat: 72.0 }
            },
            asia: {
                name: 'Asia',
                countries: {
                    japan: {
                        name: 'Giappone',
                        regions: {},
                        bounds: { minLon: 129.0, maxLon: 146.0, minLat: 30.0, maxLat: 46.0 }
                    },
                    nepal: {
                        name: 'Nepal',
                        regions: {
                            himalaya: { name: 'Himalaya', bounds: { minLon: 80.0, maxLon: 88.0, minLat: 26.0, maxLat: 31.0 } }
                        },
                        bounds: { minLon: 80.0, maxLon: 88.0, minLat: 26.0, maxLat: 31.0 }
                    }
                },
                bounds: { minLon: 26.0, maxLon: 180.0, minLat: 5.0, maxLat: 77.0 }
            },
            americas: {
                name: 'Americhe',
                countries: {
                    usa: {
                        name: 'Stati Uniti',
                        regions: {
                            california: { name: 'California', bounds: { minLon: -124.5, maxLon: -114.0, minLat: 32.0, maxLat: 42.0 } },
                            rockies: { name: 'Montagne Rocciose', bounds: { minLon: -116.0, maxLon: -104.0, minLat: 37.0, maxLat: 49.0 } }
                        },
                        bounds: { minLon: -125.0, maxLon: -66.0, minLat: 24.0, maxLat: 50.0 }
                    },
                    canada: {
                        name: 'Canada',
                        regions: {},
                        bounds: { minLon: -141.0, maxLon: -52.0, minLat: 41.0, maxLat: 70.0 }
                    }
                },
                bounds: { minLon: -170.0, maxLon: -34.0, minLat: -56.0, maxLat: 83.0 }
            }
        },
        bounds: { minLon: -180, maxLon: 180, minLat: -90, maxLat: 90 }
    }
};

// Tile size estimates (average KB per tile at different zoom levels)
const TILE_SIZES = {
    1: 5, 2: 8, 3: 12, 4: 15, 5: 20, 6: 25, 7: 30, 8: 40,
    9: 50, 10: 60, 11: 80, 12: 100, 13: 120, 14: 150, 15: 180,
    16: 220, 17: 280, 18: 350
};

// Map type multipliers
const MAP_TYPE_MULTIPLIERS = {
    full: 1.0,
    roads: 0.4,
    contours: 0.5
};

// Tile URL templates per map type
const TILE_URLS = {
    full: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    roads: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    contours: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
};

// Current selection state
let currentSelection = {
    world: null,
    continent: null,
    country: null,
    region: null,
    bounds: null,
    label: ''
};

let downloadController = null;
let isDownloading = false;

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initOfflinePageTheme();
    initOfflineMapsPage();
    loadOfflineModePreference();
    loadDownloadedMaps();
});

function initOfflineMapsPage() {
    document.getElementById('menu-back').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    document.getElementById('world-select').addEventListener('change', handleWorldSelect);
    document.getElementById('continent-select').addEventListener('change', handleContinentSelect);
    document.getElementById('country-select').addEventListener('change', handleCountrySelect);
    document.getElementById('region-select').addEventListener('change', handleRegionSelect);

    document.getElementById('min-zoom-select').addEventListener('change', updateSizeEstimates);
    document.getElementById('max-zoom-select').addEventListener('change', updateSizeEstimates);

    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', handleDownload);
    });

    document.getElementById('cancel-download-btn').addEventListener('click', cancelDownload);
    document.getElementById('clear-all-maps').addEventListener('click', clearAllMaps);

    document.getElementById('offline-mode-toggle').addEventListener('change', (e) => {
        const offline = e.target.checked;
        localStorage.setItem('offlineMode', offline ? 'true' : 'false');
        if ('BroadcastChannel' in window) {
            const ch = new BroadcastChannel('route-planner-map-mode');
            ch.postMessage({ type: 'map-mode', mode: offline ? 'offline' : 'online' });
        }
        showToast(offline ? 'Modalità offline attivata' : 'Modalità online attivata', 'success');
    });
}

function loadOfflineModePreference() {
    const saved = localStorage.getItem('offlineMode');
    const toggle = document.getElementById('offline-mode-toggle');
    if (saved !== null && toggle) {
        toggle.checked = saved === 'true';
    }
}

function getSelectionLabel() {
    const parts = [];
    if (currentSelection.region) {
        const continentData = REGION_DATA.world.continents[currentSelection.continent];
        const countryData = continentData.countries[currentSelection.country];
        parts.push(countryData.regions[currentSelection.region].name);
        parts.push(countryData.name);
    } else if (currentSelection.country) {
        const continentData = REGION_DATA.world.continents[currentSelection.continent];
        parts.push(continentData.countries[currentSelection.country].name);
    } else if (currentSelection.continent) {
        parts.push(REGION_DATA.world.continents[currentSelection.continent].name);
    } else if (currentSelection.world) {
        parts.push('Mondo Intero');
    }
    return parts.join(' · ');
}

function handleWorldSelect(e) {
    const value = e.target.value;
    if (value === 'world') {
        currentSelection = { world: 'world', continent: null, country: null, region: null, bounds: REGION_DATA.world.bounds, label: 'Mondo Intero' };
        showMapTypes();
    } else {
        resetSelection();
    }
}

function handleContinentSelect(e) {
    const value = e.target.value;
    if (value) {
        currentSelection.continent = value;
        currentSelection.country = null;
        currentSelection.region = null;
        currentSelection.bounds = REGION_DATA.world.continents[value].bounds;
        currentSelection.label = REGION_DATA.world.continents[value].name;

        const continentData = REGION_DATA.world.continents[value];
        const countrySelect = document.getElementById('country-select');
        countrySelect.innerHTML = '<option value="">Seleziona stato...</option>';

        Object.keys(continentData.countries).forEach(countryId => {
            const country = continentData.countries[countryId];
            countrySelect.innerHTML += `<option value="${countryId}">${country.name}</option>`;
        });

        document.getElementById('country-level').style.display = 'block';
        document.getElementById('region-level').style.display = 'none';
        document.getElementById('country-select').value = '';

        showMapTypes();
    }
}

function handleCountrySelect(e) {
    const value = e.target.value;
    if (value) {
        currentSelection.country = value;
        currentSelection.region = null;
        const continentData = REGION_DATA.world.continents[currentSelection.continent];
        const countryData = continentData.countries[value];
        currentSelection.bounds = countryData.bounds;
        currentSelection.label = countryData.name;

        const regionSelect = document.getElementById('region-select');
        regionSelect.innerHTML = '<option value="">Seleziona regione...</option>';

        if (Object.keys(countryData.regions).length > 0) {
            Object.keys(countryData.regions).forEach(regionId => {
                const region = countryData.regions[regionId];
                regionSelect.innerHTML += `<option value="${regionId}">${region.name}</option>`;
            });
            document.getElementById('region-level').style.display = 'block';
        } else {
            document.getElementById('region-level').style.display = 'none';
        }
        document.getElementById('region-select').value = '';

        showMapTypes();
    }
}

function handleRegionSelect(e) {
    const value = e.target.value;
    if (value) {
        currentSelection.region = value;
        const continentData = REGION_DATA.world.continents[currentSelection.continent];
        const countryData = continentData.countries[currentSelection.country];
        const regionData = countryData.regions[value];
        currentSelection.bounds = regionData.bounds;
        currentSelection.label = `${regionData.name} · ${countryData.name}`;

        showMapTypes();
    }
}

function showMapTypes() {
    document.getElementById('map-types-section').style.display = 'block';
    document.getElementById('zoom-controls').style.display = 'block';
    updateSizeEstimates();
}

function getSelectedZoomRange() {
    const minZoom = parseInt(document.getElementById('min-zoom-select').value);
    const maxZoom = parseInt(document.getElementById('max-zoom-select').value);
    if (minZoom > maxZoom) {
        return { minZoom: maxZoom, maxZoom: minZoom, swapped: true };
    }
    return { minZoom, maxZoom, swapped: false };
}

function countTiles(bounds, minZoom, maxZoom) {
    let count = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        const minX = lonToTile(bounds.minLon, z);
        const maxX = lonToTile(bounds.maxLon, z);
        const minY = latToTile(bounds.maxLat, z);
        const maxY = latToTile(bounds.minLat, z);
        count += (maxX - minX + 1) * (maxY - minY + 1);
    }
    return count;
}

function updateSizeEstimates() {
    const bounds = currentSelection.bounds;
    if (!bounds) return;

    const { minZoom, maxZoom, swapped } = getSelectedZoomRange();

    if (swapped) {
        document.getElementById('tile-count-info').innerHTML = '<span class="warn-text">⚠ Zoom minimo maggiore del massimo, valori invertiti</span>';
    } else {
        const totalTiles = countTiles(bounds, minZoom, maxZoom);
        document.getElementById('tile-count-info').innerHTML = `<span class="tile-count">${totalTiles.toLocaleString('it-IT')} tile totali · zoom ${minZoom}-${maxZoom}</span>`;
    }

    ['full', 'roads', 'contours'].forEach(type => {
        const size = calculateDownloadSize(bounds, minZoom, maxZoom, type);
        document.getElementById(`size-${type}`).textContent = formatSize(size);
    });
}

function calculateDownloadSize(bounds, minZoom, maxZoom, mapType) {
    let totalSize = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        const minX = lonToTile(bounds.minLon, z);
        const maxX = lonToTile(bounds.maxLon, z);
        const minY = latToTile(bounds.maxLat, z);
        const maxY = latToTile(bounds.minLat, z);
        const tileCount = (maxX - minX + 1) * (maxY - minY + 1);
        const tileSize = TILE_SIZES[z] || 100;
        totalSize += tileCount * tileSize;
    }
    return totalSize * MAP_TYPE_MULTIPLIERS[mapType];
}

function formatSize(bytes) {
    const mb = bytes / 1024 / 1024;
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

function formatTime(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

async function handleDownload(e) {
    const mapType = e.target.dataset.type;
    const bounds = currentSelection.bounds;

    if (!bounds) {
        showToast('Seleziona prima una regione', 'warn');
        return;
    }

    if (isDownloading) {
        showToast('Download già in corso', 'warn');
        return;
    }

    const { minZoom, maxZoom } = getSelectedZoomRange();
    const totalTiles = countTiles(bounds, minZoom, maxZoom);

    if (totalTiles > 50000) {
        if (!confirm(`Stai per scaricare ${totalTiles.toLocaleString('it-IT')} tile. Questo potrebbe richiedere molto tempo e spazio. Continuare?`)) {
            return;
        }
    }

    isDownloading = true;
    downloadController = new AbortController();

    document.getElementById('map-types-section').style.display = 'none';
    document.getElementById('zoom-controls').style.display = 'none';
    document.getElementById('download-progress-section').style.display = 'block';
    document.getElementById('download-details').textContent = `${currentSelection.label} · tipo: ${mapType} · zoom ${minZoom}-${maxZoom}`;

    const startTime = Date.now();
    let lastUpdate = startTime;
    let lastDownloaded = 0;

    downloadRegionTilesConcurrent(bounds, minZoom, maxZoom, mapType, downloadController.signal, (downloaded, total, failed) => {
        const progress = (downloaded / total) * 100;
        document.getElementById('download-progress-bar').value = progress;
        document.getElementById('download-progress-text').textContent = `${downloaded.toLocaleString('it-IT')} / ${total.toLocaleString('it-IT')} tile`;

        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        if (elapsed > 0 && now - lastUpdate > 500) {
            const speed = (downloaded / elapsed).toFixed(1);
            const remaining = (total - downloaded) / (downloaded / elapsed);
            document.getElementById('download-speed').textContent = `${speed} tile/s`;
            document.getElementById('download-eta').textContent = `ETA: ${formatTime(remaining)}`;
            lastUpdate = now;
            lastDownloaded = downloaded;
        }

        if (failed > 0) {
            document.getElementById('download-details').textContent = `${currentSelection.label} · tipo: ${mapType} · ${failed} tile fallite`;
        }
    }).then(result => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        showToast(`Download completato! ${result.downloaded.toLocaleString('it-IT')} tile in ${elapsed}s${result.failed > 0 ? ` (${result.failed} fallite)` : ''}`, 'success');
        document.getElementById('download-progress-section').style.display = 'none';
        document.getElementById('map-types-section').style.display = 'block';
        document.getElementById('zoom-controls').style.display = 'block';
        isDownloading = false;
        loadDownloadedMaps();
    }).catch(error => {
        if (error.name === 'AbortError' || error.message === 'Download aborted') {
            showToast('Download annullato', 'info');
        } else {
            console.error('Download error:', error);
            showToast('Errore durante il download: ' + error.message, 'error');
        }
        document.getElementById('download-progress-section').style.display = 'none';
        document.getElementById('map-types-section').style.display = 'block';
        document.getElementById('zoom-controls').style.display = 'block';
        isDownloading = false;
    });
}

// Concurrent tile download with configurable parallelism
async function downloadRegionTilesConcurrent(bounds, minZoom, maxZoom, mapType, signal, onProgress) {
    const tiles = [];
    for (let z = minZoom; z <= maxZoom; z++) {
        const minX = lonToTile(bounds.minLon, z);
        const maxX = lonToTile(bounds.maxLon, z);
        const minY = latToTile(bounds.maxLat, z);
        const maxY = latToTile(bounds.minLat, z);
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                if (signal && signal.aborted) throw new Error('Download aborted');
                tiles.push({ z, x, y });
            }
        }
    }

    const total = tiles.length;
    let downloaded = 0;
    let failed = 0;
    const concurrency = 8;
    const urlTemplate = TILE_URLS[mapType] || TILE_URLS.full;

    // Check which tiles are already cached
    const db = await initOfflineMapsDB();
    const cachedKeys = new Set();
    try {
        const allKeys = await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
        allKeys.forEach(k => cachedKeys.add(k));
    } catch (e) {
        // If we can't get keys, just proceed without cache check
    }

    const queue = tiles.slice();
    let activeCount = 0;

    async function downloadOne(tile) {
        if (signal && signal.aborted) throw new Error('Download aborted');

        const url = urlTemplate
            .replace('{z}', tile.z)
            .replace('{x}', tile.x)
            .replace('{y}', tile.y);

        if (cachedKeys.has(url)) {
            downloaded++;
            if (typeof onProgress === 'function') onProgress(downloaded, total, failed);
            return;
        }

        try {
            const response = await fetch(url, { signal });
            if (response.ok) {
                const blob = await response.blob();
                await saveTile(url, blob);
            } else {
                failed++;
            }
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            failed++;
        }

        downloaded++;
        if (typeof onProgress === 'function') onProgress(downloaded, total, failed);
    }

    async function worker() {
        while (queue.length > 0) {
            if (signal && signal.aborted) throw new Error('Download aborted');
            const tile = queue.shift();
            if (tile) await downloadOne(tile);
        }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    return { downloaded, total, totalTiles: total, failed };
}

function cancelDownload() {
    if (downloadController) {
        downloadController.abort();
    }
}

function resetSelection() {
    currentSelection = { world: null, continent: null, country: null, region: null, bounds: null, label: '' };

    document.getElementById('continent-level').style.display = 'none';
    document.getElementById('country-level').style.display = 'none';
    document.getElementById('region-level').style.display = 'none';
    document.getElementById('map-types-section').style.display = 'none';
    document.getElementById('zoom-controls').style.display = 'none';

    document.getElementById('continent-select').value = '';
    document.getElementById('country-select').value = '';
    document.getElementById('region-select').value = '';
}

async function loadDownloadedMaps() {
    try {
        await initOfflineMapsDB();
        const count = await getStorageUsage();

        const usageEl = document.getElementById('storage-usage');
        if (usageEl) {
            if (count > 0) {
                usageEl.textContent = `${count.toLocaleString('it-IT')} tile`;
            } else {
                usageEl.textContent = 'Nessun tile';
            }
        }

        const list = document.getElementById('downloaded-maps-list');
        if (count > 0) {
            list.innerHTML = `<p class="downloaded-info">✓ ${count.toLocaleString('it-IT')} tile memorizzate nel browser (IndexedDB)</p>`;
        } else {
            list.innerHTML = '<p class="empty-state">Nessuna mappa scaricata. Seleziona un\'area e scarica le tile per usarle offline.</p>';
        }
    } catch (error) {
        console.error('Error loading downloaded maps:', error);
    }
}

async function clearAllMaps() {
    if (confirm('Sei sicuro di voler cancellare tutte le mappe scaricate? Questa operazione non può essere annullata.')) {
        try {
            await clearOfflineTiles();
            loadDownloadedMaps();
            showToast('Mappe cancellate con successo', 'success');
        } catch (error) {
            console.error('Error clearing maps:', error);
            showToast('Errore durante la cancellazione', 'error');
        }
    }
}

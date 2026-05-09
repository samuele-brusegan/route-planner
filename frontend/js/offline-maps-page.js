// Fallback showToast for standalone pages without ui.js
if (typeof showToast === 'undefined') {
    window.showToast = function(message) { console.log('[Toast]', message); };
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
                            piedmont: { name: 'Piemonte', bounds: { minLon: 7.0, maxLon: 9.5, minLat: 44.0, maxLat: 46.0 } }
                        },
                        bounds: { minLon: 6.5, maxLon: 18.5, minLat: 36.5, maxLat: 47.5 }
                    },
                    france: {
                        name: 'Francia',
                        regions: {
                            provence: { name: 'Provenza', bounds: { minLon: 4.5, maxLon: 7.0, minLat: 43.0, maxLat: 45.0 } },
                            alps: { name: 'Alpi Francesi', bounds: { minLon: 5.5, maxLon: 8.0, minLat: 44.0, maxLat: 46.0 } }
                        },
                        bounds: { minLon: -5.0, maxLon: 10.0, minLat: 41.0, maxLat: 51.0 }
                    },
                    germany: {
                        name: 'Germania',
                        regions: {
                            bavaria: { name: 'Baviera', bounds: { minLon: 8.5, maxLon: 13.5, minLat: 47.0, maxLat: 50.5 } }
                        },
                        bounds: { minLon: 5.0, maxLon: 15.0, minLat: 47.0, maxLat: 55.0 }
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
                            california: { name: 'California', bounds: { minLon: -124.5, maxLon: -114.0, minLat: 32.0, maxLat: 42.0 } }
                        },
                        bounds: { minLon: -125.0, maxLon: -66.0, minLat: 24.0, maxLat: 50.0 }
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
    1: 5,
    2: 8,
    3: 12,
    4: 15,
    5: 20,
    6: 25,
    7: 30,
    8: 40,
    9: 50,
    10: 60,
    11: 80,
    12: 100,
    13: 120,
    14: 150,
    15: 180,
    16: 220,
    17: 280,
    18: 350
};

// Map type multipliers
const MAP_TYPE_MULTIPLIERS = {
    full: 1.0,
    roads: 0.4,
    contours: 0.5
};

// Current selection state
let currentSelection = {
    world: null,
    continent: null,
    country: null,
    region: null,
    bounds: null
};

let downloadController = null;

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initOfflineMapsPage();
    loadDownloadedMaps();
});

function initOfflineMapsPage() {
    // Back button
    document.getElementById('menu-back').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // World selector
    document.getElementById('world-select').addEventListener('change', handleWorldSelect);

    // Continent selector
    document.getElementById('continent-select').addEventListener('change', handleContinentSelect);

    // Country selector
    document.getElementById('country-select').addEventListener('change', handleCountrySelect);

    // Region selector
    document.getElementById('region-select').addEventListener('change', handleRegionSelect);

    // Download buttons
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', handleDownload);
    });

    // Cancel download
    document.getElementById('cancel-download-btn').addEventListener('click', cancelDownload);

    // Clear all maps
    document.getElementById('clear-all-maps').addEventListener('click', clearAllMaps);
}

function handleWorldSelect(e) {
    const value = e.target.value;
    if (value === 'world') {
        currentSelection.world = 'world';
        currentSelection.bounds = REGION_DATA.world.bounds;
        showMapTypes();
    } else {
        resetSelection();
    }
}

function handleContinentSelect(e) {
    const value = e.target.value;
    if (value) {
        currentSelection.continent = value;
        currentSelection.bounds = REGION_DATA.world.continents[value].bounds;
        
        // Show country selector
        const continentData = REGION_DATA.world.continents[value];
        const countrySelect = document.getElementById('country-select');
        countrySelect.innerHTML = '<option value="">Seleziona stato...</option>';
        
        Object.keys(continentData.countries).forEach(countryId => {
            const country = continentData.countries[countryId];
            countrySelect.innerHTML += `<option value="${countryId}">${country.name}</option>`;
        });
        
        document.getElementById('country-level').style.display = 'block';
        document.getElementById('region-level').style.display = 'none';
        
        showMapTypes();
    }
}

function handleCountrySelect(e) {
    const value = e.target.value;
    if (value) {
        currentSelection.country = value;
        const continentData = REGION_DATA.world.continents[currentSelection.continent];
        const countryData = continentData.countries[value];
        currentSelection.bounds = countryData.bounds;
        
        // Show region selector if regions exist
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
        
        showMapTypes();
    }
}

function showMapTypes() {
    document.getElementById('map-types-section').style.display = 'block';
    updateSizeEstimates();
}

function updateSizeEstimates() {
    const bounds = currentSelection.bounds;
    if (!bounds) return;

    const minZoom = 1;
    const maxZoom = 15;

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
    if (mb < 1024) {
        return `${mb.toFixed(1)} MB`;
    }
    return `${(mb / 1024).toFixed(1)} GB`;
}

function handleDownload(e) {
    const mapType = e.target.dataset.type;
    const bounds = currentSelection.bounds;
    
    if (!bounds) {
        showToast('Seleziona prima una regione', 'warn');
        return;
    }

    downloadController = new AbortController();
    
    document.getElementById('map-types-section').style.display = 'none';
    document.getElementById('download-progress-section').style.display = 'block';
    
    const minZoom = 1;
    const maxZoom = mapType === 'full' ? 15 : 12;
    
    downloadRegionTiles(bounds, minZoom, maxZoom, mapType, downloadController.signal, (downloaded, total) => {
        const progress = (downloaded / total) * 100;
        document.getElementById('download-progress-bar').value = progress;
        document.getElementById('download-progress-text').textContent = `${downloaded} / ${total} tile`;
    }).then(result => {
        showToast(`Download completato! ${result.downloaded} tile scaricate su ${result.totalTiles}`, 'success');
        document.getElementById('download-progress-section').style.display = 'none';
        document.getElementById('map-types-section').style.display = 'block';
        loadDownloadedMaps();
    }).catch(error => {
        if (error.name === 'AbortError') {
            showToast('Download annullato', 'info');
        } else {
            console.error('Download error:', error);
            showToast('Errore durante il download: ' + error.message, 'error');
        }
        document.getElementById('download-progress-section').style.display = 'none';
        document.getElementById('map-types-section').style.display = 'block';
    });
}

function cancelDownload() {
    if (downloadController) {
        downloadController.abort();
    }
}

function resetSelection() {
    currentSelection = {
        world: null,
        continent: null,
        country: null,
        region: null,
        bounds: null
    };
    
    document.getElementById('continent-level').style.display = 'none';
    document.getElementById('country-level').style.display = 'none';
    document.getElementById('region-level').style.display = 'none';
    document.getElementById('map-types-section').style.display = 'none';
    
    document.getElementById('continent-select').value = '';
    document.getElementById('country-select').value = '';
    document.getElementById('region-select').value = '';
}

async function loadDownloadedMaps() {
    try {
        await initOfflineMapsDB();
        const count = await getStorageUsage();
        
        const list = document.getElementById('downloaded-maps-list');
        if (count > 0) {
            list.innerHTML = `<p>${count} tile scaricate</p>`;
        } else {
            list.innerHTML = '<p>Nessuna mappa scaricata</p>';
        }
    } catch (error) {
        console.error('Error loading downloaded maps:', error);
    }
}

async function clearAllMaps() {
    if (confirm('Sei sicuro di voler cancellare tutte le mappe scaricate?')) {
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

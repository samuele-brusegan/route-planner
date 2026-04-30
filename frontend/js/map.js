// Map initialization and management
let map;
let markerLayer;
let routeLayer;
let currentMarker = null;
let onlineTileLayer;
let offlineTileLayer;
let currentMapMode = 'online'; // 'online' or 'offline'

// Initialize OpenLayers map
async function initMap() {
    // Initialize offline maps DB
    await initOfflineMapsDB();
    
    // Cache default world map on first load
    await cacheDefaultWorldMap();

    // Online tile source (OSM Topo)
    const osmTopoSource = new ol.source.XYZ({
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attributions: '© OpenStreetMap contributors, SRTM | © OpenTopoMap'
    });

    onlineTileLayer = new ol.layer.Tile({
        source: osmTopoSource
    });

    // Offline tile source (from IndexedDB)
    const offlineSource = new OfflineTileSource();
    offlineTileLayer = new ol.layer.Tile({
        source: offlineSource
    });

    // Create map
    map = new ol.Map({
        target: 'map',
        layers: [onlineTileLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([10.0, 45.0]), // Center on Italy
            zoom: 6
        })
    });

    // Create vector layers
    markerLayer = new ol.layer.Vector({
        source: new ol.source.Vector()
    });
    map.addLayer(markerLayer);

    routeLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#4a90a4',
                width: 4
            })
        })
    });
    map.addLayer(routeLayer);

    // Add click handler for placing markers
    map.on('click', handleMapClick);
    
    // Check for saved offline mode preference
    const savedMode = localStorage.getItem('offlineMode');
    if (savedMode === 'true') {
        setMapMode('offline');
    }
}

// Set map mode (online/offline)
function setMapMode(mode) {
    if (mode === currentMapMode) return;
    
    currentMapMode = mode;
    
    if (mode === 'offline') {
        map.removeLayer(onlineTileLayer);
        map.addLayer(offlineTileLayer);
    } else {
        map.removeLayer(offlineTileLayer);
        map.addLayer(onlineTileLayer);
    }
    
    localStorage.setItem('offlineMode', mode === 'offline' ? 'true' : 'false');
}

// Get current map mode
function getMapMode() {
    return currentMapMode;
}

// Cache default world map (low zoom levels)
async function cacheDefaultWorldMap() {
    const worldBounds = { minLon: -180, maxLon: 180, minLat: -90, maxLat: 90 };
    const minZoom = 1;
    const maxZoom = 4;
    
    // Check if already cached
    const cached = await getTile('https://a.tile.opentopomap.org/1/0/0.png');
    if (cached) {
        return; // Already cached
    }
    
    console.log('Caching default world map...');
    
    try {
        for (let z = minZoom; z <= maxZoom; z++) {
            const minX = lonToTile(worldBounds.minLon, z);
            const maxX = lonToTile(worldBounds.maxLon, z);
            const minY = latToTile(worldBounds.maxLat, z);
            const maxY = latToTile(worldBounds.minLat, z);
            
            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    const url = `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`;
                    try {
                        const response = await fetch(url);
                        if (response.ok) {
                            const blob = await response.blob();
                            await saveTile(url, blob);
                        }
                    } catch (error) {
                        // Skip failed tiles
                    }
                }
            }
        }
        console.log('Default world map cached');
    } catch (error) {
        console.error('Error caching world map:', error);
    }
}

// Handle map click to add marker
function handleMapClick(event) {
    const coords = ol.proj.toLonLat(event.coordinate);
    
    // Show modal to select marker type
    showAddMarkerModal(coords);
}

// Show modal to add marker
function showAddMarkerModal(coords) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Aggiungi Punto</h3>
            <select id="marker-type-select">
                ${AppState.markerTypes.map(type => 
                    `<option value="${type.id}">${type.icon} ${type.name}</option>`
                ).join('')}
            </select>
            <input type="text" id="marker-name-input" placeholder="Nome del punto (opzionale)">
            <div class="modal-actions">
                <button class="btn secondary" id="cancel-marker">Annulla</button>
                <button class="btn primary" id="confirm-marker">Aggiungi</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Handle cancel
    document.getElementById('cancel-marker').addEventListener('click', () => {
        modal.remove();
    });

    // Handle confirm
    document.getElementById('confirm-marker').addEventListener('click', () => {
        const typeId = document.getElementById('marker-type-select').value;
        const name = document.getElementById('marker-name-input').value || `Punto ${AppState.markers.length + 1}`;
        
        const markerType = AppState.markerTypes.find(t => t.id === typeId);
        
        const marker = {
            id: Date.now().toString(),
            name: name,
            type: typeId,
            lat: coords[1],
            lon: coords[0],
            order: AppState.markers.length
        };
        
        AppState.markers.push(marker);
        addMarkerToMap(marker);
        saveToLocalStorage();
        updateUI();
        
        // Calculate route if we have at least 2 markers
        if (AppState.markers.length >= 2) {
            calculateRoute();
        }
        
        modal.remove();
    });
}

// Add marker to map
function addMarkerToMap(markerData) {
    const markerType = AppState.markerTypes.find(t => t.id === markerData.type);
    
    const feature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([markerData.lon, markerData.lat])),
        markerData: markerData
    });

    const style = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 10,
            fill: new ol.style.Fill({
                color: markerType.color
            }),
            stroke: new ol.style.Stroke({
                color: '#fff',
                width: 2
            })
        }),
        text: new ol.style.Text({
            text: markerType.icon,
            font: '16px Arial',
            offsetY: -8
        })
    });

    feature.setStyle(style);
    markerLayer.getSource().addFeature(feature);

    // Make marker draggable
    const dragInteraction = new ol.interaction.Modify({
        source: markerLayer.getSource()
    });
    map.addInteraction(dragInteraction);

    dragInteraction.on('modifyend', (event) => {
        const feature = event.features.getArray()[0];
        const coords = ol.proj.toLonLat(feature.getGeometry().getCoordinates());
        const markerData = feature.get('markerData');
        
        // Update marker coordinates
        const marker = AppState.markers.find(m => m.id === markerData.id);
        if (marker) {
            marker.lat = coords[1];
            marker.lon = coords[0];
            saveToLocalStorage();
            
            // Recalculate route
            if (AppState.markers.length >= 2) {
                calculateRoute();
            }
        }
    });
}

// Clear all markers from map
function clearMapMarkers() {
    markerLayer.getSource().clear();
}

// Display route on map
function displayRoute(routeData) {
    routeLayer.getSource().clear();
    
    if (!routeData || !routeData.coordinates) return;
    
    const coordinates = routeData.coordinates.map(coord => 
        ol.proj.fromLonLat([coord[0], coord[1]])
    );
    
    const feature = new ol.Feature({
        geometry: new ol.geom.LineString(coordinates)
    });
    
    routeLayer.getSource().addFeature(feature);
    
    // Fit map to route
    const extent = routeLayer.getSource().getExtent();
    map.getView().fit(extent, { padding: [50, 50, 50, 50] });
}

// Clear route from map
function clearRoute() {
    routeLayer.getSource().clear();
}

// Export map as image
async function exportMapAsImage(format = 'png') {
    const mapCanvas = document.querySelector('#map canvas');
    if (!mapCanvas) return null;
    
    return mapCanvas.toDataURL(`image/${format}`);
}

// Map initialization and management
let map;
let markerLayer;
let routeLayer;
let routingDebugLayer;
let osmGraphLayer;
let currentMarker = null;
let onlineTileLayer;
let offlineTileLayer;
let trailOverlayLayer;
let contourOverlayLayer;
let currentMapMode = 'online'; // 'online' or 'offline'
let currentBaseMapId = 'opentopo';
let trailsOverlayVisible = true;
let contoursOverlayVisible = false;
let mapModeChannel = null;

const BASE_MAPS = {
    opentopo: {
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attributions: '© OpenStreetMap contributors, SRTM | © OpenTopoMap',
        crossOrigin: 'anonymous'
    },
    osm: {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attributions: '© OpenStreetMap contributors',
        crossOrigin: 'anonymous'
    },
    cyclosm: {
        url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        attributions: '© OpenStreetMap contributors | CyclOSM',
        crossOrigin: 'anonymous'
    },
    tracestrack: {
        url: 'https://tile.tracestrack.com/topo_it/{z}/{x}/{y}.png?key={key}',
        attributions: '© Tracestrack | © OpenStreetMap contributors | SRTM, GEBCO, NASADEM',
        crossOrigin: 'anonymous'
    }
};

// Initialize OpenLayers map
async function initMap() {
    // Initialize offline maps DB
    await initOfflineMapsDB();
    
    // Cache default world map on first load
    await cacheDefaultWorldMap();

    onlineTileLayer = new ol.layer.Tile({
        source: createBaseMapSource(getSavedBaseMapId())
    });
    currentBaseMapId = getSavedBaseMapId();

    // Offline tile source (from IndexedDB)
    const offlineSource = new OfflineTileSource();
    offlineTileLayer = new ol.layer.Tile({
        source: offlineSource
    });

    trailsOverlayVisible = localStorage.getItem('trailsOverlay') !== 'false';
    trailOverlayLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
            attributions: '© OpenStreetMap contributors | © waymarkedtrails.org',
            crossOrigin: 'anonymous'
        }),
        opacity: 0.9,
        visible: trailsOverlayVisible
    });

    contoursOverlayVisible = localStorage.getItem('contoursOverlay') === 'true';
    contourOverlayLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://tile.osm.ch/contours/{z}/{x}/{y}.png',
            attributions: 'ASTER GDEM, EarthEnv-DEM90, CDEM | © Swiss OpenStreetMap Association',
            crossOrigin: 'anonymous'
        }),
        opacity: 0.75,
        visible: contoursOverlayVisible
    });

    // Create map
    map = new ol.Map({
        target: 'map',
        layers: [onlineTileLayer, contourOverlayLayer, trailOverlayLayer],
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
        style: getRouteStyle()
    });
    map.addLayer(routeLayer);

    routingDebugLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        visible: AppState.showRoutingDebug,
        style: getRoutingDebugStyle
    });
    map.addLayer(routingDebugLayer);

    osmGraphLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        visible: AppState.showOsmGraph,
        style: getOsmGraphStyle
    });
    map.addLayer(osmGraphLayer);

    // Add click handler for placing markers
    map.on('click', handleMapClick);
    
    // Check for saved offline mode preference
    const savedMode = localStorage.getItem('offlineMode');
    if (savedMode === 'true') {
        setMapMode('offline');
    }

    if ('BroadcastChannel' in window) {
        mapModeChannel = new BroadcastChannel('route-planner-map-mode');
        mapModeChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'map-mode') {
                setMapMode(event.data.mode);
            }
        };
    }
}

// Set map mode (online/offline)
function setMapMode(mode) {
    if (mode === currentMapMode) return;
    
    currentMapMode = mode;
    
    if (mode === 'offline') {
        map.removeLayer(onlineTileLayer);
        map.getLayers().insertAt(0, offlineTileLayer);
    } else {
        map.removeLayer(offlineTileLayer);
        map.getLayers().insertAt(0, onlineTileLayer);
    }
    
    localStorage.setItem('offlineMode', mode === 'offline' ? 'true' : 'false');
    if (mapModeChannel) {
        mapModeChannel.postMessage({ type: 'map-mode', mode });
    }
}

// Get current map mode
function getMapMode() {
    return currentMapMode;
}

function getSavedBaseMapId() {
    const savedMapId = localStorage.getItem('baseMap');
    return BASE_MAPS[savedMapId] ? savedMapId : 'opentopo';
}

function createBaseMapSource(mapId) {
    const config = BASE_MAPS[BASE_MAPS[mapId] ? mapId : 'opentopo'];
    const tileUrl = config.url.replace('{key}', encodeURIComponent(localStorage.getItem('tracestrackKey') || ''));

    return new ol.source.XYZ({
        url: tileUrl,
        attributions: config.attributions,
        crossOrigin: config.crossOrigin || 'anonymous'
    });
}

function setBaseMap(mapId) {
    if (!BASE_MAPS[mapId]) return;
    if (mapId === 'tracestrack' && !localStorage.getItem('tracestrackKey')) {
        setTracestrackKey();
    }

    currentBaseMapId = mapId;
    localStorage.setItem('baseMap', mapId);
    onlineTileLayer.setSource(createBaseMapSource(mapId));
}

function setTracestrackKey() {
    const currentKey = localStorage.getItem('tracestrackKey') || '';
    const key = prompt('Chiave API Tracestrack', currentKey);
    if (key === null) return;

    localStorage.setItem('tracestrackKey', key.trim());
    if (currentBaseMapId === 'tracestrack') {
        onlineTileLayer.setSource(createBaseMapSource('tracestrack'));
    }
}

function toggleTrailOverlay() {
    return setTrailOverlayVisible(!trailsOverlayVisible);
}

function setTrailOverlayVisible(visible) {
    trailsOverlayVisible = Boolean(visible);
    localStorage.setItem('trailsOverlay', trailsOverlayVisible ? 'true' : 'false');
    trailOverlayLayer.setVisible(trailsOverlayVisible);
    return trailsOverlayVisible;
}

function getTrailOverlayVisible() {
    return trailsOverlayVisible;
}

function toggleContourOverlay() {
    return setContourOverlayVisible(!contoursOverlayVisible);
}

function setContourOverlayVisible(visible) {
    contoursOverlayVisible = Boolean(visible);
    localStorage.setItem('contoursOverlay', contoursOverlayVisible ? 'true' : 'false');
    contourOverlayLayer.setVisible(contoursOverlayVisible);
    return contoursOverlayVisible;
}

function getContourOverlayVisible() {
    return contoursOverlayVisible;
}

function getRouteStyle() {
    return new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: AppState.routeColor || '#4a90a4',
            width: 4
        })
    });
}

function applyRouteStyle() {
    if (routeLayer) {
        routeLayer.setStyle(getRouteStyle());
    }
}

function setRouteColor(color) {
    AppState.routeColor = color || '#4a90a4';
    applyRouteStyle();
    saveToLocalStorage();
}

function setRoutingDebugVisible(visible) {
    AppState.showRoutingDebug = Boolean(visible);
    if (routingDebugLayer) {
        routingDebugLayer.setVisible(AppState.showRoutingDebug);
    }
    updateRoutingDebugLayer(AppState.route);
    saveToLocalStorage();
}

function toggleRoutingDebug() {
    setRoutingDebugVisible(!AppState.showRoutingDebug);
    return AppState.showRoutingDebug;
}

function setOsmGraphVisible(visible) {
    AppState.showOsmGraph = Boolean(visible);
    if (osmGraphLayer) {
        osmGraphLayer.setVisible(AppState.showOsmGraph);
    }
    if (!AppState.showOsmGraph) {
        setOsmInspectorVisible(false);
        AppState.selectedOsmGraphId = null;
    }
    updateOsmGraphLayer();
    saveToLocalStorage();
}

function toggleOsmGraph() {
    setOsmGraphVisible(!AppState.showOsmGraph);
    return AppState.showOsmGraph;
}

async function updateOsmGraphLayer() {
    if (!osmGraphLayer) return;

    const source = osmGraphLayer.getSource();
    source.clear();
    AppState.selectedOsmGraphId = null;
    updateOsmInspectorPanel(null);

    if (!AppState.showOsmGraph || AppState.markers.length === 0) return;

    try {
        const response = await fetch(`${ROUTING_API_URL}/graph`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                locations: AppState.markers.map(marker => ({
                    lat: marker.lat,
                    lon: marker.lon
                })),
                routeCoordinates: sampleCoordinates(AppState.route?.coordinates || [], 80),
                diagnostics: AppState.route?.diagnostics || [],
                radius: 180
            })
        });

        if (!response.ok) {
            throw new Error('Errore nel caricamento grafo OSM');
        }

        const graph = await response.json();
        (graph.features || []).forEach(featureData => {
            if (!Array.isArray(featureData.coordinates) || featureData.coordinates.length < 2) return;

            const featureId = featureData.id !== undefined && featureData.id !== null
                ? String(featureData.id)
                : `graph-${source.getFeatures().length}`;

            const feature = new ol.Feature({
                geometry: new ol.geom.LineString(featureData.coordinates.map(coord => ol.proj.fromLonLat(coord))),
                graphTags: featureData.tags || {},
                graphId: featureId
            });
            feature.setId(featureId);
            source.addFeature(feature);
        });
    } catch (error) {
        console.error('OSM graph error:', error);
    }
}

function getOsmGraphFeatureAtPixel(pixel) {
    if (!osmGraphLayer || !pixel) return null;

    let foundFeature = null;
    map.forEachFeatureAtPixel(
        pixel,
        (feature, layer) => {
            if (layer === osmGraphLayer && feature.get('graphTags')) {
                foundFeature = feature;
                return true;
            }
            return false;
        },
        { hitTolerance: 8 }
    );

    return foundFeature;
}

function sampleCoordinates(coordinates, maxPoints) {
    if (!Array.isArray(coordinates) || coordinates.length <= maxPoints) {
        return coordinates;
    }

    const result = [];
    const step = (coordinates.length - 1) / (maxPoints - 1);
    for (let index = 0; index < maxPoints; index++) {
        result.push(coordinates[Math.round(index * step)]);
    }

    return result;
}

function updateRoutingDebugLayer(routeData) {
    if (!routingDebugLayer) return;

    const source = routingDebugLayer.getSource();
    source.clear();

    if (!AppState.showRoutingDebug || !routeData || !routeData.coordinates) return;

    const routeFeature = new ol.Feature({
        geometry: new ol.geom.LineString(routeData.coordinates.map(coord => ol.proj.fromLonLat(coord))),
        debugType: 'route'
    });
    source.addFeature(routeFeature);

    const step = Math.max(1, Math.floor(routeData.coordinates.length / 80));
    routeData.coordinates.forEach((coord, index) => {
        if (index % step !== 0 && index !== routeData.coordinates.length - 1) return;
        source.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat(coord)),
            debugType: 'route-point'
        }));
    });

    if (Array.isArray(routeData.snappedLocations)) {
        routeData.snappedLocations.forEach((snap, index) => {
            if (!Number.isFinite(snap.lon) || !Number.isFinite(snap.lat)) return;

            source.addFeature(new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([snap.lon, snap.lat])),
                debugType: 'snap'
            }));

            const marker = AppState.markers[index];
            if (marker) {
                source.addFeature(new ol.Feature({
                    geometry: new ol.geom.LineString([
                        ol.proj.fromLonLat([marker.lon, marker.lat]),
                        ol.proj.fromLonLat([snap.lon, snap.lat])
                    ]),
                    debugType: 'snap-line'
                }));
            }
        });
    }
}

function getRoutingDebugStyle(feature) {
    const debugType = feature.get('debugType');

    if (debugType === 'route-point') {
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 3,
                fill: new ol.style.Fill({ color: '#111827' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 1 })
            })
        });
    }

    if (debugType === 'snap') {
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#f59e0b' }),
                stroke: new ol.style.Stroke({ color: '#111827', width: 2 })
            })
        });
    }

    if (debugType === 'snap-line') {
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(245, 158, 11, 0.75)',
                width: 2,
                lineDash: [6, 6]
            })
        });
    }

    return new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: 'rgba(17, 24, 39, 0.45)',
            width: 7
        })
    });
}

function getOsmGraphStyle(feature) {
    const tags = feature.get('graphTags') || {};
    const highway = tags.highway || '';
    const routeRef = tags.ref || tags.name || '';
    const isSelected = String(feature.getId?.() || feature.get('graphId') || '') === String(AppState.selectedOsmGraphId || '');

    let color = '#64748b';
    let width = 2;
    let lineDash = undefined;

    if (['path', 'footway', 'steps', 'bridleway'].includes(highway)) {
        color = '#dc2626';
        width = 3;
        lineDash = [8, 5];
    } else if (highway === 'track') {
        color = '#ea580c';
        width = 3;
    } else if (['cycleway', 'pedestrian'].includes(highway)) {
        color = '#2563eb';
        width = 3;
    } else if (['service', 'unclassified', 'residential'].includes(highway)) {
        color = '#475569';
        width = 2;
    }

    if (isSelected) {
        color = '#f59e0b';
        width = Math.max(width + 2, 4);
        lineDash = undefined;
    }

    return new ol.style.Style({
        stroke: new ol.style.Stroke({
            color,
            width,
            lineDash
        }),
        text: routeRef ? new ol.style.Text({
            text: routeRef,
            font: '11px sans-serif',
            fill: new ol.style.Fill({ color }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
            placement: 'line'
        }) : undefined
    });
}

function openOsmInspector(feature) {
    if (!feature) return;

    AppState.selectedOsmGraphId = String(feature.getId?.() || feature.get('graphId') || '');
    setOsmInspectorVisible(true);
    updateOsmInspectorPanel(feature);
    if (osmGraphLayer) {
        osmGraphLayer.getSource().changed();
    }
}

function updateOsmInspectorPanel(featureOrId) {
    const panel = document.getElementById('osm-inspector-panel');
    const emptyState = document.getElementById('osm-inspector-empty');
    const content = document.getElementById('osm-inspector-content');
    if (!panel || !emptyState || !content) return;

    const feature = resolveOsmGraphFeature(featureOrId);
    if (!feature) {
        emptyState.classList.remove('hidden');
        content.classList.add('hidden');
        content.innerHTML = '';
        return;
    }

    const tags = feature.get('graphTags') || {};
    const analysis = analyzeOsmGraphFeature(tags, AppState.routingProfile);
    const geometry = feature.getGeometry();
    const lengthMeters = geometry && typeof geometry.getLength === 'function'
        ? Math.round(geometry.getLength())
        : null;
    const importantTags = buildOsmInspectorTagRows(tags);

    emptyState.classList.add('hidden');
    content.classList.remove('hidden');
    content.innerHTML = `
        <div class="osm-inspector-header">
            <div class="osm-inspector-title">
                ${escapeHtml(tags.name || tags.ref || 'Way senza nome')}
            </div>
            <div class="osm-inspector-subtitle">
                ${escapeHtml(tags.highway || 'highway sconosciuta')}
                ${lengthMeters !== null ? ` · ${lengthMeters} m` : ''}
            </div>
        </div>
        <div class="osm-inspector-section">
            <h4>Perché può non piacere al router</h4>
            ${analysis.reasons.length > 0
                ? `<ul>${analysis.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`
                : '<p>Nessun red flag evidente. Il router può comunque preferire un altro ramo per costo, connettività o candidate ranking.</p>'}
        </div>
        <div class="osm-inspector-section">
            <h4>Segnali utili</h4>
            <div class="osm-inspector-badges">
                ${analysis.badges.map(badge => `<span class="osm-badge">${escapeHtml(badge)}</span>`).join('')}
            </div>
        </div>
        <div class="osm-inspector-section">
            <h4>Tag principali</h4>
            <table class="osm-inspector-table">
                <tbody>
                    ${importantTags.map(row => `
                        <tr>
                            <th>${escapeHtml(row.key)}</th>
                            <td>${escapeHtml(row.value)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="osm-inspector-section">
            <h4>Raw tags</h4>
            <pre class="osm-inspector-raw">${escapeHtml(JSON.stringify(tags, null, 2))}</pre>
        </div>
    `;
}

function resolveOsmGraphFeature(featureOrId) {
    if (!osmGraphLayer) return null;

    if (featureOrId && typeof featureOrId.get === 'function') {
        return featureOrId;
    }

    const targetId = featureOrId !== undefined && featureOrId !== null
        ? String(featureOrId)
        : String(AppState.selectedOsmGraphId || '');

    if (!targetId) return null;

    return osmGraphLayer.getSource().getFeatures().find(feature =>
        String(feature.getId?.() || feature.get('graphId') || '') === targetId
    ) || null;
}

function analyzeOsmGraphFeature(tags, profile) {
    const reasons = [];
    const badges = [];
    const highway = normalizeTagValue(tags.highway);
    const access = normalizeTagValue(tags.access);
    const foot = normalizeTagValue(tags.foot);
    const bicycle = normalizeTagValue(tags.bicycle);
    const motorVehicle = normalizeTagValue(tags.motor_vehicle);
    const surface = normalizeTagValue(tags.surface);
    const smoothness = normalizeTagValue(tags.smoothness);
    const tracktype = normalizeTagValue(tags.tracktype);
    const oneway = normalizeTagValue(tags.oneway);
    const incline = normalizeTagValue(tags.incline);

    if (highway) badges.push(`highway=${highway}`);
    if (access) badges.push(`access=${access}`);
    if (surface) badges.push(`surface=${surface}`);
    if (smoothness) badges.push(`smoothness=${smoothness}`);
    if (tracktype) badges.push(`tracktype=${tracktype}`);

    if (matchesAny(access, ['no', 'private', 'agricultural', 'forestry'])) {
        reasons.push(`Accesso limitato: access=${access}.`);
    }

    if (profile === 'walking') {
        if (matchesAny(foot, ['no'])) {
            reasons.push(`Foot proibito o penalizzato: foot=${foot}.`);
        }

        if (matchesAny(highway, ['motorway', 'trunk'])) {
            reasons.push(`Tipo strada poco adatto ai pedoni: highway=${highway}.`);
        }

        if (highway === 'steps') {
            reasons.push('Tratto con scale: i pedoni lo possono usare, ma può risultare penalizzante o fragile nello snap.');
        }
    }

    if (profile === 'cycling') {
        if (matchesAny(bicycle, ['no'])) {
            reasons.push(`Bici vietata o sfavorita: bicycle=${bicycle}.`);
        }

        if (highway === 'steps') {
            reasons.push('Scale: quasi sempre pessime per la bici.');
        }

        if (matchesAny(highway, ['footway', 'pedestrian']) && bicycle !== 'designated') {
            reasons.push(`Tipologia pedonale non ideale per la bici: highway=${highway}.`);
        }

        if (oneway === 'yes') {
            reasons.push('Tratto one-way: può essere evitato o penalizzato per la bici.');
        }
    }

    if (matchesAny(surface, ['ground', 'dirt', 'mud', 'grass', 'sand', 'gravel', 'unpaved'])) {
        reasons.push(`Superficie poco buona: surface=${surface}.`);
    }

    if (matchesAny(smoothness, ['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'])) {
        reasons.push(`Smoothness sfavorevole: smoothness=${smoothness}.`);
    }

    if (matchesAny(tracktype, ['grade4', 'grade5'])) {
        reasons.push(`Track molto povero: tracktype=${tracktype}.`);
    }

    if (matchesAny(motorVehicle, ['no', 'private']) && profile === 'cycling') {
        reasons.push(`Restrizione veicolare che spesso coincide con accesso complicato: motor_vehicle=${motorVehicle}.`);
    }

    if (incline && /steep|very_steep|up|down/.test(incline)) {
        reasons.push(`Pendenza dichiarata: incline=${incline}.`);
    }

    if (!tags.name && !tags.ref) {
        badges.push('way anonima');
    }

    if (!reasons.length) {
        reasons.push('Nessun tag di esclusione evidente; il router può comunque preferire un altro ramo per minor costo o migliore connettività.');
    }

    return { reasons, badges };
}

function buildOsmInspectorTagRows(tags) {
    const keys = ['highway', 'name', 'ref', 'access', 'foot', 'bicycle', 'surface', 'smoothness', 'tracktype', 'oneway', 'motor_vehicle', 'layer'];
    const rows = [];

    keys.forEach(key => {
        if (tags[key] !== undefined && tags[key] !== null && String(tags[key]).trim() !== '') {
            rows.push({ key, value: String(tags[key]) });
        }
    });

    Object.keys(tags)
        .filter(key => !keys.includes(key))
        .slice(0, 12)
        .forEach(key => rows.push({ key, value: String(tags[key]) }));

    return rows;
}

function normalizeTagValue(value) {
    return String(value || '').trim().toLowerCase();
}

function matchesAny(value, options) {
    return options.includes(normalizeTagValue(value));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    const inspectedFeature = getOsmGraphFeatureAtPixel(event.pixel);
    if (inspectedFeature) {
        openOsmInspector(inspectedFeature);
        return;
    }

    const coords = ol.proj.toLonLat(event.coordinate);
    
    // Show modal to select marker type
    showAddMarkerModal(
        coords,
        AppState.pendingMarkerInsertIndex === null || AppState.pendingMarkerInsertIndex === undefined
            ? undefined
            : AppState.pendingMarkerInsertIndex
    );
}

// Show modal to add marker
function showAddMarkerModal(coords, insertIndex = AppState.markers.length) {
    const targetIndex = insertIndex === null || insertIndex === undefined
        ? AppState.markers.length
        : (Number.isInteger(Number(insertIndex))
            ? Math.max(0, Math.min(AppState.markers.length, Number(insertIndex)))
            : AppState.markers.length);
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
        AppState.pendingMarkerInsertIndex = null;
        modal.remove();
    });

    // Handle confirm
    document.getElementById('confirm-marker').addEventListener('click', () => {
        const typeId = document.getElementById('marker-type-select').value;
        const defaultNameIndex = targetIndex;
        const name = document.getElementById('marker-name-input').value || `Punto ${defaultNameIndex + 1}`;
        
        const marker = {
            id: Date.now().toString(),
            name: name,
            type: typeId,
            lat: coords[1],
            lon: coords[0],
            order: targetIndex
        };

        insertMarkerAtIndex(marker, targetIndex);
        AppState.pendingMarkerInsertIndex = null;
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

function insertMarkerAtIndex(marker, index) {
    const targetIndex = Math.max(0, Math.min(AppState.markers.length, index));
    AppState.markers.splice(targetIndex, 0, marker);
    AppState.markers.forEach((m, i) => {
        m.order = i;
    });
}

function moveMarker(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const marker = AppState.markers.splice(fromIndex, 1)[0];
    const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    AppState.markers.splice(Math.max(0, adjustedIndex), 0, marker);
    AppState.markers.forEach((m, i) => {
        m.order = i;
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
    updateRoutingDebugLayer(routeData);
    
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
    if (!map) return null;

    return new Promise((resolve, reject) => {
        map.once('rendercomplete', () => {
            try {
                const size = map.getSize();
                if (!size || size[0] === 0 || size[1] === 0) {
                    resolve(null);
                    return;
                }

                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = size[0];
                exportCanvas.height = size[1];
                const context = exportCanvas.getContext('2d');
                let skippedLayers = 0;

                document.querySelectorAll('#map .ol-layer canvas, #map canvas.ol-layer').forEach(canvas => {
                    if (canvas.width === 0 || canvas.height === 0 || canvas.style.display === 'none') {
                        return;
                    }

                    if (!isCanvasReadable(canvas)) {
                        skippedLayers += 1;
                        console.warn('Map export skipped a canvas layer because it is blocked by CORS.');
                        return;
                    }

                    const opacity = canvas.parentNode?.style?.opacity || canvas.style.opacity;
                    context.globalAlpha = opacity === '' ? 1 : Number(opacity);

                    const transform = canvas.style.transform;
                    if (transform && transform.startsWith('matrix(')) {
                        const matrix = transform
                            .match(/^matrix\((.+)\)$/)[1]
                            .split(',')
                            .map(Number);
                        context.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
                    } else {
                        context.setTransform(1, 0, 0, 1, 0, 0);
                    }

                    context.drawImage(canvas, 0, 0);
                });

                context.setTransform(1, 0, 0, 1, 0, 0);
                context.globalAlpha = 1;
                if (skippedLayers > 0 && typeof showToast === 'function') {
                    showToast(`${skippedLayers} layer mappa non esportato per restrizioni CORS.`, 'warning');
                }
                resolve(exportCanvas.toDataURL(`image/${format}`));
            } catch (error) {
                reject(error);
            }
        });

        map.renderSync();
    });
}

function isCanvasReadable(canvas) {
    try {
        canvas.getContext('2d').getImageData(0, 0, 1, 1);
        return true;
    } catch (error) {
        return false;
    }
}

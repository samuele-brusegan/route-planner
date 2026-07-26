// POI layer — fetch and display hiking POIs from Overpass + Wikipedia

const POI_API_URL = '/api/poi';
const TERRAIN_API_URL = '/api/terrain';

const POI_CATEGORIES = {
    refuge: { icon: '🏠', label: 'Rifugi', tags: ['tourism=alpine_hut', 'tourism=wilderness_hut'] },
    shelter: { icon: '⛺', label: 'Bivacchi', tags: ['amenity=shelter'] },
    water: { icon: '💧', label: 'Acqua', tags: ['amenity=drinking_water', 'natural=spring', 'man_made=water_well'] },
    peak: { icon: '🏔️', label: 'Vette', tags: ['natural=peak'] },
    danger: { icon: '⚠️', label: 'Pericoli', tags: ['natural=cliff', 'waterway=waterfall', 'natural=crevasse'] },
    parking: { icon: '🅿️', label: 'Parcheggi', tags: ['amenity=parking'] },
    emergency: { icon: '🏥', label: 'Emergenze', tags: ['amenity=hospital', 'emergency=phone'] }
};

let poiLayer = null;
let poiMarkers = [];
let activePoiCategories = new Set(Object.keys(POI_CATEGORIES));

function initPoiLayer() {
    if (typeof map === 'undefined' || !map) return;
    poiLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: poiStyleFunction
    });
    map.addLayer(poiLayer);
}

function poiStyleFunction(feature) {
    const category = feature.get('category');
    const cat = POI_CATEGORIES[category];
    if (!cat) return null;

    return new ol.style.Style({
        image: new ol.style.Icon({
            src: createPoiIcon(cat.icon),
            scale: 1
        }),
        text: new ol.style.Text({
            text: feature.get('name') || '',
            offsetY: -20,
            font: '12px sans-serif',
            fill: new ol.style.Fill({ color: '#000' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
        })
    });
}

function createPoiIcon(emoji) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 16, 16);
    return canvas.toDataURL();
}

// Fetch POIs using the unified terrain analysis endpoint
async function fetchPoisForRoute() {
    if (!AppState.route || !AppState.route.coordinates || AppState.route.coordinates.length < 2) return;

    const coords = AppState.route.coordinates;
    const bbox = calculateBBox(coords, 0.01);

    try {
        const response = await fetch(`${TERRAIN_API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bbox, routeCoordinates: coords })
        });

        if (!response.ok) throw new Error('Terrain analysis failed');

        const data = await response.json();
        displayPois(data.pois || []);

        // Also feed trail data to trail-analysis
        if (typeof analyzeTrailData === 'function') {
            const analysis = analyzeTrailData(data);
            if (typeof displayTrailAnalysis === 'function') {
                displayTrailAnalysis(analysis);
            }
        }
    } catch (error) {
        console.error('POI fetch error:', error);
    }
}

function displayPois(pois) {
    if (!poiLayer) initPoiLayer();
    if (!poiLayer) return;

    const source = poiLayer.getSource();
    source.clear();

    pois.forEach(poi => {
        const category = classifyPoi(poi.tags);
        if (!category || !activePoiCategories.has(category)) return;

        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([poi.lon, poi.lat])),
            category: category,
            name: poi.tags.name || POI_CATEGORIES[category].label
        });
        source.addFeature(feature);
    });
}

function classifyPoi(tags) {
    if (!tags) return null;
    for (const [cat, config] of Object.entries(POI_CATEGORIES)) {
        for (const tagFilter of config.tags) {
            const [key, value] = tagFilter.split('=');
            if (tags[key] === value) return cat;
        }
    }
    return null;
}

function togglePoiCategory(category) {
    if (activePoiCategories.has(category)) {
        activePoiCategories.delete(category);
    } else {
        activePoiCategories.add(category);
    }
    // Re-render with existing data
    if (AppState.lastPois) {
        displayPois(AppState.lastPois);
    }
}

function calculateBBox(coordinates, padding = 0.01) {
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    coordinates.forEach(coord => {
        minLat = Math.min(minLat, coord[1]);
        minLon = Math.min(minLon, coord[0]);
        maxLat = Math.max(maxLat, coord[1]);
        maxLon = Math.max(maxLon, coord[0]);
    });
    return [minLat - padding, minLon - padding, maxLat + padding, maxLon + padding];
}

// Fetch Wikipedia articles near route midpoint
async function fetchWikipediaNearby() {
    if (!AppState.route || !AppState.route.coordinates || AppState.route.coordinates.length === 0) return;

    const coords = AppState.route.coordinates;
    const midIdx = Math.floor(coords.length / 2);
    const lat = coords[midIdx][1];
    const lon = coords[midIdx][0];

    try {
        const response = await fetch(`${POI_API_URL}/wikipedia?lat=${lat}&lon=${lon}&radius=5000`);
        if (!response.ok) return;

        const { results } = await response.json();
        displayWikipediaResults(results);
    } catch (error) {
        console.error('Wikipedia fetch error:', error);
    }
}

function displayWikipediaResults(results) {
    if (!results || results.length === 0) return;
    // Store for later display in POI panel
    AppState.wikipediaResults = results;
}

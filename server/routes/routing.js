const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const router = express.Router();

const VALHALLA_REMOTE_URL = process.env.VALHALLA_REMOTE_URL || 'https://valhalla1.openstreetmap.de/route';
const VALHALLA_LOCAL_URL = process.env.VALHALLA_LOCAL_URL || 'http://valhalla:8002/route';
const VALHALLA_ADMIN_URL = process.env.VALHALLA_ADMIN_URL || 'http://valhalla:8003';
const MODE_FILE = process.env.ROUTING_MODE_FILE || '/data/routing-mode.json';
const DEFAULT_VALHALLA_API_URL = VALHALLA_LOCAL_URL;
const VALHALLA_API_URL = process.env.VALHALLA_API_URL || DEFAULT_VALHALLA_API_URL;
const VALHALLA_ONLINE_API_URL = process.env.VALHALLA_ONLINE_API_URL || VALHALLA_REMOTE_URL;
const VALHALLA_STATUS_URL = process.env.VALHALLA_STATUS_URL || buildStatusUrl(VALHALLA_API_URL);
const VALHALLA_TILE_DIR = process.env.VALHALLA_TILE_DIR || '/data/valhalla_tiles';
const VALHALLA_TILE_EXTRACT = process.env.VALHALLA_TILE_EXTRACT || '/data/valhalla_tiles.tar';

const SNAP_RADIUS_METERS = Number(process.env.SNAP_RADIUS_METERS || 18);
const RELAXED_SNAP_RADIUS_METERS = Number(process.env.RELAXED_SNAP_RADIUS_METERS || 55);
const MAX_HIKING_DIFFICULTY = clampNumber(process.env.MAX_HIKING_DIFFICULTY, 0, 6, 6);
const GRAPHHOPPER_API_URL = process.env.GRAPHHOPPER_API_URL || 'https://graphhopper.com/api/1/route';
const GRAPHHOPPER_API_KEY = process.env.GRAPHHOPPER_API_KEY || '';

// Initial mode: env override → state file → 'remote'
function readModeFromFile() {
    try {
        const raw = fsSync.readFileSync(MODE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.mode === 'local' || parsed.mode === 'remote')) {
            return parsed.mode;
        }
    } catch (_) {}
    return null;
}

function writeModeToFile(mode) {
    try {
        fsSync.mkdirSync(path.dirname(MODE_FILE), { recursive: true });
        fsSync.writeFileSync(MODE_FILE, JSON.stringify({ mode, updatedAt: Date.now() }, null, 2));
    } catch (e) {
        console.error('Failed to persist routing mode:', e.message);
    }
}

let currentMode = (() => {
    if (process.env.USE_LOCAL_VALHALLA === 'true') return 'local';
    if (process.env.USE_LOCAL_VALHALLA === 'false') return readModeFromFile() || 'remote';
    return readModeFromFile() || 'remote';
})();

function getValhallaApiUrl() {
    return currentMode === 'local' ? VALHALLA_LOCAL_URL : VALHALLA_REMOTE_URL;
}

function isLocalMode() {
    return currentMode === 'local';
}

router.use(express.json({ limit: '1mb' }));

router.post('/route', async (req, res) => {
    try {
        const {
            locations,
            engine = 'valhalla',
            profile = 'walking',
            valhalla_source = 'local',
            directions_options = {}
        } = req.body;

        if (!locations || locations.length < 2) {
            return res.status(400).json({ error: 'At least 2 locations required' });
        }

        const route = await routeWithEngine(engine, locations, profile, directions_options, valhalla_source);
        res.json(route);
    } catch (error) {
        console.error('Routing error:', error);
        res.status(error.statusCode || 500).json({
            error: error.publicMessage || error.message || 'Routing failed',
            code: error.code || 'ROUTING_FAILED',
            details: error.details || null
        });
    }
});

router.get('/status', async (req, res) => {
    try {
        const useLocal = isLocalMode();
        const valhalla = useLocal ? await getLocalValhallaStatus() : { reachable: true, tilesReady: true };

        res.json({
            service: 'routing',
            engine: 'valhalla',
            profile: useLocal ? 'local' : 'online',
            mode: currentMode,
            valhallaSources: {
                local: {
                    routeUrl: VALHALLA_API_URL,
                    statusUrl: VALHALLA_STATUS_URL
                },
                online: {
                    routeUrl: VALHALLA_ONLINE_API_URL
                }
            },
            valhalla,
            backend: useLocal ? 'local-valhalla' : 'online-valhalla',
            apiUrl: getValhallaApiUrl()
        });
    } catch (error) {
        console.error('Routing status error:', error);
        res.status(503).json({
            service: 'routing',
            engine: 'valhalla',
            profile: 'error',
            error: error.message
        });
    }
});

// === Mode management ===
router.get('/mode', (req, res) => {
    res.json({ mode: currentMode });
});

router.post('/mode', async (req, res) => {
    const requested = req.body && req.body.mode;
    if (requested !== 'local' && requested !== 'remote') {
        return res.status(400).json({ error: "mode must be 'local' or 'remote'" });
    }
    if (requested === 'local') {
        try {
            const status = await adminFetch('/tiles/status');
            if (!status || !status.hasLocalTiles) {
                return res.status(409).json({
                    error: 'Tile locali non disponibili. Scaricale prima di passare alla modalità locale.',
                    code: 'NO_LOCAL_TILES'
                });
            }
        } catch (e) {
            return res.status(503).json({ error: 'Impossibile contattare admin Valhalla: ' + e.message });
        }
    }
    currentMode = requested;
    writeModeToFile(currentMode);
    res.json({ mode: currentMode });
});

// === Tile admin proxy ===
async function adminFetch(path, options = {}) {
    const url = VALHALLA_ADMIN_URL.replace(/\/$/, '') + path;
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs || 8000)
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
    if (!response.ok) {
        const err = new Error(data.error || `Admin responded with ${response.status}`);
        err.statusCode = response.status;
        err.details = data;
        throw err;
    }
    return data;
}

router.get('/tiles/status', async (req, res) => {
    try {
        const data = await adminFetch('/tiles/status');
        res.json(data);
    } catch (e) {
        res.status(e.statusCode || 503).json({ error: e.message });
    }
});

router.get('/tiles/regions', async (req, res) => {
    try {
        const data = await adminFetch('/tiles/regions');
        res.json(data);
    } catch (e) {
        res.status(e.statusCode || 503).json({ error: e.message });
    }
});

router.post('/tiles/build', async (req, res) => {
    try {
        const data = await adminFetch('/tiles/build', { method: 'POST', body: { region: req.body && req.body.region } });
        res.status(202).json(data);
    } catch (e) {
        res.status(e.statusCode || 503).json({ error: e.message, details: e.details });
    }
});

router.get('/tiles/jobs/:id', async (req, res) => {
    try {
        const data = await adminFetch('/tiles/jobs/' + encodeURIComponent(req.params.id));
        res.json(data);
    } catch (e) {
        res.status(e.statusCode || 503).json({ error: e.message });
    }
});

router.post('/graph', async (req, res) => {
    try {
        const {
            locations = [],
            routeCoordinates = [],
            diagnostics = [],
            radius = 180
        } = req.body;

        const samplePoints = buildGraphSamplePoints(locations, routeCoordinates, diagnostics);
        if (samplePoints.length === 0) {
            return res.json({ features: [] });
        }

        const query = buildOverpassGraphQuery(samplePoints, Math.min(Math.max(Number(radius) || 180, 40), 500));
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'RoutePlanner/1.0'
            },
            body: new URLSearchParams({ data: query })
        });

        if (!response.ok) {
            throw new Error(`Overpass responded with ${response.status}`);
        }

        const data = await response.json();
        res.json({ features: normalizeOverpassWays(data) });
    } catch (error) {
        console.error('OSM graph error:', error);
        res.status(500).json({ error: 'Failed to load OSM graph' });
    }
});

// === Health check ===
router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'routing' });
});

// === Helper functions ===

function buildGraphSamplePoints(locations, routeCoordinates, diagnostics) {
    const points = [];

    locations.forEach(location => {
        if (isValidCoordinate(location.lon, location.lat)) {
            points.push({ lon: Number(location.lon), lat: Number(location.lat) });
        }
    });

    const suspiciousSegments = (diagnostics || []).filter(item => item.suspicious);
    suspiciousSegments.forEach(item => {
        const startIndex = Math.max(0, Number(item.from) - 1);
        const endIndex = Math.max(0, Number(item.to) - 1);
        [locations[startIndex], locations[endIndex]].forEach(location => {
            if (location && isValidCoordinate(location.lon, location.lat)) {
                points.push({ lon: Number(location.lon), lat: Number(location.lat) });
            }
        });
    });

    points.push(...sampleRouteCoordinatesByDistance(routeCoordinates, 50));
    points.push(...sampleRouteMidpoints(routeCoordinates, 24));

    return dedupePoints(points).slice(0, 80);
}

function sampleRouteCoordinatesByDistance(routeCoordinates, maxPoints) {
    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
        return [];
    }

    const sampled = [];
    const stride = Math.max(1, Math.floor(routeCoordinates.length / maxPoints));

    for (let index = 0; index < routeCoordinates.length; index += stride) {
        const coord = routeCoordinates[index];
        if (Array.isArray(coord) && isValidCoordinate(coord[0], coord[1])) {
            sampled.push({ lon: Number(coord[0]), lat: Number(coord[1]) });
        }
    }

    const last = routeCoordinates[routeCoordinates.length - 1];
    if (Array.isArray(last) && isValidCoordinate(last[0], last[1])) {
        sampled.push({ lon: Number(last[0]), lat: Number(last[1]) });
    }

    return sampled;
}

function sampleRouteMidpoints(routeCoordinates, maxMidpoints) {
    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
        return [];
    }

    const midpoints = [];
    const stride = Math.max(1, Math.floor((routeCoordinates.length - 1) / maxMidpoints));

    for (let index = 0; index < routeCoordinates.length - 1; index += stride) {
        const start = routeCoordinates[index];
        const end = routeCoordinates[index + 1];
        if (!Array.isArray(start) || !Array.isArray(end)) continue;
        if (!isValidCoordinate(start[0], start[1]) || !isValidCoordinate(end[0], end[1])) continue;

        midpoints.push({
            lon: Number((Number(start[0]) + Number(end[0])) / 2),
            lat: Number((Number(start[1]) + Number(end[1])) / 2)
        });
    }

    return midpoints;
}

function buildOverpassGraphQuery(points, radius) {
    const bounds = buildBoundingBox(points, 0.003);
    const aroundClauses = points.map(point =>
        `way(around:${radius},${point.lat},${point.lon})["highway"~"^(path|footway|track|steps|bridleway|cycleway|pedestrian|service|unclassified|residential|tertiary|secondary)$"];`
    ).join('\n');
    const bboxClause = bounds
        ? `way(${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon})["highway"~"^(path|footway|track|steps|bridleway|cycleway|pedestrian|service|unclassified|residential|tertiary|secondary)$"];`
        : '';

    return `
[out:json][timeout:25];
(
${aroundClauses}
${bboxClause}
);
out tags geom;
`;
}

function buildBoundingBox(points, paddingDegrees) {
    if (!Array.isArray(points) || points.length === 0) {
        return null;
    }

    let minLat = Infinity;
    let minLon = Infinity;
    let maxLat = -Infinity;
    let maxLon = -Infinity;

    points.forEach(point => {
        if (!isValidCoordinate(point.lon, point.lat)) return;
        minLat = Math.min(minLat, Number(point.lat));
        minLon = Math.min(minLon, Number(point.lon));
        maxLat = Math.max(maxLat, Number(point.lat));
        maxLon = Math.max(maxLon, Number(point.lon));
    });

    if (!Number.isFinite(minLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLat) || !Number.isFinite(maxLon)) {
        return null;
    }

    return {
        minLat: clampLatitude(minLat - paddingDegrees),
        minLon: clampLongitude(minLon - paddingDegrees),
        maxLat: clampLatitude(maxLat + paddingDegrees),
        maxLon: clampLongitude(maxLon + paddingDegrees)
    };
}

function clampLatitude(value) {
    return Math.max(-90, Math.min(90, value));
}

function clampLongitude(value) {
    return Math.max(-180, Math.min(180, value));
}

function normalizeOverpassWays(data) {
    return (data.elements || [])
        .filter(element => element.type === 'way' && Array.isArray(element.geometry))
        .map(element => ({
            id: element.id,
            tags: element.tags || {},
            coordinates: element.geometry
                .filter(point => isValidCoordinate(point.lon, point.lat))
                .map(point => [point.lon, point.lat])
        }))
        .filter(feature => feature.coordinates.length >= 2);
}

function dedupePoints(points) {
    const seen = new Set();
    return points.filter(point => {
        const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isValidCoordinate(lon, lat) {
    return Number.isFinite(Number(lon)) &&
        Number.isFinite(Number(lat)) &&
        Math.abs(Number(lon)) <= 180 &&
        Math.abs(Number(lat)) <= 90;
}

function routeWithEngine(engine, locations, profile, directionsOptions, valhallaSource = 'local') {
    if (!engine) {
        throw createRoutingError('ROUTING_ENGINE_MISSING', 'Motore routing non specificato', 400);
    }

    return routeWithPrimaryAndFallback(engine, locations, profile, directionsOptions, valhallaSource);
}

function routeWithSingleEngine(engine, locations, profile, directionsOptions, valhallaSource = 'local') {
    if (engine === 'osrm') {
        return routeWithOsrm(locations, profile);
    }

    if (engine === 'graphhopper') {
        return routeWithGraphHopper(locations, profile, directionsOptions);
    }

    if (engine === 'valhalla') {
        return routeWithValhalla(locations, profile, directionsOptions, valhallaSource);
    }

    throw createRoutingError('UNSUPPORTED_ROUTING_ENGINE', `Motore routing non supportato: ${engine}`, 400);
}

async function routeWithPrimaryAndFallback(engine, locations, profile, directionsOptions, valhallaSource = 'local') {
    try {
        return await routeWithSingleEngine(engine, locations, profile, directionsOptions, valhallaSource);
    } catch (primaryError) {
        if (locations.length < 3) {
            throw primaryError;
        }

        try {
            const repairedRoute = await routeWithSegmentRepair(engine, locations, profile, directionsOptions, valhallaSource);
            if (Array.isArray(repairedRoute.trip.diagnostics)) {
                repairedRoute.trip.diagnostics = repairedRoute.trip.diagnostics.map(item => ({
                    ...item,
                    repaired: true
                }));
            }
            repairedRoute.trip.summary.fallback = true;
            repairedRoute.trip.summary.repaired_segments = true;
            repairedRoute.trip.summary.primary_error = primaryError.code || primaryError.message;
            return repairedRoute;
        } catch (repairError) {
            repairError.details = {
                ...(repairError.details || {}),
                primaryError: primaryError.publicMessage || primaryError.message,
                primaryCode: primaryError.code || null
            };
            throw repairError;
        }
    }
}

async function routeWithSegmentRepair(engine, locations, profile, directionsOptions, valhallaSource = 'local') {
    const segments = [];
    for (let index = 0; index < locations.length - 1; index++) {
        const pair = [locations[index], locations[index + 1]];
        const segment = await routeBestSegment(pair, engine, profile, directionsOptions, index, valhallaSource);
        segments.push(segment.route);
    }

    return combineSegmentRoutes(segments, locations, profile);
}

async function routeBestSegment(locations, preferredEngine, profile, directionsOptions, index, valhallaSource = 'local') {
    try {
        const route = await routeWithSingleEngine(preferredEngine, locations, profile, directionsOptions, valhallaSource);
        markSegmentRoute(route, locations, preferredEngine, index, false);
        return { route };
    } catch (error) {
        console.error(`${preferredEngine} segment ${index + 1} failed:`, error.message);
        throw error;
    }
}

function markSegmentRoute(route, locations, engine, index, repaired) {
    route.trip.diagnostics = [{
        segment: index + 1,
        from: index + 1,
        to: index + 2,
        directDistance: Math.round(haversineDistance(
            locations[0].lat,
            locations[0].lon,
            locations[1].lat,
            locations[1].lon
        ) * 1000),
        routedDistance: Math.round(getRouteDistanceMeters(route)),
        ratio: getRouteDistanceRatio(route, locations),
        suspicious: isRouteSuspicious(route, locations),
        engine,
        repaired: Boolean(repaired)
    }];
}

function combineSegmentRoutes(segmentRoutes, originalLocations, profile) {
    const shape = [];
    const maneuvers = [];
    const diagnostics = [];
    const engines = new Set();
    const routingBackends = new Set();
    const valhallaSources = new Set();
    let totalDistanceMeters = 0;
    let totalTimeSeconds = 0;
    let elevationGain = 0;
    let hasFallback = false;
    let hasRepairedSegments = false;
    let tilesReady = true;
    let activeRegion = null;
    let lastBuiltAt = null;

    segmentRoutes.forEach((route) => {
        const summary = route.trip.summary || {};
        const leg = route.trip.legs?.[0] || {};
        const segmentShape = leg.shape || [];

        segmentShape.forEach(point => {
            if (shape[shape.length - 1] !== point) {
                shape.push(point);
            }
        });

        (leg.maneuvers || []).forEach(maneuver => maneuvers.push(maneuver));
        (route.trip.diagnostics || []).forEach(item => {
            diagnostics.push(item);
            if (item.repaired) hasRepairedSegments = true;
        });

        totalDistanceMeters += Number(summary.length || leg.summary?.length || 0);
        totalTimeSeconds += Number(summary.time || leg.summary?.time || 0);
        elevationGain += Number(summary.elevation_gain || leg.summary?.elevation_gain || 0);
        if (summary.engine) engines.add(summary.engine);
        if (summary.routing_backend) routingBackends.add(summary.routing_backend);
        if (summary.valhalla_source) valhallaSources.add(summary.valhalla_source);
        if (summary.tiles_ready === false) tilesReady = false;
        if (!activeRegion && summary.active_region) activeRegion = summary.active_region;
        if (!lastBuiltAt && summary.last_built_at) lastBuiltAt = summary.last_built_at;
        if (summary.fallback) hasFallback = true;
    });

    return {
        trip: {
            summary: {
                length: Math.round(totalDistanceMeters),
                time: Math.round(totalTimeSeconds),
                elevation_gain: elevationGain,
                engine: [...engines].join('+') || 'routing',
                profile,
                fallback: hasFallback,
                repaired_segments: hasRepairedSegments,
                routing_backend: [...routingBackends].join('+') || 'routing',
                valhalla_source: [...valhallaSources].join('+') || null,
                tiles_ready: tilesReady,
                active_region: activeRegion,
                last_built_at: lastBuiltAt
            },
            diagnostics,
            locations: originalLocations.map(loc => ({ lon: loc.lon, lat: loc.lat, name: '' })),
            legs: [{
                shape,
                maneuvers,
                summary: {
                    length: Math.round(totalDistanceMeters),
                    time: Math.round(totalTimeSeconds),
                    elevation_gain: elevationGain
                }
            }]
        }
    };
}

function isRouteSuspicious(route, locations) {
    const directDistanceMeters = haversineDistance(
        locations[0].lat,
        locations[0].lon,
        locations[1].lat,
        locations[1].lon
    ) * 1000;
    const routedDistanceMeters = getRouteDistanceMeters(route);

    if (directDistanceMeters <= 0) return false;
    return routedDistanceMeters >= 2000 && routedDistanceMeters / directDistanceMeters >= 4;
}

function getRouteDistanceRatio(route, locations) {
    const directDistanceMeters = haversineDistance(
        locations[0].lat,
        locations[0].lon,
        locations[1].lat,
        locations[1].lon
    ) * 1000;

    if (directDistanceMeters <= 0) return 0;
    return Number((getRouteDistanceMeters(route) / directDistanceMeters).toFixed(2));
}

function getRouteDistanceMeters(route) {
    return Number(route?.trip?.summary?.length || route?.trip?.legs?.[0]?.summary?.length || 0);
}

async function routeWithValhalla(locations, profile, directionsOptions, valhallaSource = 'local') {
    const source = normalizeValhallaSource(valhallaSource);
    const endpoint = getValhallaEndpoint(source);
    let status = null;

    if (source === 'local') {
        status = await getLocalValhallaStatus();
        if (!status.reachable || !status.tilesReady) {
            const reason = !status.reachable
                ? 'servizio di routing non raggiungibile'
                : 'tile Valhalla mancanti o extract non caricato';
            throw createRoutingError(
                'VALHALLA_NOT_READY',
                `Valhalla locale non pronto: ${reason}`,
                503,
                status
            );
        }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const costing = profile === 'cycling' ? 'bicycle' : 'pedestrian';

    try {
        const data = await requestValhallaRoute(locations, profile, directionsOptions, costing, endpoint.routeUrl, controller.signal);
        const route = normalizeValhallaRoute(data.response, locations, profile, source);
        route.trip.summary.routing_backend = endpoint.backend;
        route.trip.summary.valhalla_source = source;
        route.trip.summary.tiles_ready = source === 'local';
        route.trip.summary.snap_mode = data.snapMode;
        route.trip.summary.snap_radius_meters = data.snapRadiusMeters;
        route.trip.summary.max_hiking_difficulty = costing === 'pedestrian' ? MAX_HIKING_DIFFICULTY : null;
        route.trip.summary.active_region = status?.activeRegion || null;
        route.trip.summary.last_built_at = status?.lastBuiltAt || null;
        route.trip.summary.valhalla_status = status?.upstreamStatus || null;
        return route;
    } finally {
        clearTimeout(timeout);
    }
}

function normalizeValhallaSource(source) {
    return source === 'online' ? 'online' : 'local';
}

function getValhallaEndpoint(source) {
    if (source === 'online') {
        return {
            routeUrl: VALHALLA_ONLINE_API_URL,
            backend: 'online-valhalla'
        };
    }

    return {
        routeUrl: VALHALLA_API_URL,
        backend: 'local-valhalla'
    };
}

async function requestValhallaRoute(locations, profile, directionsOptions, costing, routeUrl, signal) {
    const attempts = [
        {
            snapMode: 'nearest',
            snapRadiusMeters: profile === 'cycling' ? Math.max(SNAP_RADIUS_METERS, 25) : SNAP_RADIUS_METERS,
            rankCandidates: false,
            minimumReachability: 0
        },
        {
            snapMode: 'relaxed',
            snapRadiusMeters: profile === 'cycling' ? Math.max(RELAXED_SNAP_RADIUS_METERS, 70) : RELAXED_SNAP_RADIUS_METERS,
            rankCandidates: false,
            minimumReachability: profile === 'cycling' ? 3 : 1
        }
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            return {
                ...attempt,
                response: await fetchValhallaRoute(locations, profile, directionsOptions, costing, routeUrl, signal, attempt)
            };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Valhalla route failed');
}

async function fetchValhallaRoute(locations, profile, directionsOptions, costing, routeUrl, signal, snapOptions) {
    const routeLocations = locations.map((loc, index) => ({
        lat: loc.lat,
        lon: loc.lon,
        type: 'break',
        radius: snapOptions.snapRadiusMeters,
        rank_candidates: snapOptions.rankCandidates,
        minimum_reachability: snapOptions.minimumReachability
    }));

    const response = await fetch(routeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'RoutePlanner/1.0'
        },
        body: JSON.stringify({
            locations: routeLocations,
            costing,
            costing_options: buildValhallaCostingOptions(),
            directions_options: {
                language: directionsOptions.language || 'it-IT',
                units: 'kilometers'
            },
            units: 'kilometers'
        }),
        signal
    });

    if (!response.ok) {
        let bodyText = '';
        try { bodyText = await response.text(); } catch (_) {}
        let valhallaMsg = '';
        try {
            const parsed = JSON.parse(bodyText);
            valhallaMsg = parsed.error || parsed.error_code_message || '';
        } catch (_) {}
        console.error('Valhalla error', response.status, bodyText.slice(0, 500), 'request=', JSON.stringify({ locations: routeLocations, costing }));
        const err = new Error(`Valhalla responded with ${response.status}${valhallaMsg ? ': ' + valhallaMsg : ''}`);
        err.valhallaStatus = response.status;
        err.valhallaBody = bodyText;
        throw err;
    }

    const data = await response.json();
    if (!data.trip || !Array.isArray(data.trip.legs) || data.trip.legs.length === 0) {
        throw new Error('Invalid Valhalla response');
    }

    return data;
}

function buildValhallaCostingOptions() {
    return {
        pedestrian: {
            use_tracks: 1,
            use_paths: 1,
            use_living_streets: 0.9,
            walking_speed: 4.8,
            max_hiking_difficulty: MAX_HIKING_DIFFICULTY
        },
        bicycle: {
            use_roads: 0.8,
            use_hills: 0.85,
            cycling_speed: 14
        }
    };
}

async function routeWithOsrm(locations, profile) {
    const baseUrl = profile === 'cycling'
        ? 'https://routing.openstreetmap.de/routed-bike/route/v1/bike'
        : 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
    const coordinateString = locations.map(loc => `${loc.lon},${loc.lat}`).join(';');
    const url = `${baseUrl}/${coordinateString}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'RoutePlanner/1.0' }
    });

    if (!response.ok) {
        throw new Error(`OSRM responded with ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(data.message || 'Invalid OSRM response');
    }

    return normalizeOsrmRoute(data, profile);
}

async function routeWithGraphHopper(locations, profile, directionsOptions) {
    if (!GRAPHHOPPER_API_KEY) {
        throw new Error('GRAPHHOPPER_API_KEY is not configured');
    }

    const params = new URLSearchParams({
        profile: profile === 'cycling' ? 'bike' : 'foot',
        locale: directionsOptions.language || 'it',
        points_encoded: 'false',
        key: GRAPHHOPPER_API_KEY
    });
    locations.forEach(loc => params.append('point', `${loc.lat},${loc.lon}`));

    const response = await fetch(`${GRAPHHOPPER_API_URL}?${params.toString()}`, {
        headers: { 'User-Agent': 'RoutePlanner/1.0' }
    });

    if (!response.ok) {
        throw new Error(`GraphHopper responded with ${response.status}`);
    }

    const data = await response.json();
    if (!data.paths || data.paths.length === 0) {
        throw new Error(data.message || 'Invalid GraphHopper response');
    }

    return normalizeGraphHopperRoute(data, locations, profile);
}

function normalizeValhallaRoute(data, originalLocations, profile, valhallaSource = 'local') {
    const routeCoordinates = [];
    const maneuvers = [];
    const snappedLocations = normalizeValhallaLocations(data.trip.locations);
    let totalDistanceMeters = 0;
    let totalTimeSeconds = 0;
    let elevationGain = 0;

    data.trip.legs.forEach((leg) => {
        const legCoordinates = decodeShape(leg.shape);

        legCoordinates.forEach((coord) => {
            const previous = routeCoordinates[routeCoordinates.length - 1];
            if (!previous || previous[0] !== coord[0] || previous[1] !== coord[1]) {
                routeCoordinates.push(coord);
            }
        });

        const summary = leg.summary || {};
        totalDistanceMeters += kilometersToMeters(summary.length || 0);
        totalTimeSeconds += Math.round(summary.time || 0);
        elevationGain += summary.elevation_gain || 0;

        (leg.maneuvers || []).forEach((maneuver) => {
            maneuvers.push({
                instruction: maneuver.instruction || 'Prosegui',
                length: kilometersToMeters(maneuver.length || 0),
                time: maneuver.time || 0,
                type: maneuver.type || 'route',
                street_name: maneuver.street_name || ''
            });
        });
    });

    const tripSummary = data.trip.summary || {};
    if (tripSummary.length) {
        totalDistanceMeters = kilometersToMeters(tripSummary.length);
    }
    if (tripSummary.time) {
        totalTimeSeconds = Math.round(tripSummary.time);
    }

    const endpointThresholdMeters = profile === 'cycling' ? 70 : 45;
    const endpointChecks = getEndpointSnapChecks(originalLocations, snappedLocations);
    const failedEndpoint = endpointChecks.find(check => check.distanceMeters > endpointThresholdMeters);

    if (failedEndpoint) {
        throw createRoutingError(
            'VALHALLA_ENDPOINT_UNREACHABLE',
            'Il punto di arrivo non viene raggiunto dal grafo locale',
            503,
            {
                thresholdMeters: endpointThresholdMeters,
                endpointChecks
            }
        );
    }

    if (endpointChecks.length > 0) {
        const first = endpointChecks[0];
        const last = endpointChecks[endpointChecks.length - 1];

        if (first.distanceMeters > 0 && first.distanceMeters <= endpointThresholdMeters) {
            prependCoordinate(routeCoordinates, originalLocations[0]);
        }

        if (last.distanceMeters > 0 && last.distanceMeters <= endpointThresholdMeters) {
            appendCoordinate(routeCoordinates, originalLocations[originalLocations.length - 1]);
        }
    }

    return {
        trip: {
            summary: {
                length: totalDistanceMeters,
                time: totalTimeSeconds,
                elevation_gain: elevationGain,
                engine: 'valhalla',
                profile,
                routing_backend: valhallaSource === 'online' ? 'online-valhalla' : 'local-valhalla',
                valhalla_source: valhallaSource,
                tiles_ready: valhallaSource === 'local',
                endpoint_threshold_meters: endpointThresholdMeters,
                endpoint_checks: endpointChecks,
                endpoint_reconciled: endpointChecks.some(check => check.distanceMeters > 0 && check.distanceMeters <= endpointThresholdMeters)
            },
            diagnostics: buildSegmentDiagnostics(originalLocations, data.trip.legs || []),
            locations: snappedLocations,
            legs: [{
                shape: routeCoordinates.map(coord => `${coord[0]},${coord[1]}`),
                maneuvers,
                summary: {
                    length: totalDistanceMeters,
                    time: totalTimeSeconds,
                    elevation_gain: elevationGain
                }
            }]
        }
    };
}

function getEndpointSnapChecks(originalLocations, snappedLocations) {
    const checks = [];
    if (!Array.isArray(originalLocations) || !Array.isArray(snappedLocations) || originalLocations.length === 0) {
        return checks;
    }

    const startOriginal = originalLocations[0];
    const startSnapped = snappedLocations[0];
    if (startOriginal && startSnapped && isValidCoordinate(startOriginal.lon, startOriginal.lat) && isValidCoordinate(startSnapped.lon, startSnapped.lat)) {
        checks.push({
            endpoint: 'start',
            distanceMeters: Math.round(haversineDistance(startOriginal.lat, startOriginal.lon, startSnapped.lat, startSnapped.lon) * 1000)
        });
    }

    const endOriginal = originalLocations[originalLocations.length - 1];
    const endSnapped = snappedLocations[snappedLocations.length - 1];
    if (endOriginal && endSnapped && isValidCoordinate(endOriginal.lon, endOriginal.lat) && isValidCoordinate(endSnapped.lon, endSnapped.lat)) {
        checks.push({
            endpoint: 'end',
            distanceMeters: Math.round(haversineDistance(endOriginal.lat, endOriginal.lon, endSnapped.lat, endSnapped.lon) * 1000)
        });
    }

    return checks;
}

function prependCoordinate(routeCoordinates, location) {
    if (!location || !isValidCoordinate(location.lon, location.lat)) return;
    const coordinate = [Number(location.lon), Number(location.lat)];
    const first = routeCoordinates[0];
    if (!first || first[0] !== coordinate[0] || first[1] !== coordinate[1]) {
        routeCoordinates.unshift(coordinate);
    }
}

function appendCoordinate(routeCoordinates, location) {
    if (!location || !isValidCoordinate(location.lon, location.lat)) return;
    const coordinate = [Number(location.lon), Number(location.lat)];
    const last = routeCoordinates[routeCoordinates.length - 1];
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) {
        routeCoordinates.push(coordinate);
    }
}

function normalizeOsrmRoute(data, profile) {
    const route = data.routes[0];
    const coordinates = route.geometry.coordinates || [];
    const maneuvers = [];

    (route.legs || []).forEach((leg) => {
        (leg.steps || []).forEach((step) => {
            maneuvers.push({
                instruction: formatOsrmInstruction(step),
                length: Math.round(step.distance || 0),
                time: Math.round(step.duration || 0),
                type: step.maneuver?.type || 'route',
                street_name: step.name || ''
            });
        });
    });

    return {
        trip: {
            summary: {
                length: Math.round(route.distance || 0),
                time: Math.round(route.duration || 0),
                elevation_gain: 0,
                engine: 'osrm',
                profile,
                routing_backend: 'osrm',
                tiles_ready: false
            },
            locations: (data.waypoints || []).map(point => ({
                lon: point.location?.[0],
                lat: point.location?.[1],
                name: point.name || ''
            })),
            diagnostics: buildSegmentDiagnostics(
                (data.waypoints || []).map(point => ({
                    lon: point.location?.[0],
                    lat: point.location?.[1]
                })),
                route.legs || []
            ),
            legs: [{
                shape: coordinates.map(coord => `${coord[0]},${coord[1]}`),
                maneuvers,
                summary: {
                    length: Math.round(route.distance || 0),
                    time: Math.round(route.duration || 0),
                    elevation_gain: 0
                }
            }]
        }
    };
}

function normalizeGraphHopperRoute(data, originalLocations, profile) {
    const path = data.paths[0];
    const coordinates = path.points?.coordinates || [];

    return {
        trip: {
            summary: {
                length: Math.round(path.distance || 0),
                time: Math.round((path.time || 0) / 1000),
                elevation_gain: path.ascend || 0,
                engine: 'graphhopper',
                profile,
                routing_backend: 'graphhopper',
                tiles_ready: false
            },
            locations: originalLocations.map(loc => ({ lon: loc.lon, lat: loc.lat, name: '' })),
            diagnostics: buildSegmentDiagnostics(originalLocations, [{
                summary: { length: (path.distance || 0) / 1000 }
            }]),
            legs: [{
                shape: coordinates.map(coord => `${coord[0]},${coord[1]}`),
                maneuvers: (path.instructions || []).map(instruction => ({
                    instruction: instruction.text || 'Prosegui',
                    length: Math.round(instruction.distance || 0),
                    time: Math.round((instruction.time || 0) / 1000),
                    type: instruction.sign || 'route',
                    street_name: instruction.street_name || ''
                })),
                summary: {
                    length: Math.round(path.distance || 0),
                    time: Math.round((path.time || 0) / 1000),
                    elevation_gain: path.ascend || 0
                }
            }]
        }
    };
}

function normalizeValhallaLocations(locations = []) {
    return locations.map(location => ({
        lon: location.lon,
        lat: location.lat,
        name: location.name || ''
    }));
}

function formatOsrmInstruction(step) {
    const maneuverType = step.maneuver?.type || 'continue';
    const modifier = step.maneuver?.modifier;
    const roadName = step.name ? ` su ${step.name}` : '';

    if (maneuverType === 'depart') return `Partenza${roadName}`;
    if (maneuverType === 'arrive') return 'Arrivo';
    if (maneuverType === 'turn') return `Svolta ${modifier || ''}${roadName}`.trim();
    if (maneuverType === 'new name') return `Prosegui${roadName}`;
    if (maneuverType === 'roundabout') return `Entra nella rotonda${roadName}`;

    return `Prosegui${roadName}`;
}

function buildSegmentDiagnostics(locations, legs) {
    if (!Array.isArray(locations) || locations.length < 2 || !Array.isArray(legs)) {
        return [];
    }

    return legs.map((leg, index) => {
        const start = locations[index];
        const end = locations[index + 1];
        if (!start || !end) return null;

        const directDistanceKm = haversineDistance(start.lat, start.lon, end.lat, end.lon);
        const routedDistanceKm = getLegDistanceKm(leg);
        const ratio = directDistanceKm > 0 ? routedDistanceKm / directDistanceKm : 0;

        return {
            segment: index + 1,
            from: index + 1,
            to: index + 2,
            directDistance: Math.round(directDistanceKm * 1000),
            routedDistance: Math.round(routedDistanceKm * 1000),
            ratio: Number(ratio.toFixed(2)),
            suspicious: ratio >= 4 && routedDistanceKm >= 2
        };
    }).filter(Boolean);
}

function getLegDistanceKm(leg) {
    if (leg?.summary?.length !== undefined) {
        return Number(leg.summary.length);
    }

    if (leg?.distance !== undefined) {
        return Number(leg.distance) / 1000;
    }

    return 0;
}

function buildStraightLineRoute(locations, profile = 'walking', directionsOptions = {}, engine = 'fallback') {
    const walkingSpeedKmh = profile === 'cycling' ? 15 : 5.1;
    const shape = locations.map(loc => `${loc.lon},${loc.lat}`);

    let totalDistance = 0;
    for (let i = 0; i < locations.length - 1; i++) {
        totalDistance += haversineDistance(
            locations[i].lat, locations[i].lon,
            locations[i + 1].lat, locations[i + 1].lon
        );
    }

    const totalTimeSeconds = Math.round((totalDistance / walkingSpeedKmh) * 3600);

    const maneuvers = locations.map((loc, index) => ({
        instruction: index === 0 ? 'Partenza' :
                    index === locations.length - 1 ? 'Arrivo' :
                    `Procedi verso il punto ${index + 1}`,
        length: index < locations.length - 1 ?
                haversineDistance(
                    locations[index].lat, locations[index].lon,
                    locations[index + 1].lat, locations[index + 1].lon
                ) * 1000 : 0,
        type: 'straight'
    }));

    return {
        trip: {
            summary: {
                length: totalDistance * 1000,
                time: totalTimeSeconds,
                elevation_gain: 0,
                engine,
                profile,
                fallback: true,
                routing_backend: 'straight-line',
                tiles_ready: false
            },
            locations: locations.map(loc => ({ lon: loc.lon, lat: loc.lat, name: '' })),
            diagnostics: buildSegmentDiagnostics(locations, [{
                summary: { length: totalDistance }
            }]),
            legs: [{
                shape,
                maneuvers,
                summary: {
                    length: totalDistance * 1000,
                    time: totalTimeSeconds,
                    elevation_gain: 0
                },
                directions_options: {
                    language: directionsOptions.language || 'it'
                }
            }]
        }
    };
}

function kilometersToMeters(value) {
    return Number(value) * 1000;
}

function decodeShape(shape) {
    if (Array.isArray(shape)) {
        return shape.map(point => {
            if (Array.isArray(point)) {
                return [Number(point[0]), Number(point[1])];
            }
            return [Number(point.lon), Number(point.lat)];
        });
    }

    if (typeof shape !== 'string') {
        return [];
    }

    return decodePolyline(shape, 6);
}

function decodePolyline(encoded, precision = 6) {
    const coordinates = [];
    const factor = Math.pow(10, precision);
    let index = 0;
    let lat = 0;
    let lon = 0;

    while (index < encoded.length) {
        const latResult = decodePolylineValue(encoded, index);
        index = latResult.nextIndex;
        lat += latResult.value;

        const lonResult = decodePolylineValue(encoded, index);
        index = lonResult.nextIndex;
        lon += lonResult.value;

        coordinates.push([lon / factor, lat / factor]);
    }

    return coordinates;
}

function decodePolylineValue(encoded, startIndex) {
    let result = 0;
    let shift = 0;
    let index = startIndex;
    let byte;

    do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
    } while (byte >= 0x20);

    return {
        value: (result & 1) ? ~(result >> 1) : (result >> 1),
        nextIndex: index
    };
}

async function getLocalValhallaStatus() {
    const manifest = await readValhallaManifest();
    const tileDirState = await readTileDirectoryState();
    const extractExists = await pathExists(VALHALLA_TILE_EXTRACT);

    let reachable = false;
    let upstreamStatus = null;

    try {
        const response = await fetchWithTimeout(VALHALLA_STATUS_URL, 4000, {
            headers: { 'User-Agent': 'RoutePlanner/1.0' }
        });
        reachable = response.ok;
        upstreamStatus = await safeReadJson(response);
    } catch (error) {
        upstreamStatus = { error: error.message };
    }

    return {
        reachable,
        upstreamStatus,
        tilesReady: tileDirState.hasTiles && extractExists,
        tileDir: VALHALLA_TILE_DIR,
        tileExtract: VALHALLA_TILE_EXTRACT,
        hasTileDirectory: tileDirState.exists,
        tileCount: tileDirState.count,
        activeRegion: manifest?.regionId || null,
        lastBuiltAt: manifest?.builtAt || null,
        manifest
    };
}

async function readTileDirectoryState() {
    try {
        const tileCount = await countTileFiles(VALHALLA_TILE_DIR);
        return {
            exists: true,
            count: tileCount,
            hasTiles: tileCount > 0
        };
    } catch (error) {
        return {
            exists: false,
            count: 0,
            hasTiles: false
        };
    }
}

async function countTileFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    let count = 0;

    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'manifest.json' || entry.name === 'region.json') {
            continue;
        }

        const entryPath = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
            count += await countTileFiles(entryPath);
        } else if (entry.isFile() && entry.name !== 'tile_manifest.json') {
            count += 1;
        }
    }

    return count;
}

async function readValhallaManifest() {
    const manifestPath = `${VALHALLA_TILE_DIR}/manifest.json`;
    try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch (error) {
        return false;
    }
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function safeReadJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

function buildStatusUrl(routeUrl) {
    try {
        const url = new URL(routeUrl);
        url.pathname = '/status';
        url.search = '';
        return url.toString();
    } catch (error) {
        return 'http://valhalla:8002/status';
    }
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function createRoutingError(code, message, statusCode = 503, details = null) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.publicMessage = message;
    error.details = details;
    return error;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = router;

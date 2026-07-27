// Routing integration with Valhalla
const ROUTING_API_URL = window.ROUTING_API_URL || '/api/routing';

// Calculate route between markers
async function calculateRoute() {
    if (AppState.markers.length < 2) return;
    
    try {
        AppState.routingError = null;
        // Build locations array
        const locations = AppState.markers.map(m => ({
            lon: m.lon,
            lat: m.lat
        }));
        
        // Call Valhalla API
        const response = await fetch(`${ROUTING_API_URL}/route`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                locations: locations,
                engine: AppState.routingEngine,
                profile: AppState.routingProfile,
                valhalla_source: AppState.valhallaSource,
                directions_options: {
                    language: 'it'
                }
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || 'Routing non disponibile');
        }
        
        const data = await response.json();
        
        // Process route data
        const routeData = {
            coordinates: data.trip.legs[0].shape.map(point => {
                const coords = point.split(',');
                return [parseFloat(coords[0]), parseFloat(coords[1])];
            }),
            distance: data.trip.summary.length,
            time: data.trip.summary.time,
            elevation: data.trip.summary.elevation_gain || 0,
            engine: data.trip.summary.engine || AppState.routingEngine,
            profile: data.trip.summary.profile || AppState.routingProfile,
            routingBackend: data.trip.summary.routing_backend || 'unknown',
            valhallaSource: data.trip.summary.valhalla_source || AppState.valhallaSource,
            localGraphReady: Boolean(data.trip.summary.tiles_ready),
            activeRegion: data.trip.summary.active_region || null,
            lastBuiltAt: data.trip.summary.last_built_at || null,
            snappedLocations: data.trip.locations || [],
            diagnostics: data.trip.diagnostics || [],
            fallback: Boolean(data.trip.summary.fallback),
            repairedSegments: Boolean(data.trip.summary.repaired_segments),
            endpointThresholdMeters: data.trip.summary.endpoint_threshold_meters || null,
            endpointChecks: data.trip.summary.endpoint_checks || [],
            endpointReconciled: Boolean(data.trip.summary.endpoint_reconciled)
        };
        
        AppState.route = routeData;

        if (routeData.fallback) {
            const fallbackMessage = routeData.repairedSegments
                ? 'Routing in fallback: alcuni segmenti sono stati ricalcolati dal backend.'
                : 'Routing in fallback: il motore ha usato una rotta alternativa.';
            showToast(fallbackMessage, 'warn');
        }
        
        // Process directions
        AppState.directions = processDirections(data.trip.legs[0].maneuvers);
        
        await calculateStatistics();
        await updateElevationChart();
        
        // Update display
        displayRoute(routeData);
        updateOsmGraphLayer();
        updateUI();
        
        saveToLocalStorage();
        
    } catch (error) {
        console.error('Routing error:', error);
        AppState.routingError = error.message || 'Routing non disponibile';
        AppState.route = null;
        AppState.directions = [];
        clearRoute();
        updateRoutingDebugLayer(null);
        updateOsmGraphLayer();
        calculateStatistics().then(() => {
            updateElevationChart();
            updateUI();
            saveToLocalStorage();
        });
        updateUI();
    }
}

// Fallback: calculate straight line route
function calculateStraightLineRoute() {
    const coordinates = AppState.markers.map(m => [m.lon, m.lat]);
    showToast('Routing in fallback: linea d\'aria usata come ripiego.', 'warn');
    
    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += haversineDistance(
            coordinates[i][1], coordinates[i][0],
            coordinates[i + 1][1], coordinates[i + 1][0]
        );
    }

    const totalDistanceMeters = totalDistance * 1000;
    const totalTimeSeconds = Math.round((totalDistance / 5) * 3600);
    
    AppState.route = {
        coordinates: coordinates,
        distance: totalDistanceMeters,
        time: totalTimeSeconds,
        elevation: 0
    };
    
    AppState.directions = [{
        instruction: 'Routing non disponibile. Linea d\'aria.',
        distance: totalDistanceMeters
    }];
    
    displayRoute(AppState.route);
    updateOsmGraphLayer();
    calculateStatistics().then(() => {
        updateElevationChart();
        updateUI();
        saveToLocalStorage();
    });
    updateUI();
}

// Process directions from Valhalla response
function processDirections(maneuvers) {
    return maneuvers.map(m => ({
        instruction: m.instruction,
        distance: m.length,
        type: m.type,
        streetName: m.street_name || '',
        note: ''
    }));
}

// Haversine distance calculation (in km)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Get elevation data for route using backend proxy (avoids CORS), then direct API fallback
async function getElevationData(coordinates) {
    if (!coordinates || coordinates.length === 0) return [];

    const sampled = sampleElevationCoordinates(coordinates, 300);

    // Try backend proxy first
    try {
        const elevations = await fetchElevationViaProxy(sampled);
        if (elevations && elevations.length === sampled.length) {
            const result = interpolateElevation(coordinates, sampled, elevations);
            warnIfZeroElevation(result);
            return result;
        }
    } catch (proxyError) {
        console.warn('Elevation proxy failed, trying direct API:', proxyError);
    }

    // Fallback: direct API call from browser
    try {
        const elevations = await fetchElevationBatch(sampled);
        if (elevations && elevations.length === sampled.length) {
            const result = interpolateElevation(coordinates, sampled, elevations);
            warnIfZeroElevation(result);
            return result;
        }
    } catch (error) {
        console.error('Elevation API error:', error);
    }

    showToast('Dati di elevazione non disponibili', 'warn');
    return coordinates.map(coord => ({
        lat: coord[1],
        lon: coord[0],
        elevation: 0
    }));
}

function warnIfZeroElevation(elevationData) {
    const allZero = elevationData.length > 0 && elevationData.every(d => d.elevation === 0);
    if (allZero) {
        console.warn('All elevation values are 0 — API may be returning empty data');
        showToast('Elevazione non disponibile (dati a zero)', 'warn');
    }
}

async function fetchElevationViaProxy(coordinates) {
    const batchSize = 100;
    const allElevations = [];

    for (let i = 0; i < coordinates.length; i += batchSize) {
        const batch = coordinates.slice(i, i + batchSize);
        const response = await fetch('/api/elevation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinates: batch.map(c => ({ lat: c[1], lon: c[0] }))
            })
        });
        if (!response.ok) throw new Error(`Elevation proxy responded ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elevations)) throw new Error('Invalid proxy response');
        allElevations.push(...data.elevations);
    }

    return allElevations;
}

function sampleElevationCoordinates(coordinates, maxPoints) {
    if (coordinates.length <= maxPoints) return coordinates;
    const result = [];
    const step = (coordinates.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i++) {
        result.push(coordinates[Math.round(i * step)]);
    }
    return result;
}

async function fetchElevationBatch(coordinates) {
    const batchSize = 100;
    const allElevations = [];

    // Try Open-Meteo first, then OpenTopoData as fallback
    const providers = [
        {
            name: 'Open-Meteo',
            fetch: async (batch) => {
                const lats = batch.map(c => c[1]).join(',');
                const lons = batch.map(c => c[0]).join(',');
                const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
                const data = await response.json();
                if (!Array.isArray(data.elevation)) throw new Error('Invalid Open-Meteo response');
                return data.elevation;
            }
        },
        {
            name: 'OpenTopoData',
            fetch: async (batch) => {
                const locations = batch.map(c => `${c[1]},${c[0]}`).join('|');
                const url = `https://api.opentopodata.org/v1/srtm90m?locations=${locations}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`OpenTopoData responded ${response.status}`);
                const data = await response.json();
                if (!Array.isArray(data.results)) throw new Error('Invalid OpenTopoData response');
                return data.results.map(r => r.elevation);
            }
        }
    ];

    for (let i = 0; i < coordinates.length; i += batchSize) {
        const batch = coordinates.slice(i, i + batchSize);
        let batchResult = null;
        let lastError = null;

        for (const provider of providers) {
            try {
                batchResult = await provider.fetch(batch);
                if (!Array.isArray(batchResult) || batchResult.length !== batch.length) {
                    throw new Error(`${provider.name} returned wrong count`);
                }
                break;
            } catch (err) {
                lastError = err;
                console.warn(`Direct ${provider.name} failed:`, err.message);
            }
        }

        if (!batchResult) throw lastError;
        allElevations.push(...batchResult);
    }

    return allElevations;
}

function interpolateElevation(allCoordinates, sampledCoordinates, elevations) {
    if (allCoordinates.length === sampledCoordinates.length) {
        return allCoordinates.map((coord, i) => ({
            lat: coord[1],
            lon: coord[0],
            elevation: Math.round(elevations[i])
        }));
    }

    const sampledIndices = [];
    const step = (allCoordinates.length - 1) / (sampledCoordinates.length - 1);
    for (let i = 0; i < sampledCoordinates.length; i++) {
        sampledIndices.push(Math.round(i * step));
    }

    return allCoordinates.map((coord, idx) => {
        let lower = 0;
        for (let j = 0; j < sampledIndices.length - 1; j++) {
            if (sampledIndices[j + 1] > idx) { lower = j; break; }
            lower = j;
        }
        const upper = Math.min(lower + 1, sampledIndices.length - 1);

        if (lower === upper || sampledIndices[lower] === sampledIndices[upper]) {
            return { lat: coord[1], lon: coord[0], elevation: Math.round(elevations[lower]) };
        }

        const t = (idx - sampledIndices[lower]) / (sampledIndices[upper] - sampledIndices[lower]);
        const elev = elevations[lower] + t * (elevations[upper] - elevations[lower]);
        return { lat: coord[1], lon: coord[0], elevation: Math.round(elev) };
    });
}

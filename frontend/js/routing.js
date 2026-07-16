// Routing integration with Valhalla
const ROUTING_API_URL = `${window.location.protocol}//${window.location.hostname}:8002`;

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

// Get elevation data for route
async function getElevationData(coordinates) {
    try {
        return coordinates.map(coord => ({
            lat: coord[1],
            lon: coord[0],
            elevation: Math.round(
                900 +
                (Math.sin(coord[1] * 3.1) * 140) +
                (Math.cos(coord[0] * 2.7) * 120)
            )
        }));
    } catch (error) {
        console.error('Elevation error:', error);
        return [];
    }
}

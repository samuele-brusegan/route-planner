// Routing integration with Valhalla
const ROUTING_API_URL = 'http://routing:8002';

// Calculate route between markers
async function calculateRoute() {
    if (AppState.markers.length < 2) return;
    
    try {
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
                costing: 'pedestrian',
                directions_options: {
                    language: 'it'
                }
            })
        });
        
        if (!response.ok) {
            throw new Error('Errore nel calcolo della route');
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
            elevation: data.trip.summary.elevation_gain || 0
        };
        
        AppState.route = routeData;
        
        // Process directions
        AppState.directions = processDirections(data.trip.legs[0].maneuvers);
        
        // Calculate statistics
        calculateStatistics();
        
        // Update display
        displayRoute(routeData);
        updateUI();
        
        saveToLocalStorage();
        
    } catch (error) {
        console.error('Routing error:', error);
        // Fallback to straight line if routing fails
        calculateStraightLineRoute();
    }
}

// Fallback: calculate straight line route
function calculateStraightLineRoute() {
    const coordinates = AppState.markers.map(m => [m.lon, m.lat]);
    
    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += haversineDistance(
            coordinates[i][1], coordinates[i][0],
            coordinates[i + 1][1], coordinates[i + 1][0]
        );
    }
    
    AppState.route = {
        coordinates: coordinates,
        distance: totalDistance,
        time: totalDistance * 1000, // Rough estimate
        elevation: 0
    };
    
    AppState.directions = [{
        instruction: 'Routing non disponibile. Linea d\'aria.',
        distance: totalDistance
    }];
    
    displayRoute(AppState.route);
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
        // This would call a local elevation service
        // For now, return mock data
        return coordinates.map(coord => ({
            lat: coord[1],
            lon: coord[0],
            elevation: 1000 + Math.random() * 500 // Mock elevation
        }));
    } catch (error) {
        console.error('Elevation error:', error);
        return [];
    }
}

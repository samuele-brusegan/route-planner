// Main Application State
const AppState = {
    markers: [],
    markerTypes: [
        { id: 'night', name: 'Punto Notte', color: '#e74c3c', icon: '🏠' },
        { id: 'supply', name: 'Rifornimento', color: '#f39c12', icon: '🍽️' },
        { id: 'path', name: 'Punto Strada', color: '#3498db', icon: '📍' }
    ],
    route: null,
    directions: [],
    stats: {
        totalDistance: 0,
        totalAscent: 0,
        totalDescent: 0,
        totalTime: 0
    },
    dailyStats: []
};

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    await initMap();
    initUI();
    loadFromLocalStorage();
});

// Save to localStorage
function saveToLocalStorage() {
    const data = {
        markers: AppState.markers,
        markerTypes: AppState.markerTypes,
        route: AppState.route,
        directions: AppState.directions
    };
    localStorage.setItem('routePlannerData', JSON.stringify(data));
}

// Load from localStorage
function loadFromLocalStorage() {
    const data = localStorage.getItem('routePlannerData');
    if (data) {
        const parsed = JSON.parse(data);
        AppState.markers = parsed.markers || [];
        AppState.markerTypes = parsed.markerTypes || AppState.markerTypes;
        AppState.route = parsed.route || null;
        AppState.directions = parsed.directions || [];
        
        // Restore markers on map
        AppState.markers.forEach(marker => {
            addMarkerToMap(marker);
        });
        
        // Restore route if exists
        if (AppState.route) {
            displayRoute(AppState.route);
        }
        
        updateUI();
    }
}

// Clear all data
function clearAll() {
    if (confirm('Sei sicuro di voler cancellare tutti i dati?')) {
        AppState.markers = [];
        AppState.route = null;
        AppState.directions = [];
        AppState.stats = {
            totalDistance: 0,
            totalAscent: 0,
            totalDescent: 0,
            totalTime: 0
        };
        AppState.dailyStats = [];
        
        clearMapMarkers();
        clearRoute();
        localStorage.removeItem('routePlannerData');
        updateUI();
    }
}

// Export JSON
function exportJSON() {
    const data = {
        markers: AppState.markers,
        markerTypes: AppState.markerTypes,
        route: AppState.route,
        directions: AppState.directions,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Import JSON
function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate data
            if (!data.markers || !Array.isArray(data.markers)) {
                throw new Error('Dati non validi');
            }
            
            // Clear current data
            clearMapMarkers();
            clearRoute();
            
            // Load new data
            AppState.markers = data.markers;
            AppState.markerTypes = data.markerTypes || AppState.markerTypes;
            AppState.route = data.route || null;
            AppState.directions = data.directions || [];
            
            // Restore markers on map
            AppState.markers.forEach(marker => {
                addMarkerToMap(marker);
            });
            
            // Restore route if exists
            if (AppState.route) {
                displayRoute(AppState.route);
            }
            
            saveToLocalStorage();
            updateUI();
            
            alert('Importazione completata con successo!');
        } catch (error) {
            alert('Errore durante l\'importazione: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Update all UI elements
function updateUI() {
    updateMarkersList();
    updateMarkerTypesList();
    updateStatistics();
    updateDirectionsList();
}

// Calculate time estimate using Naismith's formula
function calculateTime(distance, ascent) {
    // Naismith's rule: 1 hour per 5km + 1 hour per 600m ascent
    const baseTime = (distance / 5) * 60; // minutes
    const ascentTime = (ascent / 600) * 60; // minutes
    const totalMinutes = baseTime + ascentTime;
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    
    return `${hours}h ${minutes}m`;
}

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

// Undo/Redo system
const UndoManager = {
    undoStack: [],
    redoStack: [],
    maxHistory: 50,

    snapshot() {
        return JSON.stringify({
            markers: AppState.markers,
            markerTypes: AppState.markerTypes
        });
    },

    push() {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    },

    undo() {
        if (this.undoStack.length === 0) return false;
        this.redoStack.push(this.snapshot());
        const state = JSON.parse(this.undoStack.pop());
        this._apply(state);
        return true;
    },

    redo() {
        if (this.redoStack.length === 0) return false;
        this.undoStack.push(this.snapshot());
        const state = JSON.parse(this.redoStack.pop());
        this._apply(state);
        return true;
    },

    _apply(state) {
        AppState.markers = state.markers;
        AppState.markerTypes = state.markerTypes;
        clearMapMarkers();
        AppState.markers.forEach(m => addMarkerToMap(m));
        if (AppState.markers.length >= 2) {
            calculateRoute();
        } else {
            AppState.route = null;
            AppState.directions = [];
            clearRoute();
            calculateStatistics().then(() => {
                updateElevationChart();
                updateUI();
                saveToLocalStorage();
            });
        }
        updateUI();
        saveToLocalStorage();
    },

    canUndo() { return this.undoStack.length > 0; },
    canRedo() { return this.redoStack.length > 0; }
};

AppState.routeColor = '#4a90a4';
AppState.routingEngine = 'valhalla';
AppState.routingProfile = 'walking';
AppState.valhallaSource = 'local';
AppState.showRoutingDebug = false;
AppState.showRoutingWarnings = false;
AppState.showOsmGraph = false;
AppState.showOsmInspector = false;
AppState.routingError = null;
AppState.pendingMarkerInsertIndex = null;
AppState.selectedOsmGraphId = null;

const DAY_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    await initMap();
    initUI();
    await loadFromLocalStorage();
    if (typeof loadRouteFromUrl === 'function') {
        await loadRouteFromUrl();
    }
});

// Save to localStorage
function saveToLocalStorage() {
    const data = {
        markers: AppState.markers,
        markerTypes: AppState.markerTypes,
        route: AppState.route,
        directions: AppState.directions,
        routeColor: AppState.routeColor,
        routingEngine: AppState.routingEngine,
        routingProfile: AppState.routingProfile,
        valhallaSource: AppState.valhallaSource,
        showRoutingDebug: AppState.showRoutingDebug,
        showRoutingWarnings: AppState.showRoutingWarnings,
        showOsmGraph: AppState.showOsmGraph,
        showOsmInspector: AppState.showOsmInspector,
        routingError: AppState.routingError
    };
    localStorage.setItem('routePlannerData', JSON.stringify(data));
}

function savePanelVisibilityToLocalStorage(panelVisibility) {
    localStorage.setItem('routePlannerPanelVisibility', JSON.stringify(panelVisibility || {}));
}

function loadPanelVisibilityFromLocalStorage() {
    try {
        return JSON.parse(localStorage.getItem('routePlannerPanelVisibility') || '{}') || {};
    } catch (error) {
        return {};
    }
}

function showToast(message, type = 'info', durationMs = 4500) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    const normalizedType = type === 'warning' ? 'warn' : type;
    const safeType = ['info', 'warn', 'error', 'fatal', 'success'].includes(normalizedType) ? normalizedType : 'info';

    toast.className = `toast toast-${safeType}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    const timer = setTimeout(() => {
        toast.classList.remove('visible');
        window.setTimeout(() => toast.remove(), 180);
    }, durationMs);

    return toast;
}

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
    return container;
}

// Load from localStorage
async function loadFromLocalStorage() {
    const data = localStorage.getItem('routePlannerData');
    if (data) {
        const parsed = JSON.parse(data);
        AppState.markers = parsed.markers || [];
        AppState.markerTypes = parsed.markerTypes || AppState.markerTypes;
        AppState.route = parsed.route || null;
        AppState.directions = parsed.directions || [];
        AppState.routeColor = parsed.routeColor || AppState.routeColor;
        AppState.routingEngine = parsed.routingEngine || AppState.routingEngine;
        AppState.routingProfile = parsed.routingProfile || AppState.routingProfile;
        AppState.valhallaSource = parsed.valhallaSource || AppState.valhallaSource;
        AppState.showRoutingDebug = parsed.showRoutingDebug || false;
        AppState.showRoutingWarnings = parsed.showRoutingWarnings || false;
        AppState.showOsmGraph = parsed.showOsmGraph || false;
        AppState.showOsmInspector = parsed.showOsmInspector || false;
        AppState.routingError = parsed.routingError || null;
        applyRouteStyle();

        const savedPanelVisibility = loadPanelVisibilityFromLocalStorage();
        if (Object.prototype.hasOwnProperty.call(savedPanelVisibility, 'osm-inspector-panel')) {
            AppState.showOsmInspector = Boolean(savedPanelVisibility['osm-inspector-panel']);
            syncOsmInspectorToggleLabel();
        } else {
            setPanelVisibility('osm-inspector-panel', AppState.showOsmInspector, false);
        }
        
        // Restore markers on map
        AppState.markers.forEach(marker => {
            addMarkerToMap(marker);
        });
        
        // Restore route if exists
        if (AppState.route) {
            displayRoute(AppState.route);
            updateRoutingDebugLayer(AppState.route);
            updateOsmGraphLayer();
            await calculateStatistics();
            await updateElevationChart();
        }
        
        updateUI();
    }
}

// Clear all data
function clearAll() {
    if (confirm('Sei sicuro di voler cancellare tutti i dati?')) {
        UndoManager.push();
        AppState.markers = [];
        AppState.route = null;
        AppState.directions = [];
        AppState.routingError = null;
        AppState.pendingMarkerInsertIndex = null;
        AppState.selectedOsmGraphId = null;
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
        routeColor: AppState.routeColor,
        routingEngine: AppState.routingEngine,
        routingProfile: AppState.routingProfile,
        valhallaSource: AppState.valhallaSource,
        showRoutingDebug: AppState.showRoutingDebug,
        showOsmGraph: AppState.showOsmGraph,
        showOsmInspector: AppState.showOsmInspector,
        routingError: AppState.routingError,
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
    reader.onload = async (e) => {
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
            AppState.routeColor = data.routeColor || AppState.routeColor;
            AppState.routingEngine = data.routingEngine || AppState.routingEngine;
            AppState.routingProfile = data.routingProfile || AppState.routingProfile;
            AppState.valhallaSource = data.valhallaSource || AppState.valhallaSource;
            AppState.showRoutingDebug = data.showRoutingDebug || false;
            AppState.showOsmGraph = data.showOsmGraph || false;
            AppState.showOsmInspector = data.showOsmInspector || false;
            AppState.routingError = data.routingError || null;
            applyRouteStyle();
            setPanelVisibility('osm-inspector-panel', AppState.showOsmInspector, false);
            
            // Restore markers on map
            AppState.markers.forEach(marker => {
                addMarkerToMap(marker);
            });
            
            // Restore route if exists
            if (AppState.route) {
                displayRoute(AppState.route);
                updateRoutingDebugLayer(AppState.route);
                updateOsmGraphLayer();
                await calculateStatistics();
                await updateElevationChart();
            }
            
            saveToLocalStorage();
            updateUI();
            
            showToast('Importazione completata con successo!', 'success');
        } catch (error) {
            showToast('Errore durante l\'importazione: ' + error.message, 'error');
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
    updateRouteStyleControls();
    updateRoutingControls();
    updateRoutingDiagnostics();
    if (AppState.selectedOsmGraphId || AppState.showOsmInspector) {
        updateOsmInspectorPanel(AppState.selectedOsmGraphId);
    }
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

// Calculate time estimate using Munter's formula (DIN 33466)
// Time = distance_km/4 + ascent_m/400 (in hours)
function calculateMunterTime(distanceKm, ascentM, descentM) {
    let munterHours = (distanceKm / 4) + (ascentM / 400);

    // Add 10% for steep descents
    if (descentM > ascentM && descentM > 300) {
        munterHours *= 1.1;
    }

    // Add 20% for high average gradient (>30%)
    if (distanceKm > 0 && ascentM > 0) {
        const avgGradient = ascentM / (distanceKm * 1000);
        if (avgGradient > 0.3) {
            munterHours *= 1.2;
        }
    }

    const hours = Math.floor(munterHours);
    const minutes = Math.round((munterHours - hours) * 60);

    return `${hours}h ${minutes}m`;
}

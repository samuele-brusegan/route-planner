// Lightweight path-based client-side router
// Decouples URLs from filenames: /gpx-inspector, /secret, etc.
// Server SPA fallback already serves index.html for all non-API paths.

const Routes = {
    '/': { view: 'main', title: 'Route Planner' },
    '/gpx-inspector': { view: 'gpx-inspector', title: 'GPX Inspector' },
    '/secret': { view: 'secret', title: 'Route List' },
    '/offline-maps': { view: 'offline-maps', title: 'Mappe Offline' },
    '/map-manager': { view: 'map-manager', title: 'Gestione Mappe' }
};

let currentView = null;

function initRouter() {
    handleRoute();
    window.addEventListener('popstate', handleRoute);
}

function handleRoute() {
    const path = window.location.pathname;
    const route = Routes[path];

    if (!route) {
        // Unknown path — let the main app handle it (could be a static file)
        return;
    }

    document.title = route.title;

    if (route.view === 'main') {
        // Main app — no action needed, the app loads normally
        return;
    }

    if (route.view === 'gpx-inspector') {
        loadGpxInspectorView();
        return;
    }

    if (route.view === 'secret') {
        loadSecretView();
        return;
    }

    if (route.view === 'offline-maps') {
        window.location.href = '/offline-maps.html';
        return;
    }

    if (route.view === 'map-manager') {
        window.location.href = '/map-manager.html';
        return;
    }
}

function navigateTo(path) {
    window.history.pushState({}, '', path);
    handleRoute();
}

function loadGpxInspectorView() {
    if (currentView === 'gpx-inspector') return;
    currentView = 'gpx-inspector';

    // Hide the main app content
    hideMainApp();

    // Load the GPX inspector view
    importGpxInspector();
}

function loadSecretView() {
    if (currentView === 'secret') return;
    currentView = 'secret';

    hideMainApp();
    importSecret();
}

function hideMainApp() {
    const topBar = document.getElementById('top-bar');
    const map = document.getElementById('map');
    const panels = document.querySelectorAll('.panel');
    const bottomPanel = document.getElementById('bottom-panel');
    const topPanel = document.getElementById('top-panel');
    const directionsPanel = document.getElementById('directions-panel');
    const osmInspector = document.getElementById('osm-inspector-panel');
    const exportPage = document.getElementById('export-page');
    const settingsModal = document.getElementById('settings-modal');
    const offlineMapsModal = document.getElementById('offline-maps-modal');

    if (topBar) topBar.style.display = 'none';
    if (map) map.style.display = 'none';
    panels.forEach(p => p.style.display = 'none');
    if (bottomPanel) bottomPanel.style.display = 'none';
    if (topPanel) topPanel.style.display = 'none';
    if (directionsPanel) directionsPanel.style.display = 'none';
    if (osmInspector) osmInspector.style.display = 'none';
    if (exportPage) exportPage.style.display = 'none';
    if (settingsModal) settingsModal.classList.add('hidden');
    if (offlineMapsModal) offlineMapsModal.classList.add('hidden');
}

function showMainApp() {
    const topBar = document.getElementById('top-bar');
    const map = document.getElementById('map');
    const panels = document.querySelectorAll('.panel');
    const bottomPanel = document.getElementById('bottom-panel');
    const topPanel = document.getElementById('top-panel');
    const directionsPanel = document.getElementById('directions-panel');
    const osmInspector = document.getElementById('osm-inspector-panel');

    if (topBar) topBar.style.display = '';
    if (map) map.style.display = '';
    panels.forEach(p => p.style.display = '');
    if (bottomPanel) bottomPanel.style.display = '';
    if (topPanel) topPanel.style.display = '';
    if (directionsPanel) directionsPanel.style.display = '';
    if (osmInspector) osmInspector.style.display = '';

    // Remove any injected view containers
    const injected = document.getElementById('injected-view');
    if (injected) injected.remove();

    currentView = null;
}

// Dynamically load view scripts
function importGpxInspector() {
    const container = document.createElement('div');
    container.id = 'injected-view';
    container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1;background:var(--bg);overflow:auto;';
    document.body.appendChild(container);

    const script = document.createElement('script');
    script.src = '/js/gpx-inspector.js';
    script.onload = () => {
        if (typeof initGpxInspector === 'function') {
            initGpxInspector(container);
        }
    };
    document.head.appendChild(script);
}

function importSecret() {
    const container = document.createElement('div');
    container.id = 'injected-view';
    container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1;background:var(--bg);overflow:auto;';
    document.body.appendChild(container);

    const script = document.createElement('script');
    script.src = '/js/secret.js';
    script.onload = () => {
        if (typeof initSecret === 'function') {
            initSecret(container);
        }
    };
    document.head.appendChild(script);
}

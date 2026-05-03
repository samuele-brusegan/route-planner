// Map Manager - Region download and offline mode management
const EXPORT_API_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
let availableRegions = [];
let downloadStatuses = {};
let offlineMode = false;
let mapModeChannel = null;

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    loadOfflineModePreference();
    loadRegions();
    setupEventListeners();
    startStatusPolling();
    loadDownloadedRegions();
});

// Setup event listeners
function setupEventListeners() {
    // Back button
    document.getElementById('menu-back').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Offline mode toggle
    document.getElementById('offline-mode-toggle').addEventListener('change', (e) => {
        offlineMode = e.target.checked;
        saveOfflineModePreference();
        updateMapSource();
    });

    // Region filter
    document.getElementById('region-filter').addEventListener('input', filterRegions);
    document.getElementById('area-filter').addEventListener('change', filterRegions);
}

// Load regions from API
async function loadRegions() {
    try {
        const response = await fetch(`${EXPORT_API_URL}/regions`);
        const data = await response.json();
        availableRegions = data.regions;
        renderRegions(availableRegions);
    } catch (error) {
        console.error('Error loading regions:', error);
        document.getElementById('regions-list').innerHTML = 
            '<div class="error">Errore nel caricamento delle regioni</div>';
    }
}

// Render regions list
function renderRegions(regions) {
    const container = document.getElementById('regions-list');
    
    if (regions.length === 0) {
        container.innerHTML = '<p>Nessuna regione trovata</p>';
        return;
    }
    
    container.innerHTML = regions.map(region => `
        <div class="region-item" data-id="${region.id}">
            <div class="region-info">
                <h3>${region.name}</h3>
                <p class="region-path">${region.path}</p>
            </div>
            <button class="btn download-btn" data-id="${region.id}" data-url="${region.url}">
                Scarica Offline
            </button>
        </div>
    `).join('');
    
    // Add download button listeners
    container.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', handleDownloadClick);
    });
}

// Filter regions
function filterRegions() {
    const filterText = document.getElementById('region-filter').value.toLowerCase();
    const areaFilter = document.getElementById('area-filter').value;
    
    const filtered = availableRegions.filter(region => {
        const matchesText = region.name.toLowerCase().includes(filterText) || 
                           region.path.toLowerCase().includes(filterText);
        const matchesArea = !areaFilter || region.path.toLowerCase().includes(areaFilter);
        return matchesText && matchesArea;
    });
    
    renderRegions(filtered);
}

// Handle download button click
async function handleDownloadClick(e) {
    const btn = e.target;
    const regionId = btn.dataset.id;
    const url = btn.dataset.url;
    
    // Disable button
    btn.disabled = true;
    btn.textContent = 'Avvio...';
    
    try {
        const response = await fetch(`${EXPORT_API_URL}/download-region`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regionId, url, includeVectorTiles: true })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            btn.textContent = 'In Download...';
            updateDownloadStatus(regionId, data.status);
        } else {
            btn.disabled = false;
            btn.textContent = 'Errore';
            console.error('Download failed:', data.error);
        }
    } catch (error) {
        btn.disabled = false;
        btn.textContent = 'Errore';
        console.error('Download error:', error);
    }
}

// Update download status display
function updateDownloadStatus(regionId, status) {
    downloadStatuses[regionId] = status;
    renderDownloadStatus();
}

// Render download status list
function renderDownloadStatus() {
    const container = document.getElementById('download-status-list');
    const statuses = Object.entries(downloadStatuses);
    
    if (statuses.length === 0) {
        container.innerHTML = '<p>Nessun download in corso</p>';
        return;
    }
    
    container.innerHTML = statuses.map(([regionId, status]) => `
        <div class="status-item ${status.status}">
            <div class="status-info">
                <h4>${regionId}</h4>
                <p class="status-stage">${status.stage}</p>
            </div>
            <div class="status-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${status.progress}%"></div>
                </div>
                <span class="progress-text">${status.progress}%</span>
            </div>
        </div>
    `).join('');
}

// Start polling for status updates
function startStatusPolling() {
    setInterval(async () => {
        try {
            const response = await fetch(`${EXPORT_API_URL}/status`);
            const data = await response.json();
            
            Object.entries(data.statuses).forEach(([regionId, status]) => {
                downloadStatuses[regionId] = status;
                
                // Update button state if completed
                const btn = document.querySelector(`.download-btn[data-id="${regionId}"]`);
                if (btn && status.status === 'completed') {
                    btn.disabled = true;
                    btn.textContent = 'Scaricato';
                    loadDownloadedRegions();
                } else if (btn && status.status === 'error') {
                    btn.disabled = false;
                    btn.textContent = 'Riprova';
                }
            });
            
            renderDownloadStatus();
        } catch (error) {
            console.error('Error polling status:', error);
        }
    }, 2000);
}

// Load downloaded regions
async function loadDownloadedRegions() {
    try {
        const response = await fetch(`${EXPORT_API_URL}/status`);
        const data = await response.json();
        
        const downloaded = Object.entries(data.statuses)
            .filter(([_, status]) => status.status === 'completed')
            .map(([regionId, _]) => regionId);
        
        const container = document.getElementById('downloaded-regions-list');
        
        if (downloaded.length === 0) {
            container.innerHTML = '<p>Nessuna regione scaricata</p>';
            return;
        }
        
        container.innerHTML = downloaded.map(regionId => `
            <div class="downloaded-region-item">
                <h4>${regionId}</h4>
                <button class="btn danger delete-btn" data-id="${regionId}">Elimina</button>
            </div>
        `).join('');
        
        // Add delete button listeners
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteClick);
        });
    } catch (error) {
        console.error('Error loading downloaded regions:', error);
    }
}

// Handle delete button click
async function handleDeleteClick(e) {
    const regionId = e.target.dataset.id;
    
    if (!confirm(`Sei sicuro di voler eliminare ${regionId}?`)) {
        return;
    }

    try {
        const response = await fetch(`${EXPORT_API_URL}/regions/${regionId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Errore durante la cancellazione');
        }

        delete downloadStatuses[regionId];
        renderDownloadStatus();
        await loadDownloadedRegions();
        await loadRegions();
    } catch (error) {
        console.error('Delete region error:', error);
        alert('Errore durante la cancellazione della regione');
    }
}

// Save offline mode preference
function saveOfflineModePreference() {
    localStorage.setItem('offlineMode', offlineMode);
}

// Load offline mode preference
function loadOfflineModePreference() {
    const saved = localStorage.getItem('offlineMode');
    if (saved !== null) {
        offlineMode = saved === 'true';
        document.getElementById('offline-mode-toggle').checked = offlineMode;
    }
}

// Update map source based on offline mode
function updateMapSource() {
    console.log('Offline mode:', offlineMode);

    if ('BroadcastChannel' in window) {
        if (!mapModeChannel) {
            mapModeChannel = new BroadcastChannel('route-planner-map-mode');
        }
        mapModeChannel.postMessage({
            type: 'map-mode',
            mode: offlineMode ? 'offline' : 'online'
        });
    }
}

// UI initialization and event handlers

// Initialize UI
function initUI() {
    // Menu dropdowns
    setupMenuDropdowns();
    
    // Panel toggles
    setupPanelToggles();
    
    // Buttons
    setupButtons();
    
    // File input
    setupFileInput();
    
    // Initialize chart
    initElevationChart();
}

// Setup menu dropdowns
function setupMenuDropdowns() {
    const menuFile = document.getElementById('menu-file');
    const dropdownFile = document.getElementById('dropdown-file');
    
    const menuEdit = document.getElementById('menu-edit');
    const dropdownEdit = document.getElementById('dropdown-edit');
    
    const menuView = document.getElementById('menu-view');
    const dropdownView = document.getElementById('dropdown-view');
    
    // File menu
    menuFile.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownFile.classList.toggle('hidden');
        dropdownEdit.classList.add('hidden');
        dropdownView.classList.add('hidden');
    });
    
    // Edit menu
    menuEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownEdit.classList.toggle('hidden');
        dropdownFile.classList.add('hidden');
        dropdownView.classList.add('hidden');
    });
    
    // View menu
    menuView.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownView.classList.toggle('hidden');
        dropdownFile.classList.add('hidden');
        dropdownEdit.classList.add('hidden');
    });
    
    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        dropdownFile.classList.add('hidden');
        dropdownEdit.classList.add('hidden');
        dropdownView.classList.add('hidden');
    });
    
    // File menu items
    document.getElementById('new-route').addEventListener('click', clearAll);
    document.getElementById('import-json').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-page').addEventListener('click', showExportPage);
    
    // Edit menu items
    document.getElementById('clear-markers').addEventListener('click', clearAll);
    
    // View menu items
    document.getElementById('toggle-left-panel').addEventListener('click', () => {
        document.getElementById('left-panel').classList.toggle('open');
    });
    document.getElementById('toggle-right-panel').addEventListener('click', () => {
        document.getElementById('right-panel').classList.toggle('open');
    });
    document.getElementById('toggle-bottom-panel').addEventListener('click', () => {
        document.getElementById('bottom-panel').classList.toggle('open');
    });
    document.getElementById('offline-maps').addEventListener('click', () => {
        window.location.href = 'offline-maps.html';
    });

    // Maps menu items
    document.getElementById('map-manager').addEventListener('click', () => {
        window.location.href = 'map-manager.html';
    });
}

// Setup panel toggles
function setupPanelToggles() {
    // Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = btn.dataset.panel;
            document.getElementById(panelId).classList.remove('open');
        });
    });
}

// Setup buttons
function setupButtons() {
    // Add marker button
    document.getElementById('add-marker-btn').addEventListener('click', () => {
        alert('Clicca sulla mappa per aggiungere un punto');
    });
    
    // Add marker type button
    document.getElementById('add-marker-type-btn').addEventListener('click', addMarkerType);
    
    // Download chart button
    document.getElementById('download-chart').addEventListener('click', downloadChart);
    
    // Add direction note button
    document.getElementById('add-direction-note-btn').addEventListener('click', () => {
        addCustomDirection(AppState.directions.length - 1);
    });
    
    // Export page buttons
    document.getElementById('close-export-page').addEventListener('click', hideExportPage);
    document.getElementById('export-gpx-full').addEventListener('click', () => exportGPX(false));
    document.getElementById('export-gpx-split').addEventListener('click', () => exportGPX(true));
    document.getElementById('export-map-png').addEventListener('click', exportMapPNG);
    document.getElementById('export-map-pdf').addEventListener('click', exportMapPDF);
    document.getElementById('export-directions-pdf').addEventListener('click', exportDirectionsPDF);
}

// Setup file input
function setupFileInput() {
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importJSON(file);
            fileInput.value = '';
        }
    });
}

// Show export page
function showExportPage() {
    document.getElementById('export-page').classList.remove('hidden');
}

// Hide export page
function hideExportPage() {
    document.getElementById('export-page').classList.add('hidden');
}

// Show directions panel
function showDirectionsPanel() {
    document.getElementById('directions-panel').classList.add('open');
}

// Hide directions panel
function hideDirectionsPanel() {
    document.getElementById('directions-panel').classList.remove('open');
}

// Show offline maps modal
function showOfflineMapsModal() {
    const modal = document.getElementById('offline-maps-modal');
    modal.classList.remove('hidden');
    
    // Setup event listeners
    document.getElementById('cancel-download').onclick = () => {
        modal.classList.add('hidden');
    };
    
    document.getElementById('start-download').onclick = async () => {
        const regionId = document.getElementById('region-select').value;
        if (!regionId) {
            alert('Seleziona una regione');
            return;
        }
        
        const region = REGIONS[regionId];
        const minZoom = parseInt(document.getElementById('min-zoom').value);
        const maxZoom = parseInt(document.getElementById('max-zoom').value);
        
        if (minZoom > maxZoom) {
            alert('Lo zoom minimo deve essere inferiore al massimo');
            return;
        }
        
        // Show progress
        document.getElementById('download-progress').style.display = 'block';
        document.getElementById('start-download').disabled = true;
        
        try {
            await initOfflineMapsDB();
            
            const result = await downloadRegionTiles(
                region.bounds,
                minZoom,
                maxZoom,
                (downloaded, total) => {
                    const progress = (downloaded / total) * 100;
                    document.getElementById('progress-bar').value = progress;
                    document.getElementById('progress-text').textContent = `${downloaded} / ${total} tile`;
                }
            );
            
            alert(`Download completato! ${result.downloaded} tile scaricate su ${result.totalTiles}`);
        } catch (error) {
            console.error('Download error:', error);
            alert('Errore durante il download: ' + error.message);
        } finally {
            document.getElementById('download-progress').style.display = 'none';
            document.getElementById('start-download').disabled = false;
            modal.classList.add('hidden');
        }
    };
}

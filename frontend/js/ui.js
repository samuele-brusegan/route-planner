// UI initialization and event handlers

// Initialize UI
function initUI() {
    // Menu dropdowns
    setupMenuDropdowns();
    
    // Panel toggles
    setupPanelToggles();
    applySavedPanelVisibility();
    
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

    const menuMaps = document.getElementById('menu-maps');
    const dropdownMaps = document.getElementById('dropdown-maps');
    const menuSettings = document.getElementById('menu-settings');
    
    // File menu
    menuFile.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownFile.classList.toggle('hidden');
        dropdownEdit.classList.add('hidden');
        dropdownView.classList.add('hidden');
        dropdownMaps.classList.add('hidden');
    });
    
    // Edit menu
    menuEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownEdit.classList.toggle('hidden');
        dropdownFile.classList.add('hidden');
        dropdownView.classList.add('hidden');
        dropdownMaps.classList.add('hidden');
    });
    
    // View menu
    menuView.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownView.classList.toggle('hidden');
        dropdownFile.classList.add('hidden');
        dropdownEdit.classList.add('hidden');
        dropdownMaps.classList.add('hidden');
    });

    // Maps menu
    menuMaps.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMaps.classList.toggle('hidden');
        dropdownFile.classList.add('hidden');
        dropdownEdit.classList.add('hidden');
        dropdownView.classList.add('hidden');
    });

    menuSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        openSettingsModal();
    });
    
    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        closeAllDropdowns();
    });

    function closeAllDropdowns() {
        dropdownFile.classList.add('hidden');
        dropdownEdit.classList.add('hidden');
        dropdownView.classList.add('hidden');
        dropdownMaps.classList.add('hidden');
    }
    
    // File menu items
    document.getElementById('new-route').addEventListener('click', clearAll);
    document.getElementById('import-json').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-page').addEventListener('click', showExportPage);
    
    // Edit menu items
    document.getElementById('clear-markers').addEventListener('click', clearAll);
    
    document.getElementById('open-settings-from-view').addEventListener('click', openSettingsModal);

    document.getElementById('toggle-routing-debug').addEventListener('change', () => {
        setRoutingDebugVisible(document.getElementById('toggle-routing-debug').checked);
        syncSettingsSwitches();
    });
    document.getElementById('toggle-osm-graph').addEventListener('change', () => {
        setOsmGraphVisible(document.getElementById('toggle-osm-graph').checked);
        syncSettingsSwitches();
    });
    document.getElementById('toggle-osm-inspector').addEventListener('change', () => {
        setOsmInspectorVisible(document.getElementById('toggle-osm-inspector').checked);
        syncSettingsSwitches();
    });
    document.getElementById('offline-maps').addEventListener('click', () => {
        window.location.href = 'offline-maps.html';
    });

    // Maps menu items
    document.querySelectorAll('.map-layer-option').forEach(item => {
        item.addEventListener('click', () => {
            setBaseMap(item.dataset.mapLayer);
        });
    });
    document.getElementById('set-tracestrack-key').addEventListener('click', setTracestrackKey);
    document.getElementById('toggle-trail-overlay').addEventListener('change', () => {
        setTrailOverlayVisible(document.getElementById('toggle-trail-overlay').checked);
        syncSettingsSwitches();
    });
    document.getElementById('toggle-contour-overlay').addEventListener('change', () => {
        setContourOverlayVisible(document.getElementById('toggle-contour-overlay').checked);
        syncSettingsSwitches();
    });
    document.getElementById('map-manager').addEventListener('click', () => {
        window.location.href = 'map-manager.html';
    });

    setupSettingsModal();
    syncSettingsSwitches();
}

// Setup panel toggles
function setupPanelToggles() {
    const panelRules = {
        'left-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'right-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'bottom-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'top-panel': { visibleClass: null, hiddenClass: 'hidden', defaultVisible: true },
        'directions-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'osm-inspector-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false }
    };

    document.querySelectorAll('.panel').forEach(panel => {
        const panelId = panel.id;
        if (!panelRules[panelId]) return;
        panel.dataset.panelVisibility = panelRules[panelId].defaultVisible ? 'visible' : 'hidden';
    });

    // Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = btn.dataset.panel;
            setPanelVisibility(panelId, false);
        });
    });

    document.getElementById('toggle-left-panel').addEventListener('change', () => {
        setPanelVisibility('left-panel', document.getElementById('toggle-left-panel').checked);
    });
    document.getElementById('toggle-right-panel').addEventListener('change', () => {
        setPanelVisibility('right-panel', document.getElementById('toggle-right-panel').checked);
    });
    document.getElementById('toggle-bottom-panel').addEventListener('change', () => {
        setPanelVisibility('bottom-panel', document.getElementById('toggle-bottom-panel').checked);
    });
    document.getElementById('toggle-top-panel').addEventListener('change', () => {
        setPanelVisibility('top-panel', document.getElementById('toggle-top-panel').checked);
    });
    document.getElementById('toggle-directions-panel').addEventListener('change', () => {
        setPanelVisibility('directions-panel', document.getElementById('toggle-directions-panel').checked);
    });
}

function applySavedPanelVisibility() {
    const savedVisibility = loadPanelVisibilityFromLocalStorage();
    const panelRules = {
        'left-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'right-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'bottom-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'top-panel': { visibleClass: null, hiddenClass: 'hidden', defaultVisible: true },
        'directions-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: false },
        'osm-inspector-panel': { visibleClass: 'open', hiddenClass: 'hidden', defaultVisible: AppState.showOsmInspector }
    };

    Object.keys(panelRules).forEach(panelId => {
        const visible = savedVisibility.hasOwnProperty(panelId)
            ? Boolean(savedVisibility[panelId])
            : panelRules[panelId].defaultVisible;
        setPanelVisibility(panelId, visible, false);
    });

    syncSettingsSwitches();
}

function togglePanelVisibility(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const visible = isPanelVisible(panelId);
    setPanelVisibility(panelId, !visible);
}

function isPanelVisible(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return false;
    return !panel.classList.contains('hidden') && (panel.classList.contains('open') || panelId === 'top-panel');
}

function setPanelVisibility(panelId, visible, persist = true) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    if (panelId === 'top-panel') {
        panel.classList.toggle('hidden', !visible);
    } else if (visible) {
        panel.classList.remove('hidden');
        panel.classList.add('open');
    } else {
        panel.classList.remove('open');
        panel.classList.add('hidden');
    }

    if (panelId === 'osm-inspector-panel') {
        AppState.showOsmInspector = Boolean(visible);
    }

    if (persist) {
        const savedVisibility = loadPanelVisibilityFromLocalStorage();
        savedVisibility[panelId] = Boolean(visible);
        savePanelVisibilityToLocalStorage(savedVisibility);
    }

    syncSettingsSwitches();
}

function syncOsmInspectorToggleLabel() {
    syncSettingsSwitches();
}

function setOsmInspectorVisible(visible) {
    AppState.showOsmInspector = Boolean(visible);
    setPanelVisibility('osm-inspector-panel', AppState.showOsmInspector);
    updateOsmInspectorPanel(AppState.selectedOsmGraphId);
    saveToLocalStorage();
}

function toggleOsmInspector() {
    setOsmInspectorVisible(!AppState.showOsmInspector);
    return AppState.showOsmInspector;
}

function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const closeButton = document.getElementById('close-settings-modal');
    if (!modal || !closeButton) return;

    closeButton.addEventListener('click', closeSettingsModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeSettingsModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeSettingsModal();
        }
    });
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    syncSettingsSwitches();
    modal.classList.remove('hidden');
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function syncSettingsSwitches() {
    setSwitchChecked('toggle-left-panel', isPanelVisible('left-panel'));
    setSwitchChecked('toggle-right-panel', isPanelVisible('right-panel'));
    setSwitchChecked('toggle-bottom-panel', isPanelVisible('bottom-panel'));
    setSwitchChecked('toggle-top-panel', isPanelVisible('top-panel'));
    setSwitchChecked('toggle-directions-panel', isPanelVisible('directions-panel'));
    setSwitchChecked('toggle-osm-inspector', AppState.showOsmInspector);
    setSwitchChecked('toggle-routing-debug', AppState.showRoutingDebug);
    setSwitchChecked('toggle-osm-graph', AppState.showOsmGraph);
    setSwitchChecked('toggle-trail-overlay', getTrailOverlayVisible());
    setSwitchChecked('toggle-contour-overlay', getContourOverlayVisible());
}

function setSwitchChecked(id, checked) {
    const input = document.getElementById(id);
    if (input && input.type === 'checkbox') {
        input.checked = Boolean(checked);
    }
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

    const routeColorInput = document.getElementById('route-color-input');
    routeColorInput.addEventListener('input', (event) => {
        setRouteColor(event.target.value);
    });

    const routingEngineSelect = document.getElementById('routing-engine-select');
    const routingProfileSelect = document.getElementById('routing-profile-select');

    routingEngineSelect.addEventListener('change', () => {
        AppState.routingEngine = routingEngineSelect.value;
        saveToLocalStorage();
        if (AppState.markers.length >= 2) {
            calculateRoute();
        }
    });

    routingProfileSelect.addEventListener('change', () => {
        AppState.routingProfile = routingProfileSelect.value;
        saveToLocalStorage();
        if (AppState.markers.length >= 2) {
            calculateRoute();
        }
    });
    
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

function updateRouteStyleControls() {
    const routeColorInput = document.getElementById('route-color-input');
    if (routeColorInput) {
        routeColorInput.value = AppState.routeColor || '#4a90a4';
    }
}

function updateRoutingControls() {
    const routingEngineSelect = document.getElementById('routing-engine-select');
    const routingProfileSelect = document.getElementById('routing-profile-select');

    if (routingEngineSelect) {
        routingEngineSelect.value = AppState.routingEngine || 'valhalla';
    }

    if (routingProfileSelect) {
        routingProfileSelect.value = AppState.routingProfile || 'walking';
    }
}

function updateRoutingDiagnostics() {
    const container = document.getElementById('routing-diagnostics');
    if (!container) return;

    if (AppState.routingError && !AppState.route) {
        container.classList.remove('hidden');
        container.innerHTML = `
            <strong>Routing non disponibile</strong>
            <p>${escapeHtml(AppState.routingError)}</p>
            <p>Il motore locale deve essere pronto e caricato con tile Valhalla validi.</p>
        `;
        return;
    }

    const diagnostics = AppState.route?.diagnostics || [];
    const suspicious = diagnostics.filter(item => item.suspicious);
    const route = AppState.route;
    const summaryBits = [];

    if (route) {
        summaryBits.push(`Motore: ${escapeHtml(route.engine || AppState.routingEngine)}`);
        summaryBits.push(`Profilo: ${escapeHtml(route.profile || AppState.routingProfile)}`);

        if (route.routingBackend) {
            summaryBits.push(`Backend: ${escapeHtml(route.routingBackend)}`);
        }

        summaryBits.push(route.localGraphReady ? 'Grafo locale: pronto' : 'Grafo locale: non verificato');

        if (route.activeRegion) {
            summaryBits.push(`Regione attiva: ${escapeHtml(route.activeRegion)}`);
        }

        if (route.lastBuiltAt) {
            summaryBits.push(`Aggiornato: ${escapeHtml(route.lastBuiltAt)}`);
        }

        if (route.endpointReconciled) {
            summaryBits.push('Endpoint: agganciato al punto reale');
        }

        if (Array.isArray(route.endpointChecks) && route.endpointChecks.length > 0) {
            const endpointText = route.endpointChecks
                .map(check => `${check.endpoint}: ${check.distanceMeters} m`)
                .join(', ');
            summaryBits.push(`Snap endpoint: ${escapeHtml(endpointText)}`);
        }
    }

    if (suspicious.length === 0 && summaryBits.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    const parts = [];

    if (summaryBits.length > 0) {
        parts.push(`<p>${summaryBits.join(' · ')}</p>`);
    }

    if (suspicious.length > 0) {
        const items = suspicious.slice(0, 4).map(item => {
            const routedKm = (item.routedDistance / 1000).toFixed(1);
            const directKm = (item.directDistance / 1000).toFixed(1);
            const engine = item.engine ? `, motore ${item.engine}` : '';
            const repair = item.repaired ? ', tratto ricalcolato' : '';
            return escapeHtml(`Punti ${item.from}-${item.to}: ${routedKm} km invece di ${directKm} km diretti${engine}${repair}`);
        });

        parts.push(`
            <strong>Segmenti sospetti</strong>
            <p>Il routing prova prima il calcolo unico su tutti i punti e usa il ricalcolo per segmenti solo come fallback se il motore fallisce.</p>
            <ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>
        `);
    }

    container.innerHTML = parts.join('');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
                'full',
                downloadController.signal,
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

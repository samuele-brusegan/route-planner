// Unified tile management UI — single page with tabs for:
// 1. Map display tiles (browser-side, IndexedDB)
// 2. Valhalla routing tiles (server-side)
// 3. DEM elevation tiles (server-side)

function initTileManager(container) {
    container.innerHTML = `
        <style>
            .tile-mgr-page {
                max-width: 900px;
                margin: 0 auto;
                padding: 24px 20px;
                color: var(--text);
            }
            .tile-mgr-page h1 {
                font-size: 24px;
                margin-bottom: 8px;
            }
            .tile-mgr-page .subtitle {
                color: var(--text-muted);
                font-size: 14px;
                margin-bottom: 24px;
            }
            .tile-mgr-back {
                display: inline-block;
                margin-bottom: 16px;
                color: var(--accent);
                text-decoration: none;
                font-size: 14px;
            }
            .tile-mgr-tabs {
                display: flex;
                gap: 0;
                border-bottom: 2px solid var(--border);
                margin-bottom: 24px;
            }
            .tile-mgr-tab {
                padding: 10px 20px;
                cursor: pointer;
                font-size: 14px;
                color: var(--text-muted);
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                transition: color 0.2s, border-color 0.2s;
            }
            .tile-mgr-tab.active {
                color: var(--accent);
                border-bottom-color: var(--accent);
            }
            .tile-mgr-tab:hover {
                color: var(--text);
            }
            .tile-mgr-content {
                min-height: 300px;
            }
            .tile-mgr-section {
                display: none;
            }
            .tile-mgr-section.active {
                display: block;
            }
            .tile-mgr-card {
                background: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 16px;
                margin-bottom: 12px;
            }
            .tile-mgr-card h3 {
                font-size: 15px;
                margin: 0 0 8px;
            }
            .tile-mgr-card p {
                font-size: 12px;
                color: var(--text-muted);
                margin: 0 0 12px;
            }
            .tile-mgr-btn {
                padding: 8px 16px;
                border-radius: var(--radius-sm);
                border: 1px solid var(--border);
                background: var(--bg-alt);
                color: var(--text);
                cursor: pointer;
                font-size: 13px;
            }
            .tile-mgr-btn:hover {
                background: var(--accent-light);
            }
            .tile-mgr-btn.primary {
                background: var(--accent);
                color: #fff;
                border: none;
            }
            .tile-mgr-status {
                font-size: 12px;
                color: var(--text-muted);
                margin-top: 8px;
            }
            .tile-mgr-link {
                color: var(--accent);
                text-decoration: none;
                font-size: 14px;
            }
            .tile-mgr-link:hover {
                text-decoration: underline;
            }
        </style>
        <div class="tile-mgr-page">
            <a href="/" class="tile-mgr-back">← Torna all'app</a>
            <h1>Gestione Tile</h1>
            <p class="subtitle">Gestisci tile per visualizzazione mappa, routing Valhalla e dati di elevazione</p>

            <div class="tile-mgr-tabs">
                <div class="tile-mgr-tab active" data-tab="display">Tile Mappa (Browser)</div>
                <div class="tile-mgr-tab" data-tab="valhalla">Tile Valhalla (Server)</div>
                <div class="tile-mgr-tab" data-tab="dem">Tile DEM (Server)</div>
            </div>

            <div class="tile-mgr-content">
                <div class="tile-mgr-section active" id="tile-section-display">
                    <div class="tile-mgr-card">
                        <h3>Tile di visualizzazione</h3>
                        <p>Tile memorizzate nel browser (IndexedDB) per uso offline. Gestite dalla pagina Mappe Offline.</p>
                        <a href="/offline-maps" class="tile-mgr-link">Apri Mappe Offline →</a>
                    </div>
                    <div class="tile-mgr-card">
                        <h3>Statistiche archivio</h3>
                        <p id="tile-display-stats">Caricamento...</p>
                        <button class="tile-mgr-btn" id="tile-display-refresh">Aggiorna</button>
                        <button class="tile-mgr-btn" id="tile-display-clear" style="margin-left:8px;color:#e74c3c">Cancella cache</button>
                    </div>
                </div>

                <div class="tile-mgr-section" id="tile-section-valhalla">
                    <div class="tile-mgr-card">
                        <h3>Tile routing Valhalla</h3>
                        <p>Tile Valhalla costruite lato server dal grafo OSM. Necessarie per il routing offline.</p>
                        <a href="/map-manager" class="tile-mgr-link">Apri Gestione Mappe →</a>
                    </div>
                    <div class="tile-mgr-card">
                        <h3>Stato Valhalla</h3>
                        <p id="tile-valhalla-status">Caricamento...</p>
                        <button class="tile-mgr-btn" id="tile-valhalla-refresh">Aggiorna stato</button>
                    </div>
                </div>

                <div class="tile-mgr-section" id="tile-section-dem">
                    <div class="tile-mgr-card">
                        <h3>Cache elevazione offline</h3>
                        <p>Scarica i dati di elevazione per un'area geografica. I dati vengono salvati sul server e usati automaticamente quando sei offline.</p>
                        <div class="tile-mgr-status" id="tile-dem-status">Caricamento stato...</div>
                        <button class="tile-mgr-btn" id="tile-dem-refresh">Aggiorna stato</button>
                        <button class="tile-mgr-btn" id="tile-dem-clear" style="margin-left:8px;color:#e74c3c">Cancella cache</button>
                    </div>
                    <div class="tile-mgr-card">
                        <h3>Scarica dati elevazione</h3>
                        <p>Inserisci i limiti dell'area (latitudine/longitudine) o usa l'area della route corrente.</p>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                            <label style="font-size:12px">Lat min <input type="number" id="dem-min-lat" step="0.001" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-alt);color:var(--text)"></label>
                            <label style="font-size:12px">Lat max <input type="number" id="dem-max-lat" step="0.001" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-alt);color:var(--text)"></label>
                            <label style="font-size:12px">Lon min <input type="number" id="dem-min-lon" step="0.001" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-alt);color:var(--text)"></label>
                            <label style="font-size:12px">Lon max <input type="number" id="dem-max-lon" step="0.001" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-alt);color:var(--text)"></label>
                        </div>
                        <label style="font-size:12px;display:block;margin-bottom:8px">Risoluzione (gradi, default 0.01 ≈ 1km)
                            <input type="number" id="dem-resolution" step="0.001" value="0.01" style="width:80px;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-alt);color:var(--text)">
                        </label>
                        <button class="tile-mgr-btn primary" id="tile-dem-download">Scarica dati elevazione</button>
                        <button class="tile-mgr-btn" id="tile-dem-use-route" style="margin-left:8px">Usa area route</button>
                    </div>
                    <div class="tile-mgr-card" id="tile-dem-progress-card" style="display:none">
                        <h3>Avanzamento download</h3>
                        <div class="tile-mgr-status" id="tile-dem-progress">In corso...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Tab switching
    container.querySelectorAll('.tile-mgr-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.tile-mgr-tab').forEach(t => t.classList.remove('active'));
            container.querySelectorAll('.tile-mgr-section').forEach(s => s.classList.remove('active'));
            tab.classList.add('active');
            container.querySelector(`#tile-section-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // Display tiles stats
    refreshDisplayTileStats();
    container.querySelector('#tile-display-refresh').addEventListener('click', refreshDisplayTileStats);
    container.querySelector('#tile-display-clear').addEventListener('click', clearDisplayTileCache);

    // Valhalla status
    refreshValhallaStatus();
    container.querySelector('#tile-valhalla-refresh').addEventListener('click', refreshValhallaStatus);

    // DEM elevation
    refreshDemStatus();
    container.querySelector('#tile-dem-refresh').addEventListener('click', refreshDemStatus);
    container.querySelector('#tile-dem-clear').addEventListener('click', clearDemCache);
    container.querySelector('#tile-dem-download').addEventListener('click', downloadDemData);
    container.querySelector('#tile-dem-use-route').addEventListener('click', useRouteAreaForDem);
}

async function refreshDisplayTileStats() {
    const el = document.getElementById('tile-display-stats');
    if (!el) return;
    el.textContent = 'Caricamento...';

    try {
        if (typeof initOfflineMapsDB !== 'function') {
            el.textContent = 'Modulo offline maps non disponibile.';
            return;
        }
        const db = await initOfflineMapsDB();
        const tx = db.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');
        const countReq = store.count();
        countReq.onsuccess = () => {
            const count = countReq.result;
            if (count === 0) {
                el.textContent = 'Nessuna tile memorizzata.';
            } else {
                el.textContent = `${count} tile memorizzate nel browser (IndexedDB).`;
            }
        };
        countReq.onerror = () => { el.textContent = 'Errore lettura IndexedDB.'; };
    } catch (err) {
        el.textContent = 'Errore: ' + err.message;
    }
}

async function clearDisplayTileCache() {
    if (!confirm('Cancellare tutte le tile offline dal browser?')) return;
    try {
        if (typeof initOfflineMapsDB !== 'function') return;
        const db = await initOfflineMapsDB();
        const tx = db.transaction('tiles', 'readwrite');
        tx.objectStore('tiles').clear();
        tx.oncomplete = () => {
            refreshDisplayTileStats();
            if (typeof showToast === 'function') showToast('Cache tile cancellata', 'success');
        };
    } catch (err) {
        console.error('Clear tile cache error:', err);
    }
}

async function refreshValhallaStatus() {
    const el = document.getElementById('tile-valhalla-status');
    if (!el) return;
    el.textContent = 'Caricamento...';

    try {
        const response = await fetch('/api/routing/status');
        if (!response.ok) throw new Error('Status request failed');
        const data = await response.json();
        const lines = [];
        lines.push(`Stato: ${data.status || 'sconosciuto'}`);
        if (data.mode) lines.push(`Modalità: ${data.mode}`);
        if (data.tileSource) lines.push(`Sorgente tile: ${data.tileSource}`);
        if (data.tilesLoaded !== undefined) lines.push(`Tile caricate: ${data.tilesLoaded}`);
        el.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    } catch (err) {
        el.textContent = 'Impossibile contattare il server Valhalla: ' + err.message;
    }
}

async function refreshDemStatus() {
    const el = document.getElementById('tile-dem-status');
    if (!el) return;
    el.textContent = 'Caricamento stato...';

    try {
        const response = await fetch('/api/elevation/status');
        if (!response.ok) throw new Error('Status request failed');
        const data = await response.json();
        if (data.available) {
            el.innerHTML = `<div>Cache disponibile: <strong>${data.cacheEntries}</strong> punti</div>
                <div>File: ${data.cacheFiles} | Dimensione: ${data.cacheSizeMB} MB</div>`;
        } else {
            el.textContent = 'Nessun dato di elevazione in cache. Scarica i dati per l\'area desiderata.';
        }
    } catch (err) {
        el.textContent = 'Errore: ' + err.message;
    }
}

async function clearDemCache() {
    if (!confirm('Cancellare tutti i dati di elevazione in cache?')) return;
    try {
        const response = await fetch('/api/elevation/cache', { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        refreshDemStatus();
        if (typeof showToast === 'function') showToast('Cache elevazione cancellata', 'success');
    } catch (err) {
        console.error('Clear DEM cache error:', err);
        if (typeof showToast === 'function') showToast('Errore cancellazione cache: ' + err.message, 'error');
    }
}

function useRouteAreaForDem() {
    if (typeof AppState === 'undefined' || !AppState.route || !AppState.route.coordinates || AppState.route.coordinates.length === 0) {
        if (typeof showToast === 'function') showToast('Nessuna route disponibile', 'warn');
        return;
    }
    const coords = AppState.route.coordinates;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    coords.forEach(c => {
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
        if (c[0] < minLon) minLon = c[0];
        if (c[0] > maxLon) maxLon = c[0];
    });
    // Add small padding
    const padLat = (maxLat - minLat) * 0.1 || 0.01;
    const padLon = (maxLon - minLon) * 0.1 || 0.01;
    document.getElementById('dem-min-lat').value = (minLat - padLat).toFixed(4);
    document.getElementById('dem-max-lat').value = (maxLat + padLat).toFixed(4);
    document.getElementById('dem-min-lon').value = (minLon - padLon).toFixed(4);
    document.getElementById('dem-max-lon').value = (maxLon + padLon).toFixed(4);
    if (typeof showToast === 'function') showToast('Area route impostata', 'info');
}

async function downloadDemData() {
    const minLat = parseFloat(document.getElementById('dem-min-lat').value);
    const maxLat = parseFloat(document.getElementById('dem-max-lat').value);
    const minLon = parseFloat(document.getElementById('dem-min-lon').value);
    const maxLon = parseFloat(document.getElementById('dem-max-lon').value);
    const resolution = parseFloat(document.getElementById('dem-resolution').value) || 0.01;

    if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
        if (typeof showToast === 'function') showToast('Inserisci tutti i valori dei limiti', 'warn');
        return;
    }
    if (minLat >= maxLat || minLon >= maxLon) {
        if (typeof showToast === 'function') showToast('I limiti non sono validi (min deve essere < max)', 'warn');
        return;
    }

    // Estimate point count
    const latSteps = Math.ceil((maxLat - minLat) / resolution);
    const lonSteps = Math.ceil((maxLon - minLon) / resolution);
    const totalPoints = latSteps * lonSteps;

    if (totalPoints > 50000) {
        if (!confirm(`Stai per scaricare ~${totalPoints.toLocaleString('it-IT')} punti di elevazione. Questo potrebbe richiedere molto tempo. Continuare?`)) return;
    }

    const progressCard = document.getElementById('tile-dem-progress-card');
    const progressEl = document.getElementById('tile-dem-progress');
    progressCard.style.display = 'block';
    progressEl.textContent = `Download in corso... (~${totalPoints} punti)`;

    const btn = document.getElementById('tile-dem-download');
    btn.disabled = true;

    try {
        const response = await fetch('/api/elevation/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bounds: { minLat, maxLat, minLon, maxLon },
                resolution
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        progressEl.innerHTML = `<div>Download completato!</div>
            <div>Punti scaricati: <strong>${data.downloaded}</strong></div>
            ${data.failed > 0 ? `<div style="color:#e74c3c">Punti falliti: ${data.failed}</div>` : ''}
            ${data.downloaded === 0 && data.failed === 0 ? '<div>Tutti i punti erano già in cache.</div>' : ''}`;
        refreshDemStatus();
        if (typeof showToast === 'function') showToast(`Dati elevazione scaricati: ${data.downloaded} punti`, 'success');
    } catch (err) {
        progressEl.textContent = 'Errore: ' + err.message;
        if (typeof showToast === 'function') showToast('Errore download elevazione: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

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
                        <h3>Tile DEM (elevazione)</h3>
                        <p>Tile DEM per calcoli elevazione lato server. Attualmente l'app usa l'API Open-Meteo via proxy.</p>
                        <div class="tile-mgr-status" id="tile-dem-status">DEM server-side non ancora implementato. L'elevazione usa proxy Open-Meteo.</div>
                    </div>
                    <div class="tile-mgr-card">
                        <h3>Configurazione elevazione</h3>
                        <p>Endpoint proxy: <code>/api/elevation</code> — invia coordinate, riceve elevazioni.</p>
                        <p>Retry: 3 tentativi con backoff. Batch: 100 punti per richiesta.</p>
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

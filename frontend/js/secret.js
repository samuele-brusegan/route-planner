// Secret route list — lists all available app pages and saved routes
// Loaded dynamically by router.js when path is /secret

function initSecret(container) {
    container.innerHTML = `
        <style>
            .secret-page {
                max-width: 800px;
                margin: 0 auto;
                padding: 40px 20px;
                color: var(--text);
            }
            .secret-page h1 {
                font-size: 28px;
                margin-bottom: 8px;
            }
            .secret-page .subtitle {
                color: var(--text-muted);
                font-size: 14px;
                margin-bottom: 32px;
            }
            .secret-back {
                display: inline-block;
                margin-bottom: 24px;
                color: var(--accent);
                text-decoration: none;
                font-size: 14px;
            }
            .secret-back:hover {
                text-decoration: underline;
            }
            .secret-section {
                margin-bottom: 40px;
            }
            .secret-section h2 {
                font-size: 18px;
                margin-bottom: 16px;
                border-bottom: 1px solid var(--border);
                padding-bottom: 8px;
            }
            .secret-page-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 12px;
            }
            .secret-page-card {
                background: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 16px;
                text-decoration: none;
                color: var(--text);
                transition: border-color 0.2s, background 0.2s;
            }
            .secret-page-card:hover {
                border-color: var(--accent);
                background: var(--bg-alt);
            }
            .secret-page-card h3 {
                font-size: 15px;
                margin: 0 0 6px;
            }
            .secret-page-card .url {
                font-size: 12px;
                color: var(--accent);
                font-family: monospace;
                margin-bottom: 6px;
            }
            .secret-page-card .desc {
                font-size: 12px;
                color: var(--text-muted);
            }
            .secret-saved-route {
                background: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 12px 16px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .secret-saved-route-info {
                flex: 1;
            }
            .secret-saved-route-info h4 {
                font-size: 14px;
                margin: 0 0 4px;
            }
            .secret-saved-route-info .meta {
                font-size: 11px;
                color: var(--text-muted);
            }
            .secret-saved-route-actions {
                display: flex;
                gap: 8px;
            }
            .secret-saved-route-actions button {
                padding: 4px 10px;
                font-size: 12px;
                border-radius: var(--radius-sm);
                border: 1px solid var(--border);
                background: var(--bg-alt);
                color: var(--text);
                cursor: pointer;
            }
            .secret-saved-route-actions button:hover {
                background: var(--accent-light);
            }
            .secret-saved-route-actions button.delete:hover {
                border-color: #e74c3c;
                color: #e74c3c;
            }
            .secret-empty {
                color: var(--text-muted);
                font-size: 13px;
                padding: 20px;
                text-align: center;
            }
        </style>
        <div class="secret-page">
            <a href="/" class="secret-back">← Torna all'app</a>
            <h1>Route List</h1>
            <p class="subtitle">Pagine disponibili e route salvate</p>

            <div class="secret-section">
                <h2>Pagine</h2>
                <div class="secret-page-list" id="secret-pages-list"></div>
            </div>

            <div class="secret-section">
                <h2>Route salvate</h2>
                <div id="secret-saved-routes"></div>
            </div>
        </div>
    `;

    renderSecretPages();
    renderSavedRoutes();
}

const SECRET_PAGES = [
    { url: '/', name: 'Route Planner', desc: 'App principale: pianifica route con routing Valhalla' },
    { url: '/gpx-inspector', name: 'GPX Inspector', desc: 'Ispeziona file GPX e ZIP su mappa' },
    { url: '/offline-maps', name: 'Mappe Offline', desc: 'Scarica tile per uso offline' },
    { url: '/map-manager', name: 'Gestione Mappe', desc: 'Scarica e gestisci tile Valhalla regionali' },
    { url: '/secret', name: 'Route List', desc: 'Questa pagina: lista pagine e route salvate' }
];

function renderSecretPages() {
    const container = document.getElementById('secret-pages-list');
    container.innerHTML = SECRET_PAGES.map(page => `
        <a href="${page.url}" class="secret-page-card">
            <h3>${page.name}</h3>
            <div class="url">${page.url}</div>
            <div class="desc">${page.desc}</div>
        </a>
    `).join('');
}

function renderSavedRoutes() {
    const container = document.getElementById('secret-saved-routes');
    const saved = loadSavedRoutes();

    if (saved.length === 0) {
        container.innerHTML = '<div class="secret-empty">Nessuna route salvata. Usa "Salva route" nell\'app per aggiungerne.</div>';
        return;
    }

    container.innerHTML = saved.map((route, idx) => `
        <div class="secret-saved-route">
            <div class="secret-saved-route-info">
                <h4>${escapeHtmlSecret(route.name)}</h4>
                <div class="meta">${route.markerCount} punti · ${route.distance.toFixed(1)} km · ${new Date(route.savedAt).toLocaleDateString('it-IT')}</div>
            </div>
            <div class="secret-saved-route-actions">
                <button onclick="loadSavedRoute(${idx})">Carica</button>
                <button class="delete" onclick="deleteSavedRoute(${idx})">Elimina</button>
            </div>
        </div>
    `).join('');
}

function loadSavedRoutes() {
    try {
        return JSON.parse(localStorage.getItem('routePlannerSavedRoutes') || '[]');
    } catch {
        return [];
    }
}

function saveSavedRoutes(routes) {
    localStorage.setItem('routePlannerSavedRoutes', JSON.stringify(routes));
}

function loadSavedRoute(idx) {
    const saved = loadSavedRoutes();
    if (idx < 0 || idx >= saved.length) return;
    const route = saved[idx];
    localStorage.setItem('routePlannerData', JSON.stringify(route.data));
    window.location.href = '/';
}

function deleteSavedRoute(idx) {
    const saved = loadSavedRoutes();
    if (idx < 0 || idx >= saved.length) return;
    saved.splice(idx, 1);
    saveSavedRoutes(saved);
    renderSavedRoutes();
}

function escapeHtmlSecret(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

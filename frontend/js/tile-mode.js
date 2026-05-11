// Routing engine mode + Valhalla local tile management.
// Backend endpoints (provided by routing service on :8002):
//   GET  /mode                  -> { mode: 'remote'|'local' }
//   POST /mode                  -> { mode }            (409 if no local tiles)
//   GET  /tiles/status          -> { hasLocalTiles, region, builtAt, ... }
//   GET  /tiles/regions         -> { regions: [...] }
//   POST /tiles/build           -> { jobId }
//   GET  /tiles/jobs/:id        -> { phase, progress, message, error }

const ROUTING_BASE_URL = window.ROUTING_API_URL || `${window.location.protocol}//${window.location.hostname}:8002`;

let _jobPollHandle = null;
let _statusPollHandle = null;

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
        const msg = (data && data.error) || `HTTP ${response.status}`;
        const err = new Error(msg);
        err.status = response.status;
        err.data = data;
        throw err;
    }
    return data;
}

async function getRoutingMode() {
    try {
        const data = await fetchJson(`${ROUTING_BASE_URL}/mode`);
        return data.mode;
    } catch (_) {
        return null;
    }
}

async function getTilesStatus() {
    try {
        return await fetchJson(`${ROUTING_BASE_URL}/tiles/status`);
    } catch (_) {
        return null;
    }
}

async function setRoutingMode(mode) {
    return fetchJson(`${ROUTING_BASE_URL}/mode`, { method: 'POST', body: { mode } });
}

async function getTilesRegions() {
    const data = await fetchJson(`${ROUTING_BASE_URL}/tiles/regions`);
    return data.regions || [];
}

async function startTilesBuild(regionId) {
    const data = await fetchJson(`${ROUTING_BASE_URL}/tiles/build`, {
        method: 'POST',
        body: { region: regionId }
    });
    return data.jobId;
}

async function getJob(jobId) {
    return fetchJson(`${ROUTING_BASE_URL}/tiles/jobs/${encodeURIComponent(jobId)}`);
}

// === UI ===

function ensureRoutingDialog() {
    let modal = document.getElementById('routing-engine-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'routing-engine-modal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; height: 100vh; overflow: auto">
            <div class="modal-header">
                <h3>Motore di Routing</h3>
                <button class="close-btn" data-close>&times;</button>
            </div>
            <div class="modal-body">
                <section class="settings-section">
                    <h4>Modalità</h4>
                    <label class="settings-row" for="routing-mode-remote">
                        <span>
                            <strong>Remoto</strong>
                            <small>Usa il servizio pubblico <code>valhalla1.openstreetmap.de</code>. Nessun setup, richiede internet.</small>
                        </span>
                        <input type="radio" id="routing-mode-remote" name="routing-mode" value="remote" class="settings-radio">
                    </label>
                    <label class="settings-row" for="routing-mode-local">
                        <span>
                            <strong>Locale</strong>
                            <small>Usa il motore Valhalla nel container. Richiede tile scaricate.</small>
                        </span>
                        <input type="radio" id="routing-mode-local" name="routing-mode" value="local" class="settings-radio">
                    </label>
                </section>

                <section class="settings-section">
                    <h4>Tile locali</h4>
                    <div id="routing-tiles-status" class="settings-info"></div>
                    <label class="settings-row" for="routing-region-select">
                        <span>
                            <strong>Regione</strong>
                            <small>Area geografica da scaricare e preparare.</small>
                        </span>
                        <select id="routing-region-select" class="settings-select"></select>
                    </label>
                    <div class="settings-row" style="cursor: default;">
                        <span>
                            <strong>Avvia preparazione</strong>
                            <small>Scarica il PBF da Geofabrik, builda i tile Valhalla, riavvia il motore.</small>
                        </span>
                        <button class="btn primary" id="routing-build-btn">Scarica e prepara</button>
                    </div>
                </section>

                <section id="routing-job-section" class="settings-section" style="display: none;">
                    <h4>Avanzamento</h4>
                    <div class="settings-row" style="cursor: default; grid-template-columns: 1fr;">
                        <div>
                            <div id="routing-job-phase" style="font-weight: 600; margin-bottom: 6px;"></div>
                            <progress id="routing-job-progress" max="100" value="0" style="width: 100%; height: 14px;"></progress>
                            <div id="routing-job-message" style="font-size: 0.85em; color: #6b7280; margin-top: 6px; word-break: break-word;"></div>
                        </div>
                    </div>
                </section>
            </div>
            <div class="modal-footer">
                <button class="btn secondary" data-close>Chiudi</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', () => closeRoutingDialog());
    });
    modal.querySelectorAll('input[name="routing-mode"]').forEach(input => {
        input.addEventListener('change', onRoutingModeChange);
    });
    document.getElementById('routing-build-btn').addEventListener('click', onRoutingBuildClick);

    return modal;
}

async function showRoutingEngineDialog() {
    const modal = ensureRoutingDialog();
    modal.style.display = 'block';

    await Promise.all([
        loadRegionsIntoSelect(),
        refreshRoutingDialog()
    ]);
}

function closeRoutingDialog() {
    const modal = document.getElementById('routing-engine-modal');
    if (modal) modal.style.display = 'none';
    stopJobPolling();
}

async function loadRegionsIntoSelect() {
    const select = document.getElementById('routing-region-select');
    if (!select) return;
    try {
        const regions = await getTilesRegions();
        select.innerHTML = regions.map(r =>
            `<option value="${r.id}">${r.label} (~${r.estMb}MB)</option>`
        ).join('');
    } catch (e) {
        select.innerHTML = `<option disabled>Errore caricamento regioni: ${e.message}</option>`;
    }
}

async function refreshRoutingDialog() {
    const [mode, status] = await Promise.all([getRoutingMode(), getTilesStatus()]);

    // Mode radio
    const radios = document.querySelectorAll('input[name="routing-mode"]');
    radios.forEach(r => { r.checked = (r.value === mode); });

    // Tile status
    const statusEl = document.getElementById('routing-tiles-status');
    if (statusEl) {
        statusEl.classList.remove('ok', 'warn');
        if (!status) {
            statusEl.classList.add('warn');
            statusEl.textContent = 'Stato tile non disponibile (admin Valhalla non raggiungibile).';
        } else if (status.hasLocalTiles) {
            const built = status.builtAt ? new Date(status.builtAt * 1000).toLocaleString() : 'sconosciuto';
            statusEl.classList.add('ok');
            statusEl.innerHTML = `✓ Tile presenti — regione: <strong>${status.region || 'sconosciuta'}</strong> · build: ${built}`;
        } else {
            statusEl.classList.add('warn');
            statusEl.innerHTML = '⚠ Nessuna tile locale. Scegli una regione e premi "Scarica e prepara".';
        }
    }

    // Disable Local radio if no tiles
    const localRadio = document.querySelector('input[name="routing-mode"][value="local"]');
    if (localRadio) {
        localRadio.disabled = !(status && status.hasLocalTiles);
    }
}

async function onRoutingModeChange(event) {
    const mode = event.target.value;
    try {
        await setRoutingMode(mode);
        showToast(`Modalità routing: ${mode === 'local' ? 'Locale' : 'Remoto'}`, 'success');
        updateTileModeUI(mode === 'local' ? 'local' : 'online', mode === 'local' ? 'local-valhalla' : 'online-valhalla');
    } catch (e) {
        showToast(`Impossibile cambiare modalità: ${e.message}`, 'error');
        await refreshRoutingDialog();
    }
}

async function onRoutingBuildClick() {
    const select = document.getElementById('routing-region-select');
    const btn = document.getElementById('routing-build-btn');
    if (!select || !btn) return;

    const region = select.value;
    if (!region) return;

    if (!confirm(`Avviare il download e la build delle tile per "${select.options[select.selectedIndex].text}"?\n\nIl processo può richiedere da pochi minuti a oltre un'ora a seconda della dimensione.`)) {
        return;
    }

    btn.disabled = true;
    try {
        const jobId = await startTilesBuild(region);
        startJobPolling(jobId);
        showToast('Job avviato', 'info');
    } catch (e) {
        btn.disabled = false;
        showToast(`Avvio fallito: ${e.message}`, 'error');
    }
}

function startJobPolling(jobId) {
    stopJobPolling();
    const section = document.getElementById('routing-job-section');
    if (section) section.style.display = 'block';

    const tick = async () => {
        try {
            const job = await getJob(jobId);
            renderJob(job);
            if (job.phase === 'done') {
                stopJobPolling();
                showToast('Tile pronte!', 'success');
                document.getElementById('routing-build-btn').disabled = false;
                await refreshRoutingDialog();
                // Auto-switch to local
                try {
                    await setRoutingMode('local');
                    await refreshRoutingDialog();
                    showToast('Modalità locale attivata', 'success');
                } catch (_) {}
                return;
            }
            if (job.phase === 'error') {
                stopJobPolling();
                showToast(`Errore build: ${job.error || job.message}`, 'error');
                document.getElementById('routing-build-btn').disabled = false;
                return;
            }
        } catch (e) {
            // keep polling for a while; admin might be restarting valhalla_service
            console.warn('job poll error', e);
        }
        _jobPollHandle = setTimeout(tick, 2000);
    };
    tick();
}

function stopJobPolling() {
    if (_jobPollHandle) {
        clearTimeout(_jobPollHandle);
        _jobPollHandle = null;
    }
}

function renderJob(job) {
    const phaseEl = document.getElementById('routing-job-phase');
    const progEl = document.getElementById('routing-job-progress');
    const msgEl = document.getElementById('routing-job-message');
    if (!phaseEl || !progEl || !msgEl) return;
    const phaseLabels = {
        queued: 'In coda',
        download: 'Download PBF',
        stopping: 'Arresto motore',
        clean: 'Pulizia',
        build: 'Build tile',
        extract: 'Build extract',
        restart: 'Riavvio motore',
        done: 'Completato',
        error: 'Errore'
    };
    phaseEl.textContent = phaseLabels[job.phase] || job.phase;
    progEl.value = Number(job.progress || 0);
    msgEl.textContent = job.message || '';
}

// === Indicator in main UI ===

function updateTileModeUI(mode, backend) {
    const modeText = mode === 'local' ? 'Locale' : 'Remoto';
    const backendText = backend || '';
    document.querySelectorAll('.tile-mode-indicator').forEach(el => {
        el.textContent = `Routing: ${modeText}${backendText ? ' (' + backendText + ')' : ''}`;
    });
}

async function checkTileMode() {
    try {
        const response = await fetch(`${ROUTING_BASE_URL}/status`);
        if (response.ok) {
            const status = await response.json();
            updateTileModeUI(status.profile === 'local' ? 'local' : 'online', status.backend);
        }
    } catch (_) {
        // routing not reachable
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    checkTileMode();
    if (_statusPollHandle) clearInterval(_statusPollHandle);
    _statusPollHandle = setInterval(checkTileMode, 30000);
});

// Expose for menu wiring
window.showRoutingEngineDialog = showRoutingEngineDialog;

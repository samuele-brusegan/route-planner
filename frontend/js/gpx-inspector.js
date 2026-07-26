// GPX Inspector — standalone view for inspecting GPX files
// Loaded dynamically by router.js when path is /gpx-inspector

let gpxInspectorMap = null;
let gpxInspectorLayers = [];
let gpxInspectorData = [];

const GPX_INSPECTOR_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a'
];

function initGpxInspector(container) {
    container.innerHTML = `
        <style>
            .gpx-inspector-layout {
                display: flex;
                height: 100%;
                width: 100%;
            }
            .gpx-inspector-sidebar {
                width: 380px;
                min-width: 380px;
                background: var(--bg-alt);
                border-right: 1px solid var(--border);
                overflow-y: auto;
                padding: 16px;
                box-sizing: border-box;
            }
            .gpx-inspector-map {
                flex: 1;
                position: relative;
            }
            .gpx-inspector-map .ol-map {
                width: 100%;
                height: 100%;
            }
            .gpx-inspector-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
            }
            .gpx-inspector-header h1 {
                font-size: 18px;
                margin: 0;
                color: var(--text);
            }
            .gpx-inspector-back {
                background: var(--bg-card);
                border: 1px solid var(--border);
                color: var(--text);
                padding: 6px 12px;
                border-radius: var(--radius-sm);
                cursor: pointer;
                font-size: 13px;
                text-decoration: none;
            }
            .gpx-inspector-back:hover {
                background: var(--accent-light);
            }
            .gpx-inspector-import {
                margin-bottom: 16px;
            }
            .gpx-inspector-import-btn {
                display: block;
                width: 100%;
                padding: 12px;
                background: var(--accent);
                color: #fff;
                border: none;
                border-radius: var(--radius-md);
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                text-align: center;
                margin-bottom: 8px;
            }
            .gpx-inspector-import-btn:hover {
                opacity: 0.9;
            }
            .gpx-inspector-hint {
                font-size: 11px;
                color: var(--text-muted);
                text-align: center;
            }
            .gpx-file-card {
                background: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 12px;
                margin-bottom: 12px;
            }
            .gpx-file-card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            .gpx-file-card-header h3 {
                font-size: 13px;
                margin: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 260px;
            }
            .gpx-file-card-toggle {
                cursor: pointer;
                font-size: 18px;
                color: var(--text-muted);
            }
            .gpx-file-card-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 4px;
                font-size: 11px;
                color: var(--text-muted);
            }
            .gpx-file-card-stats span {
                font-weight: 600;
                color: var(--text);
            }
            .gpx-track-item {
                padding: 6px 8px;
                margin-top: 6px;
                background: var(--bg-alt);
                border-radius: var(--radius-sm);
                font-size: 12px;
                border-left: 3px solid var(--border);
            }
            .gpx-track-item-name {
                font-weight: 600;
                color: var(--text);
            }
            .gpx-track-item-stats {
                color: var(--text-muted);
                font-size: 11px;
                margin-top: 2px;
            }
            .gpx-waypoint-item {
                padding: 4px 8px;
                font-size: 11px;
                color: var(--text-muted);
                border-left: 2px solid var(--border);
                margin-left: 8px;
            }
            .gpx-empty {
                text-align: center;
                color: var(--text-muted);
                padding: 40px 20px;
                font-size: 14px;
            }
        </style>
        <div class="gpx-inspector-layout">
            <div class="gpx-inspector-sidebar">
                <div class="gpx-inspector-header">
                    <h1>GPX Inspector</h1>
                    <a href="/" class="gpx-inspector-back">← Torna</a>
                </div>
                <div class="gpx-inspector-import">
                    <button class="gpx-inspector-import-btn" id="gpx-import-btn">
                        Importa GPX / ZIP
                    </button>
                    <input type="file" id="gpx-file-input" accept=".gpx,.zip" multiple style="display:none">
                    <div class="gpx-inspector-hint">Supporta file .gpx e .zip contenenti GPX</div>
                </div>
                <div id="gpx-files-list">
                    <div class="gpx-empty">Nessun file caricato.<br>Importa uno o più file GPX per visualizzarli.</div>
                </div>
            </div>
            <div class="gpx-inspector-map">
                <div id="gpx-inspector-map" class="ol-map"></div>
            </div>
        </div>
    `;

    initGpxInspectorMap();

    const fileInput = document.getElementById('gpx-file-input');
    const importBtn = document.getElementById('gpx-import-btn');

    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleGpxFileImport(e.target.files));
}

function initGpxInspectorMap() {
    gpxInspectorMap = new ol.Map({
        target: 'gpx-inspector-map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.XYZ({
                    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
                    attributions: '© OpenTopoMap, © OpenStreetMap contributors',
                    maxZoom: 17
                })
            })
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([10, 44]),
            zoom: 5
        })
    });
}

async function handleGpxFileImport(fileList) {
    if (!fileList || fileList.length === 0) return;

    for (const file of fileList) {
        if (file.name.toLowerCase().endsWith('.zip')) {
            if (typeof JSZip === 'undefined') {
                alert('Libreria ZIP non caricata.');
                continue;
            }
            try {
                const zip = await JSZip.loadAsync(file);
                for (const filename of Object.keys(zip.files)) {
                    if (filename.toLowerCase().endsWith('.gpx')) {
                        const content = await zip.files[filename].async('string');
                        const parsed = parseGPX(content, filename);
                        if (parsed) gpxInspectorData.push(parsed);
                    }
                }
            } catch (err) {
                console.error('ZIP extraction error:', err);
                alert('Errore lettura ZIP: ' + err.message);
            }
        } else if (file.name.toLowerCase().endsWith('.gpx')) {
            const text = await file.text();
            const parsed = parseGPX(text, file.name);
            if (parsed) gpxInspectorData.push(parsed);
        }
    }

    renderGpxInspectorFiles();
    renderGpxInspectorOnMap();
}

function parseGPX(gpxString, filename) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(gpxString, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) throw new Error('Invalid GPX XML');

        const tracks = [];
        const trkElements = doc.querySelectorAll('trk');
        trkElements.forEach(trk => {
            const trkName = trk.querySelector('name')?.textContent || 'Track';
            const segments = [];
            trk.querySelectorAll('trkseg').forEach(seg => {
                const points = [];
                seg.querySelectorAll('trkpt').forEach(pt => {
                    const lat = parseFloat(pt.getAttribute('lat'));
                    const lon = parseFloat(pt.getAttribute('lon'));
                    const ele = pt.querySelector('ele')?.textContent;
                    points.push({
                        lat, lon,
                        elevation: ele ? parseFloat(ele) : null
                    });
                });
                if (points.length > 0) segments.push(points);
            });
            if (segments.length > 0) {
                tracks.push({ name: trkName, segments });
            }
        });

        const routes = [];
        doc.querySelectorAll('rte').forEach(rte => {
            const rteName = rte.querySelector('name')?.textContent || 'Route';
            const points = [];
            rte.querySelectorAll('rtept').forEach(pt => {
                const lat = parseFloat(pt.getAttribute('lat'));
                const lon = parseFloat(pt.getAttribute('lon'));
                const ele = pt.querySelector('ele')?.textContent;
                points.push({ lat, lon, elevation: ele ? parseFloat(ele) : null });
            });
            if (points.length > 0) routes.push({ name: rteName, points });
        });

        const waypoints = [];
        doc.querySelectorAll('wpt').forEach(wpt => {
            const lat = parseFloat(wpt.getAttribute('lat'));
            const lon = parseFloat(wpt.getAttribute('lon'));
            const ele = wpt.querySelector('ele')?.textContent;
            const name = wpt.querySelector('name')?.textContent || '';
            const desc = wpt.querySelector('desc')?.textContent || '';
            waypoints.push({ lat, lon, name, desc, elevation: ele ? parseFloat(ele) : null });
        });

        return { filename, tracks, routes, waypoints, visible: true };
    } catch (err) {
        console.error('GPX parse error for', filename, err);
        return null;
    }
}

function renderGpxInspectorFiles() {
    const container = document.getElementById('gpx-files-list');
    if (gpxInspectorData.length === 0) {
        container.innerHTML = '<div class="gpx-empty">Nessun file caricato.</div>';
        return;
    }

    container.innerHTML = gpxInspectorData.map((file, fileIdx) => {
        const color = GPX_INSPECTOR_COLORS[fileIdx % GPX_INSPECTOR_COLORS.length];
        const totalPoints = file.tracks.reduce((sum, t) => sum + t.segments.reduce((s, seg) => s + seg.length, 0), 0);
        const totalDist = file.tracks.reduce((sum, t) => sum + calculateTrackDistance(t), 0);
        const hasElevation = file.tracks.some(t => t.segments.some(seg => seg.some(p => p.elevation !== null)));
        const ascent = hasElevation ? calculateAscent(file.tracks) : null;
        const descent = hasElevation ? calculateDescent(file.tracks) : null;

        let tracksHtml = '';
        file.tracks.forEach((track, trackIdx) => {
            const trackDist = calculateTrackDistance(track);
            const trackPoints = track.segments.reduce((s, seg) => s + seg.length, 0);
            tracksHtml += `
                <div class="gpx-track-item" style="border-left-color: ${color}">
                    <div class="gpx-track-item-name">${escapeHtml(track.name)}</div>
                    <div class="gpx-track-item-stats">${trackPoints} punti · ${trackDist.toFixed(2)} km</div>
                </div>
            `;
        });

        let waypointsHtml = '';
        if (file.waypoints.length > 0) {
            waypointsHtml = file.waypoints.map(wpt => `
                <div class="gpx-waypoint-item">
                    ${escapeHtml(wpt.name || 'WP')} · ${wpt.lat.toFixed(5)}, ${wpt.lon.toFixed(5)}
                    ${wpt.elevation !== null ? ' · ' + Math.round(wpt.elevation) + 'm' : ''}
                </div>
            `).join('');
        }

        return `
            <div class="gpx-file-card">
                <div class="gpx-file-card-header">
                    <h3 style="color: ${color}">${escapeHtml(file.filename)}</h3>
                    <span class="gpx-file-card-toggle" data-idx="${fileIdx}">${file.visible ? '👁' : '🚫'}</span>
                </div>
                <div class="gpx-file-card-stats">
                    <div>Tracce: <span>${file.tracks.length}</span></div>
                    <div>Punti: <span>${totalPoints}</span></div>
                    <div>Distanza: <span>${totalDist.toFixed(2)} km</span></div>
                    <div>Waypoint: <span>${file.waypoints.length}</span></div>
                    ${ascent !== null ? `<div>Salita: <span>${ascent} m</span></div>` : ''}
                    ${descent !== null ? `<div>Discesa: <span>${descent} m</span></div>` : ''}
                </div>
                ${tracksHtml}
                ${waypointsHtml}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.gpx-file-card-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const idx = parseInt(toggle.dataset.idx);
            gpxInspectorData[idx].visible = !gpxInspectorData[idx].visible;
            renderGpxInspectorFiles();
            renderGpxInspectorOnMap();
        });
    });
}

function renderGpxInspectorOnMap() {
    gpxInspectorLayers.forEach(layer => gpxInspectorMap.removeLayer(layer));
    gpxInspectorLayers = [];

    const allCoords = [];

    gpxInspectorData.forEach((file, fileIdx) => {
        if (!file.visible) return;
        const color = GPX_INSPECTOR_COLORS[fileIdx % GPX_INSPECTOR_COLORS.length];

        file.tracks.forEach(track => {
            track.segments.forEach(seg => {
                const coords = seg.map(p => ol.proj.fromLonLat([p.lon, p.lat]));
                if (coords.length < 2) return;
                allCoords.push(...coords);
                const feature = new ol.Feature({
                    geometry: new ol.geom.LineString(coords)
                });
                feature.setStyle(new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: color, width: 3 })
                }));
                const layer = new ol.layer.Vector({
                    source: new ol.source.Vector({ features: [feature] })
                });
                gpxInspectorMap.addLayer(layer);
                gpxInspectorLayers.push(layer);
            });
        });

        if (file.waypoints.length > 0) {
            const wptFeatures = file.waypoints.map(wpt => {
                const f = new ol.Feature({
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([wpt.lon, wpt.lat]))
                });
                f.setStyle(new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 6,
                        fill: new ol.style.Fill({ color: color }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                    }),
                    text: wpt.name ? new ol.style.Text({
                        text: wpt.name,
                        font: '11px sans-serif',
                        fill: new ol.style.Fill({ color: '#fff' }),
                        stroke: new ol.style.Stroke({ color: color, width: 3 }),
                        offsetY: -15
                    }) : undefined
                }));
                return f;
            });
            const wptLayer = new ol.layer.Vector({
                source: new ol.source.Vector({ features: wptFeatures })
            });
            gpxInspectorMap.addLayer(wptLayer);
            gpxInspectorLayers.push(wptLayer);
            allCoords.push(...file.waypoints.map(wpt => ol.proj.fromLonLat([wpt.lon, wpt.lat])));
        }
    });

    if (allCoords.length > 0) {
        const extent = ol.extent.boundingExtent(allCoords);
        gpxInspectorMap.getView().fit(extent, { padding: [50, 50, 50, 50] });
    }
}

function calculateTrackDistance(track) {
    let dist = 0;
    track.segments.forEach(seg => {
        for (let i = 1; i < seg.length; i++) {
            dist += haversineDistance(seg[i-1].lat, seg[i-1].lon, seg[i].lat, seg[i].lon);
        }
    });
    return dist;
}

function calculateAscent(tracks) {
    let ascent = 0;
    tracks.forEach(track => {
        track.segments.forEach(seg => {
            for (let i = 1; i < seg.length; i++) {
                if (seg[i].elevation !== null && seg[i-1].elevation !== null) {
                    const diff = seg[i].elevation - seg[i-1].elevation;
                    if (diff > 0) ascent += diff;
                }
            }
        });
    });
    return Math.round(ascent);
}

function calculateDescent(tracks) {
    let descent = 0;
    tracks.forEach(track => {
        track.segments.forEach(seg => {
            for (let i = 1; i < seg.length; i++) {
                if (seg[i].elevation !== null && seg[i-1].elevation !== null) {
                    const diff = seg[i].elevation - seg[i-1].elevation;
                    if (diff < 0) descent += Math.abs(diff);
                }
            }
        });
    });
    return Math.round(descent);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

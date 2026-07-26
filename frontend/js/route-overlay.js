// Multiple route overlay — load GPX files as overlay routes on the map
// Each route gets a distinct color and can be toggled on/off

let overlayRouteLayer = null;
let overlayRoutes = [];

const OVERLAY_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a'
];

function initOverlayRoutes() {
    if (!map) return;
    overlayRouteLayer = new ol.layer.Vector({
        source: new ol.source.Vector()
    });
    map.addLayer(overlayRouteLayer);
}

function getOverlayRoutes() {
    return overlayRoutes;
}

async function addOverlayRouteFromFile(file) {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
        showToast('Solo file GPX supportati per overlay', 'warn');
        return;
    }

    if (typeof JSZip !== 'undefined' && file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        for (const filename of Object.keys(zip.files)) {
            if (filename.toLowerCase().endsWith('.gpx')) {
                const content = await zip.files[filename].async('string');
                addOverlayRouteFromGPX(content, filename);
            }
        }
    } else {
        const text = await file.text();
        addOverlayRouteFromGPX(text, file.name);
    }

    renderOverlayPanel();
    renderOverlayRoutesOnMap();
}

function addOverlayRouteFromGPX(gpxString, filename) {
    const parsed = parseOverlayGPX(gpxString, filename);
    if (!parsed) {
        showToast('Errore parsing GPX: ' + filename, 'error');
        return;
    }
    const color = OVERLAY_COLORS[overlayRoutes.length % OVERLAY_COLORS.length];
    parsed.color = color;
    parsed.visible = true;
    overlayRoutes.push(parsed);
    showToast(`Aggiunto: ${filename}`, 'success');
}

function parseOverlayGPX(gpxString, filename) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(gpxString, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) throw new Error('Invalid GPX');

        const coordinates = [];
        doc.querySelectorAll('trkpt').forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            coordinates.push([lon, lat]);
        });

        if (coordinates.length < 2) {
            doc.querySelectorAll('rtept').forEach(pt => {
                const lat = parseFloat(pt.getAttribute('lat'));
                const lon = parseFloat(pt.getAttribute('lon'));
                coordinates.push([lon, lat]);
            });
        }

        if (coordinates.length < 2) return null;

        let dist = 0;
        for (let i = 1; i < coordinates.length; i++) {
            dist += haversineDistance(coordinates[i-1][1], coordinates[i-1][0], coordinates[i][1], coordinates[i][0]);
        }

        return { filename, coordinates, distance: dist, visible: true };
    } catch (err) {
        console.error('Overlay GPX parse error:', err);
        return null;
    }
}

function renderOverlayRoutesOnMap() {
    if (!overlayRouteLayer) initOverlayRoutes();
    overlayRouteLayer.getSource().clear();

    overlayRoutes.forEach(route => {
        if (!route.visible) return;
        const coords = route.coordinates.map(c => ol.proj.fromLonLat(c));
        const feature = new ol.Feature({
            geometry: new ol.geom.LineString(coords)
        });
        feature.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: route.color,
                width: 3
            })
        }));
        overlayRouteLayer.getSource().addFeature(feature);
    });
}

function renderOverlayPanel() {
    const container = document.getElementById('overlay-routes-list');
    if (!container) return;

    if (overlayRoutes.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Nessuna route overlay caricata.</div>';
        return;
    }

    container.innerHTML = overlayRoutes.map((route, idx) => `
        <div class="overlay-route-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="width:12px;height:12px;border-radius:50%;background:${route.color};flex-shrink:0"></span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtmlOverlay(route.filename)}</span>
            <span style="font-size:11px;color:var(--text-muted)">${route.distance.toFixed(1)}km</span>
            <input type="checkbox" ${route.visible ? 'checked' : ''} data-idx="${idx}" class="overlay-toggle">
            <button data-idx="${idx}" class="overlay-remove" style="border:none;background:none;color:#e74c3c;cursor:pointer;font-size:16px">×</button>
        </div>
    `).join('');

    container.querySelectorAll('.overlay-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = parseInt(cb.dataset.idx);
            overlayRoutes[idx].visible = cb.checked;
            renderOverlayRoutesOnMap();
        });
    });

    container.querySelectorAll('.overlay-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            overlayRoutes.splice(idx, 1);
            renderOverlayPanel();
            renderOverlayRoutesOnMap();
        });
    });
}

function clearOverlayRoutes() {
    overlayRoutes = [];
    renderOverlayPanel();
    renderOverlayRoutesOnMap();
}

function fitMapToOverlayRoutes() {
    if (!overlayRouteLayer || overlayRoutes.length === 0) return;
    const extent = overlayRouteLayer.getSource().getExtent();
    if (extent && !ol.extent.isEmpty(extent)) {
        map.getView().fit(extent, { padding: [50, 50, 50, 50] });
    }
}

function escapeHtmlOverlay(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// GPX Import with Douglas-Peucker simplification for large tracks

// Import GPX file
async function importGPX(file) {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        showToast('File GPX non valido', 'error');
        return;
    }

    const trkpts = doc.querySelectorAll('trkpt');
    if (trkpts.length < 2) {
        showToast('GPX senza tracce valide', 'error');
        return;
    }

    let points = [];
    trkpts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const nameEl = pt.querySelector('name');
            const eleEl = pt.querySelector('ele');
            points.push({
                lat,
                lon,
                name: nameEl ? nameEl.textContent : '',
                elevation: eleEl ? parseFloat(eleEl.textContent) : null
            });
        }
    });

    if (points.length < 2) {
        showToast('GPX senza coordinate valide', 'error');
        return;
    }

    // Simplify large tracks using Douglas-Peucker
    if (points.length > 5000) {
        showToast(`Semplificazione traccia (${points.length} → ~500 punti)...`, 'info');
        points = simplifyTrack(points, 500);
    }

    // Add as markers
    AppState.markers = points.map((pt, i) => ({
        id: Date.now() + i,
        lat: pt.lat,
        lon: pt.lon,
        name: pt.name || '',
        type: 'waypoint'
    }));

    // Update UI and calculate route
    if (typeof renderMarkers === 'function') renderMarkers();
    if (typeof calculateRoute === 'function') calculateRoute();
    if (typeof saveToLocalStorage === 'function') saveToLocalStorage();

    showToast(`GPX importato: ${AppState.markers.length} waypoint`, 'success');
}

// Douglas-Peucker simplification for track points
function simplifyTrack(points, maxPoints) {
    if (points.length <= maxPoints) return points;

    // First pass: uniform sampling to reduce to ~2x target
    const sampled = [];
    const step = Math.ceil(points.length / (maxPoints * 2));
    for (let i = 0; i < points.length; i += step) {
        sampled.push(points[i]);
    }
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
        sampled.push(points[points.length - 1]);
    }

    // Second pass: Douglas-Peucker to reduce to target
    const tolerance = calculateTolerance(sampled);
    const kept = douglasPeucker(sampled, tolerance);

    if (kept.length > maxPoints) {
        // If still too many, increase tolerance
        return douglasPeucker(sampled, tolerance * 2).slice(0, maxPoints);
    }

    return kept;
}

function calculateTolerance(points) {
    if (points.length < 2) return 0.0001;
    let maxDist = 0;
    const start = points[0];
    const end = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
        const d = perpDist(points[i], start, end);
        if (d > maxDist) maxDist = d;
    }
    return Math.max(maxDist * 0.1, 0.0001);
}

function douglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;

    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];

    while (stack.length > 0) {
        const [start, end] = stack.pop();
        let maxDist = 0;
        let maxIdx = -1;

        for (let i = start + 1; i < end; i++) {
            const d = perpDist(points[i], points[start], points[end]);
            if (d > maxDist) {
                maxDist = d;
                maxIdx = i;
            }
        }

        if (maxDist > tolerance && maxIdx !== -1) {
            keep[maxIdx] = true;
            stack.push([start, maxIdx]);
            stack.push([maxIdx, end]);
        }
    }

    return points.filter((_, i) => keep[i]);
}

function perpDist(point, lineStart, lineEnd) {
    const x = point.lon;
    const y = point.lat;
    const x1 = lineStart.lon;
    const y1 = lineStart.lat;
    const x2 = lineEnd.lon;
    const y2 = lineEnd.lat;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

    return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}

// Trigger file input for GPX import
function triggerGPXImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,application/gpx+xml,application/xml,text/xml';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) importGPX(file);
    };
    input.click();
}

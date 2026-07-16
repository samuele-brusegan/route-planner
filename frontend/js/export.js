// Export functionality
const EXPORT_API_URL = window.EXPORT_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

// Export GPX
async function exportGPX(splitByDays = false) {
    if (!AppState.route || AppState.markers.length < 2) {
        showExportToast('Nessuna route da esportare.', 'warning');
        return;
    }

    try {
        if (splitByDays) {
            const daySegments = buildNightSplitSegments();
            warnIfSplitLooksInvalid(daySegments);

            for (const segment of daySegments) {
                const dayGPX = await generateGPXContent(segment.route, segment.markers, segment.name);
                downloadGPX(dayGPX, `route-giorno-${segment.day}.gpx`);
            }
            showExportToast(`Esportati ${daySegments.length} file GPX per giorni.`, 'info');
            return;
        }

        const gpxContent = await generateGPXContent(AppState.route, AppState.markers, 'Route Completa');
        downloadGPX(gpxContent, 'route-completa.gpx');
        showExportToast('GPX completo esportato.', 'info');
    } catch (error) {
        console.error('GPX export error:', error);
        showExportToast(error.message || 'Errore durante esportazione GPX.', 'fatal');
    }
}

// Generate GPX content
async function generateGPXContent(route, markers, name) {
    const date = new Date().toISOString();
    const coordinates = Array.isArray(route?.coordinates) ? route.coordinates : [];
    const elevationData = await getElevationData(coordinates);

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Route Planner"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 https://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${date}</time>
  </metadata>
  
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
`;

    coordinates.forEach((coord, index) => {
        const elevation = elevationData[index]?.elevation;
        if (Number.isFinite(Number(elevation))) {
            gpx += `      <trkpt lat="${formatCoordinate(coord[1])}" lon="${formatCoordinate(coord[0])}">
        <ele>${Math.round(elevation)}</ele>
      </trkpt>\n`;
        } else {
            gpx += `      <trkpt lat="${formatCoordinate(coord[1])}" lon="${formatCoordinate(coord[0])}"></trkpt>\n`;
        }
    });

    gpx += `    </trkseg>
  </trk>
`;

    markers.forEach(marker => {
        const markerType = AppState.markerTypes.find(t => t.id === marker.type);
        const markerTypeName = markerType?.name || marker.type || 'Punto';
        const markerElevation = findNearestElevation(marker, coordinates, elevationData);
        gpx += `  <wpt lat="${formatCoordinate(marker.lat)}" lon="${formatCoordinate(marker.lon)}">
    <name>${escapeXml(marker.name || markerTypeName)}</name>
${Number.isFinite(Number(markerElevation)) ? `    <ele>${Math.round(markerElevation)}</ele>\n` : ''}    <type>${escapeXml(markerTypeName)}</type>
  </wpt>\n`;
    });

    gpx += `</gpx>`;

    return gpx;
}

function buildNightSplitSegments() {
    const markerCount = AppState.markers.length;
    const nightIndexes = AppState.markers
        .map((marker, index) => marker.type === 'night' ? index : -1)
        .filter(index => index > 0 && index < markerCount)
        .sort((a, b) => a - b);

    const segments = [];
    let startIndex = 0;
    let day = 1;

    nightIndexes.forEach(nightIndex => {
        if (nightIndex <= startIndex) return;

        segments.push({
            day,
            name: `Giorno ${day}`,
            markers: AppState.markers.slice(startIndex, nightIndex + 1),
            route: extractRouteSegment(startIndex, nightIndex)
        });

        startIndex = nightIndex;
        day += 1;
    });

    if (startIndex < markerCount - 1) {
        segments.push({
            day,
            name: `Giorno ${day}`,
            markers: AppState.markers.slice(startIndex),
            route: extractRouteSegment(startIndex, markerCount - 1)
        });
    }

    if (segments.length === 0) {
        segments.push({
            day: 1,
            name: 'Giorno 1',
            markers: AppState.markers,
            route: AppState.route
        });
    }

    return segments;
}

function extractRouteSegment(startIndex, endIndex) {
    const coordinates = Array.isArray(AppState.route?.coordinates) ? AppState.route.coordinates : [];
    if (coordinates.length === 0) {
        return AppState.route;
    }

    const markerRouteIndexes = getMarkerRouteIndexes(coordinates);
    const routeStartIndex = markerRouteIndexes[startIndex] ?? 0;
    const routeEndIndex = markerRouteIndexes[endIndex] ?? coordinates.length - 1;
    const from = Math.max(0, Math.min(routeStartIndex, routeEndIndex));
    const to = Math.min(coordinates.length - 1, Math.max(routeStartIndex, routeEndIndex));
    const segmentCoordinates = coordinates.slice(from, to + 1);

    if (segmentCoordinates.length > 0) {
        const startMarker = AppState.markers[startIndex];
        const endMarker = AppState.markers[endIndex];
        prependEndpointCoordinate(segmentCoordinates, startMarker);
        appendEndpointCoordinate(segmentCoordinates, endMarker);
    }

    return {
        ...AppState.route,
        coordinates: segmentCoordinates,
        distance: calculateCoordinateDistanceMeters(segmentCoordinates),
        time: estimateSegmentTime(segmentCoordinates)
    };
}

function warnIfSplitLooksInvalid(daySegments) {
    const fullLength = AppState.route?.coordinates?.length || 0;
    if (!fullLength || daySegments.length <= 1) return;

    const repeatedFullSegments = daySegments.filter(segment =>
        (segment.route?.coordinates?.length || 0) >= fullLength
    );

    if (repeatedFullSegments.length > 1) {
        showExportToast('Split GPX sospetto: alcuni giorni coprono ancora tutta la route. Ricalcola la route e riesporta.', 'fatal');
    }
}

function prependEndpointCoordinate(coordinates, marker) {
    if (!marker) return;
    const coordinate = [Number(marker.lon), Number(marker.lat)];
    const first = coordinates[0];
    if (!first || first[0] !== coordinate[0] || first[1] !== coordinate[1]) {
        coordinates.unshift(coordinate);
    }
}

function appendEndpointCoordinate(coordinates, marker) {
    if (!marker) return;
    const coordinate = [Number(marker.lon), Number(marker.lat)];
    const last = coordinates[coordinates.length - 1];
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) {
        coordinates.push(coordinate);
    }
}

function getMarkerRouteIndexes(routeCoordinates) {
    let minRouteIndex = 0;

    return AppState.markers.map(marker => {
        let bestIndex = minRouteIndex;
        let bestDistance = Infinity;

        for (let index = minRouteIndex; index < routeCoordinates.length; index++) {
            const coord = routeCoordinates[index];
            const distance = haversineDistance(marker.lat, marker.lon, coord[1], coord[0]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        }

        minRouteIndex = bestIndex;
        return bestIndex;
    });
}

function calculateCoordinateDistanceMeters(coordinates) {
    let total = 0;
    for (let index = 1; index < coordinates.length; index++) {
        total += haversineDistance(
            coordinates[index - 1][1],
            coordinates[index - 1][0],
            coordinates[index][1],
            coordinates[index][0]
        ) * 1000;
    }
    return total;
}

function estimateSegmentTime(coordinates) {
    const routeDistance = Number(AppState.route?.distance || 0);
    const routeTime = Number(AppState.route?.time || 0);
    const segmentDistance = calculateCoordinateDistanceMeters(coordinates);

    if (routeDistance > 0 && routeTime > 0) {
        return Math.round(routeTime * (segmentDistance / routeDistance));
    }

    return Math.round((segmentDistance / 1000 / 5) * 3600);
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(7) : String(value);
}

function findNearestElevation(marker, coordinates, elevationData) {
    if (!marker || !Array.isArray(coordinates) || !Array.isArray(elevationData) || coordinates.length === 0) {
        return null;
    }

    let bestIndex = 0;
    let bestDistance = Infinity;

    coordinates.forEach((coord, index) => {
        const distance = haversineDistance(marker.lat, marker.lon, coord[1], coord[0]);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    });

    return elevationData[bestIndex]?.elevation ?? null;
}

// Download GPX file
function downloadGPX(content, filename) {
    const blob = new Blob([content], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Export map as PNG (client-side)
async function exportMapPNG() {
    try {
        const dataUrl = await exportMapAsImage('png');
        if (dataUrl) {
            const response = await fetch(`${EXPORT_API_URL}/export/map/png`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageDataUrl: dataUrl })
            });

            if (!response.ok) {
                throw new Error('Errore nell\'esportazione PNG');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mappa-${new Date().toISOString().split('T')[0]}.png`;
            a.click();
            URL.revokeObjectURL(url);
            showExportToast('Mappa PNG esportata.', 'info');
        } else {
            showExportToast('Impossibile esportare la mappa: vista non disponibile.', 'warning');
        }
    } catch (error) {
        console.error('Export error:', error);
        showExportToast(error.message || 'Errore nell\'esportazione PNG.', 'fatal');
    }
}

// Export map as PDF (not available without Puppeteer)
async function exportMapPDF() {
    try {
        const dataUrl = await exportMapAsImage('png');
        if (!dataUrl) {
            showExportToast('Impossibile esportare la mappa: vista non disponibile.', 'warning');
            return;
        }

        const response = await fetch(`${EXPORT_API_URL}/export/map/pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageDataUrl: dataUrl,
                title: 'Route Planner - Mappa'
            })
        });

        if (!response.ok) {
            throw new Error('Errore nell\'esportazione PDF');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mappa-${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        showExportToast('Mappa PDF esportata.', 'info');
    } catch (error) {
        console.error('Export error:', error);
        showExportToast(error.message || 'Errore nell\'esportazione PDF mappa.', 'fatal');
    }
}

// Export directions as PDF
async function exportDirectionsPDF() {
    try {
        const response = await fetch(`${EXPORT_API_URL}/export/directions/pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                directions: AppState.directions,
                stats: AppState.stats,
                dailyStats: AppState.dailyStats
            })
        });
        
        if (!response.ok) {
            throw new Error('Errore nell\'esportazione');
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `indicazioni-${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        showExportToast('PDF indicazioni esportato.', 'info');
        
    } catch (error) {
        console.error('Export error:', error);
        showExportToast('Errore nell\'esportazione PDF. Verifica che il servizio di export sia attivo.', 'fatal');
    }
}

function showExportToast(message, level = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, level);
        return;
    }

    console[level === 'fatal' ? 'error' : 'warn'](message);
}

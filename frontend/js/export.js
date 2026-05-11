// Export functionality
const EXPORT_API_URL = window.EXPORT_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

// Export GPX
function exportGPX(splitByDays = false) {
    if (!AppState.route || AppState.markers.length < 2) {
        showToast('Nessuna route da esportare', 'warn');
        return;
    }
    
    let gpxContent = '';
    
    if (splitByDays) {
        // Export separate GPX for each day
        const nightMarkers = AppState.markers.filter(m => m.type === 'night');
        
        if (nightMarkers.length === 0) {
            // Single day
            gpxContent = generateGPXContent(AppState.route, AppState.markers, 'Giorno 1');
            downloadGPX(gpxContent, `route-giorno-1.gpx`);
        } else {
            let dayStartIndex = 0;
            let dayNumber = 1;

            nightMarkers.forEach((nightMarker) => {
                const nightIndex = AppState.markers.findIndex(m => m.id === nightMarker.id);
                const dayMarkers = AppState.markers.slice(dayStartIndex, nightIndex + 1);
                const dayRoute = extractRouteSegment(dayStartIndex, nightIndex);

                const dayGPX = generateGPXContent(dayRoute, dayMarkers, `Giorno ${dayNumber}`);
                downloadGPX(dayGPX, `route-giorno-${dayNumber}.gpx`);

                dayStartIndex = nightIndex;
                dayNumber++;
            });
            
            // Add remaining route as last day
            if (dayStartIndex < AppState.markers.length - 1) {
                const dayMarkers = AppState.markers.slice(dayStartIndex);
                const dayRoute = extractRouteSegment(dayStartIndex, AppState.markers.length - 1);
                
                const dayGPX = generateGPXContent(dayRoute, dayMarkers, `Giorno ${dayNumber}`);
                downloadGPX(dayGPX, `route-giorno-${dayNumber}.gpx`);
            }
        }
    } else {
        // Export full route
        gpxContent = generateGPXContent(AppState.route, AppState.markers, 'Route Completa');
        downloadGPX(gpxContent, 'route-completa.gpx');
    }
}

// Generate GPX content
function generateGPXContent(route, markers, name) {
    const date = new Date().toISOString();
    
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Route Planner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${date}</time>
  </metadata>
  
  <trk>
    <name>${name}</name>
    <trkseg>
`;
    
    if (route && route.coordinates) {
        route.coordinates.forEach(coord => {
            gpx += `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>\n`;
        });
    }
    
    gpx += `    </trkseg>
  </trk>
`;
    
    markers.forEach(marker => {
        const markerType = AppState.markerTypes.find(t => t.id === marker.type);
        gpx += `  <wpt lat="${marker.lat}" lon="${marker.lon}">
    <name>${marker.name}</name>
    <type>${markerType.name}</type>
  </wpt>\n`;
    });
    
    gpx += `</gpx>`;
    
    return gpx;
}

// Extract route segment between two marker indices
function extractRouteSegment(startMarkerIndex, endMarkerIndex) {
    if (!AppState.route || !AppState.route.coordinates || AppState.route.coordinates.length === 0) {
        return AppState.route;
    }

    const coords = AppState.route.coordinates;
    const startMarker = AppState.markers[startMarkerIndex];
    const endMarker = AppState.markers[endMarkerIndex];
    if (!startMarker || !endMarker) return AppState.route;

    const startRouteIdx = findClosestCoordinateIndex(coords, startMarker.lon, startMarker.lat);
    const endRouteIdx = findClosestCoordinateIndex(coords, endMarker.lon, endMarker.lat);

    const from = Math.min(startRouteIdx, endRouteIdx);
    const to = Math.max(startRouteIdx, endRouteIdx);
    const segmentCoords = coords.slice(from, to + 1);

    let segmentDistance = 0;
    for (let i = 1; i < segmentCoords.length; i++) {
        segmentDistance += haversineDistance(
            segmentCoords[i - 1][1], segmentCoords[i - 1][0],
            segmentCoords[i][1], segmentCoords[i][0]
        ) * 1000;
    }

    return {
        coordinates: segmentCoords,
        distance: segmentDistance,
        time: AppState.route.time
            ? Math.round(AppState.route.time * (segmentDistance / (AppState.route.distance || 1)))
            : 0,
        elevation: 0
    };
}

function findClosestCoordinateIndex(coordinates, lon, lat) {
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < coordinates.length; i++) {
        const d = Math.pow(coordinates[i][0] - lon, 2) + Math.pow(coordinates[i][1] - lat, 2);
        if (d < closestDist) {
            closestDist = d;
            closestIdx = i;
        }
    }
    return closestIdx;
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
        } else {
            showToast('Impossibile esportare la mappa. Assicurati che la mappa sia visibile.', 'warn');
        }
    } catch (error) {
        console.error('Export error:', error);
        showToast('Errore nell\'esportazione PNG', 'error');
    }
}

// Export map as PDF (not available without Puppeteer)
async function exportMapPDF() {
    try {
        const dataUrl = await exportMapAsImage('png');
        if (!dataUrl) {
            showToast('Impossibile esportare la mappa. Assicurati che la mappa sia visibile.', 'warn');
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
    } catch (error) {
        console.error('Export error:', error);
        showToast('Errore nell\'esportazione PDF mappa', 'error');
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
        
    } catch (error) {
        console.error('Export error:', error);
        showToast('Errore nell\'esportazione PDF. Verifica che il servizio di export sia attivo.', 'error');
    }
}

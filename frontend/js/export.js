// Export functionality
const EXPORT_API_URL = `${window.location.protocol}//${window.location.hostname}:3001`;

// Export GPX
function exportGPX(splitByDays = false) {
    if (!AppState.route || AppState.markers.length < 2) {
        alert('Nessuna route da esportare');
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
            // Multiple days
            nightMarkers.forEach((nightMarker, index) => {
                const nightIndex = AppState.markers.findIndex(m => m.id === nightMarker.id);
                const dayMarkers = AppState.markers.slice(0, nightIndex + 1);
                const dayRoute = extractRouteSegment(0, nightIndex);
                
                const dayGPX = generateGPXContent(dayRoute, dayMarkers, `Giorno ${index + 1}`);
                downloadGPX(dayGPX, `route-giorno-${index + 1}.gpx`);
            });
            
            // Add remaining route as last day
            const startIndex = AppState.markers.findIndex(m => m.id === nightMarkers[nightMarkers.length - 1].id);
            if (startIndex < AppState.markers.length - 1) {
                const dayMarkers = AppState.markers.slice(startIndex);
                const dayRoute = extractRouteSegment(startIndex, AppState.markers.length - 1);
                
                const dayGPX = generateGPXContent(dayRoute, dayMarkers, `Giorno ${nightMarkers.length + 1}`);
                downloadGPX(dayGPX, `route-giorno-${nightMarkers.length + 1}.gpx`);
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
  
  <wpt>
`;
    
    markers.forEach(marker => {
        const markerType = AppState.markerTypes.find(t => t.id === marker.type);
        gpx += `    <wpt lat="${marker.lat}" lon="${marker.lon}">
      <name>${marker.name}</name>
      <type>${markerType.name}</type>
    </wpt>\n`;
    });
    
    gpx += `  </wpt>
</gpx>`;
    
    return gpx;
}

// Extract route segment (simplified)
function extractRouteSegment(startIndex, endIndex) {
    // This is a simplified implementation
    // In a real implementation, you'd need to extract the actual route segment
    return AppState.route;
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
            alert('Impossibile esportare la mappa. Assicurati che la mappa sia visibile.');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Errore nell\'esportazione PNG');
    }
}

// Export map as PDF (not available without Puppeteer)
async function exportMapPDF() {
    try {
        const dataUrl = await exportMapAsImage('png');
        if (!dataUrl) {
            alert('Impossibile esportare la mappa. Assicurati che la mappa sia visibile.');
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
        alert('Errore nell\'esportazione PDF mappa');
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
        alert('Errore nell\'esportazione PDF. Verifica che il servizio di export sia attivo.');
    }
}

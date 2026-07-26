// Altimetric chart using Chart.js — with SAC scale coloring and interactivity
let elevationChart = null;
let chartHighlightLayer = null;

// Initialize elevation chart
function initElevationChart() {
    const ctx = document.getElementById('elevation-chart').getContext('2d');
    
    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Altitudine (m)',
                data: [],
                borderColor: '#4a90a4',
                backgroundColor: 'rgba(74, 144, 164, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                segment: {
                    borderColor: (ctx) => getSegmentColor(ctx)
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onHover: (event, elements) => onChartHover(event, elements),
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const elevation = context.parsed.y;
                            const slope = getSlopeAtPoint(context.dataIndex);
                            const sac = getSacAtPoint(context.dataIndex);
                            let label = `Altitudine: ${elevation} m`;
                            if (slope !== null) label += ` | Pendenza: ${slope}%`;
                            if (sac) label += ` | SAC: ${sac}`;
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    title: {
                        display: true,
                        text: 'Altitudine (m)'
                    }
                }
            }
        }
    });
}

// Get color for a chart segment based on SAC scale or slope
function getSegmentColor(ctx) {
    const index = ctx.p0DataIndex;

    // Priority 1: SAC scale coloring
    const sac = getSacAtPoint(index);
    if (sac) {
        const colors = {
            'T1': '#22c55e',
            'T2': '#3b82f6',
            'T3': '#ef4444',
            'T4': '#1e293b',
            'T5': '#7c3aed',
            'T6': '#000000'
        };
        return colors[sac] || '#4a90a4';
    }

    // Priority 2: Slope-based coloring
    const slope = getSlopeAtPoint(index);
    if (slope !== null) {
        if (slope > 20) return '#ef4444';
        if (slope > 10) return '#f59e0b';
        return '#22c55e';
    }

    return '#4a90a4';
}

// Get SAC scale at a chart point (from trail analysis data)
function getSacAtPoint(index) {
    if (!AppState.trailAnalysis || !AppState.trailAnalysis.sacSegments) return null;
    const routeCoords = AppState.route?.coordinates || [];
    if (routeCoords.length === 0) return null;
    const routeIdx = Math.round(index * (routeCoords.length / (AppState.elevationDataLength || routeCoords.length)));

    for (const seg of AppState.trailAnalysis.sacSegments) {
        if (!seg.coordinates) continue;
        for (const coord of seg.coordinates) {
            const dist = Math.pow(coord[0] - routeCoords[routeIdx]?.[0], 2) + Math.pow(coord[1] - routeCoords[routeIdx]?.[1], 2);
            if (dist < 0.0001) return seg.sacScale;
        }
    }
    return null;
}

// Get slope at a chart point
function getSlopeAtPoint(index) {
    if (!AppState.elevationSlopes || !AppState.elevationSlopes[index]) return null;
    return AppState.elevationSlopes[index];
}

// Calculate slopes from elevation data
function calculateSlopes(elevationData, routeCoordinates) {
    if (!elevationData || elevationData.length < 2 || !routeCoordinates) return [];

    const slopes = [];
    for (let i = 0; i < elevationData.length; i++) {
        if (i === 0 || i === elevationData.length - 1) {
            slopes.push(null);
            continue;
        }
        const dz = elevationData[i + 1].elevation - elevationData[i - 1].elevation;
        const routeIdx = Math.round(i * (routeCoordinates.length / elevationData.length));
        const prevIdx = Math.round((i - 1) * (routeCoordinates.length / elevationData.length));
        if (routeIdx >= routeCoordinates.length || prevIdx >= routeCoordinates.length) {
            slopes.push(null);
            continue;
        }
        const dx = haversineDistance(
            routeCoordinates[prevIdx][1], routeCoordinates[prevIdx][0],
            routeCoordinates[routeIdx][1], routeCoordinates[routeIdx][0]
        ) * 1000;
        if (dx === 0) {
            slopes.push(null);
            continue;
        }
        slopes.push(Math.round(Math.abs(dz / dx) * 100));
    }
    return slopes;
}

// Hover handler — highlight corresponding point on map
function onChartHover(event, elements) {
    if (!elements || elements.length === 0) {
        clearChartHighlight();
        return;
    }

    const index = elements[0].index;
    const routeCoords = AppState.route?.coordinates || [];
    if (routeCoords.length === 0) return;

    const routeIdx = Math.round(index * (routeCoords.length / (AppState.elevationDataLength || routeCoords.length)));
    const coord = routeCoords[routeIdx];
    if (!coord) return;

    showChartHighlight(coord[1], coord[0]);
}

function showChartHighlight(lat, lon) {
    if (typeof map === 'undefined' || !map) return;

    if (!chartHighlightLayer) {
        chartHighlightLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 8,
                    fill: new ol.style.Fill({ color: 'rgba(239, 68, 68, 0.8)' }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                })
            })
        });
        map.addLayer(chartHighlightLayer);
    }

    const source = chartHighlightLayer.getSource();
    source.clear();
    source.addFeature(new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
    }));
}

function clearChartHighlight() {
    if (chartHighlightLayer) {
        chartHighlightLayer.getSource().clear();
    }
}

// Update elevation chart
async function updateElevationChart() {
    if (!AppState.route) {
        if (elevationChart) {
            elevationChart.data.labels = [];
            elevationChart.data.datasets[0].data = [];
            elevationChart.update();
        }
        return;
    }
    
    const elevationData = await getElevationData(AppState.route.coordinates);
    
    if (!elevationData || elevationData.length === 0) {
        return;
    }
    
    // Store elevation data length for index mapping
    AppState.elevationDataLength = elevationData.length;

    // Calculate slopes for coloring and tooltip
    AppState.elevationSlopes = calculateSlopes(elevationData, AppState.route.coordinates);

    // Prepare data for chart
    const labels = elevationData.map((_, i) => i);
    const elevations = elevationData.map(d => d.elevation);
    
    // Add day separators using actual route coordinates for positioning
    const nightMarkers = AppState.markers.filter(m => m.type === 'night');
    const annotations = [];
    const routeCoords = AppState.route.coordinates;

    nightMarkers.forEach((marker) => {
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < routeCoords.length; i++) {
            const d = Math.pow(routeCoords[i][0] - marker.lon, 2) + Math.pow(routeCoords[i][1] - marker.lat, 2);
            if (d < closestDist) {
                closestDist = d;
                closestIdx = i;
            }
        }
        const routeIndex = Math.round(closestIdx * (elevationData.length / routeCoords.length));
        annotations.push({
            type: 'line',
            xMin: routeIndex,
            xMax: routeIndex,
            borderColor: '#e74c3c',
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                display: true,
                content: marker.name,
                position: 'start'
            }
        });
    });

    // Add day background bands with distinct colors
    const dayBoundaries = computeDayBoundaries(routeCoords, elevationData.length);
    dayBoundaries.forEach((boundary, i) => {
        const dayColor = getDayColor(i);
        annotations.push({
            type: 'box',
            xMin: boundary.start,
            xMax: boundary.end,
            backgroundColor: dayColor + '15',
            borderColor: 'transparent',
            drawTime: 'beforeDraw',
            label: {
                display: true,
                content: 'Giorno ' + (i + 1),
                color: dayColor,
                position: 'start',
                font: { size: 10, weight: 'bold' }
            }
        });
    });
    
    if (!elevationChart) {
        initElevationChart();
    }
    
    elevationChart.data.labels = labels;
    elevationChart.data.datasets[0].data = elevations;
    
    // Add annotations (plugin loaded via CDN, self-registers with Chart.js)
    elevationChart.options.plugins.annotation = {
        annotations: annotations
    };
    
    elevationChart.update();
}

// Download chart as image
function downloadChart() {
    if (!elevationChart) return;
    
    const link = document.createElement('a');
    link.download = `profilo-altimetrico-${new Date().toISOString().split('T')[0]}.png`;
    link.href = elevationChart.toBase64Image();
    link.click();
}

// Compute day boundaries for chart annotations based on night markers
function computeDayBoundaries(routeCoords, elevationLength) {
    const nightMarkers = AppState.markers.filter(m => m.type === 'night');
    const boundaries = [];

    if (nightMarkers.length === 0) {
        boundaries.push({ start: 0, end: elevationLength - 1 });
        return boundaries;
    }

    let prevIdx = 0;
    nightMarkers.forEach((marker) => {
        let closestIdx = prevIdx;
        let closestDist = Infinity;
        for (let i = prevIdx; i < routeCoords.length; i++) {
            const d = Math.pow(routeCoords[i][0] - marker.lon, 2) + Math.pow(routeCoords[i][1] - marker.lat, 2);
            if (d < closestDist) {
                closestDist = d;
                closestIdx = i;
            }
        }
        const routeIndex = Math.round(closestIdx * (elevationLength / routeCoords.length));
        boundaries.push({ start: prevIdx, end: routeIndex });
        prevIdx = Math.max(routeIndex, prevIdx);
    });

    if (prevIdx < elevationLength - 1) {
        boundaries.push({ start: prevIdx, end: elevationLength - 1 });
    }

    return boundaries;
}

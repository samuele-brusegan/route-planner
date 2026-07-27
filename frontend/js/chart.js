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
            onClick: (event, elements) => onChartClick(event, elements),
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    titleFont: { size: 12 },
                    bodyFont: { size: 12 },
                    padding: 8,
                    callbacks: {
                        title: function(context) {
                            const idx = context[0].dataIndex;
                            const marker = getMarkerAtPoint(idx);
                            if (marker) return marker.name || marker.type;
                            const dist = getDistanceAtPoint(idx);
                            return dist !== null ? `${dist.toFixed(1)} km` : '';
                        },
                        label: function(context) {
                            const elevation = context.parsed.y;
                            return `Altitudine: ${elevation} m`;
                        },
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            const lines = [];
                            const slope = getSlopeAtPoint(idx);
                            const sac = getSacAtPoint(idx);
                            const cumAscent = getCumulativeAscentAtPoint(idx);
                            const cumDescent = getCumulativeDescentAtPoint(idx);
                            const dist = getDistanceAtPoint(idx);
                            const marker = getMarkerAtPoint(idx);
                            if (marker && dist !== null) lines.push(`Distanza: ${dist.toFixed(1)} km`);
                            if (slope !== null) lines.push(`Pendenza: ${slope}%`);
                            if (sac) lines.push(`SAC: ${sac}`);
                            if (cumAscent > 0 || cumDescent > 0) {
                                let cumLine = '';
                                if (cumAscent > 0) cumLine += `+${cumAscent} m`;
                                if (cumDescent > 0) cumLine += (cumLine ? ' / ' : '') + `−${cumDescent} m`;
                                lines.push(`Salita/Discesa: ${cumLine}`);
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Distanza (km)',
                        font: { size: 10 }
                    },
                    ticks: {
                        maxTicksLimit: 8,
                        font: { size: 10 },
                        callback: function(value, index) {
                            const dist = getDistanceAtPoint(index);
                            return dist !== null ? dist.toFixed(1) : '';
                        }
                    },
                    grid: {
                        display: false
                    }
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

    // Priority 2: Slope-based coloring (gradient: green 0% → red 50% → purple beyond)
    const slope = getSlopeAtPoint(index);
    if (slope !== null) {
        return slopeToColor(slope);
    }

    return '#4a90a4';
}

// Continuous slope-to-color mapping: green 0% → yellow 25% → orange 37.5% → red 50% → purple beyond
function slopeToColor(slope) {
    const s = Math.max(0, slope);
    if (s >= 50) {
        // Red (50%) → Purple (100%+): interpolate hue from 0° to 280°
        const t = Math.min((s - 50) / 50, 1);
        return interpolateHsl(0, 100, 50, 280, 100, 50, t);
    }
    // Green (120°) → Yellow (60°) → Orange (30°) → Red (0°): 0% → 50%
    const t = s / 50;
    return interpolateHsl(120, 80, 45, 0, 100, 50, t);
}

// Linear interpolation between two HSL colors
function interpolateHsl(h1, s1, l1, h2, s2, l2, t) {
    const h = h1 + (h2 - h1) * t;
    const s = s1 + (s2 - s1) * t;
    const l = l1 + (l2 - l1) * t;
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
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

// Get marker closest to a chart data index (within threshold)
function getMarkerAtPoint(index) {
    if (!AppState.chartMarkerPositions) return null;
    const threshold = Math.max(3, Math.floor((AppState.elevationDataLength || 300) / 50));
    let closest = null;
    let closestDist = Infinity;
    for (const mp of AppState.chartMarkerPositions) {
        const d = Math.abs(mp.index - index);
        if (d <= threshold && d < closestDist) {
            closestDist = d;
            closest = mp.marker;
        }
    }
    return closest;
}

// Get cumulative distance at a chart point (km)
function getDistanceAtPoint(index) {
    if (!AppState.chartCumulativeDistances) return null;
    return AppState.chartCumulativeDistances[index] ?? null;
}

// Get cumulative ascent at a chart point (m)
function getCumulativeAscentAtPoint(index) {
    if (!AppState.chartCumulativeAscent) return 0;
    return AppState.chartCumulativeAscent[index] ?? 0;
}

// Get cumulative descent at a chart point (m)
function getCumulativeDescentAtPoint(index) {
    if (!AppState.chartCumulativeDescent) return 0;
    return AppState.chartCumulativeDescent[index] ?? 0;
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

// Click handler — center map on corresponding route point
function onChartClick(event, elements) {
    if (!elements || elements.length === 0) return;
    if (typeof map === 'undefined' || !map) return;

    const index = elements[0].index;
    const routeCoords = AppState.route?.coordinates || [];
    if (routeCoords.length === 0) return;

    const routeIdx = Math.round(index * (routeCoords.length / (AppState.elevationDataLength || routeCoords.length)));
    const coord = routeCoords[routeIdx];
    if (!coord) return;

    const view = map.getView();
    const currentZoom = view.getZoom();
    view.animate({
        center: ol.proj.fromLonLat([coord[0], coord[1]]),
        zoom: Math.max(currentZoom || 10, 13),
        duration: 500
    });
}

// Compute cumulative distances (km), ascent (m), and descent (m) for each elevation data point
function computeCumulativeStats(elevationData, routeCoordinates) {
    if (!elevationData || elevationData.length === 0 || !routeCoordinates || routeCoordinates.length === 0) {
        return { distances: [], ascent: [], descent: [] };
    }

    const distances = [0];
    const ascent = [0];
    const descent = [0];
    let cumDist = 0;
    let cumAscent = 0;
    let cumDescent = 0;

    for (let i = 1; i < elevationData.length; i++) {
        const routeIdx = Math.round(i * (routeCoordinates.length / elevationData.length));
        const prevIdx = Math.round((i - 1) * (routeCoordinates.length / elevationData.length));
        if (routeIdx >= routeCoordinates.length || prevIdx >= routeCoordinates.length) {
            distances.push(cumDist);
            ascent.push(cumAscent);
            descent.push(cumDescent);
            continue;
        }
        cumDist += haversineDistance(
            routeCoordinates[prevIdx][1], routeCoordinates[prevIdx][0],
            routeCoordinates[routeIdx][1], routeCoordinates[routeIdx][0]
        );
        distances.push(cumDist);

        const dz = elevationData[i].elevation - elevationData[i - 1].elevation;
        if (dz > 5) cumAscent += dz;
        else if (dz < -5) cumDescent += Math.abs(dz);
        ascent.push(cumAscent);
        descent.push(cumDescent);
    }

    return { distances, ascent, descent };
}

// Render the stats bar above the chart with key elevation metrics
function renderChartStatsBar(elevations) {
    const bar = document.getElementById('chart-stats-bar');
    if (!bar) return;

    if (!elevations || elevations.length === 0) {
        bar.classList.add('hidden');
        return;
    }

    const max = Math.max(...elevations);
    const min = Math.min(...elevations);
    const totalAscent = AppState.stats.totalAscent || 0;
    const totalDescent = AppState.stats.totalDescent || 0;
    const totalDist = AppState.stats.totalDistance || 0;
    const avgSlope = totalDist > 0 ? Math.round((totalAscent / (totalDist * 1000)) * 100) : 0;

    bar.classList.remove('hidden');
    bar.innerHTML = [
        { icon: '▲', value: `${max}`, unit: 'm' },
        { icon: '▼', value: `${min}`, unit: 'm' },
        { icon: '↑', value: `+${totalAscent}`, unit: 'm' },
        { icon: '↓', value: `−${totalDescent}`, unit: 'm' },
        { icon: '↦', value: `${totalDist.toFixed(1)}`, unit: 'km' },
        { icon: '∠', value: `${avgSlope}`, unit: '%' }
    ].map(s => `<div class="chart-stat-pill"><span class="pill-icon">${s.icon}</span><span class="pill-value">${s.value}<span class="pill-unit">${s.unit}</span></span></div>`).join('');
}

// Render the day selector dropdown
function renderDaySelector(dayBoundaries) {
    const container = document.getElementById('chart-day-selector');
    const select = document.getElementById('chart-day-select');
    if (!container || !select) return;

    if (!dayBoundaries || dayBoundaries.length <= 1) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    // Preserve current selection if still valid
    const currentVal = AppState.chartSelectedDay;
    let html = '<option value=""' + (currentVal === null ? ' selected' : '') + '>Tutti i giorni</option>';
    dayBoundaries.forEach((_, i) => {
        const selected = currentVal === i ? ' selected' : '';
        html += `<option value="${i}"${selected}>Giorno ${i + 1}</option>`;
    });
    select.innerHTML = html;
}

// Show or hide the empty state overlay
function updateChartEmptyState(hasRoute) {
    const emptyState = document.getElementById('chart-empty-state');
    if (!emptyState) return;
    if (hasRoute) {
        emptyState.classList.add('hidden');
    } else {
        emptyState.classList.remove('hidden');
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
        AppState.chartCumulativeDistances = null;
        AppState.chartCumulativeAscent = null;
        AppState.chartCumulativeDescent = null;
        renderChartStatsBar([]);
        const daySelector = document.getElementById('chart-day-selector');
        if (daySelector) daySelector.classList.add('hidden');
        AppState.chartSelectedDay = null;
        updateChartEmptyState(false);
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

    // Compute cumulative distances, ascent, and descent for tooltip and X-axis
    const cumStats = computeCumulativeStats(elevationData, AppState.route.coordinates);
    AppState.chartCumulativeDistances = cumStats.distances;
    AppState.chartCumulativeAscent = cumStats.ascent;
    AppState.chartCumulativeDescent = cumStats.descent;

    // Prepare data for chart
    const labels = elevationData.map((_, i) => i);
    const elevations = elevationData.map(d => d.elevation);
    
    // Pre-compute marker positions on chart X-axis for tooltip lookup
    const routeCoords = AppState.route.coordinates;
    AppState.chartMarkerPositions = AppState.markers.map(marker => {
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
        return { index: routeIndex, marker };
    });

    // Add day separators using actual route coordinates for positioning
    const nightMarkers = AppState.markers.filter(m => m.type === 'night');
    const annotations = [];

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
            borderColor: 'rgba(231, 76, 60, 0.7)',
            borderWidth: 1.5,
            borderDash: [4, 4]
        });
    });

    // Compute day boundaries
    const dayBoundaries = computeDayBoundaries(routeCoords, elevationData.length);

    // Render day selector
    renderDaySelector(dayBoundaries);

    // Determine visible range based on selected day
    let visibleStart = 0;
    let visibleEnd = elevations.length - 1;
    if (AppState.chartSelectedDay !== null && AppState.chartSelectedDay >= 0 && AppState.chartSelectedDay < dayBoundaries.length) {
        visibleStart = dayBoundaries[AppState.chartSelectedDay].start;
        visibleEnd = dayBoundaries[AppState.chartSelectedDay].end;
    }

    // Add day background bands with distinct colors
    dayBoundaries.forEach((boundary, i) => {
        const dayColor = getDayColor(i);
        annotations.push({
            type: 'box',
            xMin: boundary.start,
            xMax: boundary.end,
            backgroundColor: dayColor + '0a',
            borderColor: 'transparent',
            drawTime: 'beforeDraw',
            label: {
                display: true,
                content: 'G' + (i + 1),
                color: '#ffffff',
                backgroundColor: dayColor,
                position: 'start',
                font: { size: 9, weight: 'bold' },
                padding: { top: 1, bottom: 1, left: 4, right: 4 },
                borderRadius: 3,
                yAdjust: -2
            }
        });
    });
    
    // Add all markers as point annotations on the elevation line
    AppState.markers.forEach((marker) => {
        const mp = AppState.chartMarkerPositions.find(p => p.marker === marker);
        const routeIndex = mp ? mp.index : 0;
        const elev = elevations[routeIndex] || 0;
        const isNight = marker.type === 'night';

        annotations.push({
            type: 'point',
            xValue: routeIndex,
            yValue: elev,
            radius: 3,
            backgroundColor: isNight ? '#e74c3c' : '#3b82f6',
            borderColor: '#ffffff',
            borderWidth: 1
        });
    });

    // Add max/min elevation annotations (within visible range only)
    let maxIdx = visibleStart, minIdx = visibleStart;
    for (let i = visibleStart + 1; i <= visibleEnd; i++) {
        if (elevations[i] > elevations[maxIdx]) maxIdx = i;
        if (elevations[i] < elevations[minIdx]) minIdx = i;
    }

    // Calculate xAdjust to prevent label clipping at edges
    const rangeSize = visibleEnd - visibleStart;
    const edgeThreshold = Math.max(2, Math.floor(rangeSize * 0.05));
    let maxXAdjust = 0;
    if (maxIdx <= visibleStart + edgeThreshold) maxXAdjust = 35;
    else if (maxIdx >= visibleEnd - edgeThreshold) maxXAdjust = -35;
    let minXAdjust = 0;
    if (minIdx <= visibleStart + edgeThreshold) minXAdjust = 35;
    else if (minIdx >= visibleEnd - edgeThreshold) minXAdjust = -35;

    annotations.push({
        type: 'point',
        xValue: maxIdx,
        yValue: elevations[maxIdx],
        radius: 5,
        backgroundColor: '#22c55e',
        borderColor: '#ffffff',
        borderWidth: 2
    });
    annotations.push({
        type: 'label',
        xValue: maxIdx,
        yValue: elevations[maxIdx],
        content: elevations[maxIdx] + ' m',
        color: '#ffffff',
        backgroundColor: 'rgba(34, 197, 94, 0.9)',
        font: { size: 11, weight: 'bold' },
        padding: { top: 2, bottom: 2, left: 5, right: 5 },
        borderRadius: 4,
        yAdjust: -20,
        xAdjust: maxXAdjust,
        callout: {
            display: true,
            borderColor: 'rgba(34, 197, 94, 0.7)',
            side: 'bottom',
            start: '50%'
        }
    });
    annotations.push({
        type: 'point',
        xValue: minIdx,
        yValue: elevations[minIdx],
        radius: 5,
        backgroundColor: '#ef4444',
        borderColor: '#ffffff',
        borderWidth: 2
    });
    annotations.push({
        type: 'label',
        xValue: minIdx,
        yValue: elevations[minIdx],
        content: elevations[minIdx] + ' m',
        color: '#ffffff',
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        font: { size: 11, weight: 'bold' },
        padding: { top: 2, bottom: 2, left: 5, right: 5 },
        borderRadius: 4,
        yAdjust: 20,
        xAdjust: minXAdjust,
        callout: {
            display: true,
            borderColor: 'rgba(239, 68, 68, 0.7)',
            side: 'top',
            start: '50%'
        }
    });

    if (!elevationChart) {
        initElevationChart();
    }

    elevationChart.data.labels = labels;
    elevationChart.data.datasets[0].data = elevations;

    // Set x-axis range to visible day if selected
    if (AppState.chartSelectedDay !== null) {
        elevationChart.options.scales.x.min = visibleStart;
        elevationChart.options.scales.x.max = visibleEnd;
    } else {
        elevationChart.options.scales.x.min = undefined;
        elevationChart.options.scales.x.max = undefined;
    }

    // Add annotations (plugin loaded via CDN, self-registers with Chart.js)
    elevationChart.options.plugins.annotation = {
        annotations: annotations
    };

    // Render stats bar and hide empty state
    renderChartStatsBar(elevations);
    updateChartEmptyState(true);

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

// Export elevation data as CSV
function downloadChartCSV() {
    if (!AppState.route || !AppState.elevationDataLength) {
        showToast('Nessun dato altimetrico da esportare', 'warn');
        return;
    }

    const routeCoords = AppState.route.coordinates || [];
    if (routeCoords.length === 0) return;

    const dayBoundaries = computeDayBoundaries(routeCoords, AppState.elevationDataLength);
    const nightMarkers = AppState.markers.filter(m => m.type === 'night');

    // Build CSV with all days
    let csv = 'Giorno,Latitude,Longitude,Elevation (m),Distance (km)\n';
    let cumulativeDist = 0;

    dayBoundaries.forEach((boundary, dayIdx) => {
        const dayNum = dayIdx + 1;
        for (let i = boundary.start; i <= boundary.end; i++) {
            const routeIdx = Math.round(i * (routeCoords.length / AppState.elevationDataLength));
            const coord = routeCoords[routeIdx];
            if (!coord) continue;

            const elev = elevationChart.data.datasets[0].data[i];
            if (i > 0 && i < routeCoords.length) {
                const prevRouteIdx = Math.round((i - 1) * (routeCoords.length / AppState.elevationDataLength));
                const prevCoord = routeCoords[prevRouteIdx];
                if (prevCoord) {
                    cumulativeDist += haversineDistance(prevCoord[1], prevCoord[0], coord[1], coord[0]);
                }
            }
            csv += `${dayNum},${coord[1].toFixed(7)},${coord[0].toFixed(7)},${elev ?? 0},${cumulativeDist.toFixed(3)}\n`;
        }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `altimetria-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV altimetria esportato', 'success');
}

// Export per-day elevation charts as PNG (ZIP) and CSV files
async function downloadChartPerDay() {
    if (!AppState.route || !AppState.elevationDataLength) {
        showToast('Nessun dato altimetrico da esportare', 'warn');
        return;
    }

    const routeCoords = AppState.route.coordinates || [];
    if (routeCoords.length === 0) return;

    const dayBoundaries = computeDayBoundaries(routeCoords, AppState.elevationDataLength);

    if (dayBoundaries.length <= 1) {
        // Single day — just download the full chart
        downloadChart();
        downloadChartCSV();
        return;
    }

    const hasJSZip = typeof JSZip !== 'undefined';
    let zip = null;
    if (hasJSZip) zip = new JSZip();

    const allElevations = elevationChart.data.datasets[0].data;

    dayBoundaries.forEach((boundary, dayIdx) => {
        const dayNum = dayIdx + 1;
        const dayColor = getDayColor(dayIdx);
        const dayElevations = [];
        const dayLabels = [];
        let cumulativeDist = 0;

        for (let i = boundary.start; i <= boundary.end; i++) {
            const routeIdx = Math.round(i * (routeCoords.length / AppState.elevationDataLength));
            const coord = routeCoords[routeIdx];
            if (!coord) continue;

            const elev = allElevations[i];
            if (i > boundary.start) {
                const prevRouteIdx = Math.round((i - 1) * (routeCoords.length / AppState.elevationDataLength));
                const prevCoord = routeCoords[prevRouteIdx];
                if (prevCoord) {
                    cumulativeDist += haversineDistance(prevCoord[1], prevCoord[0], coord[1], coord[0]);
                }
            }
            dayElevations.push(elev ?? 0);
            dayLabels.push(cumulativeDist.toFixed(2));
        }

        // Create per-day CSV
        let csv = 'Distance (km),Latitude,Longitude,Elevation (m)\n';
        let dist = 0;
        for (let i = boundary.start; i <= boundary.end; i++) {
            const routeIdx = Math.round(i * (routeCoords.length / AppState.elevationDataLength));
            const coord = routeCoords[routeIdx];
            if (!coord) continue;
            if (i > boundary.start) {
                const prevRouteIdx = Math.round((i - 1) * (routeCoords.length / AppState.elevationDataLength));
                const prevCoord = routeCoords[prevRouteIdx];
                if (prevCoord) {
                    dist += haversineDistance(prevCoord[1], prevCoord[0], coord[1], coord[0]);
                }
            }
            csv += `${dist.toFixed(3)},${coord[1].toFixed(7)},${coord[0].toFixed(7)},${allElevations[i] ?? 0}\n`;
        }

        if (hasJSZip) {
            zip.file(`giorno-${dayNum}-altimetria.csv`, csv);
        } else {
            // Download CSV individually
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `giorno-${dayNum}-altimetria.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
    });

    if (hasJSZip) {
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `altimetria-per-giorni-${new Date().toISOString().split('T')[0]}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`ZIP con ${dayBoundaries.length} file CSV esportato`, 'success');
    } else {
        showToast(`${dayBoundaries.length} file CSV per giorni esportati`, 'success');
    }
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

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
                    callbacks: {
                        title: function(context) {
                            const dist = getDistanceAtPoint(context[0].dataIndex);
                            return dist !== null ? `${dist.toFixed(1)} km` : '';
                        },
                        label: function(context) {
                            const elevation = context.parsed.y;
                            const slope = getSlopeAtPoint(context.dataIndex);
                            const sac = getSacAtPoint(context.dataIndex);
                            const cumAscent = getCumulativeAscentAtPoint(context.dataIndex);
                            const cumDescent = getCumulativeDescentAtPoint(context.dataIndex);
                            let label = `Altitudine: ${elevation} m`;
                            if (slope !== null) label += ` | Pendenza: ${slope}%`;
                            if (sac) label += ` | SAC: ${sac}`;
                            if (cumAscent > 0) label += ` | Salita: +${cumAscent} m`;
                            if (cumDescent > 0) label += ` | Discesa: -${cumDescent} m`;
                            return label;
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

// Render the color legend for SAC scale and slope-based coloring
function renderChartLegend() {
    const legend = document.getElementById('chart-legend');
    if (!legend) return;

    const hasSac = AppState.trailAnalysis && AppState.trailAnalysis.sacSegments && AppState.trailAnalysis.sacSegments.length > 0;
    const hasSlope = AppState.elevationSlopes && AppState.elevationSlopes.some(s => s !== null);

    if (!hasSac && !hasSlope) {
        legend.classList.add('hidden');
        return;
    }

    legend.classList.remove('hidden');
    let html = '';

    if (hasSac) {
        const sacColors = [
            { label: 'T1', color: '#22c55e' },
            { label: 'T2', color: '#3b82f6' },
            { label: 'T3', color: '#ef4444' },
            { label: 'T4', color: '#1e293b' },
            { label: 'T5', color: '#7c3aed' },
            { label: 'T6', color: '#000000' }
        ];
        html += '<div class="chart-legend-group">';
        sacColors.forEach(s => {
            html += `<span class="chart-legend-badge" title="SAC ${s.label}"><span class="chart-legend-dot" style="background:${s.color}"></span>${s.label}</span>`;
        });
        html += '</div>';
    }

    if (hasSac && hasSlope) {
        html += '<span class="chart-legend-sep"></span>';
    }

    if (hasSlope) {
        html += '<div class="chart-legend-group">';
        html += '<span class="chart-legend-badge" title="Pendenza < 10%"><span class="chart-legend-dot" style="background:#22c55e"></span>&lt;10%</span>';
        html += '<span class="chart-legend-badge" title="Pendenza 10-20%"><span class="chart-legend-dot" style="background:#f59e0b"></span>10-20%</span>';
        html += '<span class="chart-legend-badge" title="Pendenza > 20%"><span class="chart-legend-dot" style="background:#ef4444"></span>&gt;20%</span>';
        html += '</div>';
    }

    legend.innerHTML = html;
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
        renderChartLegend();
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
        const shortName = marker.name && marker.name.length > 12 ? marker.name.substring(0, 10) + '…' : (marker.name || 'Notte');
        annotations.push({
            type: 'line',
            xMin: routeIndex,
            xMax: routeIndex,
            borderColor: 'rgba(231, 76, 60, 0.7)',
            borderWidth: 1.5,
            borderDash: [4, 4],
            label: {
                display: true,
                content: shortName,
                position: 'start',
                backgroundColor: 'rgba(231, 76, 60, 0.85)',
                color: '#ffffff',
                font: { size: 9, weight: 'normal' },
                padding: { top: 2, bottom: 2, left: 4, right: 4 },
                borderRadius: 3
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
        const elev = elevations[routeIndex] || 0;
        const isNight = marker.type === 'night';
        const shortName = marker.name && marker.name.length > 10 ? marker.name.substring(0, 9) + '…' : (marker.name || '');

        annotations.push({
            type: 'point',
            xValue: routeIndex,
            yValue: elev,
            radius: 3,
            backgroundColor: isNight ? '#e74c3c' : '#3b82f6',
            borderColor: '#ffffff',
            borderWidth: 1
        });

        if (shortName && !isNight) {
            annotations.push({
                type: 'label',
                xValue: routeIndex,
                yValue: elev,
                content: shortName,
                rotation: 270,
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                font: { size: 8, weight: 'normal' },
                padding: { top: 2, bottom: 2, left: 3, right: 3 },
                borderRadius: 3,
                yAdjust: -18,
                xAdjust: 0
            });
        }
    });

    // Add max/min elevation annotations
    let maxIdx = 0, minIdx = 0;
    for (let i = 1; i < elevations.length; i++) {
        if (elevations[i] > elevations[maxIdx]) maxIdx = i;
        if (elevations[i] < elevations[minIdx]) minIdx = i;
    }
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
        font: { size: 10, weight: 'bold' },
        padding: { top: 2, bottom: 2, left: 5, right: 5 },
        borderRadius: 4,
        yAdjust: -20,
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
        font: { size: 10, weight: 'bold' },
        padding: { top: 2, bottom: 2, left: 5, right: 5 },
        borderRadius: 4,
        yAdjust: 20,
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

    // Add annotations (plugin loaded via CDN, self-registers with Chart.js)
    elevationChart.options.plugins.annotation = {
        annotations: annotations
    };

    // Render stats bar, legend, and hide empty state
    renderChartStatsBar(elevations);
    renderChartLegend();
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

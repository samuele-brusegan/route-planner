// Altimetric chart using Chart.js
let elevationChart = null;

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
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Altitudine: ${context.parsed.y} m`;
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

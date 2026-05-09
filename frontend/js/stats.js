// Statistics calculation and display

// Calculate route statistics
async function calculateStatistics() {
    if (!AppState.route) {
        AppState.stats = {
            totalDistance: 0,
            totalAscent: 0,
            totalDescent: 0,
            totalTime: 0
        };
        AppState.dailyStats = [];
        return;
    }
    
    // Get elevation data
    const elevationData = await getElevationData(AppState.route.coordinates);
    
    // Calculate elevation gain/loss
    let ascent = 0;
    let descent = 0;
    
    for (let i = 1; i < elevationData.length; i++) {
        const diff = elevationData[i].elevation - elevationData[i - 1].elevation;
        if (diff > 0) {
            ascent += diff;
        } else {
            descent += Math.abs(diff);
        }
    }
    
    AppState.stats = {
        totalDistance: AppState.route.distance / 1000, // Convert to km
        totalAscent: Math.round(ascent),
        totalDescent: Math.round(descent),
        totalTime: calculateTime(AppState.route.distance / 1000, ascent)
    };
    
    // Calculate daily statistics (split by "punto notte" markers)
    calculateDailyStats(elevationData);
}

// Calculate statistics per day
function calculateDailyStats(elevationData) {
    const nightMarkers = AppState.markers.filter(m => m.type === 'night');
    
    if (nightMarkers.length === 0) {
        AppState.dailyStats = [{
            day: 1,
            distance: AppState.stats.totalDistance,
            ascent: AppState.stats.totalAscent,
            descent: AppState.stats.totalDescent,
            time: AppState.stats.totalTime
        }];
        return;
    }
    
    AppState.dailyStats = [];
    let currentDay = 1;
    let startIndex = 0;
    
    nightMarkers.forEach((nightMarker, index) => {
        const nightIndex = AppState.markers.findIndex(m => m.id === nightMarker.id);
        
        // Calculate stats for this day
        const dayStats = calculateDayStats(startIndex, nightIndex, elevationData);
        dayStats.day = currentDay;
        AppState.dailyStats.push(dayStats);
        
        currentDay++;
        startIndex = nightIndex;
    });
    
    // Add remaining route as last day if needed
    if (startIndex < AppState.markers.length - 1) {
        const dayStats = calculateDayStats(startIndex, AppState.markers.length - 1, elevationData);
        dayStats.day = currentDay;
        AppState.dailyStats.push(dayStats);
    }
}

// Calculate stats for a specific segment using actual route coordinates
function calculateDayStats(startMarkerIndex, endMarkerIndex, elevationData) {
    const route = AppState.route;
    const coords = route && route.coordinates ? route.coordinates : [];
    const startMarker = AppState.markers[startMarkerIndex];
    const endMarker = AppState.markers[endMarkerIndex];

    if (!startMarker || !endMarker || coords.length === 0) {
        return { distance: '0.00', ascent: 0, descent: 0, time: '0h 0m' };
    }

    const startIdx = findClosestRouteIndex(coords, startMarker.lon, startMarker.lat);
    const endIdx = findClosestRouteIndex(coords, endMarker.lon, endMarker.lat);
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);

    let segmentDistance = 0;
    for (let i = from + 1; i <= to && i < coords.length; i++) {
        segmentDistance += haversineDistance(
            coords[i - 1][1], coords[i - 1][0],
            coords[i][1], coords[i][0]
        );
    }

    let ascent = 0;
    let descent = 0;
    if (elevationData && elevationData.length > 0) {
        const elevFrom = Math.min(from, elevationData.length - 1);
        const elevTo = Math.min(to, elevationData.length - 1);
        for (let i = elevFrom + 1; i <= elevTo; i++) {
            const diff = elevationData[i].elevation - elevationData[i - 1].elevation;
            if (diff > 0) ascent += diff;
            else descent += Math.abs(diff);
        }
    }

    return {
        distance: segmentDistance.toFixed(2),
        ascent: Math.round(ascent),
        descent: Math.round(descent),
        time: calculateTime(segmentDistance, Math.round(ascent))
    };
}

function findClosestRouteIndex(coords, lon, lat) {
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
        const d = Math.pow(coords[i][0] - lon, 2) + Math.pow(coords[i][1] - lat, 2);
        if (d < closestDist) {
            closestDist = d;
            closestIdx = i;
        }
    }
    return closestIdx;
}

// Update statistics display
function updateStatistics() {
    document.getElementById('total-distance').textContent = AppState.stats.totalDistance.toFixed(2) + ' km';
    document.getElementById('total-ascent').textContent = AppState.stats.totalAscent + ' m';
    document.getElementById('total-descent').textContent = AppState.stats.totalDescent + ' m';
    document.getElementById('total-time').textContent = AppState.stats.totalTime;
    
    // Update daily stats
    const dailyStatsContainer = document.getElementById('daily-stats');
    dailyStatsContainer.innerHTML = '';
    
    AppState.dailyStats.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-stat';
        dayDiv.innerHTML = `
            <h4>Giorno ${day.day}</h4>
            <div class="day-stats-grid">
                <div class="day-stat-item">
                    Distanza: <span class="day-stat-value">${day.distance} km</span>
                </div>
                <div class="day-stat-item">
                    Salita: <span class="day-stat-value">${day.ascent} m</span>
                </div>
                <div class="day-stat-item">
                    Discesa: <span class="day-stat-value">${day.descent} m</span>
                </div>
                <div class="day-stat-item">
                    Tempo: <span class="day-stat-value">${day.time}</span>
                </div>
            </div>
        `;
        dailyStatsContainer.appendChild(dayDiv);
    });
}

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

// Calculate stats for a specific segment
function calculateDayStats(startIndex, endIndex, elevationData) {
    // This is a simplified calculation
    // In a real implementation, you'd need to map the elevation data to the route segments
    
    const segmentMarkers = AppState.markers.slice(startIndex, endIndex + 1);
    let segmentDistance = 0;
    
    for (let i = 0; i < segmentMarkers.length - 1; i++) {
        const dist = haversineDistance(
            segmentMarkers[i].lat, segmentMarkers[i].lon,
            segmentMarkers[i + 1].lat, segmentMarkers[i + 1].lon
        );
        segmentDistance += dist;
    }
    
    // Simplified elevation calculation (proportional to total)
    const proportion = segmentDistance / AppState.stats.totalDistance;
    const ascent = Math.round(AppState.stats.totalAscent * proportion);
    const descent = Math.round(AppState.stats.totalDescent * proportion);
    
    return {
        distance: segmentDistance.toFixed(2),
        ascent: ascent,
        descent: descent,
        time: calculateTime(segmentDistance, ascent)
    };
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

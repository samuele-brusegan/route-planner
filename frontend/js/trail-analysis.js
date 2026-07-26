// Trail difficulty analysis — SAC scale + surface classification

const SAC_SCALE_LABELS = {
    'hiking': { label: 'T1', name: 'Turistico', color: '#22c55e' },
    'mountain_hiking': { label: 'T2', name: 'Escursionistico', color: '#3b82f6' },
    'demanding_mountain_hiking': { label: 'T3', name: 'Escursionistico difficile', color: '#ef4444' },
    'alpine_hiking': { label: 'T4', name: 'Alpinistico', color: '#1e293b' },
    'demanding_alpine_hiking': { label: 'T5', name: 'Alpinistico difficile', color: '#7c3aed' },
    'difficult_alpine_hiking': { label: 'T6', name: 'Alpinistico molto difficile', color: '#000000' }
};

const SURFACE_TYPES = {
    asphalt: { label: 'Asfalto', color: '#64748b' },
    concrete: { label: 'Cemento', color: '#64748b' },
    gravel: { label: 'Strada bianca', color: '#f59e0b' },
    unpaved: { label: 'Sterrato', color: '#f59e0b' },
    compacted: { label: 'Terra battuta', color: '#a16207' },
    dirt: { label: 'Terra', color: '#a16207' },
    grass: { label: 'Erba', color: '#22c55e' },
    ground: { label: 'Terra', color: '#a16207' },
    rock: { label: 'Roccia', color: '#475569' },
    sand: { label: 'Sabbia', color: '#fbbf24' },
    wood: { label: 'Legno', color: '#92400e' }
};

// Analyze trail data from Overpass terrain query
function analyzeTrailData(terrainResult) {
    if (!terrainResult || !terrainResult.trails) return null;

    const trails = terrainResult.trails;
    const sacSegments = [];
    const surfaceSegments = [];

    let maxDifficulty = 0;
    let maxDifficultyLabel = 'T1';
    let difficultKm = 0;
    let totalAnalyzedKm = 0;

    trails.forEach(trail => {
        if (!trail.coordinates || trail.coordinates.length < 2) return;

        const segmentLength = calculatePathLength(trail.coordinates);
        totalAnalyzedKm += segmentLength;

        // SAC scale
        if (trail.sacScale && SAC_SCALE_LABELS[trail.sacScale]) {
            const sac = SAC_SCALE_LABELS[trail.sacScale];
            const difficultyNum = parseInt(sac.label.substring(1));
            if (difficultyNum > maxDifficulty) {
                maxDifficulty = difficultyNum;
                maxDifficultyLabel = sac.label;
            }
            if (difficultyNum >= 4) {
                difficultKm += segmentLength;
            }
            sacSegments.push({
                sacScale: sac.label,
                name: sac.name,
                color: sac.color,
                length: segmentLength,
                coordinates: trail.coordinates
            });
        }

        // Surface
        if (trail.surface && SURFACE_TYPES[trail.surface]) {
            const surf = SURFACE_TYPES[trail.surface];
            surfaceSegments.push({
                surface: surf.label,
                color: surf.color,
                length: segmentLength,
                coordinates: trail.coordinates
            });
        }
    });

    // Surface breakdown for pie chart
    const surfaceBreakdown = {};
    surfaceSegments.forEach(seg => {
        if (!surfaceBreakdown[seg.surface]) {
            surfaceBreakdown[seg.surface] = { label: seg.surface, color: seg.color, km: 0 };
        }
        surfaceBreakdown[seg.surface].km += seg.length;
    });

    return {
        maxDifficulty: maxDifficultyLabel,
        maxDifficultyName: SAC_SCALE_LABELS[Object.keys(SAC_SCALE_LABELS).find(k => SAC_SCALE_LABELS[k].label === maxDifficultyLabel)]?.name || '',
        difficultKm: difficultKm.toFixed(1),
        difficultPct: totalAnalyzedKm > 0 ? Math.round((difficultKm / totalAnalyzedKm) * 100) : 0,
        sacSegments,
        surfaceSegments,
        surfaceBreakdown: Object.values(surfaceBreakdown).sort((a, b) => b.km - a.km)
    };
}

function calculatePathLength(coordinates) {
    let length = 0;
    for (let i = 1; i < coordinates.length; i++) {
        length += haversineDistance(
            coordinates[i - 1][1], coordinates[i - 1][0],
            coordinates[i][1], coordinates[i][0]
        );
    }
    return length;
}

// Display trail analysis in stats panel
function displayTrailAnalysis(analysis) {
    if (!analysis) return;

    const container = document.getElementById('trail-analysis') || createTrailAnalysisContainer();
    container.innerHTML = `
        <div class="trail-analysis-summary">
            <div class="trail-stat">
                <span class="trail-stat-label">Difficoltà massima</span>
                <span class="trail-stat-value" style="color: ${getSacColor(analysis.maxDifficulty)}">${analysis.maxDifficulty} — ${analysis.maxDifficultyName}</span>
            </div>
            <div class="trail-stat">
                <span class="trail-stat-label">Tratti T4+</span>
                <span class="trail-stat-value">${analysis.difficultKm} km (${analysis.difficultPct}%)</span>
            </div>
        </div>
        ${renderSurfaceBreakdown(analysis.surfaceBreakdown)}
    `;
}

function getSacColor(label) {
    const entry = Object.values(SAC_SCALE_LABELS).find(s => s.label === label);
    return entry?.color || '#64748b';
}

function renderSurfaceBreakdown(breakdown) {
    if (!breakdown || breakdown.length === 0) return '';
    const total = breakdown.reduce((sum, s) => sum + s.km, 0);
    return `
        <div class="surface-breakdown">
            <h5>Superficie</h5>
            ${breakdown.map(s => `
                <div class="surface-item">
                    <span class="surface-color" style="background: ${s.color}"></span>
                    <span>${s.label}: ${s.km.toFixed(1)} km (${Math.round(s.km / total * 100)}%)</span>
                </div>
            `).join('')}
        </div>
    `;
}

function createTrailAnalysisContainer() {
    const statsPanel = document.querySelector('.stats-panel') || document.querySelector('#stats-panel');
    if (!statsPanel) return document.createElement('div');

    const container = document.createElement('div');
    container.id = 'trail-analysis';
    container.className = 'trail-analysis';
    statsPanel.appendChild(container);
    return container;
}

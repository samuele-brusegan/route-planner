// Elevation smoothing utilities to reduce DEM noise in ascent/descent calculations

// Moving average filter with configurable window size
function movingAverage(elevations, windowSize = 5) {
    if (!elevations || elevations.length === 0) return [];
    if (elevations.length <= windowSize) return elevations.map(e => e.elevation);

    const half = Math.floor(windowSize / 2);
    const result = [];

    for (let i = 0; i < elevations.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(elevations.length - 1, i + half); j++) {
            sum += elevations[j].elevation;
            count++;
        }
        result.push(sum / count);
    }

    return result;
}

// Calculate ascent/descent with minimum threshold to filter noise
function calculateAscentDescent(elevations, minThreshold = 5) {
    if (!elevations || elevations.length < 2) return { ascent: 0, descent: 0 };

    let ascent = 0;
    let descent = 0;
    let pendingGain = 0;
    let pendingLoss = 0;

    for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];

        if (diff > 0) {
            if (pendingLoss > 0) {
                if (pendingLoss >= minThreshold) {
                    descent += pendingLoss;
                }
                pendingLoss = 0;
            }
            pendingGain += diff;
            if (pendingGain >= minThreshold) {
                ascent += pendingGain;
                pendingGain = 0;
            }
        } else if (diff < 0) {
            if (pendingGain > 0) {
                if (pendingGain >= minThreshold) {
                    ascent += pendingGain;
                }
                pendingGain = 0;
            }
            pendingLoss += Math.abs(diff);
            if (pendingLoss >= minThreshold) {
                descent += pendingLoss;
                pendingLoss = 0;
            }
        }
    }

    // Flush remaining
    if (pendingGain >= minThreshold) ascent += pendingGain;
    if (pendingLoss >= minThreshold) descent += pendingLoss;

    return { ascent: Math.round(ascent), descent: Math.round(descent) };
}

// Douglas-Peucker simplification for elevation profile
function simplifyElevationProfile(elevations, tolerance = 3) {
    if (!elevations || elevations.length <= 2) return elevations;

    const points = elevations.map((e, i) => ({ index: i, elevation: e.elevation }));
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;

    const stack = [[0, points.length - 1]];

    while (stack.length > 0) {
        const [start, end] = stack.pop();
        let maxDist = 0;
        let maxIdx = -1;

        for (let i = start + 1; i < end; i++) {
            const dist = perpendicularDistance(points[i], points[start], points[end]);
            if (dist > maxDist) {
                maxDist = dist;
                maxIdx = i;
            }
        }

        if (maxDist > tolerance && maxIdx !== -1) {
            keep[maxIdx] = true;
            stack.push([start, maxIdx]);
            stack.push([maxIdx, end]);
        }
    }

    return elevations.filter((_, i) => keep[i]);
}

function perpendicularDistance(point, lineStart, lineEnd) {
    const x = point.index;
    const y = point.elevation;
    const x1 = lineStart.index;
    const y1 = lineStart.elevation;
    const x2 = lineEnd.index;
    const y2 = lineEnd.elevation;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return Math.abs(y - y1);

    return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}

// Full smoothing pipeline: moving average → threshold-based ascent/descent
function smoothAndCalculate(elevationData, options = {}) {
    const windowSize = options.windowSize || 5;
    const minThreshold = options.minThreshold || 5;

    const smoothed = movingAverage(elevationData, windowSize);
    return calculateAscentDescent(smoothed, minThreshold);
}

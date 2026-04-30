const express = require('express');
const app = express();
const PORT = 8002;

app.use(express.json());

// Simple routing endpoint (placeholder for Valhalla)
// This provides straight-line routing as fallback
app.post('/route', (req, res) => {
    try {
        const { locations } = req.body;
        
        if (!locations || locations.length < 2) {
            return res.status(400).json({ error: 'At least 2 locations required' });
        }
        
        // Calculate straight-line route
        const shape = locations.map(loc => `${loc.lon},${loc.lat}`).join(',');
        
        // Calculate total distance
        let totalDistance = 0;
        for (let i = 0; i < locations.length - 1; i++) {
            totalDistance += haversineDistance(
                locations[i].lat, locations[i].lon,
                locations[i + 1].lat, locations[i + 1].lon
            );
        }
        
        // Generate simple maneuvers
        const maneuvers = locations.map((loc, index) => ({
            instruction: index === 0 ? 'Partenza' : 
                        index === locations.length - 1 ? 'Arrivo' : 
                        `Procedi verso il punto ${index + 1}`,
            length: index < locations.length - 1 ? 
                    haversineDistance(
                        locations[index].lat, locations[index].lon,
                        locations[index + 1].lat, locations[index + 1].lon
                    ) : 0,
            type: 'straight'
        }));
        
        res.json({
            trip: {
                summary: {
                    length: totalDistance * 1000, // Convert to meters
                    time: totalDistance * 1000, // Rough estimate
                    elevation_gain: 0
                },
                legs: [{
                    shape: shape,
                    maneuvers: maneuvers
                }]
            }
        });
    } catch (error) {
        console.error('Routing error:', error);
        res.status(500).json({ error: 'Routing failed' });
    }
});

// Haversine distance calculation (in km)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'routing-placeholder' });
});

app.listen(PORT, () => {
    console.log(`Routing service running on port ${PORT}`);
});

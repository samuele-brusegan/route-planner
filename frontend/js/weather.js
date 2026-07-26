// Weather and sun integration using Open-Meteo API + astronomical calculations

const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';

// Fetch weather forecast for a coordinate
async function fetchWeather(lat, lon, days = 3) {
    const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,cloud_cover_mean,weather_code',
        timezone: 'auto',
        forecast_days: Math.min(days, 7)
    });

    const response = await fetch(`${WEATHER_API_URL}?${params}`);
    if (!response.ok) throw new Error(`Weather API error: ${response.status}`);

    return response.json();
}

// Get weather for all night markers (multi-day route)
async function fetchRouteWeather() {
    const nightMarkers = AppState.markers.filter(m => m.type === 'night');
    const waypoints = nightMarkers.length > 0 ? nightMarkers : AppState.markers;

    const weatherData = [];
    const days = Math.min(waypoints.length + 1, 7);

    // Use first waypoint for overall forecast
    if (waypoints.length > 0) {
        try {
            const data = await fetchWeather(waypoints[0].lat, waypoints[0].lon, days);
            weatherData.push(...parseDailyWeather(data));
        } catch (error) {
            console.error('Weather fetch error:', error);
        }
    }

    return weatherData;
}

function parseDailyWeather(data) {
    const daily = data.daily || {};
    const times = daily.time || [];
    const result = [];

    for (let i = 0; i < times.length; i++) {
        result.push({
            date: times[i],
            tempMax: daily.temperature_2m_max?.[i] ?? null,
            tempMin: daily.temperature_2m_min?.[i] ?? null,
            precipitation: daily.precipitation_sum?.[i] ?? 0,
            windMax: daily.wind_speed_10m_max?.[i] ?? 0,
            cloudCover: daily.cloud_cover_mean?.[i] ?? 0,
            weatherCode: daily.weather_code?.[i] ?? 0,
            description: weatherCodeToText(daily.weather_code?.[i] ?? 0)
        });
    }

    return result;
}

function weatherCodeToText(code) {
    const codes = {
        0: 'Sereno',
        1: 'Prevalentemente sereno',
        2: 'Parzialmente nuvoloso',
        3: 'Coperto',
        45: 'Nebbia',
        48: 'Nebbia con brina',
        51: 'Pioviggine leggera',
        53: 'Pioviggine moderata',
        55: 'Pioviggine intensa',
        61: 'Pioggia leggera',
        63: 'Pioggia moderata',
        65: 'Pioggia intensa',
        71: 'Neve leggera',
        73: 'Neve moderata',
        75: 'Neve intensa',
        80: 'Rovesci leggeri',
        81: 'Rovesci moderati',
        82: 'Rovesci violenti',
        95: 'Temporale',
        96: 'Temporale con grandine leggera',
        99: 'Temporale con grandine intensa'
    };
    return codes[code] || 'Sconosciuto';
}

// Sun times calculation (no API needed — astronomical formula)
function calculateSunTimes(lat, lon, date = new Date()) {
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);

    // Approximate solar declination
    const declination = 23.45 * Math.sin(rad * (360 / 365) * (dayOfYear - 81));

    // Hour angle
    const latRad = lat * rad;
    const decRad = declination * rad;
    const cosHourAngle = -Math.tan(latRad) * Math.tan(decRad);

    let sunrise = null;
    let sunset = null;

    if (cosHourAngle < -1) {
        // Polar day — no sunset
        sunrise = '00:00';
        sunset = '23:59';
    } else if (cosHourAngle > 1) {
        // Polar night — no sunrise
        sunrise = null;
        sunset = null;
    } else {
        const hourAngle = Math.acos(cosHourAngle) / rad;
        const solarNoon = 12 - lon / 15;
        const sunriseHour = solarNoon - hourAngle / 15;
        const sunsetHour = solarNoon + hourAngle / 15;

        sunrise = formatHour(sunriseHour);
        sunset = formatHour(sunsetHour);
    }

    return { sunrise, sunset, daylightHours: sunrise && sunset ? formatHour(sunsetHour - sunriseHour) : null };
}

function formatHour(hour) {
    if (hour < 0) hour += 24;
    if (hour >= 24) hour -= 24;
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Display weather in daily stats
async function updateWeatherInStats() {
    if (!AppState.route || AppState.markers.length < 2) return;

    try {
        const weather = await fetchRouteWeather();
        AppState.weatherData = weather;

        // Update daily stats display with weather
        if (AppState.dailyStats && AppState.dailyStats.length > 0) {
            AppState.dailyStats.forEach((day, i) => {
                if (weather[i]) {
                    day.weather = weather[i];
                    const nightMarker = AppState.markers.filter(m => m.type === 'night')[i];
                    if (nightMarker) {
                        const sun = calculateSunTimes(nightMarker.lat, nightMarker.lon);
                        day.sunrise = sun.sunrise;
                        day.sunset = sun.sunset;
                        day.daylightHours = sun.daylightHours;
                    }
                }
            });

            if (typeof updateStatistics === 'function') {
                updateStatistics();
            }
        }
    } catch (error) {
        console.error('Weather update error:', error);
    }
}

// Search functionality — proxy to Nominatim via backend

const SEARCH_API_URL = '/api/search';
const SEARCH_RADIUS_KM = 20;
let searchDebounceTimer = null;
let searchResultsContainer = null;

function initSearch() {
    const searchInput = document.getElementById('search-input');
    searchResultsContainer = document.getElementById('search-results');

    if (!searchInput || !searchResultsContainer) return;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        const query = searchInput.value.trim();

        if (query.length < 2) {
            searchResultsContainer.innerHTML = '';
            searchResultsContainer.style.display = 'none';
            return;
        }

        searchDebounceTimer = setTimeout(() => performSearch(query), 300);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResultsContainer.style.display = 'none';
        }
    });
}

async function performSearch(query) {
    try {
        const response = await fetch(`${SEARCH_API_URL}?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');

        const { results } = await response.json();
        const filtered = filterByMapProximity(results);
        displaySearchResults(filtered);
    } catch (error) {
        console.error('Search error:', error);
    }
}

function filterByMapProximity(results) {
    if (!results || results.length === 0) return [];
    if (typeof map === 'undefined' || !map) return results;

    const view = map.getView();
    const extent = view.calculateExtent(map.getSize());
    const transformed = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
    const [minLon, minLat, maxLon, maxLat] = transformed;

    // Expand extent by SEARCH_RADIUS_KM in all directions (~0.18 deg per 20km)
    const latBuffer = SEARCH_RADIUS_KM / 111;
    const lonBuffer = SEARCH_RADIUS_KM / (111 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180));

    const expandedMinLon = minLon - lonBuffer;
    const expandedMaxLon = maxLon + lonBuffer;
    const expandedMinLat = minLat - latBuffer;
    const expandedMaxLat = maxLat + latBuffer;

    return results.filter(r =>
        r.lat >= expandedMinLat && r.lat <= expandedMaxLat &&
        r.lon >= expandedMinLon && r.lon <= expandedMaxLon
    );
}

function displaySearchResults(results) {
    if (!searchResultsContainer) return;

    if (!results || results.length === 0) {
        searchResultsContainer.innerHTML = `<div class="search-result-item">Nessun risultato entro ${SEARCH_RADIUS_KM} km dalla mappa</div>`;
        searchResultsContainer.style.display = 'block';
        return;
    }

    const lastMarker = AppState.markers.length > 0 ? AppState.markers[AppState.markers.length - 1] : null;

    searchResultsContainer.innerHTML = results.map(r => {
        const icon = getSearchIcon(r.class, r.type);
        let distHtml = '';
        if (lastMarker) {
            const dist = haversineDistance(lastMarker.lat, lastMarker.lon, r.lat, r.lon);
            distHtml = `<span class="search-dist">${dist.toFixed(1)} km dall'ultimo punto</span>`;
        }
        return `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}">
            <span class="search-icon">${icon}</span>
            <span class="search-name">${r.name}</span>
            ${distHtml}
        </div>`;
    }).join('');

    searchResultsContainer.style.display = 'block';

    searchResultsContainer.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            flyToLocation(lat, lon);
            searchResultsContainer.style.display = 'none';
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';
        });
    });
}

function getSearchIcon(cls, type) {
    const icons = {
        place: '📍',
        mountain: '🏔️',
        peak: '🏔️',
        tourism: '🏨',
        amenity: '🏛️',
        natural: '🌿',
        highway: '🛣️',
        waterway: '💧'
    };
    return icons[cls] || icons[type] || '📍';
}

function flyToLocation(lat, lon) {
    if (typeof map === 'undefined') return;
    const view = map.getView();
    view.animate({
        center: ol.proj.fromLonLat([lon, lat]),
        duration: 1000
    });
    view.setZoom(14);
}

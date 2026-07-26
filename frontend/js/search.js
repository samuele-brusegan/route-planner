// Search functionality — proxy to Nominatim via backend

const SEARCH_API_URL = '/api/search';
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
        displaySearchResults(results);
    } catch (error) {
        console.error('Search error:', error);
    }
}

function displaySearchResults(results) {
    if (!searchResultsContainer) return;

    if (!results || results.length === 0) {
        searchResultsContainer.innerHTML = '<div class="search-result-item">Nessun risultato</div>';
        searchResultsContainer.style.display = 'block';
        return;
    }

    searchResultsContainer.innerHTML = results.map(r => {
        const icon = getSearchIcon(r.class, r.type);
        return `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}">
            <span class="search-icon">${icon}</span>
            <span class="search-name">${r.name}</span>
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

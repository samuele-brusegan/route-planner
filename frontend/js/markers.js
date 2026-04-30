// Marker management functions

// Update markers list in UI
function updateMarkersList() {
    const container = document.getElementById('markers-list');
    container.innerHTML = '';
    
    AppState.markers.forEach((marker, index) => {
        const markerType = AppState.markerTypes.find(t => t.id === marker.type);
        
        const item = document.createElement('div');
        item.className = 'marker-item';
        item.draggable = true;
        item.dataset.index = index;
        item.innerHTML = `
            <div class="marker-info">
                <div class="marker-name">${marker.name}</div>
                <div class="marker-type">${markerType.icon} ${markerType.name}</div>
            </div>
            <div class="marker-actions">
                <button onclick="editMarker('${marker.id}')" title="Modifica">✏️</button>
                <button onclick="deleteMarker('${marker.id}')" title="Elimina">🗑️</button>
            </div>
        `;
        
        // Drag and drop handlers
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
        
        container.appendChild(item);
    });
}

// Update marker types list in UI
function updateMarkerTypesList() {
    const container = document.getElementById('marker-types-list');
    container.innerHTML = '';
    
    AppState.markerTypes.forEach(type => {
        const item = document.createElement('div');
        item.className = 'marker-type-item';
        item.innerHTML = `
            <div class="type-color" style="background-color: ${type.color}"></div>
            <div class="type-info">
                <div class="type-name">${type.icon} ${type.name}</div>
            </div>
            <div class="type-actions">
                <button onclick="editMarkerType('${type.id}')" title="Modifica">✏️</button>
                <button onclick="deleteMarkerType('${type.id}')" title="Elimina">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Edit marker
function editMarker(markerId) {
    const marker = AppState.markers.find(m => m.id === markerId);
    if (!marker) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Modifica Punto</h3>
            <select id="edit-marker-type">
                ${AppState.markerTypes.map(type => 
                    `<option value="${type.id}" ${type.id === marker.type ? 'selected' : ''}>${type.icon} ${type.name}</option>`
                ).join('')}
            </select>
            <input type="text" id="edit-marker-name" value="${marker.name}" placeholder="Nome del punto">
            <div class="modal-actions">
                <button class="btn secondary" id="cancel-edit-marker">Annulla</button>
                <button class="btn primary" id="confirm-edit-marker">Salva</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('cancel-edit-marker').addEventListener('click', () => modal.remove());
    
    document.getElementById('confirm-edit-marker').addEventListener('click', () => {
        marker.type = document.getElementById('edit-marker-type').value;
        marker.name = document.getElementById('edit-marker-name').value;
        
        saveToLocalStorage();
        clearMapMarkers();
        AppState.markers.forEach(m => addMarkerToMap(m));
        updateUI();
        
        if (AppState.markers.length >= 2) {
            calculateRoute();
        }
        
        modal.remove();
    });
}

// Delete marker
function deleteMarker(markerId) {
    if (confirm('Sei sicuro di voler eliminare questo punto?')) {
        AppState.markers = AppState.markers.filter(m => m.id !== markerId);
        
        // Update order
        AppState.markers.forEach((m, i) => m.order = i);
        
        saveToLocalStorage();
        clearMapMarkers();
        AppState.markers.forEach(m => addMarkerToMap(m));
        updateUI();
        
        if (AppState.markers.length >= 2) {
            calculateRoute();
        } else {
            clearRoute();
            AppState.route = null;
            AppState.directions = [];
        }
    }
}

// Add new marker type
function addMarkerType() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Nuovo Tipo Segnaposto</h3>
            <input type="text" id="new-type-name" placeholder="Nome del tipo">
            <input type="text" id="new-type-icon" placeholder="Icona (emoji)" value="📍">
            <input type="color" id="new-type-color" value="#3498db">
            <div class="modal-actions">
                <button class="btn secondary" id="cancel-add-type">Annulla</button>
                <button class="btn primary" id="confirm-add-type">Aggiungi</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('cancel-add-type').addEventListener('click', () => modal.remove());
    
    document.getElementById('confirm-add-type').addEventListener('click', () => {
        const name = document.getElementById('new-type-name').value;
        const icon = document.getElementById('new-type-icon').value || '📍';
        const color = document.getElementById('new-type-color').value;
        
        if (!name) {
            alert('Inserisci un nome per il tipo');
            return;
        }
        
        const newType = {
            id: 'type_' + Date.now(),
            name: name,
            icon: icon,
            color: color
        };
        
        AppState.markerTypes.push(newType);
        saveToLocalStorage();
        updateUI();
        modal.remove();
    });
}

// Edit marker type
function editMarkerType(typeId) {
    const type = AppState.markerTypes.find(t => t.id === typeId);
    if (!type) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Modifica Tipo Segnaposto</h3>
            <input type="text" id="edit-type-name" value="${type.name}" placeholder="Nome del tipo">
            <input type="text" id="edit-type-icon" value="${type.icon}" placeholder="Icona (emoji)">
            <input type="color" id="edit-type-color" value="${type.color}">
            <div class="modal-actions">
                <button class="btn secondary" id="cancel-edit-type">Annulla</button>
                <button class="btn primary" id="confirm-edit-type">Salva</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('cancel-edit-type').addEventListener('click', () => modal.remove());
    
    document.getElementById('confirm-edit-type').addEventListener('click', () => {
        type.name = document.getElementById('edit-type-name').value;
        type.icon = document.getElementById('edit-type-icon').value || '📍';
        type.color = document.getElementById('edit-type-color').value;
        
        saveToLocalStorage();
        clearMapMarkers();
        AppState.markers.forEach(m => addMarkerToMap(m));
        updateUI();
        modal.remove();
    });
}

// Delete marker type
function deleteMarkerType(typeId) {
    const type = AppState.markerTypes.find(t => t.id === typeId);
    
    // Check if type is in use
    const inUse = AppState.markers.some(m => m.type === typeId);
    if (inUse) {
        alert('Questo tipo è in uso. Non può essere eliminato.');
        return;
    }
    
    if (confirm(`Sei sicuro di voler eliminare "${type.name}"?`)) {
        AppState.markerTypes = AppState.markerTypes.filter(t => t.id !== typeId);
        saveToLocalStorage();
        updateUI();
    }
}

// Drag and drop handlers
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.style.opacity = '0.5';
}

function handleDragOver(e) {
    e.preventDefault();
    this.style.border = '2px dashed #4a90a4';
}

function handleDrop(e) {
    e.preventDefault();
    this.style.border = '1px solid #eee';
    
    if (draggedItem !== this) {
        const fromIndex = parseInt(draggedItem.dataset.index);
        const toIndex = parseInt(this.dataset.index);
        
        // Reorder markers
        const marker = AppState.markers.splice(fromIndex, 1)[0];
        AppState.markers.splice(toIndex, 0, marker);
        
        // Update order
        AppState.markers.forEach((m, i) => m.order = i);
        
        saveToLocalStorage();
        clearMapMarkers();
        AppState.markers.forEach(m => addMarkerToMap(m));
        updateUI();
        
        if (AppState.markers.length >= 2) {
            calculateRoute();
        }
    }
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    document.querySelectorAll('.marker-item').forEach(item => {
        item.style.border = '1px solid #eee';
    });
}

// Marker management functions

// Update markers list in UI
function updateMarkersList() {
    const container = document.getElementById('markers-list');
    container.innerHTML = '';
    container.classList.toggle('dragging', Boolean(draggedItem));
    
    for (let index = 0; index <= AppState.markers.length; index++) {
        if (index < AppState.markers.length) {
            const slot = createMarkerInsertSlot(index);
            container.appendChild(slot);
        }

        if (index === AppState.markers.length) {
            const tailSlot = createMarkerTailSlot(index);
            container.appendChild(tailSlot);
            break;
        }

        const marker = AppState.markers[index];
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
    }
}

function createMarkerInsertSlot(index) {
    const slot = document.createElement('div');
    slot.className = 'marker-insert-slot';
    slot.dataset.index = index;
    slot.innerHTML = `
        <div class="marker-insert-line"></div>
        <button type="button" class="marker-insert-button" title="Inserisci punto qui">+</button>
    `;

    slot.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        startMarkerInsertMode(index);
    });

    slot.addEventListener('dragover', handleInsertSlotDragOver);
    slot.addEventListener('dragenter', handleInsertSlotDragEnter);
    slot.addEventListener('dragleave', handleInsertSlotDragLeave);
    slot.addEventListener('drop', handleInsertSlotDrop);

    return slot;
}

function createMarkerTailSlot(index) {
    const slot = document.createElement('div');
    slot.className = 'marker-insert-slot marker-insert-slot-tail';
    slot.dataset.index = index;
    slot.innerHTML = `
        <div class="marker-insert-line"></div>
        <button type="button" class="marker-insert-button" title="Aggiungi in coda">+</button>
    `;

    slot.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        startMarkerInsertMode(index);
    });

    slot.addEventListener('dragover', handleInsertSlotDragOver);
    slot.addEventListener('dragenter', handleInsertSlotDragEnter);
    slot.addEventListener('dragleave', handleInsertSlotDragLeave);
    slot.addEventListener('drop', handleInsertSlotDrop);

    return slot;
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
        UndoManager.push();
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
        UndoManager.push();
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
            showToast('Inserisci un nome per il tipo', 'warn');
            return;
        }
        
        UndoManager.push();
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
        UndoManager.push();
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
        showToast('Questo tipo è in uso. Non può essere eliminato.', 'warn');
        return;
    }
    
    if (confirm(`Sei sicuro di voler eliminare "${type.name}"?`)) {
        UndoManager.push();
        AppState.markerTypes = AppState.markerTypes.filter(t => t.id !== typeId);
        saveToLocalStorage();
        updateUI();
    }
}

// Drag and drop handlers
let draggedItem = null;
let activeInsertSlot = null;

function handleDragStart(e) {
    draggedItem = this;
    this.style.opacity = '0.5';
    const container = document.getElementById('markers-list');
    if (container) {
        container.classList.add('dragging');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    if (!draggedItem) return;

    const index = Number(this.dataset.index);
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const targetSlot = e.clientY < midpoint ? index : index + 1;
    setActiveInsertSlot(targetSlot);
}

function handleDrop(e) {
    e.preventDefault();
    if (draggedItem === this) return;

    const fromIndex = parseInt(draggedItem.dataset.index, 10);
    const toIndex = Number.isFinite(activeInsertSlot)
        ? activeInsertSlot
        : parseInt(this.dataset.index, 10);
    if (fromIndex !== toIndex) {
        UndoManager.push();
    }
    moveMarker(fromIndex, toIndex);
    finalizeMarkerReorder();
}

function handleInsertSlotDragEnter(e) {
    e.preventDefault();
    setActiveInsertSlot(Number(this.dataset.index));
}

function handleInsertSlotDragOver(e) {
    e.preventDefault();
    setActiveInsertSlot(Number(this.dataset.index));
}

function handleInsertSlotDragLeave(e) {
    if (e.relatedTarget && this.contains(e.relatedTarget)) {
        return;
    }

    if (activeInsertSlot === Number(this.dataset.index)) {
        clearActiveInsertSlot();
    }
}

function handleInsertSlotDrop(e) {
    e.preventDefault();
    if (!draggedItem) {
        startMarkerInsertMode(Number(this.dataset.index));
        return;
    }

    const fromIndex = parseInt(draggedItem.dataset.index, 10);
    const toIndex = parseInt(this.dataset.index, 10);
    if (fromIndex !== toIndex) {
        UndoManager.push();
    }
    moveMarker(fromIndex, toIndex);
    finalizeMarkerReorder();
}

function setActiveInsertSlot(index) {
    activeInsertSlot = Number.isFinite(Number(index)) ? Number(index) : null;
    document.querySelectorAll('.marker-insert-slot').forEach(slot => {
        slot.classList.toggle('active', Number(slot.dataset.index) === activeInsertSlot);
    });
}

function clearActiveInsertSlot() {
    activeInsertSlot = null;
    document.querySelectorAll('.marker-insert-slot').forEach(slot => {
        slot.classList.remove('active');
    });
}

function startMarkerInsertMode(index) {
    AppState.pendingMarkerInsertIndex = Number(index);
    const slotLabel = Number(index) >= AppState.markers.length
        ? 'in coda'
        : `tra i punti ${Number(index) + 1} e ${Number(index) + 2}`;
    showToast(`Clicca sulla mappa per inserire un nuovo punto ${slotLabel}.`, 'info');
}

function finalizeMarkerReorder() {
    clearActiveInsertSlot();
    draggedItem = null;
    saveToLocalStorage();
    clearMapMarkers();
    AppState.markers.forEach(m => addMarkerToMap(m));
    updateUI();

    if (AppState.markers.length >= 2) {
        calculateRoute();
    }
}

function handleDragEnd() {
    this.style.opacity = '';
    draggedItem = null;
    clearActiveInsertSlot();
    const container = document.getElementById('markers-list');
    if (container) {
        container.classList.remove('dragging');
    }
    updateMarkersList();
}

// Turn-by-turn directions management

// Group consecutive directions on the same road into a single step
function groupDirections(directions) {
    if (!directions || directions.length === 0) return [];

    const grouped = [];
    let currentGroup = null;

    directions.forEach((dir, i) => {
        const isDepart = dir.type === 1 || dir.type === 'depart';
        const isArrive = dir.type === 2 || dir.type === 'arrive' || dir.type === 4 || dir.type === 'arrive_right' || dir.type === 'arrive_left';
        const isCustom = dir.type === 'custom';
        const roadName = (dir.streetName || '').trim();

        // Always start a new group for depart, arrive, or custom directions
        if (isDepart || isArrive || isCustom) {
            if (currentGroup) {
                grouped.push(currentGroup);
                currentGroup = null;
            }
            grouped.push({ ...dir, groupedIndices: [i] });
            return;
        }

        // Start or extend a group on the same road
        if (currentGroup && roadName && currentGroup.streetName === roadName) {
            currentGroup.distance += dir.distance;
            currentGroup.groupedIndices.push(i);
            // Keep the last instruction as the transition action
            currentGroup.lastInstruction = dir.instruction;
        } else {
            if (currentGroup) {
                grouped.push(currentGroup);
            }
            currentGroup = {
                ...dir,
                distance: dir.distance,
                groupedIndices: [i],
                firstInstruction: dir.instruction,
                lastInstruction: dir.instruction
            };
        }
    });

    if (currentGroup) {
        grouped.push(currentGroup);
    }

    return grouped;
}

// Format a distance value for display
function formatDistance(meters) {
    if (!meters || meters === 0) return '';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
}

// Clean up a Valhalla instruction by removing redundant road name references
function cleanInstruction(instruction, roadName) {
    if (!instruction) return '';
    let text = instruction;
    // Remove "su [roadName]" or "per rimanere su [roadName]" if we already mention the road
    if (roadName) {
        const escaped = roadName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(` per rimanere su ${escaped}`, 'i'), '');
        text = text.replace(new RegExp(` su ${escaped}`, 'i'), '');
    }
    return text.trim();
}

// Update directions list in UI
function updateDirectionsList() {
    const container = document.getElementById('directions-list');
    container.innerHTML = '';
    
    if (AppState.directions.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">Nessuna indicazione disponibile</p>';
        return;
    }

    const grouped = groupDirections(AppState.directions);
    
    grouped.forEach((direction, index) => {
        const item = document.createElement('div');
        item.className = 'direction-item';
        item.innerHTML = `
            <div class="direction-text">${index + 1}. ${formatDirection(direction)}</div>
            ${direction.note ? `<div class="direction-note">📝 ${direction.note}</div>` : ''}
            <div class="direction-actions">
                <button onclick="addDirectionNote(${direction.groupedIndices ? direction.groupedIndices[0] : index})" title="Aggiungi nota">📝</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Format direction text
function formatDirection(direction) {
    const isDepart = direction.type === 1 || direction.type === 'depart';
    const isArrive = direction.type === 2 || direction.type === 'arrive' || direction.type === 4;
    const isCustom = direction.type === 'custom';
    const roadName = (direction.streetName || '').trim();
    const dist = formatDistance(direction.distance);

    // Custom directions: use text as-is
    if (isCustom) {
        return direction.instruction;
    }

    // Departure
    if (isDepart) {
        if (roadName) return `Partenza su ${roadName}`;
        return 'Partenza';
    }

    // Arrival
    if (isArrive) {
        return 'Arrivo a destinazione';
    }

    // Grouped direction (same road, multiple maneuvers merged)
    if (direction.groupedIndices && direction.groupedIndices.length > 1) {
        let text = `Prosegui per ${dist}`;
        if (roadName) text += ` su ${roadName}`;
        // Add transition action from the last maneuver in the group
        const transition = cleanInstruction(direction.lastInstruction, roadName);
        if (transition && transition.toLowerCase() !== 'prosegui') {
            text += `, poi ${transition}`;
        }
        return text;
    }

    // Single direction with road name
    if (roadName) {
        let text = `Prosegui per ${dist} su ${roadName}`;
        const action = cleanInstruction(direction.instruction, roadName);
        if (action && action.toLowerCase() !== 'prosegui' && action.toLowerCase() !== roadName.toLowerCase()) {
            text += `, poi ${action}`;
        }
        return text;
    }

    // Single direction without road name
    if (dist) {
        let text = `Prosegui per ${dist}`;
        const action = direction.instruction;
        if (action && action.toLowerCase() !== 'prosegui') {
            text += `, ${action}`;
        }
        return text;
    }

    return direction.instruction || 'Prosegui';
}

// Add note to direction
function addDirectionNote(index) {
    const direction = AppState.directions[index];
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Aggiungi Nota</h3>
            <textarea id="direction-note-input" placeholder="Scrivi una nota per questa indicazione...">${direction.note || ''}</textarea>
            <div class="modal-actions">
                <button class="btn secondary" id="cancel-direction-note">Annulla</button>
                <button class="btn primary" id="confirm-direction-note">Salva</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('cancel-direction-note').addEventListener('click', () => modal.remove());
    
    document.getElementById('confirm-direction-note').addEventListener('click', () => {
        direction.note = document.getElementById('direction-note-input').value;
        saveToLocalStorage();
        updateDirectionsList();
        modal.remove();
    });
}

// Add custom direction between existing ones
function addCustomDirection(afterIndex) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Aggiungi Indicazione Personalizzata</h3>
            <textarea id="custom-direction-input" placeholder="Descrivi l'indicazione..."></textarea>
            <div class="modal-actions">
                <button class="btn secondary" id="cancel-custom-direction">Annulla</button>
                <button class="btn primary" id="confirm-custom-direction">Aggiungi</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('cancel-custom-direction').addEventListener('click', () => modal.remove());
    
    document.getElementById('confirm-custom-direction').addEventListener('click', () => {
        const text = document.getElementById('custom-direction-input').value;
        if (!text) {
            showToast('Inserisci una descrizione', 'warn');
            return;
        }
        
        const newDirection = {
            instruction: text,
            distance: 0,
            type: 'custom',
            note: ''
        };
        
        AppState.directions.splice(afterIndex + 1, 0, newDirection);
        saveToLocalStorage();
        updateDirectionsList();
        modal.remove();
    });
}

// Export directions as text
function exportDirectionsAsText() {
    let text = 'INDICAZIONI\n';
    text += '============\n\n';
    
    const grouped = groupDirections(AppState.directions);
    grouped.forEach((direction, index) => {
        text += `${index + 1}. ${formatDirection(direction)}\n`;
        if (direction.note) {
            text += `   Nota: ${direction.note}\n`;
        }
        text += '\n';
    });
    
    return text;
}

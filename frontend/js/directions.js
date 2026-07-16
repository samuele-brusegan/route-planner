// Turn-by-turn directions management

// Update directions list in UI
function updateDirectionsList() {
    const container = document.getElementById('directions-list');
    container.innerHTML = '';
    
    if (AppState.directions.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">Nessuna indicazione disponibile</p>';
        return;
    }
    
    AppState.directions.forEach((direction, index) => {
        const item = document.createElement('div');
        item.className = 'direction-item';
        item.innerHTML = `
            <div class="direction-text">${index + 1}. ${formatDirection(direction)}</div>
            ${direction.note ? `<div class="direction-note">📝 ${direction.note}</div>` : ''}
            <div class="direction-actions">
                <button onclick="addDirectionNote(${index})" title="Aggiungi nota">📝</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Format direction text
function formatDirection(direction) {
    let text = direction.instruction;
    
    if (direction.distance) {
        const dist = direction.distance < 1000 
            ? `${Math.round(direction.distance)}m` 
            : `${(direction.distance / 1000).toFixed(1)}km`;
        text = `Cammina per ${dist} e poi ${text.toLowerCase()}`;
    }
    
    return text;
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
    
    AppState.directions.forEach((direction, index) => {
        text += `${index + 1}. ${formatDirection(direction)}\n`;
        if (direction.note) {
            text += `   Nota: ${direction.note}\n`;
        }
        text += '\n';
    });
    
    return text;
}

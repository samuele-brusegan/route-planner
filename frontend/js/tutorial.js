// First-launch tutorial — overlay walkthrough highlighting key UI elements
// Triggered only on first visit (detected via localStorage)

const TUTORIAL_STEPS = [
    {
        target: '#search-input',
        title: 'Cerca luoghi',
        text: 'Cerca posti, montagne, rifugi entro 20 km dalla vista mappa attuale.',
        position: 'bottom'
    },
    {
        target: '[data-panel-toggle="left-panel"]',
        title: 'Punti percorso',
        text: 'Gestisci i marker del tuo itinerario. Aggiungi punti notte, rifornimento e tappe.',
        position: 'right'
    },
    {
        target: '[data-panel-toggle="right-panel"]',
        title: 'Statistiche',
        text: 'Visualizza distanza, dislivello, tempi e statistiche giornaliere.',
        position: 'left'
    },
    {
        target: '[data-panel-toggle="bottom-panel"]',
        title: 'Profilo altimetrico',
        text: 'Grafico dell\'elevazione con colori per giorno e pendenza.',
        position: 'top'
    },
    {
        target: '[data-panel-toggle="directions-panel"]',
        title: 'Indicazioni',
        text: 'Navigazione turn-by-turn generata dal motore Valhalla.',
        position: 'left'
    },
    {
        target: '[data-panel-toggle="overlay-routes-panel"]',
        title: 'Route Overlay',
        text: 'Carica file GPX come sovrapposizioni per confrontare percorsi.',
        position: 'left'
    },
    {
        target: '#toolbar-settings',
        title: 'Impostazioni',
        text: 'Configura pannelli, debug routing, overlay mappe e mappe offline.',
        position: 'left'
    },
    {
        target: '#toolbar-export',
        title: 'Esporta',
        text: 'Esporta in GPX (completo o per giorni), ZIP, PNG, PDF o condividi via link.',
        position: 'left'
    },
    {
        target: '#toolbar-add-marker',
        title: 'Aggiungi punto',
        text: 'Clicca per aggiungere un punto alla route, oppure clicca direttamente sulla mappa.',
        position: 'left'
    }
];

const TUTORIAL_KEY = 'routePlannerTutorialDone';

function shouldShowTutorial() {
    return !localStorage.getItem(TUTORIAL_KEY);
}

function markTutorialDone() {
    localStorage.setItem(TUTORIAL_KEY, '1');
}

function showTutorial() {
    if (!shouldShowTutorial()) return;

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;pointer-events:none;';

    const tooltip = document.createElement('div');
    tooltip.id = 'tutorial-tooltip';
    tooltip.style.cssText = 'position:fixed;background:var(--bg-card);border:1px solid var(--accent);border-radius:12px;padding:20px;max-width:320px;z-index:10001;box-shadow:0 8px 32px rgba(0,0,0,0.3);pointer-events:auto;';

    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);

    let currentStep = 0;

    function renderStep() {
        if (currentStep >= TUTORIAL_STEPS.length) {
            closeTutorial();
            return;
        }

        const step = TUTORIAL_STEPS[currentStep];
        const targetEl = document.querySelector(step.target);

        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const rect = targetEl.getBoundingClientRect();

            // Highlight target
            overlay.style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.left}px 0, ${rect.left}px ${rect.bottom + 4}px, ${rect.right + 4}px ${rect.bottom + 4}px, ${rect.right + 4}px ${rect.top - 4}px, ${rect.left}px ${rect.top - 4}px, ${rect.left}px 0)`;
            overlay.style.pointerEvents = 'none';

            // Position tooltip
            let tipX, tipY;
            const tipW = 320;
            const tipH = 160;

            switch (step.position) {
                case 'bottom':
                    tipX = rect.left + rect.width / 2 - tipW / 2;
                    tipY = rect.bottom + 12;
                    break;
                case 'top':
                    tipX = rect.left + rect.width / 2 - tipW / 2;
                    tipY = rect.top - tipH - 12;
                    break;
                case 'right':
                    tipX = rect.right + 12;
                    tipY = rect.top + rect.height / 2 - tipH / 2;
                    break;
                case 'left':
                    tipX = rect.left - tipW - 12;
                    tipY = rect.top + rect.height / 2 - tipH / 2;
                    break;
                default:
                    tipX = rect.right + 12;
                    tipY = rect.top;
            }

            // Keep tooltip on screen
            tipX = Math.max(12, Math.min(tipX, window.innerWidth - tipW - 12));
            tipY = Math.max(12, Math.min(tipY, window.innerHeight - tipH - 12));

            tooltip.style.left = tipX + 'px';
            tooltip.style.top = tipY + 'px';
        }

        tooltip.innerHTML = `
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Passo ${currentStep + 1} di ${TUTORIAL_STEPS.length}</div>
            <h3 style="font-size:16px;margin:0 0 8px;color:var(--text)">${step.title}</h3>
            <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px;line-height:1.5">${step.text}</p>
            <div style="display:flex;justify-content:space-between;align-items:center">
                <button id="tutorial-skip" style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer">Salta</button>
                <div>
                    ${currentStep > 0 ? '<button id="tutorial-prev" style="background:var(--bg-alt);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;margin-right:8px">Indietro</button>' : ''}
                    <button id="tutorial-next" style="background:var(--accent);border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px">${currentStep === TUTORIAL_STEPS.length - 1 ? 'Fine' : 'Avanti'}</button>
                </div>
            </div>
        `;

        document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
        const prevBtn = document.getElementById('tutorial-prev');
        if (prevBtn) prevBtn.addEventListener('click', () => { currentStep--; renderStep(); });
        document.getElementById('tutorial-next').addEventListener('click', () => { currentStep++; renderStep(); });
    }

    function closeTutorial() {
        const ov = document.getElementById('tutorial-overlay');
        const tip = document.getElementById('tutorial-tooltip');
        if (ov) ov.remove();
        if (tip) tip.remove();
        markTutorialDone();
    }

    // Start after a short delay to let UI settle
    setTimeout(renderStep, 500);
}

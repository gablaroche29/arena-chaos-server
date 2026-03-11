// ─── Vote Token State ─────────────────────────────────────────────────────────
const MAX_TOKENS = 3;
const REGEN_MS = 3000;

let tokens = MAX_TOKENS;
let regenStart = null; // timestamp when current regen tick started

function setTokens(n) {
    tokens = Math.min(MAX_TOKENS, Math.max(0, n));
    renderTokens();
    setVoteButtonsDisabled(tokens === 0);

    if (tokens < MAX_TOKENS && regenStart === null) {
        regenStart = Date.now();
    } else if (tokens >= MAX_TOKENS) {
        regenStart = null;
    }
}

function consumeToken() {
    if (tokens <= 0) return false;
    setTokens(tokens - 1);
    return true;
}

function renderTokens() {
    for (let i = 0; i < MAX_TOKENS; i++) {
        const pip = document.getElementById(`pip-${i}`);
        if (!pip) continue;
        pip.classList.toggle('filled', i < tokens);
        pip.classList.toggle('empty', i >= tokens);
    }
}

function setVoteButtonsDisabled(disabled) {
    document.querySelectorAll('.btn-vote').forEach(btn => {
        btn.disabled = disabled;
    });
}

// Regen tick — runs every 100ms for smooth progress bar
setInterval(() => {
    if (tokens >= MAX_TOKENS || regenStart === null) {
        document.getElementById('regen-bar').style.width = '0%';
        document.getElementById('regen-timer').textContent = '—';
        return;
    }

    const elapsed = Date.now() - regenStart;
    const progress = Math.min(elapsed / REGEN_MS, 1);
    document.getElementById('regen-bar').style.width = (progress * 100) + '%';

    const remaining = Math.ceil((REGEN_MS - elapsed) / 1000);
    document.getElementById('regen-timer').textContent = remaining + 's';

    if (elapsed >= REGEN_MS) {
        regenStart = tokens + 1 < MAX_TOKENS ? Date.now() : null;
        setTokens(tokens + 1);
    }
}, 100);

// ─── WebSocket ────────────────────────────────────────────────────────────────
const socket = new WebSocket(`ws://${window.location.host}`);

socket.onopen = () => {
    document.getElementById('ws-status').textContent = 'CONNECTED';
    document.getElementById('ws-status').style.color = '#22c55e';
};

socket.onclose = () => {
    document.getElementById('ws-status').textContent = 'OFFLINE';
    document.getElementById('ws-status').style.color = '#ef4444';
};

socket.onerror = () => {
    document.getElementById('ws-status').textContent = 'ERROR';
    document.getElementById('ws-status').style.color = '#ef4444';
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'VOTE_UPDATE') {
        const e = data.event;
        updateVoteDisplay(e.type, e.vote_count, e.vote_required);
        return;
    }

    if (data.type === 'EVENT_TRIGGERED') {
        const { type } = data.event;
        // Reset vote counter for triggered event
        const voteEl = document.getElementById(`votes_${type}`);
        if (voteEl) voteEl.textContent = '0';
        // Reset bar for triggered event
        const barEl = document.getElementById(`bar_${type}`);
        if (barEl) barEl.style.width = '0%';
        return;
    }
};

// ─── Vote display helpers ─────────────────────────────────────────────────────
// Track all known vote counts to compute relative bar widths
const voteCounts = {};

function updateVoteDisplay(type, count, required) {
    // Update vote count text — show "count / required" if required is known
    const voteEl = document.getElementById(`votes_${type}`);
    if (voteEl) {
        voteEl.textContent = required != null ? `${count} / ${required}` : count;
    }

    // Update progress bar relative to required votes (or relative to peers)
    voteCounts[type] = count;
    const maxRef = required != null ? required : Math.max(...Object.values(voteCounts), 1);

    for (const key in voteCounts) {
        const bar = document.getElementById(`bar_${key}`);
        if (bar) {
            const pct = Math.min((voteCounts[key] / maxRef) * 100, 100);
            bar.style.width = pct + '%';
        }
    }
}

// ─── Vote action ──────────────────────────────────────────────────────────────
async function vote(type) {
    if (!consumeToken()) return;

    await fetch('/api/events/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
    });
}

// ─── Load player info from session ───────────────────────────────────────────
async function loadPlayer() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        const name = data.username || data.name || '—';
        document.getElementById('player-name').textContent = name.toUpperCase();
    } catch (_) {
        // /api/me not available or not logged in — leave placeholder
    }
}

loadPlayer();

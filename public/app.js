// ─── Vote Token — localStorage persistence ────────────────────────────────────
//
// Storage key is scoped per username so different players on the same device
// don't share tokens. Falls back to a guest key before the username is loaded.
//
// Stored shape: { tokens: number, regenStart: number|null }
//   regenStart is a Unix ms timestamp of when the current regen tick began.
//   On page load we fast-forward any regen that happened while the page was closed.

const MAX_TOKENS = 3;
const REGEN_MS = 3000;

let currentUsername = null; // set once /api/auth/me resolves

function storageKey() {
    return `arena_tokens_${currentUsername ?? 'guest'}`;
}

function saveTokenState() {
    try {
        localStorage.setItem(storageKey(), JSON.stringify({
            tokens,
            regenStart,
        }));
    } catch (_) { /* storage unavailable — degrade silently */ }
}

function loadTokenState() {
    try {
        const raw = localStorage.getItem(storageKey());
        if (!raw) return;
        const saved = JSON.parse(raw);

        let t = Math.min(MAX_TOKENS, Math.max(0, saved.tokens ?? MAX_TOKENS));
        let rs = saved.regenStart ?? null;

        // Fast-forward: if the page was closed while regen was ticking,
        // calculate how many tokens would have regenerated in the meantime.
        if (rs !== null && t < MAX_TOKENS) {
            const elapsed = Date.now() - rs;
            if (elapsed > 0) {
                const ticks = Math.floor(elapsed / REGEN_MS);
                t = Math.min(MAX_TOKENS, t + ticks);
                // Shift regenStart forward by the consumed ticks
                rs = t < MAX_TOKENS ? rs + ticks * REGEN_MS : null;
            }
        }

        // Apply without triggering another save (we'll save after username resolves)
        tokens = t;
        regenStart = rs;
        renderTokens();
        setVoteButtonsDisabled(tokens === 0);
    } catch (_) { /* corrupted data — start fresh */ }
}

// Called after username is known so we can migrate from the guest key
function migrateToUserKey(username) {
    const guestKey = 'arena_tokens_guest';
    const userKey = `arena_tokens_${username}`;

    // If there's already a user-specific key, use it (don't overwrite with guest state)
    if (localStorage.getItem(userKey)) return;

    // Otherwise, move the guest key over
    const raw = localStorage.getItem(guestKey);
    if (raw) {
        localStorage.setItem(userKey, raw);
        localStorage.removeItem(guestKey);
    }
}

// ─── Token state ──────────────────────────────────────────────────────────────

let tokens = MAX_TOKENS;
let regenStart = null;

// Tracks which event types the current user has already voted on this round.
// Cleared per-event when EVENT_TRIGGERED fires for that event.
const votedEvents = new Set();

function setTokens(n) {
    tokens = Math.min(MAX_TOKENS, Math.max(0, n));
    renderTokens();
    setVoteButtonsDisabled(tokens === 0);

    if (tokens < MAX_TOKENS && regenStart === null) {
        regenStart = Date.now();
    } else if (tokens >= MAX_TOKENS) {
        regenStart = null;
    }

    saveTokenState();
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
    // After any enable pass, re-lock every button the user already voted on.
    // This runs even when disabled=true (harmless) so the logic is always consistent.
    reapplyVotedLocks();
}

function reapplyVotedLocks() {
    votedEvents.forEach(type => {
        const btn = document.getElementById(`btn_${type}`);
        if (btn) btn.disabled = true;
    });
}

function setVoteButtonDisabled(disabled, type) {
    const btnEl = document.getElementById(`btn_${type}`);
    if (!btnEl) { return; }
    btnEl.disabled = disabled;
}

// ─── Regen ticker — runs every 100 ms ─────────────────────────────────────────

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
        // Advance regenStart by exactly one tick to stay accurate
        regenStart = tokens + 1 < MAX_TOKENS ? regenStart + REGEN_MS : null;
        setTokens(tokens + 1); // also calls saveTokenState()
    }
}, 100);

// Persist whenever the user is about to leave / switch tabs
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveTokenState();
});
window.addEventListener('pagehide', saveTokenState);

// ─── WebSocket ────────────────────────────────────────────────────────────────

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const socket = new WebSocket(`${protocol}://${window.location.host}`);

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
        // Reset vote count display
        const voteEl = document.getElementById(`votes_${type}`);
        if (voteEl) voteEl.textContent = '0';
        const barEl = document.getElementById(`bar_${type}`);
        if (barEl) barEl.style.width = '0%';
        // Clear voted state for this event so the user can vote again next round
        votedEvents.delete(type);
        setVoteButtonDisabled(false, type);
        return;
    }
};

// ─── Vote display helpers ─────────────────────────────────────────────────────

function updateVoteDisplay(type, count, required) {
    const voteEl = document.getElementById(`votes_${type}`);
    if (!voteEl) { return; }
    voteEl.textContent = required != null ? `${count} / ${required}` : count;
    const barEl = document.getElementById(`bar_${type}`);
    if (!barEl) { return; }
    const pct = count / required * 100;
    barEl.style.width = pct + '%';
}

// ─── Vote action ──────────────────────────────────────────────────────────────

async function vote(type) {
    if (votedEvents.has(type)) return;
    if (!consumeToken()) return;

    // Lock the button immediately — before the fetch — so rapid double-clicks
    // don't sneak a second vote through while the request is in flight.
    votedEvents.add(type);
    setVoteButtonDisabled(true, type);

    try {
        const res = await fetch('/api/events/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
        });

        if (res.status === 409) {
            // Backend says already voted — button stays locked, but refund the token
            // since the vote wasn't actually counted.
            setTokens(tokens + 1);
        } else if (!res.ok) {
            // Any other server error — roll back so the user can retry
            votedEvents.delete(type);
            setVoteButtonDisabled(false, type);
            setTokens(tokens + 1);
        }
    } catch (_) {
        // Network error — roll back so the user can retry
        votedEvents.delete(type);
        setVoteButtonDisabled(false, type);
        setTokens(tokens + 1);
    }
}

// ─── Load player info from session ───────────────────────────────────────────

async function loadPlayer() {
    // Load guest token state immediately so UI is responsive before the fetch
    loadTokenState();

    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        const name = data.username || data.name || null;
        if (!name) return;

        // Update username, migrate localStorage key, reload persisted state
        currentUsername = name;
        migrateToUserKey(name);
        loadTokenState(); // reload now that key is correct

        document.getElementById('player-name').textContent = name.toUpperCase();
    } catch (_) {
        // /api/auth/me not available or not logged in — keep guest state
    }
}

loadPlayer();

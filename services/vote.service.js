import db from "../config/database.js";
import EVENTS from "../config/events.js";
import { broadcast } from "../websocket/wsServer.js";

// ─── Get or create the active (unprocessed) event row for a type ──────────────
// INSERT OR IGNORE + WHERE NOT EXISTS is atomic in SQLite — no race condition.

function getOrCreateEvent(type) {
    const config = EVENTS[type];

    db.prepare(`
        INSERT OR IGNORE INTO events (type, name, vote_required)
        SELECT ?, ?, ?
        WHERE NOT EXISTS (
            SELECT 1 FROM events WHERE type = ? AND processed = 0
        )
    `).run(type, config.name, config.vote_required, type);

    return db.prepare(`
        SELECT * FROM events
        WHERE type = ? AND processed = 0
        LIMIT 1
    `).get(type);
}

// ─── castVote(username, type) → result object ─────────────────────────────────
//
// Contains all business logic: user upsert, event upsert, vote insert,
// broadcast, and trigger check. Returns a plain object — no req/res.

export function castVote(username, type) {
    if (!username || !type) {
        return { ok: false, status: 400, body: { error: "Missing username or event type" } };
    }

    if (!EVENTS[type]) {
        return { ok: false, status: 400, body: { error: "Unknown event type" } };
    }

    // Ensure user row exists
    db.prepare(`INSERT OR IGNORE INTO users (username) VALUES (?)`).run(username);
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);

    // Ensure active event row exists (race-safe)
    const event = getOrCreateEvent(type);
    if (!event) {
        return { ok: false, status: 500, body: { error: "Could not resolve event" } };
    }

    // Record vote — UNIQUE(user_id, event_id) silently ignores duplicates
    const voteResult = db.prepare(`
        INSERT OR IGNORE INTO votes (user_id, event_id) VALUES (?, ?)
    `).run(user.id, event.id);

    if (voteResult.changes === 0) {
        return { ok: true, status: 200, body: { message: "Already voted", event } };
    }

    // Recount and persist
    const voteCount = db.prepare(`
        SELECT COUNT(*) as count FROM votes WHERE event_id = ?
    `).get(event.id).count;

    db.prepare(`UPDATE events SET vote_count = ? WHERE id = ?`).run(voteCount, event.id);

    broadcast({
        type: "VOTE_UPDATE",
        event: {
            id: event.id,
            type: event.type,
            vote_count: voteCount,
            vote_required: event.vote_required,
        },
    });

    // Trigger check — conditional UPDATE ensures only one winner under concurrency
    if (voteCount >= event.vote_required) {
        const triggerResult = db.prepare(`
            UPDATE events SET processed = 1 WHERE id = ? AND processed = 0
        `).run(event.id);

        if (triggerResult.changes === 1) {
            const voters = db.prepare(`
                SELECT username FROM users
                JOIN votes ON users.id = votes.user_id
                WHERE votes.event_id = ?
            `).all(event.id);

            const triggeredEvent = {
                type: event.type,
                users: voters.map(v => v.username),
            };

            broadcast({ type: "EVENT_TRIGGERED", event: triggeredEvent });
            console.log("🔥 Event triggered:", triggeredEvent);
        }
    }

    return { ok: true, status: 200, body: { success: true, event } };
}

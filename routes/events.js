import express from "express";
import db from "../config/database.js";
import EVENTS from "../config/events.js";
import { broadcast } from "../websocket/wsServer.js";

const router = express.Router();

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

// ─── POST /vote ───────────────────────────────────────────────────────────────

router.post("/vote", (req, res) => {
    const username = req.session.username;
    const { type } = req.body;

    if (!username || !type) {
        return res.status(400).json({ error: "Missing username or event type" });
    }

    // Reject unknown event types outright
    if (!EVENTS[type]) {
        return res.status(400).json({ error: "Unknown event type" });
    }

    // Ensure the user row exists
    db.prepare(`
        INSERT OR IGNORE INTO users (username) VALUES (?)
    `).run(username);

    const user = db.prepare(`
        SELECT * FROM users WHERE username = ?
    `).get(username);

    // Get or create the active event row (race-safe)
    const event = getOrCreateEvent(type);

    if (!event) {
        // Shouldn't happen, but guard anyway
        return res.status(500).json({ error: "Could not resolve event" });
    }

    // Record the vote — UNIQUE(user_id, event_id) prevents double-voting
    const voteResult = db.prepare(`
        INSERT OR IGNORE INTO votes (user_id, event_id)
        VALUES (?, ?)
    `).run(user.id, event.id);

    if (voteResult.changes === 0) {
        // User already voted on this active event
        return res.json({ message: "Already voted", event });
    }

    // Recount and update
    const voteCount = db.prepare(`
        SELECT COUNT(*) as count FROM votes WHERE event_id = ?
    `).get(event.id).count;

    db.prepare(`
        UPDATE events SET vote_count = ? WHERE id = ?
    `).run(voteCount, event.id);

    broadcast({
        type: "VOTE_UPDATE",
        event: {
            id: event.id,
            type: event.type,
            vote_count: voteCount,
            vote_required: event.vote_required,
        },
    });

    // ── Trigger check ──────────────────────────────────────────────────────────
    // Use a conditional UPDATE so only one request "wins" the trigger,
    // even under concurrent load.

    if (voteCount >= event.vote_required) {
        const triggerResult = db.prepare(`
            UPDATE events
            SET processed = 1
            WHERE id = ? AND processed = 0
        `).run(event.id);

        if (triggerResult.changes === 1) {
            // This request won the trigger race
            const voters = db.prepare(`
                SELECT username FROM users
                JOIN votes ON users.id = votes.user_id
                WHERE votes.event_id = ?
            `).all(event.id);

            const triggeredEvent = {
                type: event.type,
                users: voters.map(v => v.username),
            };

            broadcast({
                type: "EVENT_TRIGGERED",
                event: triggeredEvent,
            });

            console.log("🔥 Event triggered:", triggeredEvent);
        }
    }

    res.json({ success: true, event });
});

export default router;

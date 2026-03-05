import express from "express";
import db from "../config/database.js";
import { broadcast } from "../websocket/wsServer.js";

const router = express.Router();

router.post("/vote", (req, res) => {
    const username = req.session.username;
    const { type } = req.body;
    if (!username || !type) {
        return res.status(400).json({ error: "Missing username or event type" });
    }

    let user = db.prepare(`
    SELECT * FROM users WHERE username = ?
  `).get(username);

    if (!user) {
        const result = db.prepare(`
            INSERT INTO users (username)
            VALUES (?)
    `).run(username);
        user = {
            id: result.lastInsertRowid,
            username
        };
    }

    let event = db.prepare(`
        SELECT * FROM events
        WHERE type = ? AND processed = 0
        LIMIT 1
  `).get(type);

    if (!event) {
        const result = db.prepare(`
      INSERT INTO events (type, name)
      VALUES (?, ?)
    `).run(type, type);

        event = db.prepare(`
      SELECT * FROM events WHERE id = ?
    `).get(result.lastInsertRowid);
    }

    try {
        db.prepare(`
      INSERT INTO votes (user_id, event_id)
      VALUES (?, ?)
    `).run(user.id, event.id);
    } catch (err) {
        return res.json({
            message: "Already voted",
            event
        });
    }

    const voteCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM votes
    WHERE event_id = ?
  `).get(event.id).count;

    db.prepare(`
    UPDATE events
    SET vote_count = ?
    WHERE id = ?
  `).run(voteCount, event.id);

    event.vote_count = voteCount;
    broadcast({
        type: "VOTE_UPDATE",
        event: {
            id: event.id,
            type: event.type,
            vote_count: voteCount,
            vote_required: event.vote_required
        }
    });

    if (voteCount >= event.vote_required && event.processed === 0) {
        db.prepare(`
      UPDATE events
      SET processed = 1
      WHERE id = ?
    `).run(event.id);
        const voters = db.prepare(`
      SELECT username
      FROM users
      JOIN votes ON users.id = votes.user_id
      WHERE votes.event_id = ?
    `).all(event.id);

        const voterNames = voters.map(v => v.username);
        const triggeredEvent = {
            type: event.type,
            voters: voterNames
        };

        broadcast({
            type: "EVENT_TRIGGERED",
            event: triggeredEvent
        });

        console.log("🔥 Event triggered:", triggeredEvent);
    }

    res.json({
        success: true,
        event
    });

});

export default router;

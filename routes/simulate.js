import express from "express";
import EVENTS from "../config/events.js";
import { castVote } from "../services/vote.service.js";

const router = express.Router();

// ─── Config ───────────────────────────────────────────────────────────────────

const SIMULATED_USERS = 30;
const EVENT_TYPES = Object.keys(EVENTS);

const MIN_DELAY_MS = 80;
const MAX_DELAY_MS = 400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomEvent() {
    return EVENT_TYPES[randomInt(0, EVENT_TYPES.length - 1)];
}

// ─── GET / ────────────────────────────────────────────────────────────────────
//
// Calls castVote() directly — no HTTP fetch, no session/auth middleware.
// All DB writes and WebSocket broadcasts fire exactly as they would for
// real users, so you'll see events trigger live in your Godot game.

router.get("/", async (req, res) => {
    const results = [];

    const users = Array.from({ length: SIMULATED_USERS }, (_, i) => `sim_user_${i + 1}`);

    console.log(`🧪 Simulation started — ${SIMULATED_USERS} users, events: ${EVENT_TYPES.join(", ")}`);

    await Promise.all(users.map(async (username) => {
        const voteCount = randomInt(1, 4);

        for (let v = 0; v < voteCount; v++) {
            await sleep(randomInt(MIN_DELAY_MS, MAX_DELAY_MS));

            const type = randomEvent();
            const result = castVote(username, type);

            results.push({
                user: username,
                type,
                status: result.status,
                result: result.body.message ?? (result.body.success ? "voted" : "error"),
            });
        }
    }));

    const voted = results.filter(r => r.result === "voted");
    const duplicate = results.filter(r => r.result === "Already voted");
    const errored = results.filter(r => r.result === "error");

    console.log(`✅ Simulation done — ${voted.length} votes, ${duplicate.length} duplicates, ${errored.length} errors`);

    res.json({
        summary: {
            total_attempts: results.length,
            votes_cast: voted.length,
            duplicates: duplicate.length,
            errors: errored.length,
        },
        votes: results,
    });
});

export default router;

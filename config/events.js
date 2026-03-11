// ─── Event Configuration ──────────────────────────────────────────────────────
//
// Add or edit events here. The key is the `type` string sent from the frontend.
//
// Fields:
//   name          — Human-readable display name (currently stored in DB, useful for logs)
//   vote_required — How many votes are needed to trigger the event

const EVENTS = {
    SPAWN_ENEMY: {
        name: "Spawn Enemy",
        vote_required: 4,
    },
    SPAWN_TRAP: {
        name: "Spike Trap",
        vote_required: 6,
    },
    EXPLOSION: {
        name: "Explosion",
        vote_required: 10,
    },
};

export default EVENTS;

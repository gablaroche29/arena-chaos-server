import express from "express";
import db from "../config/database.js";
import { broadcast } from "../websocket/wsServer.js";

const router = express.Router();

router.post("/", (req, res) => {
  const { username, type, payload } = req.body;

  if (!username || !type) {
    return res.status(400).json({ error: "Missing username or type" });
  }

  const stmt = db.prepare(`
    INSERT INTO events (username, type, payload)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(
    username,
    type,
    JSON.stringify(payload || {})
  );

  const event = {
    id: result.lastInsertRowid,
    username,
    type,
    payload: payload || {}
  };

  // Broadcast en temps réel
  broadcast(event);

  console.log("Event reçu:", event);

  res.json({ success: true, event });
});

export default router;
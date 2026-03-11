import express from "express";
import db from "../config/database.js";

const router = express.Router();

// Handle User Creation/Login
router.post("/register", (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).send("Username is required");
    }

    try {
        // Use an "INSERT OR IGNORE" or find existing user to simplify the "simply create" logic
        const insert = db.prepare("INSERT OR IGNORE INTO users (username) VALUES (?)");
        insert.run(username);

        // Fetch the user to get their ID (whether just created or already existed)
        const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username);

        // Save to session
        req.session.userId = user.id;
        req.session.username = username;

        // Redirect to the root as requested
        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Logout helper (optional but useful)
router.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/auth");
});

router.get('/me', (req, res) => {
    if (!req.session.username) return res.status(401).json({});
    res.json({ username: req.session.username });
});

export default router;

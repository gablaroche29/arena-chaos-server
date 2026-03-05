import express from "express";
import session from "express-session";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import { protect } from "./middleware/auth.js";
import eventsRoutes from "./routes/events.js";
import { initWebSocket } from "./websocket/wsServer.js";

const app = express();
const server = http.createServer(app);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(session({
    secret: "vault-tec-key", 
    resave: false,
    saveUninitialized: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/auth", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "auth.html"));
});

app.get("/", protect, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.use("/api/events", protect, eventsRoutes);
app.use("/api/auth", authRoutes);

initWebSocket(server);

server.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));
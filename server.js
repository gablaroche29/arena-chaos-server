import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import eventsRoutes from "./routes/events.js";
import { initWebSocket } from "./websocket/wsServer.js";

const app = express();
const server = http.createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json());

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// Routes API
app.use("/api/events", eventsRoutes);

// Init WebSocket
initWebSocket(server);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
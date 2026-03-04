const log = document.getElementById("log");
const socket = new WebSocket(`ws://${window.location.host}`);

socket.onopen = () => {
  addLog("🟢 Connected to server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "INFO") {
    addLog("ℹ " + data.message);
    return;
  }

  addLog(`🔥 ${data.username} → ${data.type}`);
};

socket.onerror = () => {
  addLog("🔴 WebSocket error");
};

async function sendEvent(type) {
  const username = document.getElementById("username").value;

  if (!username) {
    alert("Enter your name!");
    return;
  }

  await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      type,
      payload: {}
    })
  });
}

function addLog(message) {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = message;
  log.prepend(div);
}
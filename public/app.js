const log = document.getElementById("log");

async function sendEvent(type) {
  const username = document.getElementById("username").value;

  if (!username) {
    alert("Entre ton nom !");
    return;
  }

  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      type,
      payload: {}
    })
  });

  const data = await response.json();

  addLog(`Event envoyé: ${type}`);
}

function addLog(message) {
  const div = document.createElement("div");
  div.textContent = message;
  log.prepend(div);
}
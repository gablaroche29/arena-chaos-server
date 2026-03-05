const log = document.getElementById("log");
const triggered = document.getElementById("triggeredEvents");

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

  if (data.type === "VOTE_UPDATE") {
    const e = data.event;
    const voteElement = document.getElementById(`votes_${e.type}`);
    if (voteElement) {
      voteElement.textContent = `${e.vote_count} / ${e.vote_required}`;
    }
    addLog(`🗳 Vote for ${e.type} (${e.vote_count}/${e.vote_required})`);
    return;
  }

  if (data.type === "EVENT_TRIGGERED") {
    const { type, users } = data.event;
    addLog(`🔥 ${type} triggered`);
    addTriggered(type, users);
    const voteElement = document.getElementById(`votes_${type}`);
    if (voteElement) {
      voteElement.textContent = `0`;
    }
    return;
  }
};

socket.onerror = () => {
  addLog("🔴 WebSocket error");
};

async function vote(type) {
  await fetch("/api/events/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type
    })
  });
}

function addLog(message) {
  const div = document.createElement("div");
  div.className = "bg-gray-700 px-2 py-1 rounded";
  div.textContent = message;
  log.prepend(div);
}

function addTriggered(type, users) {
  const div = document.createElement("div");
  div.className = "bg-orange-600 px-3 py-2 rounded";
  div.innerHTML = `
    <div class="font-semibold">${type}</div>
    <div class="text-xs text-gray-200">by ${users.join(", ")}</div>
  `;
  triggered.prepend(div);
}

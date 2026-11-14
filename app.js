const state = {
  language: "en",
  screen: "welcome-screen",
  socket: null,
  connected: false,
  playerId: "",
  roomCode: "",
  hostId: "",
  mode: "classic",
  maxPlayers: 4,
  round: 1,
  totalRounds: 5,
  phase: "lobby",
  myRole: "",
  selectedSuspect: "",
  players: []
};

const translations = {
  en: {
    "hero-title": "Kallan Police", "hero-copy": "Find the Thief before the timer runs out.",
    "create-room": "Create room", "join-room": "Join", "how-to-title": "How to play",
    "step-one": "Everyone gets a secret role chit.", "step-two": "The King reveals himself and summons the Queen.",
    "step-three": "The Queen has limited time to point out the Thief.", "back": "Back",
    "ready-to-play": "READY TO PLAY?", "setup-copy": "Choose your mode, then invite your friends with the room code.",
    "your-name": "Your name", "game-mode": "Game mode", "room-code": "Room code",
    "waiting-room": "WAITING ROOM", "lobby-title": "Gather your crew", "lobby-tip": "Share the code with friends. The host can start when everyone is ready.",
    "round": "ROUND", "round-complete": "ROUND COMPLETE", "leave-game": "Leave game"
  },
  ta: {
    "hero-title": "கள்ளன் போலீஸ்", "hero-copy": "நேரம் முடிவதற்குள் திருடனை கண்டுபிடி.",
    "create-room": "அறையை உருவாக்கு", "join-room": "சேர்", "how-to-title": "எப்படி விளையாடுவது",
    "step-one": "அனைவருக்கும் ஒரு ரகசிய வேட சீட்டு கிடைக்கும்.", "step-two": "ராஜா தன்னை வெளிப்படுத்தி ராணியை அழைப்பார்.",
    "step-three": "ராணி குறிப்பிட்ட நேரத்திற்குள் திருடனை சுட்டிக்காட்ட வேண்டும்.", "back": "பின்",
    "ready-to-play": "விளையாட தயாரா?", "setup-copy": "பயன்முறையைத் தேர்ந்தெடுத்து, அறை குறியீட்டுடன் நண்பர்களை அழைக்கவும்.",
    "your-name": "உங்கள் பெயர்", "game-mode": "விளையாட்டு முறை", "room-code": "அறை குறியீடு",
    "waiting-room": "காத்திருப்பு அறை", "lobby-title": "உங்கள் குழுவைச் சேர்க்கவும்", "lobby-tip": "குறியீட்டை நண்பர்களுடன் பகிரவும். அனைவரும் தயாரானதும் ஹோஸ்ட் தொடங்கலாம்.",
    "round": "சுற்று", "round-complete": "சுற்று முடிந்தது", "leave-game": "விளையாட்டை விட்டு வெளியேறு"
  }
};
const roles = {
  King: { icon: "👑", copy: "Reveal yourself and choose the Queen." },
  Queen: { icon: "👸", copy: "Choose one hidden player before the timer runs out." },
  Police: { icon: "🚔", copy: "Confirm or change the Queen's final suspect." },
  Thief: { icon: "🕵️", copy: "Stay hidden. Do not let the Queen identify you." },
  Civilian: { icon: "🧑‍🤝‍🧑", copy: "Watch the table and help your team read the room." }
};
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const modeLabel = () => `${state.maxPlayers} players · ${state.maxPlayers === 3 ? "Rani finds the Thief" : "Police finds the Thief"}`;

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === id));
  state.screen = id;
}
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
}
function send(type, data = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    toast("Connect to the game server first.");
    return false;
  }
  state.socket.send(JSON.stringify({ type, ...data }));
  return true;
}
function connect() {
  if (state.socket && state.socket.readyState <= WebSocket.OPEN) return;
  const endpoint = location.protocol === "file:" ? "ws://localhost:3000" : `${location.origin.replace(/^http/, "ws")}`;
  state.socket = new WebSocket(endpoint);
  state.socket.addEventListener("open", () => { state.connected = true; toast("Connected to game server"); });
  state.socket.addEventListener("close", () => { state.connected = false; toast("Disconnected from game server"); });
  state.socket.addEventListener("error", () => toast("Could not connect. Run npm start first."));
  state.socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { toast("Received an invalid server message."); return; }
    if (message.event === "error") return toast(message.message);
    if (message.event === "session") {
      state.playerId = message.playerId;
      state.roomCode = message.roomCode;
    }
    if (message.event === "state") applyServerState(message);
  });
}
function applyServerState(message) {
  Object.assign(state, {
    roomCode: message.code, mode: message.mode, maxPlayers: message.maxPlayers || state.maxPlayers, hostId: message.hostId || state.hostId,
    round: message.round, totalRounds: message.totalRounds, phase: message.phase,
    myRole: message.myRole || state.myRole, players: message.players
  });
  if (message.status === "lobby") {
    showScreen("lobby-screen");
    renderLobby();
  } else if (message.phase === "result" || message.phase === "leaderboard") {
    showScreen("result-screen");
    if (message.phase === "leaderboard") renderLeaderboard(message);
    else renderResult(message);
  } else if (message.status === "playing") {
    showScreen("game-screen");
    $("#round-number").textContent = `${state.round} / ${state.totalRounds}`;
    renderGamePhase(message);
  } else if (message.status === "ended") {
    showScreen("result-screen");
    renderLeaderboard(message);
  }
}
function renderLobby() {
  $("#room-code-display").innerHTML = `${state.roomCode} <span>⧉</span>`;
  $("#mode-label").textContent = modeLabel();
  $("#ready-count").textContent = `${state.players.filter((player) => player.ready).length}/${state.players.length} ready`;
  const me = state.players.find((player) => player.id === state.playerId);
  $("#ready-button").textContent = me && me.ready ? "Ready ✓" : "I'm ready";
  $("#start-button").disabled = state.hostId !== state.playerId;
  $("#start-button").title = state.hostId === state.playerId ? "Start when everyone is ready" : "Only the host can start";
  $("#player-list").innerHTML = state.players.map((player) => `
    <div class="player-row"><span class="avatar">${escapeHtml(player.avatar)}</span>
      <span class="player-name">${escapeHtml(player.name)}</span>${player.id === state.hostId ? '<span class="host-tag">HOST</span>' : ""}
      <span class="player-status">${player.connected ? (player.ready ? "● Ready" : "○ Waiting") : "Disconnected"}</span>
    </div>`).join("");
}
function renderGamePhase(message) {
  $("#my-score").textContent = (state.players.find((player) => player.id === state.playerId) || {}).score || 0;
  if (state.phase === "role_reveal") renderRole();
  else if (state.phase === "queen_identification" && state.myRole === "Queen") renderQueen(message);
  else if (state.phase === "police_confirmation" && state.myRole === "Police") renderPolice(message);
  else renderWaiting();
}
function renderRole() {
  const info = roles[state.myRole] || roles.Civilian;
  $("#phase-label").textContent = "ROLE REVEAL";
  $("#game-content").innerHTML = `
    <div class="section-kicker">YOUR SECRET ROLE</div>
    <div class="role-card"><div class="role-symbol">${info.icon}</div><div class="role-name">${state.myRole}</div><p class="role-copy">${info.copy}</p></div>
    <p class="muted">Only you can see this role. Reveal it carefully.</p>
    <button class="button button-primary" data-action="continue-role">Continue <span>→</span></button>`;
}
function renderWaiting() {
  $("#phase-label").textContent = state.phase === "role_reveal" ? "ROLE REVEAL" : "LIVE ROUND";
  $("#game-content").innerHTML = `<div class="role-card"><div class="role-symbol">⏳</div><div class="role-name">Waiting for the next move</div>
    <p class="role-copy">The King, Queen, and Police each have a private action. You will see the result when it is validated.</p></div>`;
}
function suspectCards(excludeId, action, selectedId) {
  return state.players.filter((player) => player.id !== excludeId && player.connected).map((player) => `
    <button class="suspect-card ${player.id === selectedId ? "selected" : ""}" data-action="${action}" data-id="${player.id}">
      <span class="avatar">${escapeHtml(player.avatar)}</span><b>${escapeHtml(player.name)}</b><small>Hidden role</small>
    </button>`).join("");
}
function renderKing() {
  $("#phase-label").textContent = "KING'S CHOICE";
  $("#game-content").innerHTML = `<div class="section-kicker">YOU ARE THE KING</div><h2>Choose the Queen</h2>
    <p class="muted">Choose one player to receive the identification turn.</p>
    <div class="select-grid">${suspectCards(state.playerId, "select-queen", "")}</div>
    <button class="button button-primary button-full" id="confirm-queen" data-action="confirm-queen" disabled>Summon Queen</button>`;
}
function renderQueen(message) {
  $("#phase-label").textContent = "IDENTIFY THE THIEF";
  $("#game-content").innerHTML = `<div class="section-kicker">THE KING CHOSE YOU</div><h2>Who is the Thief?</h2>
    <p class="muted">Pick one hidden player. Your decision can only be made once.</p>
    <div class="timer"><div class="timer-fill" id="timer-fill"></div></div><div class="timer-count"><span id="timer-count"></span>s remaining</div>
    <div class="select-grid">${suspectCards(state.playerId, "select-suspect", "")}</div>
    <button class="button button-primary button-full" id="confirm-selection" data-action="confirm-selection" disabled>Lock in choice</button>`;
  startCountdown(message.deadline);
}
function renderPolice(message) {
  $("#phase-label").textContent = "POLICE CONFIRMATION";
  $("#game-content").innerHTML = `<div class="section-kicker">YOU ARE THE POLICE</div><h2>Confirm the suspect</h2>
    <p class="muted">The Queen has made a selection. Confirm it or choose another player.</p>
    <div class="select-grid">${suspectCards(state.playerId, "police-select", message.selectedId || "")}</div>
    <button class="button button-primary button-full" data-action="confirm-police">Submit final decision</button>`;
}
function startCountdown(deadline) {
  const update = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const count = $("#timer-count");
    const fill = $("#timer-fill");
    if (count) count.textContent = remaining;
    if (fill) fill.style.width = `${Math.min(100, (remaining / 30) * 100)}%`;
    if (remaining > 0 && state.phase === "queen_identification") setTimeout(update, 500);
  };
  update();
}
function renderResult(message) {
  const winner = message.roundWinner ? "The Thief was caught!" : "The Thief got away!";
  const thiefNames = (message.thiefIds || []).map((id) => (state.players.find((player) => player.id === id) || {}).name).join(", ");
  $("#result-icon").textContent = message.roundWinner ? "🎉" : "🕵️";
  $("#result-title").textContent = winner;
  $("#result-copy").textContent = message.roundWinner ? `${thiefNames} was caught. Great teamwork.` : `${thiefNames} escaped this round.`;
  $("#next-round-button").textContent = state.round >= state.totalRounds ? "See final leaderboard →" : "Next round →";
  const resultRows = state.players.slice().sort((a, b) => b.score - a.score).map((player) => `
    <div class="score-row"><span><b>${escapeHtml(player.name)}</b><span class="role">${message.roles[player.id] || "Player"}</span></span>
    <span class="points">+${player.roundPoints || 0}</span><span>${player.score}</span></div>`).join("");
  $("#result-table").innerHTML = `<div class="score-row header"><span>PLAYER / ROLE</span><span>ROUND</span><span>TOTAL</span></div>${resultRows}`;
}
function renderLeaderboard(message) {
  renderResult({ ...message, roundWinner: true, roles: message.roles || {} });
  $("#result-icon").textContent = "🏆";
  const winner = state.players.slice().sort((a, b) => b.score - a.score)[0];
  $("#result-title").textContent = `${escapeHtml(winner.name)} wins the match!`;
  $("#result-copy").textContent = `Final leaderboard after ${state.totalRounds} rounds.`;
  $("#next-round-button").textContent = "Play again";
}
function applyLanguage() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = translations[state.language][element.dataset.i18n];
    if (value) element.innerHTML = value;
  });
  document.documentElement.lang = state.language === "ta" ? "ta" : "en";
  $(".language-toggle").textContent = state.language === "en" ? "தமிழ்" : "English";
}
function openSetup(intent) {
  $("#setup-title").textContent = intent === "create" ? "Create a room" : "Join a room";
  $("#setup-submit").textContent = intent === "create" ? "Create room" : "Join room";
  $("#join-code-wrap").classList.toggle("hidden", intent === "create");
  $("#room-form").dataset.intent = intent;
  showScreen("setup-screen");
}

document.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  const action = element.dataset.action;
  if (action === "home") showScreen("welcome-screen");
  if (action === "show-create") { connect(); openSetup("create"); }
  if (action === "show-join") { connect(); openSetup("join"); }
  if (action === "toggle-language") { state.language = state.language === "en" ? "ta" : "en"; applyLanguage(); }
  if (action === "toggle-sound") { element.classList.toggle("muted"); toast(element.classList.contains("muted") ? "Sound off" : "Sound on"); }
  if (action === "copy-code") { navigator.clipboard?.writeText(state.roomCode); toast("Room code copied"); }
  if (action === "toggle-ready") send("player_ready");
  if (action === "start-game") send("start_game");
  if (action === "continue-role") {
    if (state.myRole === "King") renderKing();
    else renderWaiting();
  }
  if (action === "select-queen") {
    state.selectedSuspect = element.dataset.id;
    document.querySelectorAll("[data-action='select-queen']").forEach((card) => card.classList.toggle("selected", card.dataset.id === state.selectedSuspect));
    $("#confirm-queen").disabled = false;
  }
  if (action === "confirm-queen") send("select_queen", { playerId: state.selectedSuspect });
  if (action === "select-suspect") {
    state.selectedSuspect = element.dataset.id;
    document.querySelectorAll("[data-action='select-suspect']").forEach((card) => card.classList.toggle("selected", card.dataset.id === state.selectedSuspect));
    $("#confirm-selection").disabled = false;
  }
  if (action === "confirm-selection") send("select_suspect", { playerId: state.selectedSuspect });
  if (action === "police-select") {
    state.selectedSuspect = element.dataset.id;
    document.querySelectorAll("[data-action='police-select']").forEach((card) => card.classList.toggle("selected", card.dataset.id === state.selectedSuspect));
  }
  if (action === "confirm-police") send("confirm_suspect", { playerId: state.selectedSuspect });
  if (action === "next-round") send("next_round");
});

$("#quick-join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  connect();
  const code = $("#quick-room-code").value.trim().toUpperCase();
  const name = "Player";
  if (!/^[A-Z0-9]{6}$/.test(code)) return toast("Enter a valid 6-letter room code");
  const wait = setInterval(() => {
    if (state.connected) { clearInterval(wait); send("join_room", { code, name, avatar: "🙂" }); }
  }, 50);
});
$("#game-mode").addEventListener("change", (event) => {
  $("#custom-count-wrap").classList.toggle("hidden", event.target.value !== "custom");
});
$("#room-form").addEventListener("submit", (event) => {
  event.preventDefault();
  connect();
  const name = $("#player-name").value.trim() || "Player";
  const intent = event.currentTarget.dataset.intent;
  const code = $("#room-code").value.trim().toUpperCase();
  const wait = setInterval(() => {
    if (state.connected) {
      clearInterval(wait);
      if (intent === "create") {
        const selectedMode = $("#game-mode").value;
        const playerCount = selectedMode === "three" ? 3 : selectedMode === "four" ? 4 : Number($("#player-count").value);
        if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 12) {
          clearInterval(wait);
          toast("Choose between 3 and 12 players.");
          return;
        }
        send("create_room", { name, mode: selectedMode, playerCount, avatar: "🙂", rounds: 5, timerSeconds: 30 });
      }
      else send("join_room", { name, code, avatar: "🙂" });
    }
  }, 50);
});
connect();
applyLanguage();

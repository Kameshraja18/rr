const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();
const sessions = new Map();
const names = ["Arun", "Meena", "Siva", "Divya", "Vijay", "Nila", "Karthik", "Anu", "Bala", "Priya", "Ravi"];
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;

const server = http.createServer((request, response) => {
  const requested = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const file = path.resolve(ROOT, "." + requested);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});
const socketServer = new WebSocket.Server({ server });

function id() { return crypto.randomBytes(16).toString("hex"); }
function roomCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 8).toUpperCase(); while (rooms.has(code));
  return code;
}
function send(socket, event, data = {}) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, ...data }));
}
function error(socket, message) { send(socket, "error", { message }); }
function publicPlayer(player) {
  return { id: player.id, name: player.name, avatar: player.avatar, ready: player.ready, connected: player.connected, score: player.score, roundPoints: player.roundPoints || 0 };
}
function publicState(room, viewerId) {
  const viewer = room.players.get(viewerId);
  const result = {
    code: room.code,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    round: room.round,
    totalRounds: room.totalRounds,
    phase: room.phase,
    deadline: room.deadline,
    players: [...room.players.values()].map(publicPlayer)
  };
  if (viewer && room.roles.has(viewerId)) result.myRole = room.roles.get(viewerId);
  if (room.phase === "result" || room.status === "ended") {
    result.thiefIds = room.thiefIds;
    result.roles = Object.fromEntries(room.roles);
    result.selectedId = room.finalSelection;
    result.roundWinner = room.finalSelection && room.thiefIds.includes(room.finalSelection);
  }
  if (room.queenId) result.queenId = room.queenId;
  if (room.selectedId) result.selectedId = room.selectedId;
  return result;
}
function broadcast(room) {
  room.players.forEach((player) => send(player.socket, "state", publicState(room, player.id)));
}
function findRoom(socket) {
  const session = sessions.get(socket);
  return session && rooms.get(session.roomCode);
}
function clearRoomTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function randomize(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const index = Math.floor(Math.random() * (i + 1));
    [result[i], result[index]] = [result[index], result[i]];
  }
  return result;
}
function assignRoles(room) {
  const ids = randomize([...room.players.keys()]);
  room.roles = new Map();
  room.thiefIds = [];
  room.queenId = null;
  room.policeId = room.maxPlayers === 3 ? null : ids[1];
  ids.forEach((playerId) => room.roles.set(playerId, "Civilian"));
  room.roles.set(ids[0], "King");
  const thiefIndex = room.maxPlayers === 3 ? 1 : 2;
  if (room.maxPlayers > 3) room.roles.set(ids[1], "Police");
  const thiefCount = room.maxPlayers >= 6 ? Math.max(1, Math.floor(ids.length / 6)) : 1;
  ids.slice(thiefIndex, thiefIndex + thiefCount).forEach((playerId) => {
    room.roles.set(playerId, "Thief");
    room.thiefIds.push(playerId);
  });
}
function startIdentification(room) {
  room.phase = "queen_identification";
  room.deadline = Date.now() + room.timerSeconds * 1000;
  clearRoomTimer(room);
  room.timer = setTimeout(() => resolveRound(room, null), room.timerSeconds * 1000);
  broadcast(room);
}
function resolveRound(room, selectedId) {
  if (room.phase === "result" || room.status !== "playing") return;
  clearRoomTimer(room);
  room.finalSelection = selectedId;
  const caught = Boolean(selectedId && room.thiefIds.includes(selectedId));
  room.players.forEach((player) => {
    const role = room.roles.get(player.id);
    let points = 0;
    if (role === "King" && caught) points = 10;
    if (role === "Queen" && caught) points = 5;
    if (role === "Police" && caught) points = 1;
    if (role === "Civilian" && caught) points = 2;
    if (role === "Thief" && !caught) points = 10;
    player.roundPoints = points;
    player.score += points;
  });
  room.phase = "result";
  room.deadline = null;
  broadcast(room);
}
function startRound(room) {
  room.status = "playing";
  room.phase = "role_reveal";
  room.queenId = null;
  room.policeId = null;
  room.finalSelection = null;
  assignRoles(room);
  broadcast(room);
}
function nextRound(room) {
  if (room.round >= room.totalRounds) {
    room.status = "ended";
    room.phase = "leaderboard";
    broadcast(room);
    return;
  }
  room.round += 1;
  startRound(room);
}
function disconnect(socket) {
  const session = sessions.get(socket);
  if (!session) return;
  const room = rooms.get(session.roomCode);
  if (!room) return;
  const player = room.players.get(session.playerId);
  if (player) {
    player.connected = false;
    player.socket = null;
    player.disconnectTimer = setTimeout(() => {
      if (!player.connected) room.players.delete(player.id);
      if (room.players.size === 0) rooms.delete(room.code);
      else broadcast(room);
    }, 60000);
    broadcast(room);
  }
}
function createRoom(socket, data) {
  const name = String(data.name || "").trim().slice(0, 18);
  const mode = data.mode;
  const maxPlayers = Number(data.playerCount);
  if (!name || !["three", "four", "custom"].includes(mode) || !Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    return error(socket, "Choose a valid name and player count between 3 and 12.");
  }
  const playerId = id();
  const code = roomCode();
  const room = {
    code, mode, maxPlayers, hostId: playerId, players: new Map(), status: "lobby", phase: "lobby",
    round: 1, totalRounds: Math.min(20, Math.max(1, Number(data.rounds) || 5)),
    timerSeconds: Math.min(120, Math.max(10, Number(data.timerSeconds) || 30)),
    roles: new Map(), thiefIds: [], timer: null, deadline: null
  };
  room.players.set(playerId, { id: playerId, name, avatar: data.avatar || "🙂", ready: false, connected: true, socket, score: 0 });
  rooms.set(code, room);
  sessions.set(socket, { roomCode: code, playerId });
  send(socket, "session", { token: playerId, playerId, roomCode: code });
  broadcast(room);
}
function joinRoom(socket, data) {
  const code = String(data.code || "").trim().toUpperCase();
  const room = rooms.get(code);
  const name = String(data.name || "").trim().slice(0, 18);
  if (!room) return error(socket, "Room not found. Check the room code.");
  if (room.status !== "lobby") return error(socket, "This game has already started.");
  if (room.players.size >= room.maxPlayers) return error(socket, "This room is full.");
  if (!name) return error(socket, "Enter your name to join.");
  const playerId = id();
  room.players.set(playerId, { id: playerId, name, avatar: data.avatar || "🙂", ready: false, connected: true, socket, score: 0 });
  sessions.set(socket, { roomCode: code, playerId });
  send(socket, "session", { token: playerId, playerId, roomCode: code });
  broadcast(room);
}
function handle(socket, message) {
  const data = message || {};
  if (data.type === "create_room") return createRoom(socket, data);
  if (data.type === "join_room") return joinRoom(socket, data);
  const session = sessions.get(socket);
  const room = findRoom(socket);
  if (!session || !room) return error(socket, "Join a room first.");
  const player = room.players.get(session.playerId);
  if (!player) return error(socket, "Your player session has expired.");
  if (data.type === "player_ready") {
    if (room.status !== "lobby") return error(socket, "The lobby is closed.");
    player.ready = !player.ready;
    broadcast(room);
  } else if (data.type === "start_game") {
    if (room.hostId !== player.id) return error(socket, "Only the host can start the game.");
    if (room.players.size < room.maxPlayers) return error(socket, `Need ${room.maxPlayers} players to start.`);
    if ([...room.players.values()].some((item) => !item.ready)) return error(socket, "Everyone must be ready.");
    startRound(room);
  } else if (data.type === "select_queen") {
    if (room.phase !== "role_reveal" || room.roles.get(player.id) !== "King") return error(socket, "Only the King can select the Queen now.");
    if (!room.players.has(data.playerId) || data.playerId === player.id || room.roles.get(data.playerId) !== "Civilian") return error(socket, "Choose a hidden civilian as Queen.");
    room.roles.set(data.playerId, "Queen");
    room.queenId = data.playerId;
    startIdentification(room);
  } else if (data.type === "select_suspect") {
    if (room.phase !== "queen_identification" || room.queenId !== player.id) return error(socket, "Only the Queen can select a suspect.");
    if (!room.players.has(data.playerId) || data.playerId === player.id) return error(socket, "Invalid suspect.");
    room.selectedId = data.playerId;
    clearRoomTimer(room);
    if (room.maxPlayers === 3) resolveRound(room, data.playerId);
    else {
      room.phase = "police_confirmation";
      room.deadline = null;
      broadcast(room);
    }
  } else if (data.type === "confirm_suspect" || data.type === "change_suspect") {
    if (room.phase !== "police_confirmation" || room.policeId !== player.id) return error(socket, "Only the Police can make the final selection.");
    const selected = data.playerId || room.selectedId;
    if (!room.players.has(selected) || selected === player.id) return error(socket, "Invalid final selection.");
    resolveRound(room, selected);
  } else if (data.type === "next_round") {
    if (room.phase !== "result" && room.phase !== "leaderboard") return error(socket, "The round is still active.");
    nextRound(room);
  } else if (data.type === "leave_room") {
    room.players.delete(player.id);
    socket.close();
    if (room.players.size === 0) rooms.delete(room.code);
    else { if (room.hostId === player.id) room.hostId = room.players.keys().next().value; broadcast(room); }
  }
}
socketServer.on("connection", (socket) => {
  socket.on("message", (payload) => {
    try { handle(socket, JSON.parse(payload.toString())); } catch { error(socket, "Invalid request."); }
  });
  socket.on("close", () => disconnect(socket));
});
server.listen(PORT, () => console.log(`Kallan Police running at http://localhost:${PORT}`));

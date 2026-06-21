import assert from "node:assert/strict";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4175";
const wsBaseUrl = baseUrl.replace(/^http/, "ws");

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

function roomSocket(roomId, token) {
  const socket = new WebSocket(`${wsBaseUrl}/api/rooms/${roomId}/socket?token=${token}`);
  const listeners = new Set();
  let latestRoom = null;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "error") throw new Error(message.message);
    if (message.type !== "state") return;
    latestRoom = message.room;
    listeners.forEach((listener) => listener(message.room));
  });

  return {
    send(message) {
      socket.send(JSON.stringify(message));
    },
    waitFor(predicate, timeoutMs = 5000) {
      if (latestRoom && predicate(latestRoom)) return Promise.resolve(latestRoom);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          listeners.delete(check);
          reject(new Error("Timed out waiting for room state."));
        }, timeoutMs);
        function check(room) {
          if (!predicate(room)) return;
          clearTimeout(timeout);
          listeners.delete(check);
          resolve(room);
        }
        listeners.add(check);
      });
    },
    close() {
      socket.close();
    },
  };
}

const created = await request("/api/rooms", {
  method: "POST",
  body: JSON.stringify({ name: "Alex", deckId: "fibonacci" }),
});
const joined = await request(`/api/rooms/${created.roomId}/join`, {
  method: "POST",
  body: JSON.stringify({ name: "Alex" }),
});

const facilitator = roomSocket(created.roomId, created.token);
const participant = roomSocket(created.roomId, joined.token);

const lobby = await facilitator.waitFor((room) => room.participants.length === 2);
assert.equal(lobby.viewer.role, "facilitator");
assert.notEqual(lobby.participants[0].displayName, lobby.participants[1].displayName);
assert.match(lobby.participants[0].displayName, /^Alex - [a-f0-9]{5}$/);

facilitator.send({ type: "start_round", title: "Smoke test task" });
await participant.waitFor((room) => room.currentRound?.phase === "voting");

facilitator.send({ type: "select_vote", value: "5" });
facilitator.send({ type: "confirm_vote" });
participant.send({ type: "select_vote", value: "8" });
participant.send({ type: "confirm_vote" });
await facilitator.waitFor((room) => room.currentRound?.revealAllowed);

facilitator.send({ type: "reveal" });
const revealed = await facilitator.waitFor((room) => room.currentRound?.phase === "revealed");
assert.equal(revealed.currentRound.suggestion.value, "8");
assert.equal(revealed.currentRound.suggestion.tied, true);

facilitator.send({ type: "finalize", value: "8" });
const finalized = await participant.waitFor((room) => room.currentRound?.phase === "finalized");
assert.equal(finalized.history[0].finalValue, "8");
assert.equal(finalized.history[0].votes.length, 2);

facilitator.close();
participant.close();
console.log(`Smoke test passed for ${lobby.name} (${created.roomId}).`);

import assert from "node:assert/strict";
import WebSocket from "ws";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4175";
const wsBaseUrl = baseUrl.replace(/^http/, "ws");
const facilitatorSession = { cookie: "" };
const participantSession = { cookie: "" };
const observerSession = { cookie: "" };

async function request(path, options = {}, session = facilitatorSession) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      ...(session.cookie ? { Cookie: session.cookie } : {}),
      ...options.headers,
    },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) session.cookie = setCookie.split(";")[0];
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

function roomSocket(roomId, session) {
  const socket = new WebSocket(`${wsBaseUrl}/api/rooms/${roomId}/socket`, {
    headers: { Cookie: session.cookie, Origin: baseUrl },
  });
  const listeners = new Set();
  const errorListeners = new Set();
  let latestRoom = null;
  let latestError = null;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "error") {
      latestError = message.message;
      errorListeners.forEach((listener) => listener(message.message));
      return;
    }
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
    waitForError(pattern, timeoutMs = 5000) {
      if (latestError && pattern.test(latestError)) {
        const error = latestError;
        latestError = null;
        return Promise.resolve(error);
      }
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          errorListeners.delete(check);
          reject(new Error("Timed out waiting for room error."));
        }, timeoutMs);
        function check(message) {
          if (!pattern.test(message)) return;
          clearTimeout(timeout);
          errorListeners.delete(check);
          latestError = null;
          resolve(message);
        }
        errorListeners.add(check);
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
assert.match(created.roomId, /^[a-z]+-[a-z]+-[a-z]+-[a-f0-9]{6}$/);
await request(`/api/rooms/${created.roomId}/join`, {
  method: "POST",
  body: JSON.stringify({ name: "Alex" }),
}, participantSession);
await request(`/api/rooms/${created.roomId}/join`, {
  method: "POST",
  body: JSON.stringify({ name: "Sam" }),
}, observerSession);

const facilitator = roomSocket(created.roomId, facilitatorSession);
const participant = roomSocket(created.roomId, participantSession);
const observer = roomSocket(created.roomId, observerSession);

const lobby = await facilitator.waitFor((room) => room.participants.length === 3);
assert.equal(created.roomId.startsWith(`${lobby.name.toLowerCase().replaceAll(" ", "-")}-`), true);
assert.equal(lobby.viewer.role, "facilitator");
assert.notEqual(lobby.participants[0].displayName, lobby.participants[1].displayName);
assert.match(lobby.participants[0].displayName, /^Alex - [a-f0-9]{5}$/);
const observerPerson = lobby.participants.find((person) => person.displayName.startsWith("Sam - "));
facilitator.send({
  type: "set_participant_role",
  participantId: observerPerson.id,
  role: "observer",
});
const observerConfigured = await observer.waitFor((room) => room.viewer.role === "observer");
assert.equal(observerConfigured.participants.find((person) => person.id === observerPerson.id).role, "observer");
assert.deepEqual(observerConfigured.settings.reactionPalette, ["👍", "🤔", "👀", "🎉", "☕"]);

observer.send({ type: "send_reaction", reaction: "👍" });
const reacted = await facilitator.waitFor(
  (room) => room.reactions.some((reaction) => reaction.participantId === observerPerson.id),
);
assert.equal(reacted.reactions.at(-1).reaction, "👍");

await new Promise((resolve) => setTimeout(resolve, 1250));
observer.send({ type: "send_reaction", reaction: "✋" });
const handRaised = await facilitator.waitFor(
  (room) => room.raisedHands.some((hand) => hand.participantId === observerPerson.id),
);
assert.equal(handRaised.raisedHands.length, 1);
observer.send({ type: "lower_hand" });
await facilitator.waitFor((room) => room.raisedHands.length === 0);

facilitator.send({ type: "set_reactions_muted", muted: true });
await participant.waitFor((room) => room.settings.reactionsMuted);
facilitator.send({ type: "clear_reactions" });
await participant.waitFor((room) => room.reactions.length === 0);
facilitator.send({ type: "set_reactions_muted", muted: false });
await participant.waitFor((room) => !room.settings.reactionsMuted);

facilitator.send({
  type: "update_settings",
  cards: Array.from({ length: 17 }, (_, index) => String(index)),
});
await facilitator.waitForError(/at most 16 cards/);

facilitator.send({
  type: "add_items",
  titles: Array.from({ length: 51 }, (_, index) => `Overflow item ${index + 1}`),
});
await facilitator.waitForError(/at most 50 pending items/);

facilitator.send({
  type: "update_settings",
  cards: ["1", "3", "5", "8", "13", "?"],
  suggestionAlgorithm: "middle_ground",
  revealDelaySeconds: 15,
});
const configured = await participant.waitFor(
  (room) => room.settings?.suggestionAlgorithm === "middle_ground",
);
assert.deepEqual(configured.deck.cards, ["1", "3", "5", "8", "13", "?"]);
assert.equal(configured.settings.revealDelaySeconds, 15);

facilitator.send({
  type: "add_items",
  titles: ["Smoke test task", "Second backlog item"],
});
const withBacklog = await participant.waitFor(
  (room) => room.items.filter((item) => item.status === "pending").length === 2,
);
const selectedItem = withBacklog.items.find((item) => item.title === "Smoke test task");
const secondQueuedItem = withBacklog.items.find((item) => item.title === "Second backlog item");
assert.ok(selectedItem);

facilitator.send({
  type: "reorder_items",
  itemIds: [secondQueuedItem.id, selectedItem.id],
});
const reordered = await participant.waitFor(
  (room) => room.items.filter((item) => item.status === "pending")[0]?.id === secondQueuedItem.id,
);
assert.deepEqual(
  reordered.items.filter((item) => item.status === "pending").map((item) => item.title),
  ["Second backlog item", "Smoke test task"],
);
facilitator.send({
  type: "reorder_items",
  itemIds: [selectedItem.id, secondQueuedItem.id],
});
await participant.waitFor(
  (room) => room.items.filter((item) => item.status === "pending")[0]?.id === selectedItem.id,
);

facilitator.send({ type: "start_round", itemId: selectedItem.id });
const voting = await participant.waitFor((room) => room.currentRound?.phase === "voting");
assert.equal(voting.currentRound.title, "Smoke test task");
assert.equal(voting.currentRound.itemId, selectedItem.id);
assert.equal(voting.participants.filter((person) => person.eligible).length, 2);

facilitator.send({ type: "remove_participant", participantId: observerPerson.id });
const observerRemoved = await participant.waitFor((room) => room.participants.length === 2);
assert.equal(observerRemoved.participants.some((person) => person.id === observerPerson.id), false);

facilitator.send({ type: "update_round_title", title: "Renamed smoke test task" });
const renamed = await participant.waitFor(
  (room) => room.currentRound?.title === "Renamed smoke test task",
);
assert.equal(
  renamed.items.find((item) => item.id === selectedItem.id).title,
  "Renamed smoke test task",
);

facilitator.send({ type: "select_vote", value: "3" });
facilitator.send({ type: "confirm_vote" });
participant.send({ type: "select_vote", value: "13" });
participant.send({ type: "confirm_vote" });
await facilitator.waitFor((room) => room.currentRound?.revealAllowed);

facilitator.send({ type: "reveal" });
const revealed = await facilitator.waitFor((room) => room.currentRound?.phase === "revealed");
assert.equal(revealed.currentRound.suggestion.value, "8");
assert.equal(revealed.currentRound.suggestion.tied, true);
assert.equal(revealed.currentRound.suggestion.algorithm, "middle_ground");

facilitator.send({ type: "restart_voting" });
const restarted = await participant.waitFor(
  (room) => room.currentRound?.phase === "voting" && !room.currentRound.ownVote?.value,
);
await facilitator.waitFor(
  (room) =>
    room.currentRound?.phase === "voting" &&
    room.participants.every((person) => !person.eligible || !person.hasVoted),
);
assert.equal(restarted.participants.some((person) => person.hasVoted), false);

facilitator.send({ type: "select_vote", value: "5" });
facilitator.send({ type: "confirm_vote" });
participant.send({ type: "select_vote", value: "8" });
participant.send({ type: "confirm_vote" });
await facilitator.waitFor(
  (room) =>
    room.currentRound?.phase === "voting" &&
    room.participants.filter((person) => person.eligible).every((person) => person.hasVoted),
);
facilitator.send({ type: "reveal" });
await facilitator.waitFor((room) => room.currentRound?.phase === "revealed");

facilitator.send({ type: "finalize", value: "8" });
const finalized = await participant.waitFor((room) => room.currentRound?.phase === "finalized");
assert.equal(finalized.history[0].finalValue, "8");
assert.equal(finalized.history[0].title, "Renamed smoke test task");
assert.equal(finalized.history[0].votes.length, 2);
assert.equal(finalized.history[0].metrics.consensusPercent, 50);
assert.equal(finalized.history[0].metrics.low, "5");
assert.equal(finalized.history[0].metrics.high, "8");
assert.equal(finalized.history[0].metrics.spread, 1);
assert.deepEqual(finalized.history[0].deckCards, ["1", "3", "5", "8", "13", "?"]);
assert.equal(
  finalized.items.find((item) => item.id === selectedItem.id).status,
  "estimated",
);
assert.deepEqual(
  finalized.items.filter((item) => item.status === "pending").map((item) => item.title),
  ["Second backlog item"],
);

const secondItem = finalized.items.find((item) => item.title === "Second backlog item");
facilitator.send({
  type: "update_item",
  itemId: secondItem.id,
  title: "Edited second backlog item",
});
const itemEdited = await participant.waitFor(
  (room) => room.items.some((item) => item.id === secondItem.id && item.title === "Edited second backlog item"),
);
assert.equal(itemEdited.items.find((item) => item.id === secondItem.id).title, "Edited second backlog item");
facilitator.send({ type: "start_round", itemId: secondItem.id });
await participant.waitFor((room) => room.currentRound?.itemId === secondItem.id);
facilitator.send({ type: "cancel_round" });
const cancelled = await participant.waitFor((room) => room.currentRound === null);
assert.equal(
  cancelled.items.find((item) => item.id === secondItem.id).status,
  "pending",
);

facilitator.send({
  type: "transfer_facilitator",
  participantId: cancelled.viewer.id,
});
const transferred = await participant.waitFor((room) => room.viewer.role === "facilitator");
assert.equal(
  transferred.participants.find((person) => person.id === lobby.viewer.id).role,
  "participant",
);

participant.send({ type: "set_room_lock", locked: true });
await facilitator.waitFor((room) => room.isLocked);
await assert.rejects(
  request(`/api/rooms/${created.roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ name: "Late guest" }),
  }, { cookie: "" }),
  /not accepting new participants/,
);

participant.send({ type: "set_room_lock", locked: false });
await facilitator.waitFor((room) => !room.isLocked);

participant.send({ type: "close_room" });
const closed = await facilitator.waitFor((room) => room.isClosed);
assert.equal(closed.isLocked, true);
await assert.rejects(
  request(`/api/rooms/${created.roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ name: "Too late" }),
  }, { cookie: "" }),
  /closed/,
);

participant.send({ type: "delete_room" });
await new Promise((resolve) => setTimeout(resolve, 150));
await assert.rejects(
  request(`/api/rooms/${created.roomId}/state`, { method: "GET" }, participantSession),
  /expired or does not exist/,
);

const rejectedOrigin = await fetch(`${baseUrl}/api/rooms`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" },
  body: JSON.stringify({ name: "Origin test", deckId: "fibonacci" }),
});
assert.equal(rejectedOrigin.status, 403);

const capacityOwner = { cookie: "" };
const capacityRoom = await request("/api/rooms", {
  method: "POST",
  body: JSON.stringify({ name: "Capacity owner", deckId: "fibonacci" }),
}, capacityOwner);
for (let index = 1; index < 20; index += 1) {
  await request(`/api/rooms/${capacityRoom.roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ name: `Person ${index}` }),
  }, { cookie: "" });
}
await assert.rejects(
  request(`/api/rooms/${capacityRoom.roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ name: "Person 20" }),
  }, { cookie: "" }),
  /20-person limit/,
);

facilitator.close();
participant.close();
observer.close();
console.log(`Smoke test passed for ${lobby.name} (${created.roomId}).`);

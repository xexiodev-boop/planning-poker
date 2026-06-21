import { getDeck } from "../shared/decks.js";

const ROOM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const REVEAL_DELAY_MS = 30 * 1000;
const COLORS = [
  "#ef6a5b",
  "#5b8def",
  "#20a77a",
  "#a36be2",
  "#e59b2f",
  "#db5f9a",
  "#3e9aa6",
  "#7e8c45",
];
const ADJECTIVES = ["Brisk", "Bright", "Calm", "Clever", "Merry", "Nimble", "Quiet", "Swift"];
const COLORS_AS_WORDS = ["Amber", "Azure", "Coral", "Indigo", "Jade", "Lilac", "Silver", "Violet"];
const ANIMALS = ["Badger", "Falcon", "Fox", "Koala", "Otter", "Panda", "Raven", "Tiger"];

function json(data, status = 200) {
  return Response.json(data, { status });
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomHex(length = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

function randomRoomId() {
  return `${randomHex(8)}${randomHex(8)}`;
}

function cleanName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
  return name || "Guest";
}

function cleanTitle(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function newParticipant(name, role, index) {
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name: cleanName(name),
    suffix: randomHex(),
    color: COLORS[index % COLORS.length],
    role,
    connected: false,
    joinedAt: Date.now(),
  };
}

function displayName(participant) {
  return `${participant.name} - ${participant.suffix}`;
}

function findParticipantByToken(room, token) {
  return room.participants.find((participant) => participant.token === token);
}

function calculateSuggestion(round, deck) {
  const tally = new Map();

  Object.values(round.votes).forEach((vote) => {
    if (!vote?.confirmed || vote.value === "?" || vote.value === "☕") return;
    tally.set(vote.value, (tally.get(vote.value) ?? 0) + 1);
  });

  if (tally.size === 0) return null;

  const highestCount = Math.max(...tally.values());
  const tied = [...tally.entries()]
    .filter(([, count]) => count === highestCount)
    .map(([value]) => value);
  const ordered = tied.sort((a, b) => deck.cards.indexOf(a) - deck.cards.indexOf(b));

  return {
    value: ordered.at(-1),
    votes: highestCount,
    tied: ordered.length > 1,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      const roomId = randomRoomId();
      const objectId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(objectId);
      const response = await stub.fetch("https://room.internal/create", {
        method: "POST",
        body: JSON.stringify({
          roomId,
          facilitatorName: input.name,
          deckId: input.deckId,
        }),
      });
      return response;
    }

    const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{16})(?:\/(join|socket|state))?$/);
    if (!match) {
      return json({ error: "Not found" }, 404);
    }

    const [, roomId, action = "state"] = match;
    const objectId = env.ROOMS.idFromName(roomId);
    const stub = env.ROOMS.get(objectId);
    const target = new URL(`https://room.internal/${action}`);
    target.search = url.search;
    return stub.fetch(target, request);
  },
};

export class PlanningRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async loadRoom() {
    return this.ctx.storage.get("room");
  }

  async saveRoom(room, { touch = true } = {}) {
    if (touch) {
      room.updatedAt = Date.now();
      room.expiresAt = room.updatedAt + ROOM_LIFETIME_MS;
    }
    await this.ctx.storage.put("room", room);
    await this.scheduleNextAlarm(room);
  }

  async scheduleNextAlarm(room) {
    const wakeAt =
      room.currentRound?.phase === "voting" && !room.currentRound.revealAllowed
        ? Math.min(room.currentRound.revealAvailableAt, room.expiresAt)
        : room.expiresAt;
    await this.ctx.storage.setAlarm(wakeAt);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      return this.create(request);
    }

    const room = await this.loadRoom();
    if (!room || room.expiresAt <= Date.now()) {
      return json({ error: "This room has expired or does not exist." }, 404);
    }

    if (url.pathname === "/join" && request.method === "POST") {
      return this.join(request, room);
    }

    if (url.pathname === "/state" && request.method === "GET") {
      const participant = findParticipantByToken(room, url.searchParams.get("token"));
      if (!participant) return json({ error: "Invalid room identity." }, 401);
      return json(this.roomView(room, participant));
    }

    if (url.pathname === "/socket" && request.headers.get("Upgrade") === "websocket") {
      return this.connect(url, room);
    }

    return json({ error: "Not found" }, 404);
  }

  async create(request) {
    if (await this.loadRoom()) {
      return json({ error: "Room already exists." }, 409);
    }

    const input = await request.json();
    const facilitator = newParticipant(input.facilitatorName, "facilitator", 0);
    const now = Date.now();
    const room = {
      id: input.roomId,
      name: `${randomItem(ADJECTIVES)} ${randomItem(COLORS_AS_WORDS)} ${randomItem(ANIMALS)}`,
      deckId: getDeck(input.deckId).id,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ROOM_LIFETIME_MS,
      participants: [facilitator],
      currentRound: null,
      history: [],
    };

    await this.saveRoom(room);
    return json({
      roomId: room.id,
      token: facilitator.token,
      participantId: facilitator.id,
    }, 201);
  }

  async join(request, room) {
    const input = await request.json().catch(() => ({}));
    const returning = input.token && findParticipantByToken(room, input.token);
    if (returning) {
      return json({
        roomId: room.id,
        token: returning.token,
        participantId: returning.id,
      });
    }

    const participant = newParticipant(input.name, "participant", room.participants.length);
    room.participants.push(participant);
    await this.saveRoom(room);
    await this.broadcast(room);

    return json({
      roomId: room.id,
      token: participant.token,
      participantId: participant.id,
    }, 201);
  }

  async connect(url, room) {
    const participant = findParticipantByToken(room, url.searchParams.get("token"));
    if (!participant) return json({ error: "Invalid room identity." }, 401);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ token: participant.token });
    this.ctx.acceptWebSocket(server);

    participant.connected = true;
    await this.saveRoom(room, { touch: false });
    server.send(JSON.stringify({ type: "state", room: this.roomView(room, participant) }));
    await this.broadcast(room, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    const attachment = socket.deserializeAttachment();
    const room = await this.loadRoom();
    if (!room || !attachment?.token) return;

    const participant = findParticipantByToken(room, attachment.token);
    if (!participant) {
      socket.send(JSON.stringify({ type: "error", message: "Your room identity is no longer valid." }));
      return;
    }

    try {
      const event = JSON.parse(message);
      await this.applyAction(room, participant, event);
      await this.saveRoom(room);
      await this.broadcast(room);
    } catch (error) {
      socket.send(JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "That action could not be completed.",
      }));
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment();
    const room = await this.loadRoom();
    if (!room || !attachment?.token) return;

    const participant = findParticipantByToken(room, attachment.token);
    if (!participant) return;

    participant.connected = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      return candidate.deserializeAttachment()?.token === participant.token;
    });
    await this.saveRoom(room, { touch: false });
    await this.broadcast(room);
  }

  async alarm() {
    const room = await this.loadRoom();
    if (!room) return;

    if (room.expiresAt <= Date.now()) {
      this.ctx.getWebSockets().forEach((socket) => socket.close(1001, "Room expired"));
      await this.ctx.storage.deleteAll();
      return;
    }

    if (
      room.currentRound?.phase === "voting" &&
      !room.currentRound.revealAllowed &&
      room.currentRound.revealAvailableAt <= Date.now()
    ) {
      room.currentRound.revealAllowed = true;
      await this.saveRoom(room, { touch: false });
      await this.broadcast(room);
      return;
    }

    await this.scheduleNextAlarm(room);
  }

  async applyAction(room, participant, event) {
    const isFacilitator = participant.role === "facilitator";
    const deck = getDeck(room.deckId);

    switch (event.type) {
      case "start_round": {
        if (!isFacilitator) throw new Error("Only the facilitator can start a round.");
        if (room.currentRound && room.currentRound.phase !== "finalized") {
          throw new Error("Finish the current round first.");
        }
        const title = cleanTitle(event.title);
        if (!title) throw new Error("Enter a task title.");
        const now = Date.now();
        room.currentRound = {
          id: crypto.randomUUID(),
          title,
          phase: "voting",
          startedAt: now,
          revealAvailableAt: now + REVEAL_DELAY_MS,
          revealAllowed: false,
          eligibleParticipantIds: room.participants.map(({ id }) => id),
          votes: {},
          suggestion: null,
          finalValue: null,
        };
        break;
      }

      case "select_vote": {
        const round = room.currentRound;
        if (!round || round.phase !== "voting") throw new Error("Voting is not open.");
        if (!round.eligibleParticipantIds.includes(participant.id)) {
          throw new Error("You joined after this round started and can vote in the next one.");
        }
        const value = String(event.value);
        if (!deck.cards.includes(value)) throw new Error("That card is not in this deck.");
        round.votes[participant.id] = { value, confirmed: false, votedAt: Date.now() };
        break;
      }

      case "confirm_vote": {
        const round = room.currentRound;
        const vote = round?.votes[participant.id];
        if (!round || round.phase !== "voting" || !vote) {
          throw new Error("Choose a card before confirming.");
        }
        vote.confirmed = true;
        vote.votedAt = Date.now();
        const everyoneConfirmed = round.eligibleParticipantIds.every(
          (id) => room.participants.some((person) => person.id === id) && round.votes[id]?.confirmed,
        );
        if (everyoneConfirmed) round.revealAllowed = true;
        break;
      }

      case "reveal": {
        if (!isFacilitator) throw new Error("Only the facilitator can reveal cards.");
        const round = room.currentRound;
        if (!round || round.phase !== "voting") throw new Error("There is no voting round to reveal.");
        round.phase = "revealed";
        round.revealedAt = Date.now();
        round.suggestion = calculateSuggestion(round, deck);
        break;
      }

      case "finalize": {
        if (!isFacilitator) throw new Error("Only the facilitator can finalize an estimate.");
        const round = room.currentRound;
        if (!round || round.phase !== "revealed") throw new Error("Reveal the cards first.");
        const finalValue = String(event.value ?? "").trim();
        if (!finalValue) throw new Error("Choose or enter a final estimate.");
        round.phase = "finalized";
        round.finalValue = finalValue.slice(0, 24);
        round.completedAt = Date.now();
        room.history.unshift({
          id: round.id,
          title: round.title,
          startedAt: round.startedAt,
          completedAt: round.completedAt,
          suggestion: round.suggestion,
          finalValue: round.finalValue,
          votes: round.eligibleParticipantIds.map((participantId) => {
            const voter = room.participants.find(({ id }) => id === participantId);
            return {
              participantId,
              participantName: voter ? displayName(voter) : "Former participant",
              value: round.votes[participantId]?.value ?? null,
              confirmed: round.votes[participantId]?.confirmed ?? false,
            };
          }),
        });
        break;
      }

      default:
        throw new Error("Unknown room action.");
    }
  }

  roomView(room, viewer) {
    const round = room.currentRound;
    const votesVisible = round?.phase === "revealed" || round?.phase === "finalized";
    const ownVote = round?.votes[viewer.id] ?? null;

    return {
      id: room.id,
      name: room.name,
      deck: getDeck(room.deckId),
      expiresAt: room.expiresAt,
      viewer: {
        id: viewer.id,
        displayName: displayName(viewer),
        color: viewer.color,
        role: viewer.role,
      },
      participants: room.participants.map((participant) => ({
        id: participant.id,
        displayName: displayName(participant),
        color: participant.color,
        role: participant.role,
        connected: participant.connected,
        hasVoted: Boolean(round?.votes[participant.id]?.confirmed),
        vote: votesVisible ? round?.votes[participant.id]?.value ?? null : undefined,
        eligible: round ? round.eligibleParticipantIds.includes(participant.id) : true,
      })),
      currentRound: round
        ? {
            id: round.id,
            title: round.title,
            phase: round.phase,
            startedAt: round.startedAt,
            revealAvailableAt: round.revealAvailableAt,
            revealAllowed: round.revealAllowed,
            suggestion: votesVisible ? round.suggestion : null,
            finalValue: round.finalValue,
            ownVote: votesVisible || ownVote
              ? { value: ownVote?.value ?? null, confirmed: ownVote?.confirmed ?? false }
              : null,
          }
        : null,
      history: room.history,
    };
  }

  async broadcast(room, excludedSocket = null) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludedSocket) continue;
      const token = socket.deserializeAttachment()?.token;
      const viewer = findParticipantByToken(room, token);
      if (!viewer) continue;
      try {
        socket.send(JSON.stringify({ type: "state", room: this.roomView(room, viewer) }));
      } catch {
        // The close handler will update presence for disconnected sockets.
      }
    }
  }
}

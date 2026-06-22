import { getDeck } from "../shared/decks.js";
import { ROOM_LIMITS } from "../shared/limits.js";
import {
  byteLength,
  calculateResultMetrics,
  calculateSuggestion,
  cleanCards,
  readJson,
} from "./room-logic.js";

const ROOM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_SCHEMA_VERSION = 1;
const IDENTITY_COOKIE = "point_taken_identity";
const REACTION_COOLDOWN_MS = 1200;
const REACTION_LIFETIME_MS = 5000;
const DEFAULT_REACTION_PALETTE = ["👍", "🤔", "👀", "🎉", "☕"];
const ALLOWED_REACTIONS = new Set([...DEFAULT_REACTION_PALETTE, "✋"]);
const DEFAULT_REVEAL_DELAY_SECONDS = 30;
const ALLOWED_REVEAL_DELAYS = new Set([0, 15, 30, 60, 90]);
const ALLOWED_SUGGESTION_ALGORITHMS = new Set([
  "most_votes",
  "middle_ground",
  "median",
  "average_up",
  "highest",
  "none",
]);
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

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function identityCookie(token, roomId, secure) {
  const parts = [
    `${IDENTITY_COOKIE}=${encodeURIComponent(token)}`,
    `Path=/api/rooms/${roomId}`,
    `Max-Age=${Math.floor(ROOM_LIFETIME_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function withSecurityHeaders(response) {
  const next = new Response(response.body, response);
  next.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  next.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next.headers.set("X-Content-Type-Options", "nosniff");
  next.headers.set("Referrer-Policy", "no-referrer");
  next.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next.headers.set("Cache-Control", "no-store");
  return next;
}

function validateOrigin(request, requestUrl, env) {
  const origin = request.headers.get("Origin");
  const allowed = new Set([requestUrl.origin]);
  if (env.ALLOWED_ORIGIN) allowed.add(env.ALLOWED_ORIGIN);
  return Boolean(origin && allowed.has(origin));
}

function safeLog(event, details = {}) {
  console.log({ event, ...details });
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

function randomRoomName() {
  return `${randomItem(ADJECTIVES)} ${randomItem(COLORS_AS_WORDS)} ${randomItem(ANIMALS)}`;
}

function roomSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function randomRoomId(name) {
  return `${roomSlug(name)}-${randomHex(6)}`;
}

function cleanName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
  return name || "Guest";
}

function cleanTitle(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function cleanItemTitles(values) {
  if (!Array.isArray(values)) throw new Error("Items must be provided as a list.");
  const titles = values.map(cleanTitle).filter(Boolean);
  if (titles.length === 0) throw new Error("Add at least one item.");
  if (titles.length > 100) throw new Error("Add no more than 100 items at a time.");
  return titles;
}

function cloneDeck(deckId) {
  const deck = getDeck(deckId);
  return { ...deck, cards: [...deck.cards] };
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

function requireFacilitator(participant, action) {
  if (participant.role !== "facilitator") {
    throw new Error(`Only the facilitator can ${action}.`);
  }
}

function requireBetweenRounds(room, message) {
  if (room.currentRound && room.currentRound.phase !== "finalized") {
    throw new Error(message);
  }
}

function everyoneConfirmed(round, participants) {
  return round.eligibleParticipantIds.every(
    (id) => participants.some((person) => person.id === id) && round.votes[id]?.confirmed,
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/rooms" && request.method === "POST") {
        if (!validateOrigin(request, url, env)) {
          safeLog("origin_rejected", { action: "create_room" });
          return withSecurityHeaders(json({ error: "Request origin is not allowed." }, 403));
        }
        const actorKey = request.headers.get("CF-Connecting-IP") ?? "local";
        const { success } = await env.CREATE_RATE_LIMITER.limit({ key: actorKey });
        if (!success) {
          safeLog("rate_limited", { action: "create_room" });
          return withSecurityHeaders(json({ error: "Too many rooms created. Try again shortly." }, 429));
        }
        const input = await readJson(request);
        const roomName = randomRoomName();
        const roomId = randomRoomId(roomName);
        const objectId = env.ROOMS.idFromName(roomId);
        const stub = env.ROOMS.get(objectId);
        const response = await stub.fetch("https://room.internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            roomName,
            facilitatorName: input.name,
            deckId: input.deckId,
          }),
        });
        const result = await response.json();
        if (!response.ok) return withSecurityHeaders(json(result, response.status));
        const publicResult = {
          roomId: result.roomId,
          participantId: result.participantId,
        };
        const publicResponse = json(publicResult, 201);
        publicResponse.headers.append(
          "Set-Cookie",
          identityCookie(result.token, roomId, url.protocol === "https:"),
        );
        safeLog("room_created", { roomId });
        return withSecurityHeaders(publicResponse);
      }

      const match = url.pathname.match(
        /^\/api\/rooms\/([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-[a-f0-9]{6})(?:\/(join|socket|state))?$/,
      );
      if (!match) {
        return withSecurityHeaders(json({ error: "Not found" }, 404));
      }

      const [, roomId, action = "state"] = match;
      const isSocket = action === "socket";
      const isMutation = request.method !== "GET";
      if ((isSocket || isMutation) && !validateOrigin(request, url, env)) {
        safeLog("origin_rejected", { action, roomId });
        return withSecurityHeaders(json({ error: "Request origin is not allowed." }, 403));
      }

      const objectId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(objectId);
      const target = new URL(`https://room.internal/${action}`);
      const headers = new Headers(request.headers);
      const token = cookieValue(request, IDENTITY_COOKIE);
      if (token) headers.set("X-Room-Identity", token);

      let forwardedRequest = request;
      if (action === "join" && request.method === "POST") {
        const actorKey = `${roomId}:${request.headers.get("CF-Connecting-IP") ?? "local"}`;
        const { success } = await env.JOIN_RATE_LIMITER.limit({ key: actorKey });
        if (!success) {
          safeLog("rate_limited", { action: "join_room", roomId });
          return withSecurityHeaders(json({ error: "Too many join attempts. Try again shortly." }, 429));
        }
        const input = await readJson(request);
        forwardedRequest = new Request(target, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        });
      } else {
        forwardedRequest = new Request(target, request);
        forwardedRequest.headers.set("X-Room-Identity", token ?? "");
      }

      const response = await stub.fetch(target, forwardedRequest);
      if (action === "join" && request.method === "POST") {
        const result = await response.json();
        if (!response.ok) return withSecurityHeaders(json(result, response.status));
        const publicResponse = json({
          roomId: result.roomId,
          participantId: result.participantId,
        }, response.status);
        publicResponse.headers.append(
          "Set-Cookie",
          identityCookie(result.token, roomId, url.protocol === "https:"),
        );
        safeLog("participant_joined", { roomId });
        return withSecurityHeaders(publicResponse);
      }
      return isSocket ? response : withSecurityHeaders(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request.";
      safeLog("request_rejected", { reason: message });
      return withSecurityHeaders(json({ error: message }, 400));
    }
  },
};

export class PlanningRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async loadRoom() {
    const room = await this.ctx.storage.get("room");
    if (!room) return room;
    room.schemaVersion ??= 0;
    room.deck ??= cloneDeck(room.deckId);
    room.settings ??= {};
    room.settings.suggestionAlgorithm ??= "most_votes";
    room.settings.revealDelaySeconds ??= DEFAULT_REVEAL_DELAY_SECONDS;
    room.settings.reactionsEnabled ??= true;
    room.settings.reactionPalette ??= [...DEFAULT_REACTION_PALETTE];
    room.settings.reactionPalette = room.settings.reactionPalette.filter(
      (reaction) => reaction !== "✋",
    );
    room.settings.reactionsMuted ??= false;
    room.isLocked ??= false;
    room.isClosed ??= false;
    room.items ??= [];
    room.reactions ??= [];
    room.raisedHands ??= [];
    if (room.schemaVersion < CURRENT_SCHEMA_VERSION) {
      room.schemaVersion = CURRENT_SCHEMA_VERSION;
      await this.ctx.storage.put("room", room);
    }
    return room;
  }

  async saveRoom(room, { touch = true } = {}) {
    room.reactions = room.reactions.filter(
      ({ createdAt }) => Date.now() - createdAt < REACTION_LIFETIME_MS,
    );
    if (touch) {
      room.updatedAt = Date.now();
      room.expiresAt = room.updatedAt + ROOM_LIFETIME_MS;
    }
    await this.ctx.storage.put("room", room);
    await this.scheduleNextAlarm(room);
  }

  async scheduleNextAlarm(room) {
    const wakeAt =
      room.currentRound?.phase === "voting" &&
      !room.currentRound.revealAllowed &&
      room.currentRound.revealAvailableAt
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
      const participant = findParticipantByToken(room, request.headers.get("X-Room-Identity"));
      if (!participant) return json({ error: "Invalid room identity." }, 401);
      return json(this.roomView(room, participant));
    }

    if (url.pathname === "/socket" && request.headers.get("Upgrade") === "websocket") {
      return this.connect(request, room);
    }

    return json({ error: "Not found" }, 404);
  }

  async create(request) {
    if (await this.loadRoom()) {
      return json({ error: "Room already exists." }, 409);
    }

    const input = await readJson(request);
    const facilitator = newParticipant(input.facilitatorName, "facilitator", 0);
    const now = Date.now();
    const room = {
      id: input.roomId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name: input.roomName || randomRoomName(),
      deckId: getDeck(input.deckId).id,
      deck: cloneDeck(input.deckId),
      settings: {
        suggestionAlgorithm: "most_votes",
        revealDelaySeconds: DEFAULT_REVEAL_DELAY_SECONDS,
        reactionsEnabled: true,
        reactionPalette: [...DEFAULT_REACTION_PALETTE],
        reactionsMuted: false,
      },
      isLocked: false,
      isClosed: false,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ROOM_LIFETIME_MS,
      participants: [facilitator],
      items: [],
      reactions: [],
      raisedHands: [],
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
    const input = await readJson(request);
    const returning = findParticipantByToken(room, request.headers.get("X-Room-Identity"));
    if (returning) {
      return json({
        roomId: room.id,
        token: returning.token,
        participantId: returning.id,
      });
    }

    if (room.isClosed) return json({ error: "This room has been closed." }, 423);
    if (room.isLocked) return json({ error: "This room is not accepting new participants." }, 423);
    if (room.participants.length >= ROOM_LIMITS.participants) {
      return json({ error: `This room has reached its ${ROOM_LIMITS.participants}-person limit.` }, 409);
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

  async connect(request, room) {
    const participant = findParticipantByToken(room, request.headers.get("X-Room-Identity"));
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
      const now = Date.now();
      const messageWindowStartedAt = attachment.messageWindowStartedAt ?? now;
      const messageCount = now - messageWindowStartedAt < 10000
        ? (attachment.messageCount ?? 0) + 1
        : 1;
      if (messageCount > 40) throw new Error("Too many room actions. Slow down and try again.");
      socket.serializeAttachment({
        ...attachment,
        messageWindowStartedAt: now - messageWindowStartedAt < 10000 ? messageWindowStartedAt : now,
        messageCount,
      });
      if (
        typeof message !== "string" ||
        byteLength(message) > ROOM_LIMITS.webSocketMessageBytes
      ) {
        throw new Error("Room message is too large.");
      }
      const event = JSON.parse(message);
      if (event.type === "delete_room") {
        requireFacilitator(participant, "delete the room");
        for (const connectedSocket of this.ctx.getWebSockets()) {
          try {
            connectedSocket.send(JSON.stringify({ type: "room_deleted" }));
            connectedSocket.close(4002, "Room deleted");
          } catch {
            // The room is being destroyed; disconnected sockets need no further cleanup.
          }
        }
        safeLog("room_deleted", { roomId: room.id });
        await this.ctx.storage.deleteAll();
        return;
      }
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
      safeLog("room_expired", { roomId: room.id });
      this.ctx.getWebSockets().forEach((socket) => socket.close(1001, "Room expired"));
      await this.ctx.storage.deleteAll();
      return;
    }

    if (
      room.currentRound?.phase === "voting" &&
      !room.currentRound.revealAllowed &&
      room.currentRound.revealAvailableAt &&
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
    const deck = room.deck;

    if (room.isClosed) throw new Error("This room is closed and can only be viewed.");

    switch (event.type) {
      case "update_settings": {
        requireFacilitator(participant, "change room settings");
        requireBetweenRounds(room, "Room settings can only change between rounds.");

        if (event.cards) room.deck.cards = cleanCards(event.cards);
        if (event.suggestionAlgorithm) {
          if (!ALLOWED_SUGGESTION_ALGORITHMS.has(event.suggestionAlgorithm)) {
            throw new Error("Unknown suggestion algorithm.");
          }
          room.settings.suggestionAlgorithm = event.suggestionAlgorithm;
        }
        if (event.revealDelaySeconds !== undefined) {
          const delay = Number(event.revealDelaySeconds);
          if (!ALLOWED_REVEAL_DELAYS.has(delay)) throw new Error("Unsupported reveal timer.");
          room.settings.revealDelaySeconds = delay;
        }
        if (event.reactionsEnabled !== undefined) {
          room.settings.reactionsEnabled = Boolean(event.reactionsEnabled);
        }
        if (event.reactionPalette !== undefined) {
          if (!Array.isArray(event.reactionPalette)) throw new Error("Reaction palette must be a list.");
          const palette = [...new Set(event.reactionPalette)]
            .filter((reaction) => ALLOWED_REACTIONS.has(reaction));
          if (palette.length === 0) throw new Error("Keep at least one reaction available.");
          room.settings.reactionPalette = palette;
        }
        break;
      }

      case "send_reaction": {
        if (!room.settings.reactionsEnabled || room.settings.reactionsMuted) {
          throw new Error("Reactions are currently paused.");
        }
        const reaction = String(event.reaction ?? "");
        if (
          !ALLOWED_REACTIONS.has(reaction) ||
          (reaction !== "✋" && !room.settings.reactionPalette.includes(reaction))
        ) {
          throw new Error("That reaction is not available.");
        }
        const now = Date.now();
        if (participant.lastReactionAt && now - participant.lastReactionAt < REACTION_COOLDOWN_MS) {
          throw new Error("Give reactions a moment to breathe.");
        }
        participant.lastReactionAt = now;
        if (reaction === "✋") {
          if (!room.raisedHands.includes(participant.id)) room.raisedHands.push(participant.id);
        } else {
          room.reactions = room.reactions
            .filter(({ createdAt }) => now - createdAt < REACTION_LIFETIME_MS)
            .concat({
              id: crypto.randomUUID(),
              participantId: participant.id,
              reaction,
              createdAt: now,
            })
            .slice(-30);
        }
        break;
      }

      case "lower_hand": {
        room.raisedHands = room.raisedHands.filter((id) => id !== participant.id);
        break;
      }

      case "set_reactions_muted": {
        requireFacilitator(participant, "pause reactions");
        room.settings.reactionsMuted = Boolean(event.muted);
        break;
      }

      case "clear_reactions": {
        requireFacilitator(participant, "clear reactions");
        room.reactions = [];
        room.raisedHands = [];
        break;
      }

      case "set_room_lock": {
        requireFacilitator(participant, "lock the room");
        room.isLocked = Boolean(event.locked);
        break;
      }

      case "set_participant_role": {
        requireFacilitator(participant, "change participant roles");
        requireBetweenRounds(room, "Roles can only change between rounds.");
        const target = room.participants.find(({ id }) => id === event.participantId);
        if (!target || target.role === "facilitator") {
          throw new Error("That participant cannot be changed.");
        }
        if (!["participant", "observer"].includes(event.role)) {
          throw new Error("Unknown participant role.");
        }
        target.role = event.role;
        break;
      }

      case "transfer_facilitator": {
        requireFacilitator(participant, "transfer ownership");
        requireBetweenRounds(room, "Facilitator ownership can only transfer between rounds.");
        const target = room.participants.find(({ id }) => id === event.participantId);
        if (!target || target.id === participant.id) {
          throw new Error("Choose another person to become facilitator.");
        }
        participant.role = "participant";
        target.role = "facilitator";
        break;
      }

      case "remove_participant": {
        requireFacilitator(participant, "remove participants");
        const target = room.participants.find(({ id }) => id === event.participantId);
        if (!target || target.role === "facilitator") {
          throw new Error("That participant cannot be removed.");
        }
        room.participants = room.participants.filter(({ id }) => id !== target.id);
        room.raisedHands = room.raisedHands.filter((id) => id !== target.id);
        room.reactions = room.reactions.filter(({ participantId }) => participantId !== target.id);
        if (room.currentRound && room.currentRound.phase !== "finalized") {
          room.currentRound.eligibleParticipantIds =
            room.currentRound.eligibleParticipantIds.filter((id) => id !== target.id);
          delete room.currentRound.votes[target.id];
          if (everyoneConfirmed(room.currentRound, room.participants)) {
            room.currentRound.revealAllowed = true;
          }
        }
        break;
      }

      case "add_items": {
        requireFacilitator(participant, "add estimation items");
        requireBetweenRounds(room, "Items can only be changed between rounds.");
        const existingTitles = new Set(
          room.items.filter((item) => item.status === "pending").map((item) => item.title.toLowerCase()),
        );
        const requestedTitles = cleanItemTitles(event.titles);
        const availableSlots = ROOM_LIMITS.pendingItems - existingTitles.size;
        const uniqueNewTitles = requestedTitles.filter((title, index, values) =>
          !existingTitles.has(title.toLowerCase()) &&
          values.findIndex((value) => value.toLowerCase() === title.toLowerCase()) === index,
        );
        if (uniqueNewTitles.length > availableSlots) {
          throw new Error(`A room can have at most ${ROOM_LIMITS.pendingItems} pending items.`);
        }
        for (const title of uniqueNewTitles) {
          if (existingTitles.has(title.toLowerCase())) continue;
          room.items.push({
            id: crypto.randomUUID(),
            title,
            status: "pending",
            createdAt: Date.now(),
          });
          existingTitles.add(title.toLowerCase());
        }
        break;
      }

      case "remove_item": {
        requireFacilitator(participant, "remove estimation items");
        requireBetweenRounds(room, "Items can only be changed between rounds.");
        const item = room.items.find(({ id }) => id === event.itemId);
        if (!item || item.status !== "pending") throw new Error("That pending item was not found.");
        room.items = room.items.filter(({ id }) => id !== item.id);
        break;
      }

      case "update_item": {
        requireFacilitator(participant, "edit estimation items");
        requireBetweenRounds(room, "Items can only be changed between rounds.");
        const item = room.items.find(({ id }) => id === event.itemId);
        if (!item || item.status !== "pending") throw new Error("That pending item was not found.");
        const title = cleanTitle(event.title);
        if (!title) throw new Error("Enter an item title.");
        const duplicate = room.items.some(
          (candidate) =>
            candidate.id !== item.id &&
            candidate.status === "pending" &&
            candidate.title.toLowerCase() === title.toLowerCase(),
        );
        if (duplicate) throw new Error("That item is already in the estimation queue.");
        item.title = title;
        break;
      }

      case "reorder_items": {
        requireFacilitator(participant, "reorder estimation items");
        requireBetweenRounds(room, "Items can only be reordered between rounds.");
        const pendingItems = room.items.filter(({ status }) => status === "pending");
        const orderedIds = Array.isArray(event.itemIds) ? event.itemIds : [];
        if (
          orderedIds.length !== pendingItems.length ||
          new Set(orderedIds).size !== orderedIds.length ||
          pendingItems.some(({ id }) => !orderedIds.includes(id))
        ) {
          throw new Error("The pending item order is no longer current.");
        }
        const pendingById = new Map(pendingItems.map((item) => [item.id, item]));
        const reordered = orderedIds.map((id) => pendingById.get(id));
        let pendingIndex = 0;
        room.items = room.items.map((item) =>
          item.status === "pending" ? reordered[pendingIndex++] : item,
        );
        break;
      }

      case "close_room": {
        requireFacilitator(participant, "close the room");
        requireBetweenRounds(room, "Finish the current round before closing the room.");
        room.isClosed = true;
        room.isLocked = true;
        room.closedAt = Date.now();
        break;
      }

      case "start_round": {
        requireFacilitator(participant, "start a round");
        requireBetweenRounds(room, "Finish the current round first.");
        const selectedItem = event.itemId
          ? room.items.find(({ id, status }) => id === event.itemId && status === "pending")
          : null;
        if (event.itemId && !selectedItem) throw new Error("That item is no longer pending.");
        const title = selectedItem?.title ?? cleanTitle(event.title);
        if (!title) throw new Error("Enter a task title.");
        const now = Date.now();
        const revealDelayMs = room.settings.revealDelaySeconds * 1000;
        room.currentRound = {
          id: crypto.randomUUID(),
          itemId: selectedItem?.id ?? null,
          title,
          phase: "voting",
          startedAt: now,
          revealAvailableAt: revealDelayMs ? now + revealDelayMs : null,
          revealAllowed: false,
          eligibleParticipantIds: room.participants
            .filter(({ role }) => role !== "observer")
            .map(({ id }) => id),
          votes: {},
          suggestion: null,
          finalValue: null,
        };
        break;
      }

      case "update_round_title": {
        requireFacilitator(participant, "edit the item title");
        const round = room.currentRound;
        if (!round || round.phase === "finalized") throw new Error("There is no active round to edit.");
        const title = cleanTitle(event.title);
        if (!title) throw new Error("Enter an item title.");
        round.title = title;
        if (round.itemId) {
          const item = room.items.find(({ id }) => id === round.itemId);
          if (item) item.title = title;
        }
        break;
      }

      case "restart_voting": {
        requireFacilitator(participant, "restart voting");
        const round = room.currentRound;
        if (!round || round.phase === "finalized") throw new Error("There is no active round to restart.");
        const now = Date.now();
        const revealDelayMs = room.settings.revealDelaySeconds * 1000;
        round.phase = "voting";
        round.startedAt = now;
        round.revealAvailableAt = revealDelayMs ? now + revealDelayMs : null;
        round.revealAllowed = false;
        round.votes = {};
        round.suggestion = null;
        round.revealedAt = null;
        break;
      }

      case "cancel_round": {
        requireFacilitator(participant, "cancel a round");
        const round = room.currentRound;
        if (!round || round.phase === "finalized") throw new Error("There is no active round to cancel.");
        room.currentRound = null;
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
        if (everyoneConfirmed(round, room.participants)) round.revealAllowed = true;
        break;
      }

      case "reveal": {
        requireFacilitator(participant, "reveal cards");
        const round = room.currentRound;
        if (!round || round.phase !== "voting") throw new Error("There is no voting round to reveal.");
        round.phase = "revealed";
        round.revealedAt = Date.now();
        round.suggestion = calculateSuggestion(
          round,
          deck,
          room.settings.suggestionAlgorithm,
        );
        round.metrics = calculateResultMetrics(round, deck);
        break;
      }

      case "finalize": {
        requireFacilitator(participant, "finalize an estimate");
        const round = room.currentRound;
        if (!round || round.phase !== "revealed") throw new Error("Reveal the cards first.");
        const finalValue = String(event.value ?? "").trim();
        if (!finalValue) throw new Error("Choose or enter a final estimate.");
        round.phase = "finalized";
        round.finalValue = finalValue.slice(0, 24);
        round.completedAt = Date.now();
        if (round.itemId) {
          const item = room.items.find(({ id }) => id === round.itemId);
          if (item) {
            item.status = "estimated";
            item.finalValue = round.finalValue;
            item.completedAt = round.completedAt;
          }
        }
        room.history.unshift({
          id: round.id,
          itemId: round.itemId,
          title: round.title,
          startedAt: round.startedAt,
          completedAt: round.completedAt,
          suggestion: round.suggestion,
          metrics: round.metrics,
          deckCards: [...deck.cards],
          suggestionAlgorithm: room.settings.suggestionAlgorithm,
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
        room.history = room.history.slice(0, ROOM_LIMITS.completedEstimates);
        const retainedItemIds = new Set(room.history.map(({ itemId }) => itemId).filter(Boolean));
        room.items = room.items.filter(
          (item) => item.status === "pending" || retainedItemIds.has(item.id),
        );
        safeLog("round_finalized", {
          roomId: room.id,
          participantCount: round.eligibleParticipantIds.length,
          historyCount: room.history.length,
        });
        break;
      }

      default:
        throw new Error("Unknown room action.");
    }
  }

  roomView(room, viewer) {
    const round = room.currentRound;
    const now = Date.now();
    const activeReactions = room.reactions.filter(
      ({ createdAt }) => now - createdAt < REACTION_LIFETIME_MS,
    );
    const votesVisible = round?.phase === "revealed" || round?.phase === "finalized";
    const ownVote = round?.votes[viewer.id] ?? null;

    return {
      id: room.id,
      name: room.name,
      deck: room.deck,
      settings: room.settings,
      isLocked: room.isLocked,
      isClosed: room.isClosed,
      closedAt: room.closedAt ?? null,
      reactions: activeReactions.map((reaction) => {
        const reactor = room.participants.find(({ id }) => id === reaction.participantId);
        return {
          ...reaction,
          participantName: reactor ? displayName(reactor) : "Someone",
          color: reactor?.color ?? "#607069",
        };
      }),
      raisedHands: room.raisedHands
        .map((participantId) => room.participants.find(({ id }) => id === participantId))
        .filter(Boolean)
        .map((person) => ({
          participantId: person.id,
          participantName: displayName(person),
          color: person.color,
        })),
      items: room.items,
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
            itemId: round.itemId ?? null,
            title: round.title,
            phase: round.phase,
            startedAt: round.startedAt,
            revealAvailableAt: round.revealAvailableAt,
            revealAllowed: round.revealAllowed,
            suggestion: votesVisible ? round.suggestion : null,
            metrics: votesVisible ? round.metrics : null,
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
      if (!viewer) {
        socket.close(4001, "Removed from room");
        continue;
      }
      try {
        socket.send(JSON.stringify({ type: "state", room: this.roomView(room, viewer) }));
      } catch {
        // The close handler will update presence for disconnected sockets.
      }
    }
  }
}

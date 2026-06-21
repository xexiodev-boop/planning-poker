import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DECKS, DEFAULT_DECK_ID } from "../shared/decks.js";

const ROOM_PATH = /^\/room\/([a-f0-9]{16}|[a-z0-9]+(?:-[a-z0-9]+){3})\/?$/;
const SUGGESTION_ALGORITHMS = [
  {
    id: "most_votes",
    name: "Most votes",
    description: "Pick the most popular card; ties lean higher.",
  },
  {
    id: "middle_ground",
    name: "Middle ground",
    description: "For tied leaders, choose the card nearest their midpoint.",
  },
  {
    id: "median",
    name: "Median",
    description: "Pick the middle submitted card, reducing the effect of extremes.",
  },
  {
    id: "average_up",
    name: "Average, rounded up",
    description: "Average numeric votes and round up to a card in the deck.",
  },
  {
    id: "highest",
    name: "Highest vote",
    description: "Use the most cautious submitted estimate.",
  },
  {
    id: "none",
    name: "No suggestion",
    description: "Show the votes and leave the decision entirely to the team.",
  },
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function useRoomId() {
  return window.location.pathname.match(ROOM_PATH)?.[1] ?? null;
}

function useConfirmation() {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    setRequest(options);
  }), []);

  const resolve = useCallback((accepted) => {
    resolverRef.current?.(accepted);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  useEffect(() => () => resolverRef.current?.(false), []);

  return {
    confirm,
    confirmationDialog: request ? (
      <ConfirmDialog {...request} onCancel={() => resolve(false)} onConfirm={() => resolve(true)} />
    ) : null,
  };
}

export default function App() {
  const roomId = useRoomId();
  return roomId ? <RoomPage roomId={roomId} /> : <HomePage />;
}

function HomePage() {
  const [name, setName] = useState("");
  const [deckId, setDeckId] = useState(DEFAULT_DECK_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createRoom(event) {
    event.preventDefault();
    if (!name.trim()) return setError("Tell the room what to call you.");
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name, deckId }),
      });
      window.location.assign(`/room/${result.roomId}`);
    } catch (requestError) {
      setError(requestError.message);
      setLoading(false);
    }
  }

  return (
    <main className="home-shell">
      <section className="hero">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <div className="hero-copy">
          <p className="eyebrow">Planning poker without the ceremony</p>
          <h1>Find the estimate your team can stand behind.</h1>
          <p className="lede">
            Open a room, invite your team, and turn different instincts into one clear decision.
            No accounts. No setup detour.
          </p>
          <div className="promise-row" aria-label="Product highlights">
            <span>Live voting</span>
            <span>Private cards</span>
            <span>Seven-day rooms</span>
          </div>
        </div>
      </section>

      <section className="create-panel">
        <div>
          <p className="step-label">Create a room</p>
          <h2>You’ll be the facilitator.</h2>
          <p className="muted">Choose a deck now. You can invite everyone once you’re inside.</p>
        </div>

        <form onSubmit={createRoom}>
          <label>
            Your name
            <input
              autoFocus
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex"
              value={name}
            />
          </label>

          <fieldset>
            <legend>Planning deck</legend>
            <div className="deck-options">
              {Object.values(DECKS).map((deck) => (
                <label className={`deck-option ${deckId === deck.id ? "selected" : ""}`} key={deck.id}>
                  <input
                    checked={deckId === deck.id}
                    name="deck"
                    onChange={() => setDeckId(deck.id)}
                    type="radio"
                    value={deck.id}
                  />
                  <span>
                    <strong>{deck.name}</strong>
                    <small>{deck.cards.slice(0, 7).join(" · ")}</small>
                  </span>
                  <i aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "Opening the room…" : "Create planning room"}
          </button>
        </form>
      </section>
    </main>
  );
}

function RoomPage({ roomId }) {
  const [access, setAccess] = useState("checking");
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    let retryCount = 0;

    function connect() {
      setStatus(room ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${roomId}/socket`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) {
          retryCount = 0;
          setStatus("connected");
          setError("");
        }
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") setRoom(message.room);
        if (message.type === "error") setError(message.message);
      };
      socket.onclose = (event) => {
        if (cancelled) return;
        if (event.code === 1008 || event.code === 1001 || event.code === 4001) {
          setAccess("join");
          setRoom(null);
          setStatus("join");
          if (event.code === 4001) setError("You were removed from this room.");
          return;
        }
        setStatus("reconnecting");
        const delay = Math.min(15000, 750 * (2 ** retryCount));
        retryCount += 1;
        retryTimer = window.setTimeout(connect, delay + Math.random() * 500);
      };
    }

    async function authenticate() {
      try {
        const state = await api(`/api/rooms/${roomId}/state`);
        if (cancelled) return;
        setRoom(state);
        setAccess("joined");
        connect();
      } catch (requestError) {
        if (cancelled) return;
        if (requestError.status === 401) {
          setAccess("join");
          setStatus("join");
        } else {
          setAccess("join");
          setStatus("join");
          setError(requestError.message);
        }
      }
    }

    authenticate();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [roomId]);

  const send = useCallback((event) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("The room is reconnecting. Try that again in a moment.");
      return;
    }
    socketRef.current.send(JSON.stringify(event));
  }, []);

  async function join(name) {
    setStatus("connecting");
    setError("");
    try {
      await api(`/api/rooms/${roomId}/join`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setAccess("checking");
      const state = await api(`/api/rooms/${roomId}/state`);
      setRoom(state);
      setAccess("joined");
      window.location.reload();
    } catch (requestError) {
      setError(requestError.message);
      setStatus("join");
    }
  }

  if (access === "join") return <JoinRoom roomId={roomId} onJoin={join} error={error} />;
  if (!room) return <LoadingRoom status={status} error={error} />;

  return <Room room={room} send={send} status={status} error={error} />;
}

function JoinRoom({ roomId, onJoin, error }) {
  const [name, setName] = useState("");

  function submit(event) {
    event.preventDefault();
    if (name.trim()) onJoin(name);
  }

  return (
    <main className="center-shell">
      <section className="join-card">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <p className="eyebrow">You’ve been invited</p>
        <h1>Join the planning room</h1>
        <p className="muted">We’ll add a short suffix to your name so everyone stays distinct.</p>
        <form onSubmit={submit}>
          <label>
            Your name
            <input
              autoFocus
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex"
              value={name}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit">Join room</button>
        </form>
        <small className="room-code">Room code {roomId.split("-").at(-1).slice(0, 6)}</small>
      </section>
    </main>
  );
}

function LoadingRoom({ status, error }) {
  return (
    <main className="center-shell">
      <div className="loading-card">
        <div className="spinner" />
        <h2>{status === "reconnecting" ? "Finding the room again…" : "Pulling up a chair…"}</h2>
        {error && <p className="form-error">{error}</p>}
      </div>
    </main>
  );
}

function Room({ room, send, status, error }) {
  const isFacilitator = room.viewer.role === "facilitator";
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="room-shell">
      <header className="room-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <div className="room-identity">
          <div>
            <span className="status-dot" data-status={status} />
            <strong>{room.name}</strong>
            {(room.isLocked || room.isClosed) && (
              <span className={`room-state ${room.isClosed ? "closed" : ""}`}>
                {room.isClosed ? "Closed" : "Locked"}
              </span>
            )}
          </div>
          <button className="text-button" onClick={copyLink} type="button">
            {copied ? "Link copied" : "Invite people"}
          </button>
          {isFacilitator && !room.isClosed && (
            <button className="text-button" onClick={() => setSettingsOpen(true)} type="button">
              Room settings
            </button>
          )}
        </div>
        <div className="viewer-pill">
          <span style={{ backgroundColor: room.viewer.color }} />
          <div>
            <strong>{room.viewer.displayName}</strong>
            <small>{isFacilitator ? "Facilitator" : "Participant"}</small>
          </div>
        </div>
      </header>

      {error && <div className="toast">{error}</div>}
      {settingsOpen && (
        <RoomSettings
          room={room}
          send={send}
          onClose={() => setSettingsOpen(false)}
          onManageItems={() => {
            setSettingsOpen(false);
            setItemsOpen(true);
          }}
        />
      )}
      {itemsOpen && (
        <ItemManager
          room={room}
          send={send}
          onClose={() => setItemsOpen(false)}
        />
      )}

      <div className="room-layout">
        <section className="table-area">
          <RoundStage room={room} send={send} />
          <CardHand room={room} send={send} />
        </section>
        <aside className="sidebar">
          <PeopleList room={room} send={send} />
          <History room={room} />
        </aside>
      </div>
    </main>
  );
}

function RoundStage({ room, send }) {
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";

  if (room.isClosed) {
    return (
      <div className="round-stage empty-stage">
        <div className="stage-message">
          <p className="eyebrow">Session complete</p>
          <h2>This room is closed</h2>
          <p>Its estimates remain available here until the room expires.</p>
        </div>
      </div>
    );
  }

  if (!round || round.phase === "finalized") {
    return (
      <div className="round-stage empty-stage">
        <div className="table-orbit">
          <span>?</span><span>3</span><span>8</span>
        </div>
        {isFacilitator ? (
          <StartRound room={room} send={send} previousRound={round} />
        ) : (
          <div className="stage-message">
            <p className="eyebrow">{round ? "Estimate saved" : "Room is ready"}</p>
            <h2>Waiting for the facilitator</h2>
            <p>{round ? "The next task will appear here." : "They’ll bring the first task to the table."}</p>
          </div>
        )}
      </div>
    );
  }

  if (round.phase === "voting") {
    return <VotingStage room={room} send={send} />;
  }

  return <ResultsStage room={room} send={send} />;
}

function StartRound({ room, send, previousRound }) {
  const pendingItems = room.items.filter((item) => item.status === "pending");
  const [itemId, setItemId] = useState(pendingItems[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState(pendingItems.length ? "backlog" : "new");
  const selectedItem = pendingItems.find((item) => item.id === itemId);

  function submit(event) {
    event.preventDefault();
    if (source === "backlog" && itemId) {
      send({ type: "start_round", itemId });
    } else if (title.trim()) {
      send({ type: "start_round", title });
    } else {
      return;
    }
    setTitle("");
  }

  return (
    <form className="start-round" onSubmit={submit}>
      <div className="round-picker">
        <section className="pending-picker">
          <div className="picker-heading">
            <span>Pending items</span>
            <b>{pendingItems.length}</b>
          </div>
          {pendingItems.length ? (
            <div className="picker-list">
              {pendingItems.map((item, index) => (
                <button
                  className={source === "backlog" && itemId === item.id ? "selected" : ""}
                  key={item.id}
                  onClick={() => {
                    setItemId(item.id);
                    setSource("backlog");
                  }}
                  type="button"
                >
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <span>{item.title}</span>
                  <i aria-hidden="true">›</i>
                </button>
              ))}
            </div>
          ) : (
            <p className="picker-empty">No pending items. Add an item on the right to begin.</p>
          )}
        </section>

        <section className="round-choice">
          <p className="eyebrow">{previousRound ? "Ready for another?" : "First estimate"}</p>
          <h2>What are we sizing?</h2>
          {source === "backlog" && selectedItem ? (
            <div className="selected-backlog-item">
              <small>Selected from the item list</small>
              <strong>{selectedItem.title}</strong>
            </div>
          ) : (
            <div className="new-item-entry">
              <label>
                New item
                <input
                  autoFocus={!pendingItems.length}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Add team mentions to comments"
                  value={title}
                />
              </label>
            </div>
          )}
          <div className="round-choice-actions">
            {pendingItems.length > 0 && (
              <button
                className="text-button"
                onClick={() => setSource(source === "new" ? "backlog" : "new")}
                type="button"
              >
                {source === "new" ? "Choose a pending item" : "Enter a new item instead"}
              </button>
            )}
            <button className="primary-button" type="submit">Start voting</button>
          </div>
        </section>
      </div>
    </form>
  );
}

function VotingStage({ room, send }) {
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";
  const eligible = room.participants.filter((person) => person.eligible);
  const voted = eligible.filter((person) => person.hasVoted).length;
  const allVoted = voted === eligible.length;
  const { confirm, confirmationDialog } = useConfirmation();
  const hasRevealReminder = Boolean(round.revealAvailableAt);
  const [remaining, setRemaining] = useState(() =>
    hasRevealReminder
      ? Math.max(0, Math.ceil((round.revealAvailableAt - Date.now()) / 1000))
      : null,
  );

  useEffect(() => {
    if (!round.revealAvailableAt) {
      setRemaining(null);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((round.revealAvailableAt - Date.now()) / 1000)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [round.revealAvailableAt]);

  async function reveal() {
    const missing = eligible.length - voted;
    if (missing > 0) {
      const accepted = await confirm({
        title: "Reveal cards early?",
        message: `${missing} ${missing === 1 ? "person is" : "people are"} still deciding. Their card will appear as missing.`,
        confirmLabel: "Reveal cards",
      });
      if (!accepted) return;
    }
    send({ type: "reveal" });
  }

  return (
    <div className="round-stage voting-stage">
      <p className="eyebrow">Now estimating</p>
      <h1>{round.title}</h1>
      {isFacilitator && <FacilitatorRoundControls room={room} send={send} />}
      <div className="vote-progress">
        <div>
          <strong>{voted} of {eligible.length}</strong>
          <span>votes locked</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${eligible.length ? (voted / eligible.length) * 100 : 0}%` }} />
        </div>
        {!allVoted && hasRevealReminder && remaining > 0 && <small>Reveal suggested in {remaining}s</small>}
        {(allVoted || round.revealAllowed) && <small className="ready-copy">Ready to reveal</small>}
      </div>
      {isFacilitator && (
        <button className="reveal-button" onClick={reveal} type="button">
          Reveal cards
        </button>
      )}
      {!isFacilitator && (
        <p className="stage-hint">
          {round.ownVote?.confirmed ? "Your vote is locked. You can still choose another card." : "Choose your card below."}
        </p>
      )}
      {confirmationDialog}
    </div>
  );
}

function FacilitatorRoundControls({ room, send }) {
  const round = room.currentRound;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(round.title);
  const confirmedVotes = room.participants.filter((person) => person.hasVoted).length;
  const { confirm, confirmationDialog } = useConfirmation();

  function saveTitle(event) {
    event.preventDefault();
    if (!title.trim()) return;
    send({ type: "update_round_title", title });
    setEditing(false);
  }

  async function restartVoting() {
    const message = round.phase === "revealed"
      ? "Clear every card and ask the team to vote again?"
      : confirmedVotes
        ? `Clear ${confirmedVotes} confirmed ${confirmedVotes === 1 ? "vote" : "votes"} and restart the timer?`
        : "Restart this round and its reveal timer?";
    const accepted = await confirm({
      title: round.phase === "revealed" ? "Start another ballot?" : "Clear the current votes?",
      message,
      confirmLabel: round.phase === "revealed" ? "Vote again" : "Clear votes",
    });
    if (accepted) send({ type: "restart_voting" });
  }

  async function cancelRound() {
    const message = round.itemId
      ? "Cancel this round? Its votes will be discarded and the item will remain pending."
      : "Cancel this round? Its votes and ad-hoc item will be discarded.";
    const accepted = await confirm({
      title: "Cancel this round?",
      message,
      confirmLabel: "Cancel round",
      tone: "danger",
    });
    if (accepted) send({ type: "cancel_round" });
  }

  return (
    <div className="round-controls">
      {editing ? (
        <form className="round-title-editor" onSubmit={saveTitle}>
          <input
            autoFocus
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <button className="small-action primary" type="submit">Save</button>
          <button
            className="small-action"
            onClick={() => {
              setTitle(round.title);
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button className="round-control-button" onClick={() => setEditing(true)} type="button">
            <span aria-hidden="true">✎</span> Edit title
          </button>
          <button className="round-control-button" onClick={restartVoting} type="button">
            <span aria-hidden="true">↻</span> {round.phase === "revealed" ? "Vote again" : "Clear votes"}
          </button>
          <button className="round-control-button danger" onClick={cancelRound} type="button">
            <span aria-hidden="true">×</span> Cancel round
          </button>
        </>
      )}
      {confirmationDialog}
    </div>
  );
}

function CardHand({ room, send }) {
  const round = room.currentRound;
  if (room.isClosed || !round || round.phase !== "voting") return null;

  const viewer = room.participants.find(({ id }) => id === room.viewer.id);
  if (!viewer?.eligible) {
    return (
      <div className="late-join-note">
        {room.viewer.role === "observer"
          ? "You’re observing this session. Observers can follow the discussion without voting."
          : "You joined during this round. Your hand opens on the next task."}
      </div>
    );
  }

  const selected = round.ownVote?.value;
  const confirmed = round.ownVote?.confirmed;

  return (
    <section className="hand">
      <div className="hand-heading">
        <div>
          <p className="eyebrow">Your hand</p>
          <h3>{confirmed ? "Vote locked" : selected ? "Ready to lock it in?" : "Pick the closest fit"}</h3>
        </div>
        {selected && !confirmed && (
          <button className="primary-button compact" onClick={() => send({ type: "confirm_vote" })} type="button">
            Confirm {selected}
          </button>
        )}
        {confirmed && <span className="locked-badge">Locked · {selected}</span>}
      </div>
      <div className="cards">
        {room.deck.cards.map((value) => (
          <button
            className={`poker-card ${selected === value ? "selected" : ""}`}
            key={value}
            onClick={() => send({ type: "select_vote", value })}
            type="button"
          >
            <small>{value}</small>
            <strong>{value}</strong>
            <small>{value}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ResultsStage({ room, send }) {
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";
  const [finalValue, setFinalValue] = useState(round.suggestion?.value ?? "");
  const tally = useMemo(() => {
    const counts = new Map();
    room.participants.forEach((participant) => {
      if (participant.vote) counts.set(participant.vote, (counts.get(participant.vote) ?? 0) + 1);
    });
    return [...counts.entries()].sort(
      ([a], [b]) => room.deck.cards.indexOf(a) - room.deck.cards.indexOf(b),
    );
  }, [room.deck.cards, room.participants]);

  return (
    <div className="round-stage results-stage">
      <p className="eyebrow">Cards on the table</p>
      <h1>{round.title}</h1>
      {isFacilitator && <FacilitatorRoundControls room={room} send={send} />}
      <div className="result-cards">
        {room.participants.filter((person) => person.eligible).map((person) => (
          <div className="person-result" key={person.id}>
            <div className="result-card">{person.vote ?? "—"}</div>
            <span style={{ "--person-color": person.color }}>{person.displayName}</span>
          </div>
        ))}
      </div>
      <div className="result-summary">
        <div>
          <span>Suggested estimate</span>
          <strong>{round.suggestion?.value ?? "No signal"}</strong>
          {round.suggestion?.tied && <small>Split vote · higher tied value shown</small>}
        </div>
        <div className="tally">
          {tally.map(([value, count]) => <span key={value}>{value} <b>{count}</b></span>)}
        </div>
      </div>
      <ResultMetrics metrics={round.metrics} />
      {isFacilitator && (
        <form
          className="finalize-row"
          onSubmit={(event) => {
            event.preventDefault();
            send({ type: "finalize", value: finalValue });
          }}
        >
          <label>
            Final estimate
            <input
              maxLength={24}
              onChange={(event) => setFinalValue(event.target.value)}
              placeholder="Enter a value"
              value={finalValue}
            />
          </label>
          <button className="primary-button" type="submit">Save estimate</button>
        </form>
      )}
    </div>
  );
}

function PeopleList({ room, send }) {
  const [managerOpen, setManagerOpen] = useState(false);
  const isFacilitator = room.viewer.role === "facilitator";

  return (
    <>
      <section className="side-section">
        <div className="side-heading">
          <h2>People</h2>
          <div className="people-heading-actions">
            {isFacilitator && !room.isClosed && (
              <button onClick={() => setManagerOpen(true)} type="button">Manage</button>
            )}
            <span>{room.participants.length}</span>
          </div>
        </div>
        <div className="people-list">
          {room.participants.map((person) => (
            <div className="person-row" key={person.id}>
              <span className="avatar" style={{ backgroundColor: person.color }}>
                {person.displayName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{person.displayName}</strong>
                <small>
                  {person.role === "facilitator"
                    ? "Facilitator"
                    : person.role === "observer"
                      ? `Observer · ${person.connected ? "Here" : "Away"}`
                      : person.connected ? "At the table" : "Away"}
                </small>
              </div>
              {room.currentRound?.phase === "voting" && person.eligible && (
                <i className={person.hasVoted ? "voted" : ""}>{person.hasVoted ? "✓" : "…"}</i>
              )}
              {person.role === "observer" && <i className="observer-mark" title="Observer">◉</i>}
            </div>
          ))}
        </div>
      </section>
      {managerOpen && (
        <ParticipantManager
          room={room}
          send={send}
          onClose={() => setManagerOpen(false)}
        />
      )}
    </>
  );
}

function ParticipantManager({ room, send, onClose }) {
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";
  const { confirm, confirmationDialog } = useConfirmation();
  const others = room.participants.filter((person) => person.id !== room.viewer.id);

  async function transfer(person) {
    const accepted = await confirm({
      title: `Make ${person.displayName} facilitator?`,
      message: "You’ll become a regular participant and they’ll receive all facilitator controls.",
      confirmLabel: "Transfer facilitator",
    });
    if (!accepted) return;
    send({ type: "transfer_facilitator", participantId: person.id });
    onClose();
  }

  async function remove(person) {
    const accepted = await confirm({
      title: `Remove ${person.displayName}?`,
      message: activeRound
        ? "They’ll leave immediately and their current vote will be discarded."
        : "They’ll be disconnected and their room identity will stop working.",
      confirmLabel: "Remove person",
      tone: "danger",
    });
    if (accepted) send({ type: "remove_participant", participantId: person.id });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="participant-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Facilitator controls</p>
            <h2>Manage people</h2>
            <p>Choose who votes, observes, or facilitates the room.</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close people manager">×</button>
        </header>

        {activeRound && (
          <div className="settings-notice">
            During a round you can remove people, but roles and facilitator ownership stay fixed.
          </div>
        )}

        <div className="participant-list">
          <div className="participant-manage-row current-facilitator">
            <span className="avatar" style={{ backgroundColor: room.viewer.color }}>
              {room.viewer.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{room.viewer.displayName}</strong>
              <small>You · Facilitator</small>
            </div>
            <span className="role-badge facilitator">Facilitator</span>
          </div>

          {others.map((person) => (
            <div className="participant-manage-row" key={person.id}>
              <span className="avatar" style={{ backgroundColor: person.color }}>
                {person.displayName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{person.displayName}</strong>
                <small>{person.connected ? "Connected" : "Away"}</small>
              </div>
              <select
                aria-label={`Role for ${person.displayName}`}
                disabled={activeRound}
                onChange={(event) => send({
                  type: "set_participant_role",
                  participantId: person.id,
                  role: event.target.value,
                })}
                value={person.role}
              >
                <option value="participant">Participant</option>
                <option value="observer">Observer</option>
              </select>
              <div className="participant-actions">
                <button
                  disabled={activeRound}
                  onClick={() => transfer(person)}
                  type="button"
                  title="Transfer facilitator ownership"
                >
                  Make facilitator
                </button>
                <button className="remove" onClick={() => remove(person)} type="button">
                  Remove
                </button>
              </div>
            </div>
          ))}

          {others.length === 0 && (
            <div className="participant-empty">
              Invite someone with the room link and they’ll appear here.
            </div>
          )}
        </div>
        {confirmationDialog}
      </section>
    </div>
  );
}

function ResultMetrics({ metrics }) {
  if (!metrics) return null;
  const spreadLabel = metrics.low && metrics.high
    ? metrics.low === metrics.high ? metrics.low : `${metrics.low}–${metrics.high}`
    : "No range";

  return (
    <div className="result-metrics">
      <div>
        <span>Agreement</span>
        <strong>{metrics.consensusPercent}%</strong>
        <small>{metrics.unanimous ? "Full consensus" : "Largest voting group"}</small>
      </div>
      <div>
        <span>Vote range</span>
        <strong>{spreadLabel}</strong>
        <small>{metrics.spread ? `${metrics.spread} deck steps apart` : "No numeric spread"}</small>
      </div>
      <div>
        <span>Cards counted</span>
        <strong>{metrics.voteCount}</strong>
        <small>Confirmed votes</small>
      </div>
    </div>
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportHistory(room, format) {
  const filename = room.name.toLowerCase().replaceAll(" ", "-");

  if (format === "csv") {
    const rows = [["Item", "Final estimate", "Suggested estimate", "Agreement", "Voter", "Vote", "Confirmed", "Completed"]];
    room.history.slice().reverse().forEach((item) => {
      item.votes.forEach((vote) => rows.push([
        item.title,
        item.finalValue,
        item.suggestion?.value ?? "",
        item.metrics ? `${item.metrics.consensusPercent}%` : "",
        vote.participantName,
        vote.value ?? "",
        vote.confirmed ? "Yes" : "No",
        new Date(item.completedAt).toISOString(),
      ]));
    });
    downloadText(`${filename}-estimates.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
    return;
  }

  const lines = [`# ${room.name} estimates`, ""];
  room.history.slice().reverse().forEach((item) => {
    lines.push(`## ${item.title}`, "", `- Final estimate: **${item.finalValue}**`);
    lines.push(`- Suggested estimate: ${item.suggestion?.value ?? "None"}`);
    if (item.metrics) lines.push(`- Agreement: ${item.metrics.consensusPercent}%`);
    lines.push("", "| Participant | Vote |", "| --- | --- |");
    item.votes.forEach((vote) => lines.push(`| ${vote.participantName} | ${vote.value ?? "No vote"} |`));
    lines.push("");
  });
  downloadText(`${filename}-estimates.md`, lines.join("\n"), "text/markdown");
}

function History({ room }) {
  const { history } = room;
  const [selected, setSelected] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <section className="side-section history-section">
        <div className="side-heading">
          <h2>Estimates</h2>
          <div className="history-heading-actions">
            {history.length > 0 && (
              <button onClick={() => setExportOpen(!exportOpen)} type="button">Export</button>
            )}
            <span>{history.length}</span>
          </div>
        </div>
        {exportOpen && (
          <div className="export-menu">
            <button onClick={() => exportHistory(room, "csv")} type="button">Download CSV</button>
            <button onClick={() => exportHistory(room, "markdown")} type="button">Download Markdown</button>
          </div>
        )}
        {history.length === 0 ? (
          <p className="empty-history">Finished tasks will collect here.</p>
        ) : (
          <ol className="history-list">
            {history.map((item) => (
              <li key={item.id}>
                <button onClick={() => setSelected(item)} type="button">
                  <span>{item.finalValue}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.metrics ? `${item.metrics.consensusPercent}% agreement` : `${item.votes.filter((vote) => vote.confirmed).length} votes`}
                    </small>
                  </div>
                  <i aria-hidden="true">›</i>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {selected && <ResultDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ResultDetail({ item, onClose }) {
  const counts = new Map();
  item.votes.forEach((vote) => {
    if (vote.value) counts.set(vote.value, (counts.get(vote.value) ?? 0) + 1);
  });

  return (
    <div className="workspace-backdrop" onMouseDown={onClose}>
      <section className="results-screen workspace-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <button className="back-button" onClick={onClose} type="button">← Close details</button>
          <div>
            <p className="eyebrow">Completed estimate</p>
            <h1>{item.title}</h1>
            <p>{new Date(item.completedAt).toLocaleString()}</p>
          </div>
          <span className="completed-estimate">{item.finalValue}</span>
        </header>
        <main className="result-detail">
          <section className="result-detail-summary">
            <div>
              <span>Final estimate</span>
              <strong>{item.finalValue}</strong>
            </div>
            <div>
              <span>App suggestion</span>
              <strong>{item.suggestion?.value ?? "None"}</strong>
            </div>
            <div>
              <span>Agreement</span>
              <strong>{item.metrics ? `${item.metrics.consensusPercent}%` : "—"}</strong>
            </div>
            <div>
              <span>Vote range</span>
              <strong>
                {item.metrics?.low
                  ? item.metrics.low === item.metrics.high ? item.metrics.low : `${item.metrics.low}–${item.metrics.high}`
                  : "—"}
              </strong>
            </div>
          </section>
          <section className="vote-breakdown">
            <div>
              <p className="eyebrow">Vote breakdown</p>
              <h2>How the team voted</h2>
            </div>
            <div className="breakdown-bars">
              {[...counts.entries()].map(([value, count]) => (
                <div key={value}>
                  <strong>{value}</strong>
                  <span><i style={{ width: `${(count / item.votes.length) * 100}%` }} /></span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
            <ol className="result-voter-list">
              {item.votes.map((vote) => (
                <li key={vote.participantId}>
                  <span>{vote.participantName}</span>
                  <strong>{vote.value ?? "No vote"}</strong>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </section>
    </div>
  );
}

function RoomSettings({ room, send, onClose, onManageItems }) {
  const [cards, setCards] = useState(room.deck.cards);
  const [newCard, setNewCard] = useState("");
  const [algorithm, setAlgorithm] = useState(room.settings.suggestionAlgorithm);
  const [timer, setTimer] = useState(room.settings.revealDelaySeconds);
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";
  const { confirm, confirmationDialog } = useConfirmation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addCard(event) {
    event.preventDefault();
    const value = newCard.trim();
    if (!value || cards.includes(value) || cards.length >= 16) return;
    setCards([...cards, value]);
    setNewCard("");
  }

  function reorderCards(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCards((currentCards) => {
      const oldIndex = currentCards.indexOf(active.id);
      const newIndex = currentCards.indexOf(over.id);
      return arrayMove(currentCards, oldIndex, newIndex);
    });
  }

  function save() {
    send({
      type: "update_settings",
      cards,
      suggestionAlgorithm: algorithm,
      revealDelaySeconds: Number(timer),
    });
    onClose();
  }

  function resetDeck() {
    const original = DECKS[room.deck.id];
    if (original) setCards([...original.cards]);
  }

  async function closeRoom() {
    const accepted = await confirm({
      title: "Close this room permanently?",
      message: "Existing participants can review completed estimates, but nobody will be able to vote or join.",
      confirmLabel: "Close room",
      tone: "danger",
    });
    if (!accepted) return;
    send({ type: "close_room" });
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Facilitator controls</p>
            <h2>Room settings</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close settings">×</button>
        </header>

        {activeRound && (
          <div className="settings-notice">
            Finish the current round before changing its deck or suggestion rules.
          </div>
        )}

        <div className="settings-content">
          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3>Items to estimate</h3>
                <p>Prepare and maintain the work this room will estimate.</p>
              </div>
              <span className="pending-count">
                {room.items.filter((item) => item.status === "pending").length} pending
              </span>
            </div>
            <button className="manage-items-button" onClick={onManageItems} type="button">
              <span>
                <strong>Open item manager</strong>
                <small>Add, review, and remove estimation items</small>
              </span>
              <i aria-hidden="true">→</i>
            </button>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3>Planning deck</h3>
                <p>Add, remove, or reorder the cards used in this room.</p>
              </div>
              <button className="text-button" disabled={activeRound} onClick={resetDeck} type="button">
                Reset deck
              </button>
            </div>
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={reorderCards}
              sensors={sensors}
            >
              <SortableContext items={cards} strategy={rectSortingStrategy}>
                <div className="card-editor">
                  {cards.map((card) => (
                    <SortableCard
                      card={card}
                      disabled={activeRound}
                      key={card}
                      onRemove={() => setCards(cards.filter((value) => value !== card))}
                      removable={cards.length > 2}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <form className="add-card-row" onSubmit={addCard}>
              <input
                disabled={activeRound}
                maxLength={12}
                onChange={(event) => setNewCard(event.target.value)}
                placeholder="New card"
                value={newCard}
              />
              <button className="secondary-button" disabled={activeRound} type="submit">Add card</button>
            </form>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3>Suggested estimate</h3>
                <p>Choose how the app turns the revealed votes into a starting point.</p>
              </div>
            </div>
            <div className="algorithm-options">
              {SUGGESTION_ALGORITHMS.map((option) => (
                <label className={algorithm === option.id ? "selected" : ""} key={option.id}>
                  <input
                    checked={algorithm === option.id}
                    disabled={activeRound}
                    name="algorithm"
                    onChange={() => setAlgorithm(option.id)}
                    type="radio"
                  />
                  <span>
                    <strong>{option.name}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-group settings-row">
            <div>
              <h3>Reveal reminder</h3>
              <p>Signal when it may be time to turn the cards over.</p>
            </div>
            <select disabled={activeRound} onChange={(event) => setTimer(event.target.value)} value={timer}>
              <option value={0}>Off</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
            </select>
          </section>

          <section className="settings-group access-settings">
            <div>
              <h3>Room access</h3>
              <p>
                {room.isLocked
                  ? "New participants cannot join. Existing participants can reconnect."
                  : "Anyone with the link can currently join."}
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => send({ type: "set_room_lock", locked: !room.isLocked })}
              type="button"
            >
              {room.isLocked ? "Unlock room" : "Lock room"}
            </button>
          </section>

          <section className="danger-zone">
            <div>
              <h3>Close room</h3>
              <p>Make this session permanently read-only until it expires.</p>
            </div>
            <button className="danger-button" disabled={activeRound} onClick={closeRoom} type="button">
              Close room
            </button>
          </section>
        </div>

        <footer>
          <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={activeRound || cards.length < 2} onClick={save} type="button">
            Save settings
          </button>
        </footer>
        {confirmationDialog}
      </section>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Continue",
  cancelLabel = "Keep editing",
  tone = "default",
  onCancel,
  onConfirm,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-backdrop" onMouseDown={onCancel} role="presentation">
      <section
        aria-describedby="confirmation-message"
        aria-labelledby="confirmation-title"
        aria-modal="true"
        className={`confirm-dialog ${tone === "danger" ? "danger" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <span className="confirm-icon" aria-hidden="true">
          {tone === "danger" ? "!" : "?"}
        </span>
        <h2 id="confirmation-title">{title}</h2>
        <p id="confirmation-message">{message}</p>
        <div>
          <button className="secondary-button" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={tone === "danger" ? "danger-confirm-button" : "primary-button"}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ItemManager({ room, send, onClose }) {
  const [itemTitles, setItemTitles] = useState("");
  const pendingItems = room.items.filter((item) => item.status === "pending");
  const estimatedItems = room.items.filter((item) => item.status === "estimated");
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";

  function addItems(event) {
    event.preventDefault();
    const titles = itemTitles.split(/\r?\n/).map((title) => title.trim()).filter(Boolean);
    if (!titles.length) return;
    send({ type: "add_items", titles });
    setItemTitles("");
  }

  return (
    <div className="workspace-backdrop" onMouseDown={onClose}>
      <section className="items-screen workspace-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="items-screen-header">
          <button className="back-button" onClick={onClose} type="button">← Close items</button>
          <div>
            <p className="eyebrow">Estimation queue</p>
            <h1>Items to estimate</h1>
            <p>Prepare the session before voting starts. Add one item per line.</p>
          </div>
          <span className="items-room-name">{room.name}</span>
        </header>

        {activeRound && (
          <div className="items-active-notice">
            The item list is read-only while a round is active.
          </div>
        )}

        <div className="items-workspace">
          <section className="items-composer">
          <span className="item-step">01</span>
          <h2>Add items</h2>
          <p>Paste a list from your backlog or write the work down here.</p>
          <form onSubmit={addItems}>
            <textarea
              autoFocus
              disabled={activeRound}
              maxLength={16000}
              onChange={(event) => setItemTitles(event.target.value)}
              placeholder={"Login with SSO\nAdd audit log export\nImprove empty states"}
              rows={10}
              value={itemTitles}
            />
            <div>
              <small>{itemTitles.split(/\r?\n/).filter((line) => line.trim()).length} items ready</small>
              <button className="primary-button" disabled={activeRound || !itemTitles.trim()} type="submit">
                Add to session
              </button>
            </div>
          </form>
          </section>

          <section className="items-queue">
          <div className="items-queue-heading">
            <div>
              <span className="item-step">02</span>
              <h2>Session queue</h2>
            </div>
            <span>{pendingItems.length} pending</span>
          </div>
          {pendingItems.length ? (
            <ol>
              {pendingItems.map((item, index) => (
                <li key={item.id}>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <span>{item.title}</span>
                  <button
                    disabled={activeRound}
                    onClick={() => send({ type: "remove_item", itemId: item.id })}
                    type="button"
                    aria-label={`Remove ${item.title}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="items-queue-empty">
              <strong>Your queue is empty</strong>
              <p>Add a few items and they’ll appear here in voting order.</p>
            </div>
          )}
          {estimatedItems.length > 0 && (
            <div className="estimated-summary">
              <strong>{estimatedItems.length} already estimated</strong>
              <span>{estimatedItems.map((item) => item.title).join(" · ")}</span>
            </div>
          )}
          </section>
        </div>
      </section>
    </div>
  );
}

function SortableCard({ card, disabled, onRemove, removable }) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card, disabled });

  return (
    <div
      className={`editable-card ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="drag-handle"
        disabled={disabled}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${card}`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <strong>{card}</strong>
      <button
        className="remove-card"
        disabled={disabled || !removable}
        onClick={onRemove}
        type="button"
        aria-label={`Remove ${card}`}
      >
        ×
      </button>
    </div>
  );
}

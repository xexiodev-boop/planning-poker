import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DECKS, DEFAULT_DECK_ID } from "../shared/decks.js";

const ROOM_PATH = /^\/room\/([a-f0-9]{16})$/;

function identityKey(roomId) {
  return `estimation-poker:${roomId}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function useRoomId() {
  return window.location.pathname.match(ROOM_PATH)?.[1] ?? null;
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
      localStorage.setItem(identityKey(result.roomId), result.token);
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
  const [token, setToken] = useState(() => localStorage.getItem(identityKey(roomId)));
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) {
      setStatus("join");
      return undefined;
    }

    let cancelled = false;
    let retryTimer;

    function connect() {
      setStatus(room ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/rooms/${roomId}/socket?token=${encodeURIComponent(token)}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) {
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
        if (event.code === 1008 || event.code === 1001) {
          localStorage.removeItem(identityKey(roomId));
          setToken(null);
          setRoom(null);
          setStatus("join");
          return;
        }
        setStatus("reconnecting");
        retryTimer = window.setTimeout(connect, 1500);
      };
    }

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [roomId, token]);

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
      const result = await api(`/api/rooms/${roomId}/join`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      localStorage.setItem(identityKey(roomId), result.token);
      setToken(result.token);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("join");
    }
  }

  if (!token) return <JoinRoom roomId={roomId} onJoin={join} error={error} />;
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
        <small className="room-code">Room {roomId.slice(0, 6)}</small>
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
          </div>
          <button className="text-button" onClick={copyLink} type="button">
            {copied ? "Link copied" : "Copy invite link"}
          </button>
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

      <div className="room-layout">
        <section className="table-area">
          <RoundStage room={room} send={send} />
          <CardHand room={room} send={send} />
        </section>
        <aside className="sidebar">
          <PeopleList room={room} />
          <History history={room.history} />
        </aside>
      </div>
    </main>
  );
}

function RoundStage({ room, send }) {
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";

  if (!round || round.phase === "finalized") {
    return (
      <div className="round-stage empty-stage">
        <div className="table-orbit">
          <span>?</span><span>3</span><span>8</span>
        </div>
        {isFacilitator ? (
          <StartRound send={send} previousRound={round} />
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

function StartRound({ send, previousRound }) {
  const [title, setTitle] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    send({ type: "start_round", title });
    setTitle("");
  }

  return (
    <form className="start-round" onSubmit={submit}>
      <p className="eyebrow">{previousRound ? "Ready for another?" : "First estimate"}</p>
      <h2>What are we sizing?</h2>
      <div className="task-entry">
        <input
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add team mentions to comments"
          value={title}
        />
        <button className="primary-button" type="submit">Start voting</button>
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
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((round.revealAvailableAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((round.revealAvailableAt - Date.now()) / 1000)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [round.revealAvailableAt]);

  function reveal() {
    const missing = eligible.length - voted;
    if (missing > 0 && !window.confirm(`Reveal while ${missing} ${missing === 1 ? "person is" : "people are"} still deciding?`)) {
      return;
    }
    send({ type: "reveal" });
  }

  return (
    <div className="round-stage voting-stage">
      <p className="eyebrow">Now estimating</p>
      <h1>{round.title}</h1>
      <div className="vote-progress">
        <div>
          <strong>{voted} of {eligible.length}</strong>
          <span>votes locked</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${eligible.length ? (voted / eligible.length) * 100 : 0}%` }} />
        </div>
        {!allVoted && remaining > 0 && <small>Reveal suggested in {remaining}s</small>}
        {(allVoted || round.revealAllowed || remaining === 0) && <small className="ready-copy">Ready to reveal</small>}
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
    </div>
  );
}

function CardHand({ room, send }) {
  const round = room.currentRound;
  if (!round || round.phase !== "voting") return null;

  const viewer = room.participants.find(({ id }) => id === room.viewer.id);
  if (!viewer?.eligible) {
    return <div className="late-join-note">You joined during this round. Your hand opens on the next task.</div>;
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

function PeopleList({ room }) {
  return (
    <section className="side-section">
      <div className="side-heading">
        <h2>People</h2>
        <span>{room.participants.length}</span>
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
                {person.role === "facilitator" ? "Facilitator" : person.connected ? "At the table" : "Away"}
              </small>
            </div>
            {room.currentRound?.phase === "voting" && person.eligible && (
              <i className={person.hasVoted ? "voted" : ""}>{person.hasVoted ? "✓" : "…"}</i>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function History({ history }) {
  return (
    <section className="side-section history-section">
      <div className="side-heading">
        <h2>Estimates</h2>
        <span>{history.length}</span>
      </div>
      {history.length === 0 ? (
        <p className="empty-history">Finished tasks will collect here.</p>
      ) : (
        <ol className="history-list">
          {history.map((item) => (
            <li key={item.id}>
              <span>{item.finalValue}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.votes.filter((vote) => vote.confirmed).length} votes</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

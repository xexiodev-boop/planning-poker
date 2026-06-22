import { useState } from "react";
import { DECKS, DEFAULT_DECK_ID } from "../../shared/decks.js";
import { api } from "../lib/api.js";
import { dismissRecentRoom, visibleRecentRoom } from "../lib/recentRoom.js";

export function HomePage() {
  const [name, setName] = useState("");
  const [deckId, setDeckId] = useState(DEFAULT_DECK_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentRoom, setRecentRoom] = useState(visibleRecentRoom);
  const platform = navigator.userAgentData?.platform ?? navigator.userAgent;
  const bookmarkShortcut = /mac/i.test(platform) ? "⌘D" : "Ctrl+D";

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
      {recentRoom && (
        <aside className="recent-room-banner">
          <span className="recent-room-icon" aria-hidden="true">↗</span>
          <div>
            <small>Your planning room is still active</small>
            <strong>{recentRoom.name}</strong>
            <p>
              You created this room. Open it again or press <kbd>{bookmarkShortcut}</kbd> there to bookmark it.
            </p>
          </div>
          <a href={recentRoom.path}>Open room</a>
          <button
            aria-label="Dismiss room reminder"
            onClick={() => {
              dismissRecentRoom(recentRoom.roomId);
              setRecentRoom(null);
            }}
            type="button"
          >
            ×
          </button>
        </aside>
      )}
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

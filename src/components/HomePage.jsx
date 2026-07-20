import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { DECKS, DEFAULT_DECK_ID } from "../../shared/decks.js";
import { api } from "../lib/api.js";
import { readDisplayName, rememberDisplayName } from "../lib/displayName.js";
import { deckName } from "../lib/labels.js";
import { dismissRecentRoom, visibleRecentRoom } from "../lib/recentRoom.js";
import { stashRecoveryCode } from "../lib/recovery.js";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

export function HomePage() {
  const { t, i18n } = useLingui();
  const [name, setName] = useState(readDisplayName);
  const [deckId, setDeckId] = useState(DEFAULT_DECK_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentRoom, setRecentRoom] = useState(visibleRecentRoom);
  const platform = navigator.userAgentData?.platform ?? navigator.userAgent;
  const bookmarkShortcut = /mac/i.test(platform) ? "⌘D" : "Ctrl+D";

  async function createRoom(event) {
    event.preventDefault();
    if (!name.trim()) return setError(t`Tell the room what to call you.`);
    setLoading(true);
    setError("");
    rememberDisplayName(name);
    try {
      const result = await api("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name, deckId }),
      });
      stashRecoveryCode(result.roomId, result.recoveryCode);
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
            <small><Trans>Your planning room is still active</Trans></small>
            <strong>{recentRoom.name}</strong>
            <p>
              {recentRoom.role === "facilitator"
                ? <Trans>You created this room.</Trans>
                : <Trans>You joined this room.</Trans>}{" "}
              <Trans>Open it again, then press <kbd>{bookmarkShortcut}</kbd> inside the room to bookmark it.</Trans>
            </p>
          </div>
          <a href={recentRoom.path}><Trans>Open room</Trans></a>
          <button
            aria-label={t`Dismiss room reminder`}
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
          <p className="eyebrow"><Trans>Planning poker without the ceremony</Trans></p>
          <h1><Trans>Find the estimate your team can stand behind.</Trans></h1>
          <p className="lede">
            <Trans>
              Open a room, invite your team, and turn different instincts into one clear decision.
              No accounts. No setup detour.
            </Trans>
          </p>
          <div className="promise-row" aria-label={t`Product highlights`}>
            <span><Trans>Always free</Trans></span>
            <span><Trans>Live voting</Trans></span>
            <span><Trans>Custom decks</Trans></span>
            <span><Trans>Seven-day rooms</Trans></span>
          </div>
        </div>
      </section>

      <section className="create-panel">
        <div>
          <p className="step-label"><Trans>Create a room</Trans></p>
          <h2><Trans>You’ll be the facilitator.</Trans></h2>
          <p className="muted"><Trans>Choose a deck now. You can invite everyone once you’re inside.</Trans></p>
        </div>

        <form onSubmit={createRoom}>
          <label>
            <Trans>Your name</Trans>
            <input
              autoFocus
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              placeholder={t`Your name`}
              value={name}
            />
          </label>

          <fieldset>
            <legend><Trans>Planning deck</Trans></legend>
            <p className="field-hint"><Trans>Pick one to start. You can tweak the deck later in room settings.</Trans></p>
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
                    <strong>{deckName(deck)}</strong>
                    <small>{deck.cards.slice(0, 7).join(" · ")}</small>
                  </span>
                  <i aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? <Trans>Opening the room…</Trans> : <Trans>Create planning room</Trans>}
          </button>
        </form>
      </section>

      <footer className="home-footer">
        <span><Trans>Free · privacy-first · no accounts</Trans></span>
        <a href={i18n.locale === "es" ? "/es/what-is-planning-poker" : "/what-is-planning-poker"}>
          <Trans>What is planning poker?</Trans>
        </a>
        <a href={i18n.locale === "es" ? "/es/how-to-run-planning-poker" : "/how-to-run-planning-poker"}>
          <Trans>Run a session</Trans>
        </a>
        <a href={i18n.locale === "es" ? "/es/planning-poker-remote-teams" : "/planning-poker-remote-teams"}>
          <Trans>Remote teams</Trans>
        </a>
        <a href="/privacy"><Trans>Usage &amp; privacy</Trans></a>
        <a
          className="github-link"
          href="https://github.com/xexiodev-boop/planning-poker"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
        <LanguageSwitcher />
        <span><Trans>Made by <a href="https://xexio.dev" target="_blank" rel="noopener noreferrer">xexio.dev</a></Trans></span>
      </footer>
    </main>
  );
}

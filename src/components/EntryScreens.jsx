import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { readDisplayName, rememberDisplayName } from "../lib/displayName.js";

function roomNameFromId(roomId) {
  return roomId
    .split("-")
    .slice(0, -1)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function JoinRoom({ roomId, onJoin, error }) {
  const { t } = useLingui();
  const [name, setName] = useState(readDisplayName);
  const roomName = roomNameFromId(roomId);

  function submit(event) {
    event.preventDefault();
    if (name.trim()) {
      rememberDisplayName(name);
      onJoin(name);
    }
  }

  return (
    <main className="center-shell">
      <section className="join-card">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <p className="eyebrow"><Trans>You’ve been invited</Trans></p>
        <h1><Trans>Join the planning room</Trans></h1>
        <form onSubmit={submit}>
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
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit"><Trans>Join room</Trans></button>
        </form>
        <small className="room-code"><Trans>You’re joining {roomName}</Trans></small>
        <small className="join-privacy">
          <Trans>
            No account needed. <a href="/privacy">How your data is handled</a>.
          </Trans>
        </small>
      </section>
    </main>
  );
}

export function LoadingRoom({ status, error }) {
  return (
    <main className="center-shell">
      <div className="loading-card">
        <div className="spinner" />
        <h2>
          {status === "reconnecting"
            ? <Trans>Finding the room again…</Trans>
            : <Trans>Pulling up a chair…</Trans>}
        </h2>
        {error && <p className="form-error">{error}</p>}
      </div>
    </main>
  );
}

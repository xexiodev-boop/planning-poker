import { useState } from "react";

export function JoinRoom({ roomId, onJoin, error }) {
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
              placeholder="Your name"
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

export function LoadingRoom({ status, error }) {
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

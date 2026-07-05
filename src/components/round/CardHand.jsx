import { useEffect, useRef } from "react";

export function CardHand({ room, send }) {
  const round = room.currentRound;
  const viewer = room.participants.find(({ id }) => id === room.viewer.id);
  const selected = round?.ownVote?.value;
  const confirmed = round?.ownVote?.confirmed;
  const handRef = useRef(null);
  const shouldShowHand = !room.isClosed && round?.phase === "voting" && viewer?.eligible && !selected;

  useEffect(() => {
    if (!shouldShowHand) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      handRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [round?.id, shouldShowHand]);

  if (room.isClosed || !round || round.phase !== "voting") return null;

  if (!viewer?.eligible) {
    return (
      <div className="late-join-note">
        {room.viewer.role === "observer"
          ? "You’re observing this session. Observers can follow the discussion without voting."
          : "You joined during this round. Your hand opens on the next task."}
      </div>
    );
  }

  return (
    <section
      className={`hand ${selected ? "" : "needs-action"}`}
      id={`voting-hand-${round.id}`}
      ref={handRef}
    >
      <div className="hand-heading">
        <div>
          <p className="eyebrow">Your hand</p>
          <h3>{confirmed ? "Vote locked" : selected ? "Ready to lock it in?" : "Pick the closest fit"}</h3>
          {!selected && <small className="hand-prompt">Select one card to continue</small>}
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

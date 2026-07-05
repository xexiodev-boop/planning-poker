import { useEffect, useMemo, useState } from "react";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";

export function RoundStage({ room, send, onManageItems }) {
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
          <StartRound
            room={room}
            send={send}
            previousRound={round}
            onManageItems={onManageItems}
          />
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

function StartRound({ room, send, previousRound, onManageItems }) {
  const pendingItems = useMemo(
    () => room.items.filter((item) => item.status === "pending"),
    [room.items],
  );
  const [itemId, setItemId] = useState(pendingItems[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState(pendingItems.length ? "backlog" : "new");
  const selectedItem = pendingItems.find((item) => item.id === itemId);
  const firstPendingId = pendingItems[0]?.id ?? "";
  const selectedIsPending = pendingItems.some((item) => item.id === itemId);

  useEffect(() => {
    if (firstPendingId && !selectedIsPending) {
      setItemId(firstPendingId);
      setSource("backlog");
    } else if (!firstPendingId) {
      setItemId("");
      setSource("new");
    }
  }, [firstPendingId, selectedIsPending]);

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
            <div className="picker-empty">
              <p>No items are waiting to be estimated.</p>
              <button onClick={onManageItems} type="button">
                <span aria-hidden="true">+</span>
                Add items to the estimation queue
              </button>
            </div>
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
                  placeholder="Describe the item to estimate"
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

  function showHand() {
    document.getElementById(`voting-hand-${round.id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
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
      {!round.ownVote?.value && room.participants.some(
        (person) => person.id === room.viewer.id && person.eligible,
      ) && (
        <button className="choose-card-cue" onClick={showHand} type="button">
          Choose a card <span aria-hidden="true">↓</span>
        </button>
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

import { useState } from "react";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";
import { useModal } from "../../hooks/useModal.js";

export function PeopleList({ room, send }) {
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
  const dialogRef = useModal(onClose);

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
      <section
        aria-labelledby="participant-manager-title"
        aria-modal="true"
        className="participant-panel"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Facilitator controls</p>
            <h2 id="participant-manager-title">Manage people</h2>
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

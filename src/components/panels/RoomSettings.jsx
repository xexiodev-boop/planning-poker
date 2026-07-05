import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SUGGESTION_ALGORITHMS } from "../../../shared/algorithms.js";
import { DECKS } from "../../../shared/decks.js";
import { ROOM_LIMITS } from "../../../shared/limits.js";
import { HAND_REACTION, REACTION_OPTIONS } from "../../../shared/reactions.js";
import { REVEAL_DELAY_OPTIONS } from "../../../shared/reveal.js";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";
import { useModal } from "../../hooks/useModal.js";

export function RoomSettings({ room, send, onClose, onManageItems }) {
  const [cards, setCards] = useState(room.deck.cards);
  const [newCard, setNewCard] = useState("");
  const [algorithm, setAlgorithm] = useState(room.settings.suggestionAlgorithm);
  const [timer, setTimer] = useState(room.settings.revealDelaySeconds);
  const [autoReveal, setAutoReveal] = useState(room.settings.autoRevealEnabled);
  const [reactionsEnabled, setReactionsEnabled] = useState(room.settings.reactionsEnabled);
  const [reactionPalette, setReactionPalette] = useState(room.settings.reactionPalette);
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";
  // Settings are read-only while a round is running (finish it first) or once the
  // room is closed. Deletion stays available in both cases.
  const editingDisabled = activeRound || room.isClosed;
  const { confirm, confirmationDialog } = useConfirmation();
  const dialogRef = useModal(onClose);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addCard(event) {
    event.preventDefault();
    const value = newCard.trim();
    if (!value || cards.includes(value) || cards.length >= ROOM_LIMITS.cards) return;
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
      autoRevealEnabled: autoReveal,
      reactionsEnabled,
      reactionPalette,
    });
    onClose();
  }

  function resetDeck() {
    const original = DECKS[room.deck.id];
    if (original) setCards([...original.cards]);
  }

  async function closeRoom() {
    const accepted = await confirm({
      title: "Close this room?",
      message: "Existing participants can review completed estimates, but nobody will be able to vote or join.",
      confirmLabel: "Close room",
      tone: "danger",
    });
    if (!accepted) return;
    send({ type: "close_room" });
    onClose();
  }

  async function deleteRoom() {
    const accepted = await confirm({
      title: "Delete this room permanently?",
      message: "All items, votes, participants, and completed estimates will be erased immediately. This cannot be undone.",
      confirmLabel: "Delete room",
      tone: "danger",
    });
    if (!accepted) return;
    send({ type: "delete_room" });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="room-settings-title"
        aria-modal="true"
        className="settings-panel"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Facilitator controls</p>
            <h2 id="room-settings-title">Room settings</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close settings">×</button>
        </header>

        <div className="settings-content">
          {room.isClosed ? (
            <div className="settings-notice">
              This room is closed and read-only. Settings can’t be changed, but you can still delete it below.
            </div>
          ) : activeRound ? (
            <div className="settings-notice">
              Finish the current round before changing its deck or suggestion rules.
            </div>
          ) : null}
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
              <button className="text-button" disabled={editingDisabled} onClick={resetDeck} type="button">
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
                      disabled={editingDisabled}
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
                disabled={editingDisabled}
                maxLength={12}
                onChange={(event) => setNewCard(event.target.value)}
                placeholder="New card"
                value={newCard}
              />
              <button className="secondary-button" disabled={editingDisabled} type="submit">Add card</button>
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
                    disabled={editingDisabled}
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
            <select disabled={editingDisabled} onChange={(event) => setTimer(event.target.value)} value={timer}>
              {REVEAL_DELAY_OPTIONS.map(({ seconds, label }) => (
                <option key={seconds} value={seconds}>{label}</option>
              ))}
            </select>
          </section>

          <section className="settings-group settings-row">
            <div>
              <h3>Auto-reveal</h3>
              <p>Turn the cards over automatically once everyone has voted.</p>
            </div>
            <label className="switch-control">
              <input
                checked={autoReveal}
                disabled={editingDisabled}
                onChange={(event) => setAutoReveal(event.target.checked)}
                type="checkbox"
              />
              <span />
            </label>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3>Team reactions</h3>
                <p>Let people signal agreement, uncertainty, breaks, or a wish to speak.</p>
              </div>
              <label className="switch-control">
                <input
                  checked={reactionsEnabled}
                  disabled={editingDisabled}
                  onChange={(event) => setReactionsEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span />
              </label>
            </div>
            {reactionsEnabled && (
              <>
                <div className="reaction-palette-editor">
                  {REACTION_OPTIONS.filter(({ emoji }) => emoji !== HAND_REACTION).map((option) => {
                    const selected = reactionPalette.includes(option.emoji);
                    return (
                      <button
                        className={selected ? "selected" : ""}
                        disabled={editingDisabled}
                        key={option.emoji}
                        onClick={() => {
                          if (selected && reactionPalette.length === 1) return;
                          setReactionPalette(
                            selected
                              ? reactionPalette.filter((reaction) => reaction !== option.emoji)
                              : [...reactionPalette, option.emoji],
                          );
                        }}
                        title={option.label}
                        type="button"
                      >
                        <strong>{option.emoji}</strong>
                        <small>{option.label}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="reaction-admin-actions">
                  <button
                    className="secondary-button"
                    disabled={room.isClosed}
                    onClick={() => send({
                      type: "set_reactions_muted",
                      muted: !room.settings.reactionsMuted,
                    })}
                    type="button"
                  >
                    {room.settings.reactionsMuted ? "Resume reactions" : "Pause reactions"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={room.isClosed}
                    onClick={() => send({ type: "clear_reactions" })}
                    type="button"
                  >
                    Clear reactions
                  </button>
                </div>
              </>
            )}
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
              disabled={room.isClosed}
              onClick={() => send({ type: "set_room_lock", locked: !room.isLocked })}
              type="button"
            >
              {room.isLocked ? "Unlock room" : "Lock room"}
            </button>
          </section>

          <section className="danger-zone">
            <div className="danger-action">
              <div>
                <h3>Close room</h3>
                <p>Make this session read-only until it expires.</p>
              </div>
              <button className="danger-button" disabled={editingDisabled} onClick={closeRoom} type="button">
                Close room
              </button>
            </div>
            <div className="danger-action delete">
              <div>
                <h3>Delete room</h3>
                <p>Immediately erase the room and all of its data.</p>
              </div>
              <button className="danger-button solid" onClick={deleteRoom} type="button">
                Delete room
              </button>
            </div>
          </section>
        </div>

        <footer>
          <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={editingDisabled || cards.length < 2} onClick={save} type="button">
            {room.isClosed ? "Room closed" : "Save settings"}
          </button>
        </footer>
        {confirmationDialog}
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

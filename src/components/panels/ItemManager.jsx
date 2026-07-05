import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useModal } from "../../hooks/useModal.js";

export function ItemManager({ room, send, error, onClose }) {
  const [itemTitles, setItemTitles] = useState("");
  const pendingItems = useMemo(
    () => room.items.filter((item) => item.status === "pending"),
    [room.items],
  );
  const [orderedItems, setOrderedItems] = useState(pendingItems);
  const estimatedItems = room.items.filter((item) => item.status === "estimated");
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";
  const pendingOrderRef = useRef(null);
  const pendingSignature = pendingItems.map(({ id, title }) => `${id}:${title}`).join("|");
  const dialogRef = useModal(onClose);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setOrderedItems((current) => {
      const currentSignature = current.map(({ id, title }) => `${id}:${title}`).join("|");
      if (currentSignature === pendingSignature) {
        pendingOrderRef.current = null;
        return current;
      }
      if (pendingOrderRef.current && pendingOrderRef.current !== pendingSignature) {
        return current;
      }
      pendingOrderRef.current = null;
      return pendingItems;
    });
  }, [pendingItems, pendingSignature]);

  // A rejected reorder produces no state broadcast, so the optimistic order
  // would otherwise stay pinned indefinitely. `send` clears `error` on every
  // dispatch, so a fresh error while a reorder is in flight means the server
  // refused it — drop the pin and snap back to the authoritative order.
  useEffect(() => {
    if (error && pendingOrderRef.current) {
      pendingOrderRef.current = null;
      setOrderedItems(pendingItems);
    }
  }, [error, pendingItems]);

  function addItems(event) {
    event.preventDefault();
    const titles = itemTitles.split(/\r?\n/).map((title) => title.trim()).filter(Boolean);
    if (!titles.length) return;
    send({ type: "add_items", titles });
    setItemTitles("");
  }

  function reorderItems(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedItems((items) => {
      const reordered = arrayMove(
        items,
        items.findIndex((item) => item.id === active.id),
        items.findIndex((item) => item.id === over.id),
      );
      pendingOrderRef.current = reordered.map(({ id, title }) => `${id}:${title}`).join("|");
      send({ type: "reorder_items", itemIds: reordered.map((item) => item.id) });
      return reordered;
    });
  }

  return (
    <div className="workspace-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="item-manager-title"
        aria-modal="true"
        className="items-screen workspace-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="items-screen-header">
          <div>
            <p className="eyebrow">Estimation queue</p>
            <h1 id="item-manager-title">Items to estimate</h1>
            <p>Prepare the session before voting starts. Add one item per line.</p>
          </div>
          <div className="workspace-header-actions">
            <span className="items-room-name">{room.name}</span>
            <button className="workspace-close" onClick={onClose} type="button" aria-label="Close items">×</button>
          </div>
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
          {orderedItems.length ? (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={reorderItems}
              sensors={sensors}
            >
              <SortableContext items={orderedItems.map((item) => item.id)} strategy={rectSortingStrategy}>
                <ol>
                  {orderedItems.map((item, index) => (
                    <SortableQueueItem
                      activeRound={activeRound}
                      index={index}
                      item={item}
                      key={item.id}
                      onRemove={() => send({ type: "remove_item", itemId: item.id })}
                      onUpdate={(title) => send({ type: "update_item", itemId: item.id, title })}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
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

function SortableQueueItem({ activeRound, index, item, onRemove, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id, disabled: activeRound || editing });

  useEffect(() => {
    if (!editing) setTitle(item.title);
  }, [editing, item.title]);

  function save(event) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onUpdate(nextTitle);
    setEditing(false);
  }

  return (
    <li
      className={isDragging ? "dragging" : ""}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="queue-drag-handle"
        disabled={activeRound}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${item.title}`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <small>{String(index + 1).padStart(2, "0")}</small>
      {editing ? (
        <form className="queue-item-editor" onSubmit={save}>
          <input
            autoFocus
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <button type="submit">Save</button>
          <button
            onClick={() => {
              setTitle(item.title);
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span>{item.title}</span>
          <div className="queue-item-actions">
            <button
              className="queue-edit"
              disabled={activeRound}
              onClick={() => setEditing(true)}
              type="button"
              aria-label={`Edit ${item.title}`}
            >
              Edit
            </button>
            <button
              className="queue-remove"
              disabled={activeRound}
              onClick={onRemove}
              type="button"
              aria-label={`Remove ${item.title}`}
            >
              ×
            </button>
          </div>
        </>
      )}
    </li>
  );
}

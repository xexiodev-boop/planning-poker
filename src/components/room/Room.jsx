import { useCallback, useEffect, useRef, useState } from "react";
import { describeExpiry } from "../../lib/expiry.js";
import { takeRecoveryCode } from "../../lib/recovery.js";
import { FacilitatorGuide } from "./FacilitatorGuide.jsx";
import { ReactionLayer } from "./ReactionLayer.jsx";
import { CardHand } from "../round/CardHand.jsx";
import { RoundStage } from "../round/RoundStage.jsx";
import { History } from "../panels/History.jsx";
import { ItemManager } from "../panels/ItemManager.jsx";
import { PeopleList } from "../panels/PeopleList.jsx";
import { RoomSettings } from "../panels/RoomSettings.jsx";
import { SupportBanner } from "../SupportBanner.jsx";

export function Room({ room, send, status, error, onError, notice, onNotice }) {
  const isFacilitator = room.viewer.role === "facilitator";
  const expiry = describeExpiry(room.expiresAt);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [presenceNotices, setPresenceNotices] = useState([]);
  const [recoveryCode, setRecoveryCode] = useState(() => takeRecoveryCode(room.id));
  const recoveryLink = `${window.location.origin}/room/${room.id}?recover=${recoveryCode ?? ""}`;
  const previousPeopleRef = useRef(null);
  const timersRef = useRef(new Set());

  const scheduleTimeout = useCallback((callback, delay) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      callback();
    }, delay);
    timersRef.current.add(id);
    return id;
  }, []);

  // Clear any pending UI timers if the room unmounts (navigation, room deleted)
  // so their deferred setState calls don't run against a torn-down component.
  useEffect(() => () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => onNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, onNotice]);

  useEffect(() => {
    const currentPeople = new Map(room.participants.map((person) => [person.id, person]));
    const previousPeople = previousPeopleRef.current;
    previousPeopleRef.current = currentPeople;
    if (!previousPeople) return;

    const events = [];
    for (const person of room.participants) {
      if (person.id === room.viewer.id) continue;
      const previous = previousPeople.get(person.id);
      if (person.connected && (!previous || !previous.connected)) {
        events.push({ person, kind: "joined" });
      } else if (!person.connected && previous?.connected) {
        events.push({ person, kind: "left" });
      }
    }
    for (const [id, person] of previousPeople) {
      if (id !== room.viewer.id && !currentPeople.has(id)) {
        events.push({ person, kind: "left" });
      }
    }

    events.forEach(({ person, kind }) => {
      const id = crypto.randomUUID();
      setPresenceNotices((notices) => [...notices.slice(-3), { id, person, kind }]);
      scheduleTimeout(() => {
        setPresenceNotices((notices) => notices.filter((notice) => notice.id !== id));
      }, 3500);
    });
  }, [room.participants, room.viewer.id, scheduleTimeout]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      scheduleTimeout(() => setCopied(false), 1600);
    } catch {
      onError("The invite link could not be copied. Copy it from the address bar instead.");
    }
  }

  return (
    <main className="room-shell">
      <SupportBanner />
      <header className="room-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <div className="room-identity">
          <div>
            <span className="status-dot" data-status={status} />
            <strong>{room.name}</strong>
            {(room.isLocked || room.isClosed) && (
              <span className={`room-state ${room.isClosed ? "closed" : ""}`}>
                {room.isClosed ? "Closed" : "Locked"}
              </span>
            )}
            <span className={`room-expiry ${expiry.near ? "warn" : ""}`} title="Rooms expire after 7 days of inactivity. Any activity keeps them alive.">
              {expiry.label}
            </span>
          </div>
          <button className="text-button" onClick={copyLink} type="button">
            {copied ? "Link copied" : "Invite people"}
          </button>
          {isFacilitator && (
            <>
              {!room.isClosed && (
                <button className="text-button" onClick={() => setGuideOpen(true)} type="button">
                  Quick guide
                </button>
              )}
              <button className="text-button" onClick={() => setSettingsOpen(true)} type="button">
                Room settings
              </button>
            </>
          )}
        </div>
        <div className="viewer-pill">
          <span style={{ backgroundColor: room.viewer.color }} />
          <div>
            <strong>{room.viewer.displayName}</strong>
            <small>{isFacilitator ? "Facilitator" : "Participant"}</small>
          </div>
        </div>
      </header>

      {isFacilitator && recoveryCode && (
        <div className="recovery-banner" role="note">
          <div>
            <strong>Save your facilitator recovery link</strong>
            <p>
              It’s the only way to reclaim this room if you lose this browser or switch devices.
              We won’t show it again.
            </p>
            <code>{recoveryLink}</code>
          </div>
          <div className="recovery-actions">
            <button
              className="primary-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(recoveryLink);
                  onNotice("Recovery link copied — keep it somewhere safe.");
                } catch {
                  onError("Couldn’t copy automatically. Select and copy the link manually.");
                }
              }}
              type="button"
            >
              Copy link
            </button>
            <button className="secondary-button" onClick={() => setRecoveryCode(null)} type="button">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss message" onClick={() => onError("")} type="button">×</button>
        </div>
      )}
      {notice && (
        <div className="toast notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => onNotice("")} type="button">×</button>
        </div>
      )}
      <div className="presence-notifications" aria-live="polite">
        {presenceNotices.map((notice) => (
          <div className={`presence-notice ${notice.kind}`} key={notice.id}>
            <span style={{ backgroundColor: notice.person.color }}>
              {notice.person.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{notice.person.displayName}</strong>
              <small>{notice.kind === "joined" ? "joined the room" : "left the room"}</small>
            </div>
          </div>
        ))}
      </div>
      {settingsOpen && (
        <RoomSettings
          room={room}
          send={send}
          onClose={() => setSettingsOpen(false)}
          onManageItems={() => {
            setSettingsOpen(false);
            setItemsOpen(true);
          }}
        />
      )}
      {itemsOpen && (
        <ItemManager
          room={room}
          send={send}
          error={error}
          onClose={() => setItemsOpen(false)}
        />
      )}
      {guideOpen && (
        <FacilitatorGuide
          onClose={() => setGuideOpen(false)}
          onManageItems={() => {
            setGuideOpen(false);
            setItemsOpen(true);
          }}
        />
      )}

      <div className="room-layout">
        <section className="table-area">
          <RoundStage room={room} send={send} onManageItems={() => setItemsOpen(true)} />
          <CardHand room={room} send={send} />
        </section>
        <aside className="sidebar">
          <PeopleList room={room} send={send} />
          <History room={room} />
        </aside>
      </div>
      <ReactionLayer room={room} send={send} />
    </main>
  );
}

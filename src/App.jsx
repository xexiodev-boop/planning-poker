import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_ID_PATTERN } from "../shared/roomId.js";
import { JoinRoom, LoadingRoom } from "./components/EntryScreens.jsx";
import { HomePage } from "./components/HomePage.jsx";
import { PrivacyPage } from "./components/PrivacyPage.jsx";
import { Room } from "./components/room/Room.jsx";
import { api } from "./lib/api.js";
import { forgetRoom, rememberRoom } from "./lib/recentRoom.js";

const ROOM_PATH = new RegExp(`^/room/(${ROOM_ID_PATTERN})/?$`);
function useRoomId() {
  return window.location.pathname.match(ROOM_PATH)?.[1] ?? null;
}

export default function App() {
  const roomId = useRoomId();
  if (roomId) return <RoomPage roomId={roomId} />;
  if (window.location.pathname.replace(/\/+$/, "") === "/privacy") return <PrivacyPage />;
  return <HomePage />;
}

function RoomPage({ roomId }) {
  const [access, setAccess] = useState("checking");
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    if (!error || access === "join") return undefined;
    const timer = window.setTimeout(() => setError(""), 5000);
    return () => window.clearTimeout(timer);
  }, [access, error]);

  useEffect(() => {
    if (room) rememberRoom(room);
  }, [room]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    let retryCount = 0;

    function connect(isRetry = false) {
      setStatus(isRetry ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${roomId}/socket`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) {
          retryCount = 0;
          setStatus("connected");
          setError("");
        }
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "state") {
            // Frequent syncs omit the large history payload to save bandwidth;
            // carry our last-known history forward when it isn't included.
            setRoom((previous) =>
              message.room.history === undefined && previous
                ? { ...message.room, history: previous.history }
                : message.room,
            );
          }
          if (message.type === "error") setError(message.message);
          if (message.type === "announcement") setNotice(message.message);
          if (message.type === "room_deleted") {
            forgetRoom(roomId);
            window.location.assign("/");
          }
        } catch {
          setError("The room sent an unreadable update. Reconnecting may help.");
        }
      };
      socket.onclose = (event) => {
        if (cancelled) return;
        // Explicit app codes are intentional kicks — act on them immediately.
        if (event.code === 4002) {
          forgetRoom(roomId);
          window.location.assign("/");
          return;
        }
        if (event.code === 4001) {
          setError("You were removed from this room.");
          setAccess("join");
          setRoom(null);
          setStatus("join");
          return;
        }
        // Any other close (server restart/eviction and browser navigation both
        // use 1001, network drops use 1006, room expiry closes with 1001) is
        // ambiguous: re-check identity via /state before assuming we were kicked,
        // so a still-valid session reconnects instead of landing on the join form.
        recover();
      };
    }

    async function recover() {
      setStatus("reconnecting");
      try {
        const state = await api(`/api/rooms/${roomId}/state`);
        if (cancelled) return;
        setRoom(state);
        setAccess("joined");
        retryCount = 0;
        connect(true);
      } catch (requestError) {
        if (cancelled) return;
        if (requestError.status === 401) {
          // Identity genuinely rejected — the user needs to (re)join.
          setAccess("join");
          setRoom(null);
          setStatus("join");
          return;
        }
        if (requestError.status === 404) {
          // Room is gone (expired or deleted) — send them home.
          forgetRoom(roomId);
          window.location.assign("/");
          return;
        }
        // Transient failure (still restarting, network blip) — back off and retry.
        const delay = Math.min(15000, 750 * (2 ** retryCount));
        retryCount += 1;
        retryTimer = window.setTimeout(recover, delay + Math.random() * 500);
      }
    }

    async function redeemRecoveryLink() {
      const code = new URLSearchParams(window.location.search).get("recover");
      if (!code) return;
      try {
        await api(`/api/rooms/${roomId}/recover`, {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        if (!cancelled) setNotice("Facilitator access recovered.");
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        // Strip the secret from the address bar/history regardless of outcome.
        window.history.replaceState(null, "", `/room/${roomId}`);
      }
    }

    async function authenticate() {
      await redeemRecoveryLink();
      if (cancelled) return;
      try {
        const state = await api(`/api/rooms/${roomId}/state`);
        if (cancelled) return;
        setRoom(state);
        setAccess("joined");
        connect();
      } catch (requestError) {
        if (cancelled) return;
        if (requestError.status === 401) {
          setAccess("join");
          setStatus("join");
        } else {
          setAccess("join");
          setStatus("join");
          setError(requestError.message);
        }
      }
    }

    authenticate();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [roomId]);

  const send = useCallback((event) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("The room is reconnecting. Try that again in a moment.");
      return;
    }
    socketRef.current.send(JSON.stringify(event));
  }, []);

  async function join(name) {
    setStatus("connecting");
    setError("");
    try {
      await api(`/api/rooms/${roomId}/join`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      window.location.reload();
    } catch (requestError) {
      setError(requestError.message);
      setStatus("join");
    }
  }

  if (access === "join") return <JoinRoom roomId={roomId} onJoin={join} error={error} />;
  if (!room) return <LoadingRoom status={status} error={error} />;

  return (
    <Room
      room={room}
      send={send}
      status={status}
      error={error}
      onError={setError}
      notice={notice}
      onNotice={setNotice}
    />
  );
}

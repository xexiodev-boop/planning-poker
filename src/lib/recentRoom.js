const RECENT_ROOM_KEY = "point-taken:recent-room";
const DISMISSED_ROOM_KEY = "point-taken:dismissed-room";

export function readRecentRoom() {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_ROOM_KEY));
    if (!recent?.roomId || !recent?.expiresAt || recent.expiresAt <= Date.now()) {
      localStorage.removeItem(RECENT_ROOM_KEY);
      return null;
    }
    return recent;
  } catch {
    localStorage.removeItem(RECENT_ROOM_KEY);
    return null;
  }
}

export function visibleRecentRoom() {
  const recent = readRecentRoom();
  return recent && localStorage.getItem(DISMISSED_ROOM_KEY) !== recent.roomId ? recent : null;
}

export function rememberRoom(room) {
  if (room.viewer.role !== "facilitator") return;
  localStorage.setItem(RECENT_ROOM_KEY, JSON.stringify({
    roomId: room.id,
    name: room.name,
    role: room.viewer.role,
    expiresAt: room.expiresAt,
    path: `/room/${room.id}`,
  }));
  if (localStorage.getItem(DISMISSED_ROOM_KEY) !== room.id) {
    localStorage.removeItem(DISMISSED_ROOM_KEY);
  }
}

export function dismissRecentRoom(roomId) {
  localStorage.setItem(DISMISSED_ROOM_KEY, roomId);
}

export function forgetRoom(roomId) {
  const recent = readRecentRoom();
  if (recent?.roomId === roomId) localStorage.removeItem(RECENT_ROOM_KEY);
  if (localStorage.getItem(DISMISSED_ROOM_KEY) === roomId) {
    localStorage.removeItem(DISMISSED_ROOM_KEY);
  }
}

// The canonical room-id shape: three lowercase slug words plus a 6-char hex
// suffix, e.g. "merry-jade-otter-a1b2c3". Shared so the worker's API route and
// the client's page route validate the exact same shape and can't drift apart.
export const ROOM_ID_PATTERN = "[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-[a-f0-9]{6}";

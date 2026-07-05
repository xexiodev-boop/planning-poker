// The raise-hand signal. It toggles a persistent raised hand rather than
// floating away like the emoji reactions, and is never part of the configurable
// palette — but a client may still send it, so it counts as an allowed reaction.
export const HAND_REACTION = "✋";

// Emoji reactions paired with their accessible labels. Shared so the worker's
// validation and the client's buttons/labels stay in lockstep — adding a
// reaction here is the single edit needed on both sides.
export const REACTION_OPTIONS = [
  { emoji: "👍", label: "Agree" },
  { emoji: "🤔", label: "Unsure" },
  { emoji: "👀", label: "Reviewing" },
  { emoji: "🎉", label: "Nice" },
  { emoji: "☕", label: "Break" },
  { emoji: HAND_REACTION, label: "Need to speak" },
];

// The palette a facilitator can configure — every reaction except raise-hand.
export const DEFAULT_REACTION_PALETTE = REACTION_OPTIONS
  .map(({ emoji }) => emoji)
  .filter((emoji) => emoji !== HAND_REACTION);

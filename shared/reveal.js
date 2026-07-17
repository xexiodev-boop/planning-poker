// Reveal-reminder timer choices, shared so the worker's allowed set and the
// client's dropdown offer exactly the same options.
export const DEFAULT_REVEAL_DELAY_SECONDS = 30;

export const REVEAL_DELAY_OPTIONS = [
  { seconds: 0, label: "Off" },
  { seconds: 15, label: "15 seconds" },
  { seconds: 30, label: "30 seconds" },
  { seconds: 60, label: "60 seconds" },
  { seconds: 90, label: "90 seconds" },
];

export const ALLOWED_REVEAL_DELAYS = REVEAL_DELAY_OPTIONS.map(({ seconds }) => seconds);

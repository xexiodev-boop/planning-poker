import { plural, t } from "@lingui/core/macro";

const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000;

// Rooms expire after 7 days of inactivity; any facilitator action slides the
// window forward. Surface the remaining time so a room's data isn't lost by
// surprise. `near` flags the last day so the facilitator can nudge it along.
export function describeExpiry(expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { label: t`Expired`, near: true };
  if (remaining < EXPIRY_WARNING_MS) {
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    return {
      label: hours > 1 ? t`Expires in ${hours} hours` : t`Expires within an hour`,
      near: true,
    };
  }
  const days = Math.round(remaining / (24 * 60 * 60 * 1000));
  return {
    label: plural(days, { one: "Expires in # day", other: "Expires in # days" }),
    near: false,
  };
}

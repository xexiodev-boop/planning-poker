import { i18n } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

// The worker replies and broadcasts in English. Lingui message ids are the
// English source strings, so running a server message through i18n._() returns
// its translation when one exists and the original text untouched otherwise.
// Nothing breaks if the worker and client ever disagree on the exact wording.
export function localizeServerMessage(message) {
  return message ? i18n._(message) : message;
}

// Announcements that interpolate participant names carry a machine-readable
// kind + params next to the prebuilt English message, so they can be rebuilt
// in the viewer's language instead of string-matched.
export function localizeAnnouncement(announcement) {
  if (announcement.kind === "facilitator_recovered") {
    const { name } = announcement.params;
    return t`${name} recovered facilitator access.`;
  }
  if (announcement.kind === "facilitator_auto_transferred") {
    const { from, to } = announcement.params;
    return t`${from} was away, so ${to} is now the facilitator.`;
  }
  return localizeServerMessage(announcement.message);
}

// Every fixed string the worker can send, mirrored as catalog entries so
// `lingui extract` picks them up. Update this list when worker copy changes;
// a missed entry only means that one message stays in English.
export const SERVER_MESSAGES = [
  msg`A deck needs at least two cards.`,
  msg`Add at least one item.`,
  msg`Add no more than 100 items at a time.`,
  msg`Cards must be provided as a list.`,
  msg`Choose a card before confirming.`,
  msg`Choose another person to become facilitator.`,
  msg`Choose or enter a final estimate.`,
  msg`Content-Type must be application/json.`,
  msg`Deck cards must be unique.`,
  msg`Enter a task title.`,
  msg`Enter an item title.`,
  msg`Give reactions a moment to breathe.`,
  msg`Invalid room identity.`,
  msg`Items must be provided as a list.`,
  msg`Keep at least one reaction available.`,
  msg`Not found`,
  msg`Reaction palette must be a list.`,
  msg`Reactions are currently paused.`,
  msg`Request body must be valid JSON.`,
  msg`Request is too large.`,
  msg`Request origin is not allowed.`,
  msg`Reveal the cards first.`,
  msg`Room already exists.`,
  msg`Room message is too large.`,
  msg`Something went wrong. Please try again.`,
  msg`That action could not be completed.`,
  msg`That card is not in this deck.`,
  msg`That item is already in the estimation queue.`,
  msg`That item is no longer pending.`,
  msg`That participant cannot be changed.`,
  msg`That participant cannot be removed.`,
  msg`That pending item was not found.`,
  msg`That reaction is not available.`,
  msg`That recovery code is not valid for this room.`,
  msg`The pending item order is no longer current.`,
  msg`There is no active round to cancel.`,
  msg`There is no active round to edit.`,
  msg`There is no active round to restart.`,
  msg`There is no voting round to reveal.`,
  msg`This room has been closed.`,
  msg`This room has expired or does not exist.`,
  msg`This room is closed and can only be viewed.`,
  msg`This room is not accepting new participants.`,
  msg`Too many attempts. Try again shortly.`,
  msg`Too many room actions. Slow down and try again.`,
  msg`Too many rooms created. Try again shortly.`,
  msg`Unknown participant role.`,
  msg`Unknown room action.`,
  msg`Unknown suggestion algorithm.`,
  msg`Unsupported reveal timer.`,
  msg`Voting is not open.`,
  msg`You joined after this round started and can vote in the next one.`,
  msg`Your room identity is no longer valid.`,
];

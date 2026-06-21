# Point Taken

A lightweight, real-time planning poker app for development teams.

## Stack

- React and Vite
- Cloudflare Workers
- One SQLite-backed Durable Object per planning room
- Hibernatable WebSockets for live room state

Rooms are anonymous and expire seven days after their last meaningful activity. Participants
choose a name and receive a random five-character suffix, color, private identity token, and
reconnect support.

Room links use the generated room name plus a short random identifier, for example
`/room/quiet-violet-koala-58f74e`.

## Local development

```bash
npm install
npm run dev
```

The app is normally available at `http://localhost:5173`.

## Verification

```bash
npm run build
```

With the development server running on port `4175`, the end-to-end room smoke test is:

```bash
npm run smoke
```

Set `APP_URL` to test another local or deployed URL.

## Deployment

Authenticate Wrangler with Cloudflare, then run:

```bash
npm run deploy
```

The first deployment creates the `PlanningRoom` Durable Object namespace using the migration
declared in `wrangler.jsonc`.

## Current flow

1. A facilitator creates a room and selects a deck.
2. Anyone with the link joins using a display name.
3. The facilitator starts a task.
4. Eligible participants select and confirm a card.
5. Reveal is suggested when everyone confirms or after 30 seconds.
6. The facilitator reveals, reviews the suggested mode, and saves a final estimate.
7. Votes and final estimates remain in the room history until the room expires.

## Facilitator settings

Between rounds, the facilitator can:

- Batch-add a list of items to estimate and remove pending items.
- Add, remove, reorder, or reset deck cards.
- Select most votes, middle ground, median, average rounded up, highest vote, or
  no automatic suggestion.
- Set the reveal reminder to off, 15, 30, 60, or 90 seconds.
- Lock and unlock the room for new participants.
- Permanently close the room, leaving its completed history read-only.

Every participant can copy the room invitation link. Locking prevents new identities from
joining but still permits existing participants to reconnect.

When starting a round, the facilitator can select an unestimated backlog item or enter a new
ad-hoc item. Finalizing an estimate marks the selected backlog item as estimated.

Item preparation lives in a dedicated full-screen workspace opened from Room Settings. The
round launcher keeps the remaining queue visible on the left so the facilitator can select the
next item directly.

During an active round, the facilitator can edit its title, clear all cards and run another
ballot, or cancel the round. Cancelled backlog items remain pending; cancelled ad-hoc items are
discarded.

The facilitator can also manage people from the room sidebar:

- Switch participants to an observer role between rounds.
- Transfer facilitator ownership between rounds.
- Remove participants at any time.

Observers remain present in the room but are excluded from voting. Removing someone during a
round discards their current card and immediately recalculates whether the remaining voters are
ready to reveal.

Revealed and completed results include:

- Agreement percentage and unanimous-vote detection.
- Lowest and highest submitted cards plus deck-step spread.
- A detailed completed-estimate screen with vote distribution and individual cards.
- Room-history export as CSV or Markdown, generated locally in the browser.

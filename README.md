# Point Taken

**Free, real-time planning poker for agile teams. No signup, no tracking, no data kept.**

Live at **[pointtaken.team](https://pointtaken.team)**.

Point Taken is an estimation (planning) poker app for sprint planning sessions. A facilitator
creates a room, shares the link, and the team votes on tasks with a card deck in real time.
Nobody creates an account, rooms expire on their own, and nothing about your team or your
backlog is retained.

## Features

- **Instant rooms**: create a room and share one link; everyone joins with just a display name.
- **Real-time voting**: live card selection, confirmation tracking, and reveal over WebSockets.
- **Flexible decks**: Fibonacci, t-shirt sizes, and more; add, remove, or reorder cards freely.
- **Estimate suggestions**: most votes, median, average rounded up, middle ground, highest
  vote, or no suggestion at all.
- **Backlog queue**: batch-add items to estimate, reorder them by drag and drop, and edit
  titles inline between rounds.
- **Round insights**: agreement percentage, unanimous-vote detection, vote spread, and a
  detailed per-estimate breakdown.
- **History export**: download completed estimates as CSV or Markdown, generated locally in
  your browser.
- **People management**: observers, facilitator transfer, participant removal, room locking.
- **Reactions**: an optional curated reaction palette with raised hands that persist until
  lowered.
- **Auto-reveal and reminders**: reveal automatically when everyone has voted, or nudge after
  a configurable timer.

## Privacy

Privacy is the point, not an afterthought:

- No accounts, emails, passwords, or profiles, ever.
- Rooms are anonymous and expire seven days after their last meaningful activity; facilitators
  can delete a room and all of its data instantly at any time.
- Participant identity lives in a room-scoped, HttpOnly, SameSite cookie. It is never exposed
  to application JavaScript or included in WebSocket URLs.
- Operational logs exclude names, votes, task titles, and identity tokens.
- Exports are generated entirely in the browser; nothing leaves the room to produce them.

## How a session works

1. A facilitator creates a room and selects a deck.
2. Anyone with the link joins using a display name.
3. The facilitator starts a task; eligible participants select and confirm a card.
4. The facilitator reveals the cards, reviews the suggested estimate, and saves the result.
5. Votes and final estimates stay in the room history until the room expires or is deleted.

## Tech stack

- [React](https://react.dev/) + [Vite](https://vite.dev/) frontend
- [Cloudflare Workers](https://workers.cloudflare.com/) backend
- One SQLite-backed Durable Object per planning room
- Hibernatable WebSockets for live room state

### Production safeguards

- Requests and WebSocket upgrades are restricted to the app origin.
- Room creation, joining, and WebSocket actions are rate-limited.
- HTTP bodies and WebSocket messages are limited to 16 KB.
- Security headers and a restrictive Content Security Policy are applied.
- Room state is schema-versioned and automatically upgraded when loaded.

### Room limits

- 20 people, including the facilitator
- 50 pending items
- 100 completed estimates (older history is pruned)
- 16 cards per deck

## Local development

```bash
npm install
npm run dev
```

The app is available at `http://localhost:5173`.

### Verification

```bash
npm run check
```

This runs ESLint, the Vitest unit and authorization tests, and the production build. With a
dev server running on port `4175`, `npm run smoke` runs an end-to-end room smoke test
(set `APP_URL` to target another URL).

### Deployment

Authenticate Wrangler with Cloudflare, then:

```bash
npm run deploy
```

The first deployment creates the `PlanningRoom` Durable Object namespace using the migration
declared in `wrangler.jsonc`.

## AI Disclosure

AI tools were used in the development of this app as code assistants and as bug and
vulnerability scanners. Architecture, product, and privacy decisions are the author's own.

## License

This project is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). You are free to use, modify, and
share it for any noncommercial purpose. Commercial use, including selling the software
or offering it as a paid service, is not permitted.

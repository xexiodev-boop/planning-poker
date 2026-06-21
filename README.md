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

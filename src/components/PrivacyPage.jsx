const CONTACT_EMAIL = "ajdionisio@proton.me";
const HOME_URL = "https://xexio.dev";

export function PrivacyPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <a className="text-button" href="/">← Back to home</a>
      </header>

      <article className="legal-article">
        <p className="eyebrow">Usage &amp; privacy</p>
        <h1>How Point Taken treats your data</h1>
        <p className="legal-lede">
          Point Taken is a free, real-time planning-poker room for teams. It is built privacy-first:
          no accounts, no tracking, and no more data than a voting session actually needs. This page
          explains, in plain language, what is stored, what is not, and how to remove it.
        </p>
        <p className="legal-meta">Last updated: 5 July 2026</p>

        <section>
          <h2>The short version</h2>
          <ul>
            <li>No sign-up. No email, password, or profile is ever required.</li>
            <li>The only personal detail we handle is the display name you choose — a nickname is fine.</li>
            <li>No analytics, no advertising, no third-party trackers, and nothing is sold or shared.</li>
            <li>Rooms and everything in them are deleted automatically 7 days after the last activity.</li>
            <li>A facilitator can delete a room and all of its data instantly, at any time.</li>
          </ul>
        </section>

        <section>
          <h2>No accounts</h2>
          <p>
            There is nothing to register. When you create or join a room you type a display name, to
            which the app appends a short random suffix so people with the same name stay distinct.
            You are identified only within that one room, only for as long as it exists.
          </p>
        </section>

        <section>
          <h2>What is stored while a room is live</h2>
          <p>Each room keeps only what it needs to run the session on the server that hosts it:</p>
          <ul>
            <li>The room name, the planning deck, and the room settings.</li>
            <li>Participant display names and their role (facilitator, voter, or observer).</li>
            <li>Votes during a round and the finalized estimates in the room’s history.</li>
            <li>Short-lived reactions and raised hands, which clear on their own within seconds.</li>
            <li>
              A one-way hash (SHA-256) of the facilitator recovery code. The code itself is shown to
              you once and is never stored — we keep only the hash so it can be checked, not recovered.
            </li>
            <li>Timestamps for when the room was created, last used, and is due to expire.</li>
          </ul>
          <p>
            Votes stay hidden from other participants until the facilitator reveals them (or everyone
            has voted, if auto-reveal is on). We do not store IP addresses alongside your activity.
          </p>
        </section>

        <section>
          <h2>What stays on your device</h2>
          <p>Point Taken uses a small amount of browser storage purely to keep a session working and to save you re-typing. None of it is used for tracking, and it never leaves your device except the identity cookie, which is sent only to this site.</p>
          <ul>
            <li>
              <strong>One identity cookie per room</strong> (<code>point_taken_identity</code>): a random
              token that binds your browser to your seat so your votes and role survive a refresh or
              reconnect. It is <code>HttpOnly</code>, <code>SameSite=Strict</code>, scoped to that room’s
              path, and expires within 7 days. It is not an advertising or analytics cookie.
            </li>
            <li>
              <strong>Local storage</strong>: your last-used display name and the link to your most recent
              room, so join and create forms can prefill and the home page can offer you the room again.
              It also remembers if you dismissed the “buy me a coffee” banner, so it stays hidden for a week.
            </li>
            <li>
              <strong>Session storage</strong>: a facilitator recovery code is held briefly so it can be
              shown to you once after a room is created, then removed.
            </li>
          </ul>
          <p>You can clear any of this at any time from your browser’s site-data settings.</p>
        </section>

        <section>
          <h2>What we do not collect</h2>
          <ul>
            <li>No analytics or usage tracking, and no advertising or marketing profiles.</li>
            <li>No third-party scripts, embeds, or trackers load in the app.</li>
            <li>No location data, contacts, or device fingerprinting.</li>
            <li>Your data is never sold, rented, or shared with anyone.</li>
          </ul>
        </section>

        <section>
          <h2>Hosting and infrastructure</h2>
          <p>
            The app runs on Cloudflare’s network (Workers and Durable Objects). To deliver the service
            and protect it from abuse, Cloudflare processes connection details — including your IP
            address — transiently for connectivity, security, and rate-limiting. The app uses your IP
            only as a short-lived counter to limit how many rooms can be created or joined in a short
            window; it is not linked to your name or votes. This processing is covered by Cloudflare’s
            own privacy practices.
          </p>
        </section>

        <section>
          <h2>Removing your data</h2>
          <ul>
            <li>
              <strong>Delete now:</strong> a facilitator can open Room settings and choose “Delete room”
              to erase the room, its participants, votes, and history immediately.
            </li>
            <li>
              <strong>Automatic expiry:</strong> every room is permanently deleted 7 days after its last
              activity, whether or not anyone deletes it manually.
            </li>
            <li>
              <strong>On your device:</strong> clearing this site’s browser storage removes the saved
              name, recent-room link, and identity cookie.
            </li>
          </ul>
        </section>

        <section>
          <h2>Free, and provided “as is”</h2>
          <p>
            Point Taken is free to use for teams and individuals. It is offered as-is, without warranty
            of any kind: while it is built and maintained with care, availability, data retention, and
            fitness for any particular purpose are not guaranteed. Please don’t rely on a room as a
            system of record — export or note down estimates you need to keep, since rooms expire.
          </p>
        </section>

        <section>
          <h2>Supporting the project</h2>
          <p>
            Point Taken is free and has no ads or paid tiers. A small banner may invite you to support
            its upkeep by “buying me a coffee.” It is entirely optional and changes nothing about the app
            if you ignore or dismiss it — dismissing it just hides it for a week (see browser storage above).
            The link opens an external payment service (Buy Me a Coffee) in a new tab; no third-party
            scripts or trackers are loaded inside Point Taken itself, but once you follow that link you are
            on their site, subject to their own privacy practices.
          </p>
        </section>

        <section>
          <h2>Changes to this statement</h2>
          <p>
            If this statement changes, the “last updated” date above will change with it. Because there
            are no accounts, material changes cannot be emailed to you — the current version always lives
            at this page.
          </p>
        </section>

        <section>
          <h2>Who runs this &amp; how to reach out</h2>
          <p>
            Point Taken is made by <a href={HOME_URL} target="_blank" rel="noopener noreferrer">xexio.dev</a>,
            an independent developer based in Spain, and is not affiliated with any company. For any privacy
            question or request, contact me at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </article>

      <footer className="legal-footer">
        <a href="/">Point Taken</a>
        <span>·</span>
        <span>Made by <a href={HOME_URL} target="_blank" rel="noopener noreferrer">xexio.dev</a> · Spain</span>
        <span>·</span>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </footer>
    </main>
  );
}

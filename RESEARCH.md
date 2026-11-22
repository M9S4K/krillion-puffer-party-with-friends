# Krillion "Puffer Party" — how joining actually works

Researched 2026-11-22 against the live site (krillion.io) and its party backend.

## The game
Krillion (krillion.io) — daily category/trivia game. Multiplayer mode = **Puffer Party**
at https://krillion.io/party. Roughly 6,000 players / 2,000 rooms online when checked.

## Ways into a game (what the UI offers)
1. **PLAY NOW** size picker: `1V1`, `3S`, `4-6`, `8-10`, then either
   - `RATED` — matchmade near your rating, or
   - `QUICK PLAY` — unrated matchmaking.
2. **HOST A ROOM** — with a visibility toggle: `PUBLIC · LISTED` or `PRIVATE · CODE ONLY`.
3. **JOIN BY CODE** — 4-letter code box.
4. **PUBLIC ROOMS** list — live, shows `CODE / host / players/max / IN THE LOBBY | PLAYING`,
   50 at a time with LOAD MORE. Rooms already `PLAYING` are joinable if a seat is free.

## Why you two keep getting split up
Quick Play is *designed* to fill the fullest lobby it can find. The client fallback logic
literally sorts candidate lobby rooms by **most players first** and takes the top 3:

```js
(rooms).filter(r => r.phase === "lobby" && r.players < r.maxPlayers)
       .sort((a,b) => b.players - a.players).slice(0,3)
```

So Quick Play lands you in a room with typically **exactly one seat left** — there is no
second seat for your friend. Same for shouting a code from the public list: by the time he
types it, the last seat is gone. Joining is first-come, server-side, with a 4-second
seat-hold refresh; there is no invite/party/reserve-a-friend feature in the game.

## Backend facts (from the site's own JS)
- Party backend: `https://party.krillion.io`
  - `GET /rooms` (optional `?cursor=`) → public, **no auth**, JSON list of rooms
    (`code, hostName, players, maxPlayers, phase, queue, rated, rating, lobbySince`).
    Cached 2s. **No CORS header**, so only same-origin (krillion.io) or non-browser code can read it.
  - `GET /activity` → `{"players":N,"rooms":N}`
  - `POST /rooms` (create), `POST /rooms/{CODE}/join`, `POST /quick-play`, `POST /rating`
  - per-room WebSocket for live play
- Joining needs a guest token from `krillion.io/api/party/token`, which is gated by a
  **Cloudflare Turnstile captcha** (action `puffer_join`). Automating the join itself means
  defeating that — not doing it, and it is a good way to get blocked.
- Errors worth knowing: `"This room is full."`, `SEATED_ELSEWHERE` (you can only hold one
  seat at a time), `party-verification` (captcha needed).
- **Deep link that works today:** `https://krillion.io/party/<CODE>` takes you straight into
  that room ("swimming in…"). This is the fast path for a friend — no menu, no typing.

## What actually fixes it
**A. Host, don't chase (fully reliable).** Whoever is faster hosts a `4-6` room. The room
starts at 1/6, so your friend walks straight in with the deep link. Set it PUBLIC · LISTED
and strangers fill the other 4 seats — you still get a full lobby, you just get in first.
PRIVATE · CODE ONLY if you want it to be only the two of you.

**B. For joining other people's rooms: filter for 2+ free seats, then one-tap join.**
Never call out a room with one seat. A tool can poll `/rooms`, show only
`maxPlayers - players >= 2` and `phase == "lobby"`, and hand both of you the same
`krillion.io/party/<CODE>` link at the same instant. Clicking is still manual (no captcha
bypass), but you both click the same link within a second instead of relaying over voice.

Tool shapes that work, given the CORS block:
- **Tampermonkey userscript on krillion.io** (same-origin, so it can read `/rooms` and drive
  the real page) — adds a "2+ seats" filter, a one-key host-and-copy-invite button, and
  auto-join on an incoming link.
- **Small local app** (Node/Python) that polls `/rooms` and posts the link to your Discord
  channel via a webhook, so you both get the same clickable link at the same moment.

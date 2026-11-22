# Krillion Puffer Party With Friends

A Chrome extension for two (or more) people who want to land in the **same** Puffer Party
room on [krillion.io](https://krillion.io/party). One of you joins a room; everyone else in
the party is pulled in automatically - no code shouted over Discord, no typing, no clicking.

## What it does

- **You join a room → your friend joins the same room.** His browser opens
  `krillion.io/party/<CODE>` and presses TAKE A SEAT for him. He touches nothing.
- Works whichever way you got in: `JOIN` from the public list, `JOIN BY CODE`,
  `QUICK PLAY`, `RATED`, or hosting your own room.
- **Find a room**: reads the live public room list and jumps you both into the
  fullest lobby that still has room for the two of you. This is the fix for Quick Play,
  which deliberately drops you in the fullest lobby it can find - usually one with exactly
  one seat left, which is why you two keep getting split up.
- **Room size picker**, left of that button: `Any size`, `1v1`, `3 players`, `4-6`, `8-10`.
  The finder only offers lobbies of the size you picked.

It does not log in for you, does not bypass anything, and does not touch the game beyond
clicking the same buttons you would. If Krillion shows its occasional Cloudflare
verification, the extension beeps and tells you to tap it - that one is yours.

## Install (both of you)

1. Copy the `extension` folder onto the machine.
2. Open `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick the folder.
3. Open https://krillion.io/party. The panel opens at the bottom left on first run.
4. Type the **same party name** on both machines - something nobody would guess.
5. Type your display name under YOUR NAME on the Krillion page once. Krillion will not seat
   you without it.

Everything lives in that panel. The toolbar popup only mirrors the party name and gives you
a link to the game.

## Using it

The panel collapses to a pill: `● PARTY · 2` - the dot is your relay link, the number is how
many of you are connected. Click it to open. A second card peeks out from behind it, and
every passing line (status, errors, what the finder is doing) lands there, so the main card
never jumps around.

- **Who's here** sits at the top: each of you, and the room you are in. When you are in the
  same room it says **with you**, in green. That is the question the tool exists to answer.
- **Find a room** - the one button. Picks the fullest public lobby with a free seat
  for everyone in your party and takes you both in. The number of seats comes from how many
  of you are linked, so there is nothing to configure.
- **Size picker** to its left - restrict the search to `1v1`, `3 players`, `4-6` or `8-10`.
- **Party name** is editable straight in the header; the ⓘ beside it explains what it does.
  There is no settings screen - following, auto-seating and the room search are always on.

Joining any room by hand still works the same way: click `JOIN` on any room, use `JOIN BY
CODE`, `QUICK PLAY`, `RATED` or host - your friend is pulled in either way.

## How you two are connected

Through [ntfy.sh](https://ntfy.sh), a free public pub/sub relay - there is no server for you
to run. The party name becomes a channel (`kpj-<party-name>`); each browser listens on
`wss://ntfy.sh/kpj-<party-name>/ws`, and joining a room POSTs the four-letter code to it.
Delivery is usually under half a second.

Two things follow from that:

- **Pick an unguessable party name.** Anyone using the same name is in your party.
- Only a room code and a random client id ever travel. No names, no accounts. ntfy drops
  messages after about 12 hours.

To use your own relay instead, change `NTFY` in `background.js` and the `wss://` URL in
`content.js` - any pub/sub that speaks HTTP POST and WebSocket will do.

## Sharing a log

The extension keeps its last 250 events - relay connects, publishes, peers
appearing, follows, seat attempts, room searches - and survives page reloads.

- **Click the status line** at the foot of the card, or press **Alt+L**, to copy the
  whole log to the clipboard. Paste it wherever you need it.
- The report starts with the extension version, browser, relay state and peer count.
  Your party name is masked (first two characters and a length), so the log is safe
  to paste in public.
- If the clipboard is blocked, the log is printed to the console instead (F12).

## If something misbehaves

- **Red dot on the badge** - no relay connection. Check the party name is set and that
  you are online; it retries on its own.
- **"filled up before you got there"** - the last seat went to someone else. Hit
  **Find a room** and go again.
- **Friend does not follow** - party names must match exactly, both need **Linked** on, and
  his krillion.io tab has to be open.
- **Nothing happens after a Krillion update** - the extension keys off two bits of the
  page: the `▼ TAKE A SEAT ▼` button text (`autoSeat()` in `content.js`) and room rows
  reading `CODE host 4/6 · PLAYING` (`watchClicks()`). If Krillion rewords either, adjust
  those two matchers.

## What was tested

Run live against krillion.io on 22 Nov 2026, with two browser tabs standing in for two
machines:

- Room-code extraction from the public list - correct on every row, `FULL` rows skipped,
  character-tier buttons ignored.
- Leader click → relay → follower lands on `krillion.io/party/<CODE>`: works. Relay
  delivery measured at **82 ms**.
- TAKE A SEAT found and clicked automatically, 352 ms after the page opened.
- Room picker against the live room list: 14 valid lobbies out of 50 rooms, picks
  the fullest one with space for both.

Not covered: the final seated-in-the-room step. Krillion's Cloudflare verification would
not load in the test browser, so no seat was actually taken. That is the one step you will
confirm on the first real run.

## Files

| File | Role |
|---|---|
| `manifest.json` | Chrome manifest (MV3) |
| `content.js` | Runs on krillion.io: watches rooms, badge UI, follows, takes the seat |
| `background.js` | Publishes to the relay, reads the public room list |
| `popup.html` / `popup.js` | Settings |
| `content.css` | Panel, shelf and toast styling |
| `icons/` | Toolbar icon: two krill from the game, composed from `krillion.io/tiers/krillion.png` |
| `RESEARCH.md` | How Krillion's party backend works, and why Quick Play splits you up |

## Note on the icon

The toolbar icon is built from Krillion's own krill sprites (`/tiers/krillion.png` and
`/tiers/krillion-gold.png`) on the game's trench gradient. That is the game's artwork - fine for a private tool the two of you load
unpacked, not something to publish to the Chrome Web Store.

## Design lab

`python3 tools/build-preview.py` regenerates `ui-preview.html` from the extension's own CSS
and markup. The page shows every panel state and a lab on the right:

- **Version** - flip between the working copy and any commit that touched the panel. Each
  version renders in its own frame with its own stylesheet, so you can see what changed.
- **Editing** - All elements tunes the shared tokens; pick a single element and you get its
  own padding, margin, size, colours, stroke and corners, seeded from its computed style.
- Every row has an info icon explaining what the value does.
- **Copy tokens** puts the result on the clipboard, ready to paste into `content.css`.

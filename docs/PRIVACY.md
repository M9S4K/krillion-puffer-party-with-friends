# Privacy policy

**Krillion Puffer Party With Friends**
Last updated: 23 November 2026

## The short version

The extension has no account, no server of its own, and no analytics. The only
thing it sends anywhere is a four-letter Krillion room code, your Krillion
display name, and whether you have "follow" switched on — and it sends those
only to the other browsers in your own party.

Nothing is sold, shared with advertisers, or used to build a profile.

## What the extension collects

It reads three things from your browser:

| What | Where it comes from | Why |
| --- | --- | --- |
| Your party name | You type it into the panel | It is the channel your browsers talk on |
| Your Krillion display name | The "YOUR NAME" box on krillion.io | So your friends see who is who in the panel |
| The room code you are in | The address bar, e.g. `/party/ABCD` | It is the thing your friends need in order to follow you |

It also keeps your four settings switches, and a local event log of its own
activity for troubleshooting.

## What it sends, and to whom

When you join a room, or roughly every 20 seconds while you are idle, the
extension publishes one small message:

```json
{ "t": "join", "code": "ABCD", "name": "yourname", "f": 1, "from": "<random id>", "ts": 1763... }
```

That message goes to a **public MQTT message broker** — either
[broker.hivemq.com](https://www.hivemq.com/public-mqtt-broker/) or, if that is
unreachable, [test.mosquitto.org](https://test.mosquitto.org/) — on a channel
named after your party name. Anyone else running the extension with the same
party name receives it. That is how following works.

These brokers are free public services run by third parties. They are not
operated by us, and their own terms apply to traffic passing through them.

**Because the broker is public, anyone who knows or guesses your party name can
read these messages.** This is why the extension tells you to choose an unusual
party name. Treat it like a password.

The extension also fetches the public room list from
`https://party.krillion.io/rooms` to find a lobby with enough free seats. That
request contains no information about you.

## What it never does

- No account, sign-in, email address or password
- No analytics, telemetry, crash reporting or advertising identifiers
- No reading, storing or transmitting of browsing history
- No access to any site other than `krillion.io`
- No server operated by this project — there is nowhere for us to store anything
- Nothing is sold or transferred to anyone for any purpose

## Where your data is stored

| Data | Stored in | Who can see it |
| --- | --- | --- |
| Party name and settings | `chrome.storage.sync` | You, and your own Chrome profile on your other devices |
| Event log | `chrome.storage.local` | You only, on that machine. The party name is masked. |
| Messages in flight | The public broker, momentarily | Anyone with your party name |

Nothing is retained by the broker: messages are delivered at QoS 0 with no
retention flag, so they exist only for the instant it takes to pass them on.

## Removing your data

Remove the extension and everything local goes with it. There is nothing held
anywhere else to delete. To change the channel your browsers talk on, simply
type a different party name.

## Permissions, and why each one is needed

- **`storage`** — to remember your party name and the four settings between
  visits.
- **`https://krillion.io/*`** — to show the panel on the game page, read the
  room code out of the address bar, and press "Take a seat" for you.
- **`https://party.krillion.io/*`** — to read Krillion's public room list when
  you press "Find room". A content script cannot make that request itself,
  because the endpoint sends no CORS header.

The extension asks for nothing else. It cannot see any other site you visit.

## Children

The extension is not directed at children and collects nothing that would
identify one.

## Changes

Any change to this policy will be committed to this file, which is public and
versioned, so its full history is visible at any time.

## Contact

Open an issue:
<https://github.com/M9S4K/krillion-puffer-party-with-friends/issues>

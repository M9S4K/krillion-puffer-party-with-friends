# Chrome Web Store submission

Everything the dashboard will ask for, written out so it can be pasted in.
Read **Before you submit** first — there is one decision worth making.

---

## Before you submit

### 1. The name is the biggest rejection risk

"Krillion" is somebody else's product name. Store policy forbids using another
product's name in a way that suggests it is official or endorsed, and
**Krillion Puffer Party With Friends** leads with their trademark — it reads
like Krillion shipped it.

The convention reviewers accept is **"<thing> for <product>"**:

> **Party Joiner for Krillion**

That one word of grammar is the difference between "we are Krillion" and "we
work with Krillion". If you want to keep the current name, submit anyway — but
expect this to be what comes back, and the appeal is slower than the rename.

Changing it means editing `name` and `action.default_title` in
`extension/manifest.json`, and it does not affect how the extension works.

### 2. You need a developer account

A one-off **$5** registration fee, paid once per Google account, at
<https://chrome.google.com/webstore/devconsole>. This is yours to do — it needs
your Google login and your card.

### 3. Expect to be asked about automation

The extension presses "Take a seat" on krillion.io for the user. That is
legitimate — it does exactly what the user would do by hand, on a page they
opened themselves — but a reviewer may ask. The answer is in the single purpose
statement below.

---

## Listing

### Name
```
Krillion Puffer Party With Friends
```
*(recommended instead: `Party Joiner for Krillion`)*

### Short description
*Max 132 characters. This is 95.*
```
When one of you joins a Puffer Party room, the other is pulled into the same room automatically.
```

### Category
`Social & Communication`
*(second choice: `Fun`)*

### Language
`English (UK)`

### Detailed description
```
Puffer Party on krillion.io puts you in the fullest lobby it can find. That is good
for the game and terrible for friends, because the fullest lobby usually has exactly
one seat left. So you press Quick Play together, and get split up. Every time.

This fixes that.

HOW IT WORKS

Everyone types the same party name into the panel. That is the whole setup. No
account, no sign-in, nothing to register.

After that, one of you joins a room and everyone else is pulled into the same room
automatically. Their browser opens the room and takes their seat for them. They do
not have to click anything, and nobody has to read a four-letter code out loud.

It works whichever way you got in: the public room list, Join by code, Quick Play,
Rated, or hosting your own room.

FIND A ROOM FOR ALL OF US

Press Find room and it reads Krillion's live room list, picks a lobby with enough
free seats for everyone in your party, and takes you all there together. Choose the
size you want first: 1v1, 3s, 4-6, 8-10, 10+, or any.

ONCE YOU ARE ALL IN

The button becomes Hold to move, and asks for a four second press. Once you have all
got seats, one stray click should not drag everybody back out of the room you just
filled.

ALSO

- A friend arriving blinks in the list, with a short sound, so you notice mid-game
- See at a glance who is browsing, who is playing, and who has following switched off
- Four switches, all optional: stay connected, follow, take seat, play a sound
- Works in Chrome, Edge, Brave, Arc and other Chrome-based browsers

PRIVACY

There is no account and no server. The only thing that leaves your browser is a
four-letter room code, your Krillion display name, and whether following is on, sent
to the other browsers in your own party through a public MQTT broker.

No analytics. No tracking. No access to any site except krillion.io. Nothing is sold
or shared with anyone.

Because the broker is public, pick an unusual party name and treat it like a
password.

OPEN SOURCE

Every line is readable at
https://github.com/M9S4K/krillion-puffer-party-with-friends

Not affiliated with Krillion. It clicks the same buttons you would, and nothing else.
```

---

## Privacy practices tab

### Single purpose
```
The extension has one purpose: to put the members of a user-defined group into the
same Krillion Puffer Party game room. It shares the room code the user is currently
in with the other browsers that have typed the same party name, and opens that room
for them. Everything it does serves that one function.
```

### Permission justifications

**`storage`**
```
Stores the user's party name and their four preference switches, so they do not have
to retype the party name on every visit. Nothing else is stored.
```

**Host permission `https://krillion.io/*`**
```
The extension's entire interface is a panel injected into the Puffer Party page. It
needs this host to display that panel, to read the four-letter room code out of the
page URL, to read the display name the user has already typed into the game, and to
press the game's own "Take a seat" button on the user's behalf when they are
following a friend into a room.
```

**Host permission `https://party.krillion.io/*`**
```
Fetches Krillion's public list of open rooms so the extension can pick one with
enough free seats for the whole party. This request is made from the service worker
because the endpoint returns no CORS header and a content script cannot read it. The
request contains no user data.
```

**Remote code**
```
No. All code is contained in the package. The two fonts are embedded in the
stylesheet as data URIs, and nothing is fetched and executed at runtime.
```

### Data usage — what to tick

| Question | Answer |
| --- | --- |
| Personally identifiable information | **Yes** — the display name the user has set in the game |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | **Yes** — which game room the user is in |
| Website content | No |

### The three certifications
All three can be accepted truthfully:

- I do not sell or transfer user data to third parties, outside of the approved use cases — **yes**
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose — **yes**
- I do not use or transfer user data to determine creditworthiness or for lending purposes — **yes**

### Privacy policy URL
```
https://github.com/M9S4K/krillion-puffer-party-with-friends/blob/main/docs/PRIVACY.md
```

> Note: "sent to other users in the same party via a public MQTT broker" is a
> *transfer*, but it is squarely within the item's single purpose and is fully
> described in the privacy policy, so the certifications above still hold. Do not
> hide it — describe it, as the policy does.

---

## Graphics to upload

| Asset | Size | File |
| --- | --- | --- |
| Store icon | 128×128 | `extension/icons/icon128.png` |
| Screenshot 1 | 1280×800 | `docs/store/screenshot-1-on-the-page.png` |
| Screenshot 2 | 1280×800 | `docs/store/screenshot-2-together.png` |
| Screenshot 3 | 1280×800 | `docs/store/screenshot-3-sizes.png` |
| Screenshot 4 | 1280×800 | `docs/store/screenshot-4-settings.png` |

The small promo tile (440×280) and the marquee (1400×560) are optional. Skip
them unless you are pitching to be featured; the listing works without.

---

## Steps, in order

1. Decide on the name (see **Before you submit**).
2. Run `./tools/pack.sh` to build `krillion-party-joiner-<version>.zip`.
3. Register at <https://chrome.google.com/webstore/devconsole> and pay the $5.
4. **Add new item**, upload the zip.
5. Fill the **Store listing** tab from the copy above, upload the graphics.
6. Fill the **Privacy practices** tab from the justifications above, paste the
   privacy policy URL.
7. Under **Distribution**, choose Public, and all regions unless you want
   otherwise.
8. Submit for review.

Review usually takes a few days. Extensions with host permissions sometimes take
longer. If it is rejected, the email names the exact policy — send it over and it
can be addressed.

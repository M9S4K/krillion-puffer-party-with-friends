# Posting it on X

Lead with the problem. The extension is the punchline, not the pitch — by the
time you mention it, people should already be nodding along.

Attach `docs/video/krillion-party-joiner-15s.mp4` to the first post.

---

## The post

> me and my mate have this routine where we both open Krillion, hit Quick Play
> at the same second, and end up in two different rooms.
>
> took me embarrassingly long to work out why.
>
> matchmaking drops you in the fullest lobby it can find. and the fullest
> lobby, by definition, has one seat left.
>
> so it works perfectly. it just hates friends.
>
> anyway. built a thing 🦐

*Attach the video.*

---

## First reply

> you both type the same party name once. that's it, that's the setup — no
> account, no login, nothing to sign up for.
>
> after that whoever joins a room drags everyone else in behind them. their
> browser opens the room and takes their seat for them.
>
> free, open source, works in any chrome browser:
> github.com/M9S4K/krillion-puffer-party-with-friends

---

## If people ask how it works

> no server. the browsers talk to each other over a public MQTT broker and the
> only thing that ever travels is a 4-letter room code.
>
> the party name is the channel they talk on, which is why it tells you to pick
> a weird one.

> the button turns into "hold to move" once you're all in the same room. four
> seconds. because after you've finally got seats together, one stray click
> should not drag everyone back out.

---

## A shorter version, if you don't want to thread

> krillion matchmaking puts you in the fullest lobby it can find, which always
> has exactly one seat left, which means me and my mate never once landed in
> the same game.
>
> so: type the same party name, and whoever joins a room pulls the rest of the
> party in with them.
>
> free, no account 🦐
> github.com/M9S4K/krillion-puffer-party-with-friends

---

## Worth knowing

- **Put the video in the first post and the link in the reply.** X buries posts
  that contain links.
- **Lower case and no formatting reads as a person.** Bullet points and bold
  headings read as marketing, and get scrolled past.
- **Don't tag Krillion.** If they find it themselves it lands far better than
  being summoned.
- **The hook is the one-seat detail.** It is the bit that makes people go "oh,
  that's why" — everything else is downstream of it.
- A weekday morning US Eastern is the usual best window.

---

## The video

15 seconds, 1920x1080, animated rather than recorded:

- `tools/video-scenes.html` renders every text card and UI piece from the
  extension's own stylesheet, at exactly half of 1080p so they pixel-double
  cleanly and the type stays sharp
- the two krill are Krillion's own sprites
- `tools/make-video.py` animates it in ffmpeg: every position is an expression
  in `t`, with eased moves, a bob on each krill, and the room row dropping in
  with some overshoot

The beats: you both hit Quick Play, it drops you in the fullest lobby, the row
lands with one free seat, the red krill darts into it, the gold one bounces off
and drifts away, then the panel slides up and they end up side by side.

Re-render it with:

```bash
python3 tools/make-video.py
```

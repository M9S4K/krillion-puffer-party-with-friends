#!/usr/bin/env python3
"""Build the launch clip: 1920x1080, 30fps, ~15s, animated in ffmpeg.

Everything on screen is a layer in docs/video/layers, and every movement is an
expression in t. The text and UI layers are captured at exactly half size by
tools/video-scenes.html so they pixel-double with flags=neighbor and the pixel
type stays sharp. The two krill are the game's own sprites.

Re-render:  python3 tools/make-video.py
"""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
L = ROOT / "docs/video/layers"
OUT = ROOT / "docs/video/krillion-party-joiner-15s.mp4"
W, H, FPS, DUR = 1920, 1080, 30, 15.0
BG = "0x070f1c"           # the layers were captured on this, so no seams


# ---- easing helpers: every one returns an ffmpeg expression in t -----------
def p(t0, d):
    """progress 0..1 across d seconds from t0, clipped"""
    return f"clip((t-{t0})/{d},0,1)"


def ease(t0, d, a, b):
    """smoothstep from a to b"""
    q = p(t0, d)
    return f"({a}+({b}-{a})*({q}*{q}*(3-2*{q})))"


def overshoot(t0, d, a, b):
    """lands past the target and settles, for a drop with weight"""
    q = p(t0, d)
    return f"({a}+({b}-{a})*(1-pow(1-{q},3)*cos({q}*7)))"


def bob(amp, speed, phase=0.0):
    return f"{amp}*sin((t+{phase})*{speed})"


def seq(*moves):
    """chain eased moves: each is (t0, dur, a, b); holds the last value"""
    expr = str(moves[0][2])
    for t0, d, a, b in moves:
        expr = f"if(lt(t,{t0}),{expr},{ease(t0, d, a, b)})"
    return expr


# ---- the layers ------------------------------------------------------------
# name, file, prepare filter, x expr, y expr, visible from, to, fade
TEXT_Y = 96
LAYERS = [
    # the UI pieces, under the krill
    # the room row drops in with some weight
    dict(src="room.png", prep="crop=620:120:170:50,scale=1240:240:flags=neighbor",
         x="340", y=overshoot(2.45, .75, -260, 470),
         t0=2.45, t1=7.00, fade=0.25, z="under"),

    dict(src="panel_a.png", prep="crop=470:330:245:5,scale=940:660:flags=neighbor",
         x="490", y=ease(8.55, .6, 1180, 352),
         t0=8.55, t1=10.42, fade=0.2, z="under"),
    dict(src="panel_b.png", prep="crop=470:330:245:5,scale=940:660:flags=neighbor",
         x="490", y="352",
         t0=10.42, t1=13.00, fade=0.12, z="under"),

    # the two krill, under the text and over everything else
    dict(src="krill-red.png", prep="scale=232:232:flags=neighbor",
         x=seq((0.15, .8, -260, 700),          # swims in from the left
               (4.10, .40, 700, 846),          # darts at the one free seat
               (7.00, .60, 846, 660),          # comes back out
               (10.45, .55, 660, 700),         # settles beside the panel
               (13.30, .80, 812, 2100)),       # off
         y="(" + seq((0.15, .8, 690, 690),
                     (4.10, .40, 690, 548),    # up into the room row
                     (7.00, .60, 548, 700),
                     (8.50, .55, 700, 892)) + f")+{bob(13, 2.6)}",
         t0=0.0, t1=DUR, fade=0.0),

    dict(src="krill-gold.png", prep="hflip,scale=232:232:flags=neighbor",
         x=seq((0.15, .85, 2120, 1010),        # swims in from the right
               (4.30, .22, 1010, 918),         # bumps the full room
               (4.52, .45, 918, 1180),         # and bounces off it
               (5.40, 1.3, 1180, 1540),        # drifts away, split up
               (7.05, .70, 1540, 1040),        # back for the fix
               (10.60, .55, 1040, 1004),       # joins the other one
               (13.30, .90, 1004, 2200)),
         y="(" + seq((0.15, .85, 700, 700),
                     (5.40, 1.3, 700, 858),
                     (7.05, .70, 858, 700),
                     (8.55, .55, 700, 892)) + f")+{bob(15, 2.2, 0.8)}",
         t0=0.0, t1=DUR, fade=0.0),

    # text, screen-blended so the black card disappears
    dict(src="t1.png", y=str(TEXT_Y), t0=0.35, t1=2.15, text=True),
    dict(src="t2.png", y=str(TEXT_Y), t0=2.25, t1=4.00, text=True),
    dict(src="t3.png", y=str(TEXT_Y), t0=4.08, t1=5.20, text=True),
    dict(src="t4.png", y=str(TEXT_Y), t0=5.32, t1=6.95, text=True),
    dict(src="t5.png", y=str(TEXT_Y), t0=7.05, t1=8.40, text=True),
    dict(src="t6.png", y=str(TEXT_Y), t0=8.50, t1=10.30, text=True),
    dict(src="t7.png", y=str(TEXT_Y), t0=10.50, t1=12.35, text=True),
    dict(src="t8.png", y=str(TEXT_Y), t0=12.45, t1=13.20, text=True),

    # the end card is full frame and covers everything
    dict(src="endcard.png", prep=f"scale={W}:{H}:flags=neighbor",
         x="0", y="0", t0=13.30, t1=DUR, fade=0.35),
]


def build():
    missing = [d["src"] for d in LAYERS if not (L / d["src"]).exists()]
    if missing:
        sys.exit("missing layers: " + ", ".join(missing))

    ins, fc = [], []
    fc.append(f"color=c={BG}:s={W}x{H}:r={FPS}:d={DUR},format=rgba[bg]")

    prev = "[bg]"
    for i, d in enumerate(LAYERS):
        # every layer is looped to the full duration so fade can work off
        # real timestamps rather than a single still's t=0
        ins += ["-loop", "1", "-t", str(DUR), "-i", str(L / d["src"])]
        lab = f"l{i}"
        f = d.get("fade", 0.18)
        if d.get("text"):
            # pad the strip out to a full frame: screen blend needs both
            # inputs the same size, and black pad adds nothing
            prep = (f"scale=iw*2:ih*2:flags=neighbor,"
                    f"pad={W}:{H}:0:{TEXT_Y}:black,format=rgba")
            fades = (f",fade=t=in:st={d['t0']}:d={f},"
                     f"fade=t=out:st={d['t1']-f}:d={f}")
        else:
            prep = d.get("prep", "scale=iw*2:ih*2:flags=neighbor") + ",format=rgba"
            fades = (f",fade=t=in:st={d['t0']}:d={f}:alpha=1,"
                     f"fade=t=out:st={d['t1']-f}:d={f}:alpha=1") if f > 0 else ""
        fc.append(f"[{i}:v]{prep}{fades}[{lab}]")

        x = d.get("x", str((W - 1920) // 2))
        y = d["y"]
        en = f":enable='between(t,{d['t0']},{d['t1']})'"
        out = f"[s{i}]"
        if d.get("text"):
            # white on black: screen blend drops the card and keeps the glyphs
            fc.append(f"{prev}[{lab}]blend=all_mode=screen:shortest=0"
                      f":enable='between(t,{d['t0']},{d['t1']})'{out}")
        else:
            # quote the expressions: they contain commas, which otherwise
            # split the filter's own argument list
            fc.append(f"{prev}[{lab}]overlay=x='{x}':y='{y}'{en}:format=auto{out}")
        prev = out

    fc.append(f"{prev}fade=t=in:st=0:d=0.3,fade=t=out:st={DUR-0.4}:d=0.4,"
              f"format=yuv420p[out]")

    cmd = (["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + ins +
           ["-filter_complex", ";".join(fc), "-map", "[out]", "-t", str(DUR),
            "-c:v", "libx264", "-preset", "slow", "-crf", "19",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", str(FPS),
            str(OUT)])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    log = pathlib.Path("/tmp/kpj-ffmpeg.log")
    r = subprocess.run(cmd, capture_output=True, text=True)
    log.write_text(r.stderr or "")
    if r.returncode:
        sys.exit(f"ffmpeg failed, see {log}:\n" + (r.stderr or "")[-700:])
    print(f"{OUT.name}  {OUT.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    build()

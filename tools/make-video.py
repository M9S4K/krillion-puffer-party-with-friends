#!/usr/bin/env python3
"""Compose the 15-second clip from the scene stills, in code.

Each scene gets a slow push in or out so nothing sits still, and the cuts are
cross-fades except one hard cut on "One seat." for the punch. 1280x720, 30fps,
H.264, under 2MB so it uploads anywhere.
"""
import subprocess, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FR = ROOT / "docs/video/frames"
OUT = ROOT / "docs/video/krillion-party-joiner-15s.mp4"
FPS = 30
XF = 0.3                                   # cross-fade length

# The capture draws the OS pointer into every still at the same spot. delogo
# interpolates it away from the flat background. Scene 6 keeps it: there the
# pointer sits on the button and reads as someone about to press it.
CURSOR = "delogo=x=630:y=476:w=38:h=44"

#      still      hold   zoom     transition into the NEXT scene
SCENES = [
    ("scene-1.png", 2.1, "in",  "fade"),   # you press quick play together
    ("scene-2.png", 2.6, "in",  "fade"),   # the fullest lobby
    ("scene-3.png", 1.4, "out", "cut"),    # one seat
    ("scene-4.png", 1.8, "in",  "fade"),   # split up, every time
    ("scene-5.png", 1.7, "out", "fade"),   # so i fixed it
    ("scene-6.png", 2.3, "in",  "fade"),   # the panel
    ("scene-7.png", 2.1, "out", "fade"),   # one joins, everyone follows
    ("scene-8.png", 2.3, "in",  None),     # end card
]

def clip(idx, name, dur, zoom):
    frames = max(2, int(round(dur * FPS)))
    # zoom across the clip, computed per output frame; rendered from a 2x
    # source and scaled back, because zoompan stair-steps at 1x
    if zoom == "in":
        z = f"1.015+0.055*on/{frames}"
    else:
        z = f"1.07-0.055*on/{frames}"
    clean = "" if name == "scene-6.png" else f"{CURSOR},"
    return (f"[{idx}:v]{clean}scale=2560:1440,"
            f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s=1280x720:fps={FPS},setsar=1,format=yuv420p[v{idx}]")

ins, parts = [], []
for i, (name, dur, zoom, _) in enumerate(SCENES):
    p = FR / name
    if not p.exists():
        sys.exit(f"missing {p}")
    # one frame in, and zoompan's d= decides the length. Looping the input
    # instead makes zoompan emit d frames per input frame, and 15s becomes 145.
    ins += ["-i", str(p)]
    parts.append(clip(i, name, dur, zoom))

# One filter for every join. A "cut" is just a very short fade, which looks
# like a hard cut and keeps one timebase through the chain - mixing in concat
# gives "timebase 1/1000000 does not match 1/30".
CUT = 0.06
chain, prev, elapsed = [], "[v0]", SCENES[0][1]
for i in range(1, len(SCENES)):
    d = CUT if SCENES[i-1][3] == "cut" else XF
    out = f"[c{i}]"
    off = elapsed - d
    chain.append(f"{prev}[v{i}]xfade=transition=fade:duration={d}:offset={off:.3f}{out}")
    elapsed += SCENES[i][1] - d
    prev = out

# a short fade up from black at the top and out to black at the end
chain.append(f"{prev}fade=t=in:st=0:d=0.35,"
             f"fade=t=out:st={elapsed-0.45:.3f}:d=0.45[out]")

cmd = (["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + ins +
       ["-filter_complex", ";".join(parts + chain), "-map", "[out]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", str(FPS),
        str(OUT)])
OUT.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(cmd, check=True)
print(f"{OUT.name}  {OUT.stat().st_size/1e6:.2f} MB  ~{elapsed:.1f}s")

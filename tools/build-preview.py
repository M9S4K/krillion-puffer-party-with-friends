#!/usr/bin/env python3
"""Regenerate ui-preview.html from the extension's own CSS and markup.

    python3 tools/build-preview.py

The preview shows every panel state plus a design lab: sliders that rewrite the
token block live. "Copy tokens" puts the result on the clipboard, ready to paste
back into extension/content.css.
"""
import json, re, pathlib

import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent

def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True).stdout

def versions():
    """Working copy first, then every commit that touched the panel."""
    out = [("working", "Working copy",
            (ROOT / 'extension/content.css').read_text(),
            (ROOT / 'extension/content.js').read_text())]
    log = git('log', '--format=%h\x1f%cs\x1f%s', '--', 'extension/content.css').strip()
    for line in filter(None, log.splitlines()):
        sha, date, subject = line.split('\x1f')
        c = git('show', f'{sha}:extension/content.css')
        j = git('show', f'{sha}:extension/content.js')
        if c and j:
            out.append((sha, f'{date} · {subject[:38]}', c, j))
    return out

VERSIONS = versions()
css = VERSIONS[0][2]
js = VERSIONS[0][3]

def build_frame(css_text, js_text):
    """One self-contained document: a version's stylesheet around its own markup."""
    preview_css = css_text.replace(
        "  position: fixed; inset-inline-start: 14px; bottom: 14px; z-index: 2147483000;\n"
        "  width: var(--w); max-width: calc(100vw - 28px);",
        "  position: relative; z-index: 1;\n  width: var(--w);")

    tpl = re.search(r'root\.innerHTML = `(.*?)`;\n', js_text, re.S).group(1)
    def pick(pattern, fallback=''):
        m = re.search(pattern, tpl, re.S)
        return m.group(1) if m else fallback
    INFO = pick(r'(<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6".*?</svg>)')
    HIDE = pick(r'(<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3\.5 8h9".*?</svg>)',
                '<svg viewBox="0 0 16 16"><path d="M3.5 8h9" stroke-linecap="round"/></svg>')
    GEAR = pick(r'(<svg viewBox="0 0 24 24".*?</svg>)')
    has_shelf = 'kpj-shelf' in css_text
    has_settings = 'kpj-set' in css_text

    PILL = '<button id="kpj-pill"><i class="kpj-dot live"></i><span>Party &middot; 2</span></button>'

    def top(name='puffa-boy'):
        val = f'value="{name}"' if name else 'value="" placeholder="name your party"'
        gear = f'<button id="kpj-gear">{GEAR}</button>' if GEAR else ''
        if 'kpj-kicker' in css_text:
            idblock = ('<div id="kpj-id">'
                       '<div id="kpj-kicker-row"><span id="kpj-kicker">Party</span>'
                       + (f'<button id="kpj-info">{INFO}</button>' if INFO else '')
                       + '<span id="kpj-tip">Both of you type the same party name. Only room codes travel.</span></div>'
                       f'<input id="kpj-name-input" type="text" {val} aria-label="Party name"></div>')
        else:
            idblock = '<div id="kpj-name">Party &middot; puffa-boy</div>'
        dot = '' if 'kpj-id' in css_text else '<i class="kpj-dot live"></i>'
        return (f'<div id="kpj-top">{dot}{idblock}{gear}'
                f'<button id="kpj-close">{HIDE}</button></div>')

    if 'kpj-cta' in css_text:
        ACTS = ('<div id="kpj-acts"><div id="kpj-cta">'
                '<select id="kpj-size"><option>4-6</option></select>'
                '<button id="kpj-go">Find a room</button></div></div>')
    else:
        ACTS = ('<div id="kpj-acts">'
                + ('<select id="kpj-size"><option>4-6</option></select>' if 'kpj-size' in css_text else '')
                + '<button id="kpj-go">Find a room</button></div>')

    def row(cls, name, me, status):
        dot = ' live' if cls != ' kpj-away' else ''
        return (f'<div class="kpj-who-row{cls}"><i class="kpj-dot{dot}"></i><b>{name}</b>'
                + ('<em class="kpj-me">(you)</em>' if me else '') + f'<span>{status}</span></div>')

    def tail():
        if 'kpj-invite' in css_text:
            return ('<div class="kpj-who-row kpj-away"><i class="kpj-dot kpj-ghost"></i>'
                    '<button class="kpj-invite" type="button">Invite +</button></div>')
        return '<div class="kpj-who-row kpj-away"><i class="kpj-dot"></i><b>Waiting</b></div>'

    WHO_T = ('<div id="kpj-who">' + row(' kpj-same', 'puffa', True, 'in UCYU')
             + row(' kpj-same', 'dave', False, 'with you') + row(' kpj-same', 'sam', False, 'with you')
             + tail() + '</div>')
    WHO_A = ('<div id="kpj-who">' + row('', 'puffa', True, 'browsing') + row('', 'dave', False, 'too late')
             + tail() + '</div>')
    WHO_S = '<div id="kpj-who">' + row('', 'puffa', True, 'browsing') + tail() + '</div>'

    def stack(cls, inner, msg):
        if not inner:
            return f'<div id="kpj" class="{cls}">{PILL}</div>'
        if has_shelf:
            body = (f'<div id="kpj-stack"><div id="kpj-panel">{inner}</div>'
                    f'<div id="kpj-shelf"><span id="kpj-msg">{msg}</span></div></div>')
        else:
            body = (f'<div id="kpj-stack"><div id="kpj-panel">{inner}'
                    f'<div id="kpj-msg">{msg}</div></div></div>')
        return f'<div id="kpj" class="{cls}">{PILL}{body}</div>'

    states = [
        ("Collapsed", "How it sits while you play.", stack("", "", "")),
        ("Three up", "A party is however many turn up.", stack("open", top() + WHO_T + ACTS, "UCYU &middot; 4/6 - going in.")),
        ("Apart", "They started without you.", stack("open", top() + WHO_A + ACTS, "dave went to QMLL - following.")),
        ("Alone", "Nobody there yet.", stack("open", top() + WHO_S + ACTS, "Linked - waiting for your friend")),
        ("First run", "Nothing to configure but the name.", stack("open", top('') + WHO_S + ACTS, "Name your party above, same on both machines.")),
    ]
    cards = "\n".join(f'<figure><div class="stage">{h}</div><figcaption><b>{n}</b>{d}</figcaption></figure>'
                      for n, d, h in states)

    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 26px 22px 40px; background: #061324;
    background-image: radial-gradient(900px 500px at 20% -10%, rgba(40,90,150,.35), transparent),
                      radial-gradient(700px 400px at 90% 10%, rgba(20,70,120,.3), transparent);
    color: #e8f3ff; font: .8125rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .grid { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
  figure { margin: 0; }
  .stage { background: rgba(4,12,24,.5); border: 1px dashed rgba(125,180,255,.14);
    border-radius: 14px; padding: 26px 22px 22px; min-width: 330px; display: flex; justify-content: center; }
  figcaption { margin-top: 10px; max-width: 330px; font-size: .75rem; color: #9fb6d2; }
  figcaption b { display: block; color: #e8f3ff; letter-spacing: .09em; font-weight: 400; margin-bottom: 3px; }
""" + preview_css + """
  #kpj.open #kpj-panel { opacity: 1; transform: none; }
  figure:nth-child(2) #kpj-tip { opacity: 1; visibility: visible; transform: none; }
</style></head><body><div class="grid">""" + cards + """</div>
<style id="kpj-override"></style></body></html>"""


FRAMES = [{"id": vid, "label": label, "doc": build_frame(c, j)} for vid, label, c, j in VERSIONS]

# slider: (css var, label, min, max, step, default, unit, group, scoped?)
CONTROLS = [
("sea-c",   "Sea chroma",      0.3,  2.0,  0.05,  1,     "x",   "Colour", 0),
    ("acc-c",   "Accent chroma",   0.2,  1.6,  0.05,  1,     "x",   "Colour", 0),
    ("w",       "Panel width",   200,   360,   2,   306,     "px",  "Shape", 0),
    ("r-outer", "Outer radius",    0,    32,   1,    20,     "px",  "Shape", 1),
    ("r-inner", "Inner radius",    0,    28,   1,    18,     "px",  "Shape", 1),
    ("corner-k","Corner smoothing", 0.5,  8,  .1,     1,     "",    "Shape", 1),
    ("pad",     "Card padding",    6,    24,   1,    15,     "px",  "Spacing", 0),
    ("pad-head","Header padding",  2,    20,   1,     8,     "px",  "Spacing", 0),
    ("gap-row", "Row gap",         0,    16,   1,     5,     "px",  "Spacing", 0),
    ("cta-h",   "Button height",  26,    52,   1,    34,     "px",  "Spacing", 0),
    ("fs-body", "Body size",      11,    18,  .5,    14,     "px",  "Type", 0),
    ("fs-label","Label size",      9,    16,  .5,    13,     "px",  "Type", 0),
    ("fs-kicker","Kicker size",    7,    14,  .5,   9.5,     "px",  "Type", 0),
    ("lip-a",   "Top highlight",   0,   0.3,  .005,  .07,    "",    "Depth", 0),
    ("lift-a",  "Drop shadow",     0,   0.8,  .01,   .4,     "",    "Depth", 0),
    ("stroke-w",     "Stroke width",     0,    4,  .5,   1.5, "px", "Stroke", 1),
    ("stroke-a",     "Stroke alpha",     0,    1,  .01,  .50, "",   "Stroke", 1),
    ("stroke-mix",   "Gradient amount",  0,  100,   1,     0, "%",  "Stroke", 1),
    ("stroke-angle", "Gradient angle",   0,  360,   5,   195, "deg","Stroke", 1),
]

PICKERS = [
    ("sea",    "Sea",    "Colour", "#4d6489"),
    ("acc",    "Accent", "Colour", "#4effb2"),
    ("stroke", "Stroke", "Stroke", "#1c3050"),
]

ELEMENTS = [
    ("All elements",  "all",              "all"),
    ("Panel",         "#kpj-panel",       "#kpj #kpj-panel"),
    ("Pill",          "#kpj-pill",        "#kpj button#kpj-pill"),
    ("Header",        "#kpj-top",         "#kpj #kpj-top"),
    ("Party name",    "#kpj-name-input",  "#kpj #kpj-name-input"),
    ("Kicker",        "#kpj-kicker",      "#kpj #kpj-kicker"),
    ("Rows",          "#kpj-who",         "#kpj #kpj-who"),
    ("Invite",        ".kpj-invite",      "#kpj button.kpj-invite"),
    ("Button",        "#kpj-cta",         "#kpj #kpj-cta"),
    ("Button label",  "#kpj-go",          "#kpj button#kpj-go"),
    ("Size chip",     "#kpj-size",        "#kpj #kpj-size"),
    ("Status line",   "#kpj-msg",         "#kpj #kpj-msg"),
    ("Tooltip",       "#kpj-tip",         "#kpj #kpj-tip"),
]

# per-element inspector: (key, label, kind, min, max, step, unit, css property, what it does)
PROPS = [
    ("width",   "Width",            "range", 0,   420, 2,   "px", "width",
     "How wide the element is. 0 leaves it as the layout decides."),
    ("height",  "Height",           "range", 0,   120, 1,   "px", "min-height",
     "Smallest height it can be; content can still push it taller."),
    ("padding", "Padding",          "range", 0,    40, 1,   "px", "padding",
     "Space inside the element, between its edge and its content."),
    ("margin",  "Margin",           "range", 0,    40, 1,   "px", "margin",
     "Space outside the element, pushing its neighbours away."),
    ("gap",     "Gap",              "range", 0,    30, 1,   "px", "gap",
     "Space between this element's children. Only bites on rows and stacks."),
    ("radius",  "Corner radius",    "range", 0,    40, 1,   "px", "border-radius",
     "How round the corners are."),
    ("corner",  "Corner smoothing", "range", 0.5,   8, .1,  "",   "corner-shape",
     "2 is a plain round corner, 4 a squircle, 1 a straight chamfer."),
    ("fs",      "Font size",        "range", 8,    24, .5,  "px", "font-size",
     "Text size inside this element."),
    ("ls",      "Letter spacing",   "range", -0.02, .3, .005, "em", "letter-spacing",
     "Space between letters. Uppercase labels want more."),
    ("sw",      "Stroke width",     "range", 0,     6, .5,  "px", "border-width",
     "Thickness of the border on every side."),
    ("opacity", "Opacity",          "range", 0,     1, .01, "",   "opacity",
     "Transparency of the whole element, contents included."),
    ("shadow",  "Shadow",           "range", 0,    40, 1,   "px", "box-shadow",
     "Drop shadow depth beneath the element."),
    ("color",   "Text colour",      "color", 0, 0, 0, "", "color",
     "Colour of the text in this element."),
    ("bg",      "Background",       "color", 0, 0, 0, "", "background",
     "Flat fill behind the element. Replaces its gradient."),
    ("stroke",  "Stroke colour",    "color", 0, 0, 0, "", "border-color",
     "Colour of the border."),
]

def info(text):
    if not text:
        return ""
    return f'<i class="lab-i" tabindex="0" data-info="{text}">i</i>'

TOKEN_INFO = {
    "sea": "Base colour of the card. The whole navy ramp is rebuilt from it.",
    "acc": "Colour of the main button and the with-you state.",
    "stroke": "Colour every border is drawn in.",
    "sea-c": "Multiplies the sea ramp's colourfulness. 1x keeps the picked colour.",
    "acc-c": "Multiplies the accent ramp's colourfulness.",
    "w": "Width of the whole panel and the card behind it.",
    "r-outer": "Corner radius of the card itself.",
    "r-inner": "Corner radius of things inside the card: button, chip, tooltip.",
    "corner-k": "Corner curve. 2 is round, 4 a squircle, 1 a straight chamfer.",
    "pad": "Space inside the card, around every block.",
    "pad-head": "Space above and below the party name block.",
    "gap-row": "Space between the people rows.",
    "cta-h": "Height of the Find a room button and its size chip.",
    "fs-body": "Size of names and the button label.",
    "fs-label": "Size of the room status, the status line and the chip.",
    "fs-kicker": "Size of the small PARTY label above the name.",
    "lip-a": "Strength of the 1px highlight along the top of raised surfaces.",
    "lift-a": "Strength of the shadow the card casts on the page.",
    "stroke-w": "Thickness of every border.",
    "stroke-a": "Transparency of the stroke colour.",
    "stroke-mix": "0% is a flat stroke. Higher blends toward the opposite hue.",
    "stroke-angle": "Direction the stroke gradient runs.",
}

groups = {}
for c in CONTROLS:
    groups.setdefault(c[7], []).append(c)

lab_rows = ('<label class="lab-row lab-target"><span>Editing</span>'
            '<select id="lab-target">'
            + "".join(f'<option value="{sel}" data-solid="{solid}">{label}</option>' for label, sel, solid in ELEMENTS)
            + '</select><output id="lab-scope-note"></output></label>')
lab_rows += '<div id="lab-global">'
pickers = {}
for k, label, g, hexv in PICKERS:
    pickers.setdefault(g, []).append((k, label, hexv))

for g, items in groups.items():
    lab_rows += f'<h2>{g}</h2>'
    for k, label, hexv in pickers.get(g, []):
        lab_rows += (f'<label class="lab-row"><span>{label}{info(TOKEN_INFO.get(k, ""))}</span>'
                     f'<input type="color" data-pick="{k}" value="{hexv}">'
                     f'<output data-for="pick-{k}">{hexv}</output></label>')
    for key, label, lo, hi, step, dflt, unit, _, scoped in items:
        lab_rows += (f'<label class="lab-row"><span>{label}{info(TOKEN_INFO.get(key, ""))}</span>'
                     f'<input type="range" data-k="{key}" data-unit="{unit}" data-scoped="{scoped}" '
                     f'min="{lo}" max="{hi}" step="{step}" value="{dflt}">'
                     f'<output data-for="{key}">{dflt}{unit}</output></label>')
lab_rows += '</div>'

VERSION_OPTIONS = ''.join(f'<option value="{f["id"]}">{f["label"]}</option>' for f in FRAMES)

PROPS_JSON = json.dumps([
    {"k": k, "label": lb, "kind": kind, "min": lo, "max": hi, "step": st,
     "unit": u, "css": css, "info": note}
    for k, lb, kind, lo, hi, st, u, css, note in PROPS
])
ELEMENTS_JSON = json.dumps({sel: ov for _, sel, ov in ELEMENTS})

HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Party Joiner UI</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 0; background: #061324;
    background-image: radial-gradient(900px 500px at 20% -10%, rgba(40,90,150,.35), transparent),
                      radial-gradient(700px 400px at 90% 10%, rgba(20,70,120,.3), transparent);
    color: #e8f3ff; font: .8125rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: .75rem; letter-spacing: .14em; text-transform: uppercase; margin: 0 0 4px; color: #9fc2ff; }
  .sub { color: #9fb6d2; font-size: .75rem; margin: 0 0 26px; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  figure { margin: 0; }
  .stage { background: rgba(4,12,24,.5); border: 1px dashed rgba(125,180,255,.14);
    border-radius: 14px; padding: 26px 22px 22px; min-width: 292px; display: flex; justify-content: center; }
  figcaption { margin-top: 10px; max-width: 292px; font-size: .75rem; color: #9fb6d2; }
  figcaption b { display: block; color: #e8f3ff; letter-spacing: .09em; font-weight: 400; margin-bottom: 3px; }

  /* design lab */
  #lab { position: fixed; top: 0; right: 0; bottom: 0; width: 288px; overflow-y: auto;
    padding: 18px 18px 26px; background: rgba(4,11,22,.95); border-left: 1px solid rgba(125,180,255,.16);
    backdrop-filter: blur(8px); }
  #lab h2 { font-size: .6875rem; letter-spacing: .14em; text-transform: uppercase;
    color: #6d8cb4; margin: 18px 0 8px; font-weight: 400; }
  #lab h2:first-of-type { margin-top: 10px; }
  .lab-row { display: grid; grid-template-columns: 1fr 104px 46px; align-items: center;
    gap: 8px; padding: 3px 0; font-size: .75rem; color: #c7d9ee; }
  .lab-row output { color: #6d8cb4; text-align: right; font-size: .6875rem; }
  .lab-row output.overridden { color: #35d49a; }
  .lab-row input:disabled { opacity: .3; }
  .lab-target { grid-template-columns: 1fr 104px 46px; margin-bottom: 4px; }
  .lab-target select { width: 104px; font: inherit; font-size: .6875rem; color: #e8f3ff;
    background: rgba(10,22,44,.9); border: 1px solid rgba(125,180,255,.3); border-radius: 6px; padding: 4px 6px; }
  #lab-scope-note { color: #35d49a; }
  .lab-row input[type=range] { width: 104px; accent-color: #35d49a; }
  .lab-row input[type=color] { width: 104px; height: 24px; padding: 0; cursor: pointer;
    background: transparent; border: 1px solid rgba(125,180,255,.3); border-radius: 6px; }
  #lab-actions { display: grid; gap: 7px; margin-top: 20px; }
  #lab button { font: inherit; font-size: .75rem; letter-spacing: .06em; cursor: pointer;
    padding: 9px; border-radius: 8px; color: #d7fff0;
    background: rgba(53,212,154,.16); border: 1px solid rgba(53,212,154,.42); }
  #lab button.ghost { background: transparent; border-color: rgba(125,180,255,.24); color: #9db5d3; }
  #lab button:hover { filter: brightness(1.2); }
  .lab-i { display: inline-grid; place-items: center; width: 12px; height: 12px; margin-left: 5px;
    border: 1px solid rgba(125,180,255,.4); border-radius: 50%; font-style: normal;
    font-size: .5rem; color: #6d8cb4; cursor: help; position: relative; vertical-align: 1px; }
  .lab-i:hover, .lab-i:focus-visible { color: #e8f3ff; border-color: #35d49a; outline: none; }
  .lab-i::after { content: attr(data-info); position: absolute; right: 0; top: calc(100% + 6px);
    width: 196px; padding: 7px 9px; border-radius: 8px; z-index: 5;
    background: #0d1c31; border: 1px solid rgba(125,180,255,.3); color: #c7d9ee;
    font-size: .625rem; line-height: 1.45; text-align: left; letter-spacing: 0;
    opacity: 0; visibility: hidden; transform: translateY(-2px);
    transition: opacity 150ms ease-out, transform 150ms ease-out, visibility 150ms; }
  .lab-i:hover::after, .lab-i:focus-visible::after { opacity: 1; visibility: visible; transform: none; }
  #lab-el h2 { margin-top: 10px; color: #35d49a; }
  #lab-note { margin: 12px 0 0; font-size: .625rem; color: #6d8cb4; line-height: 1.5; }
  #stage { position: fixed; inset: 0 288px 0 0; width: calc(100% - 288px); height: 100%;
    border: 0; background: #061324; }
  #lab-out { margin-top: 8px; font-size: .625rem; color: #6d8cb4; white-space: pre-wrap;
    word-break: break-all; max-height: 150px; overflow: auto; }
  #stage { position: fixed; inset: 0 288px 0 0; width: calc(100% - 288px); height: 100%;
    border: 0; background: #061324; }
</style></head>
<body>
  <iframe id="stage" title="Panel preview"></iframe>

  <aside id="lab">
    <h1>Design lab</h1>
    <label class="lab-row lab-target"><span>Version</span>
      <select id="lab-version">VERSION_OPTIONS</select>
      <output id="lab-ver-note"></output></label>
""" + lab_rows + """
    <div id="lab-el" hidden>
      <h2 id="lab-el-name">Element</h2>
      <div id="lab-el-rows"></div>
    </div>
    <div id="lab-actions">
      <button id="lab-copy">Copy tokens</button>
      <button id="lab-clear" class="ghost" hidden>Clear this element</button>
      <button id="lab-reset" class="ghost">Reset all</button>
    </div>
    <p id="lab-note"></p>
    <pre id="lab-out"></pre>
  </aside>

<script>
const FRAMES = FRAMES_PLACEHOLDER;
const PROPS = PROPS_PLACEHOLDER;
const OVERRIDE = ELEMENTS_PLACEHOLDER;
const SEA = [[950,.144,.024],[900,.190,.034],[850,.231,.047],[800,.270,.056],[700,.309,.064],
             [600,.400,.066],[500,.500,.066],[400,.660,.061],[300,.780,.045],[200,.880,.030],[100,.956,.021]];
const ACC = [[700,.643,.125],[600,.763,.160],[500,.892,.179],[400,.933,.100],[300,.973,.055],[100,.990,.022]];
const el = id => document.getElementById(id);
const sliders = [...document.querySelectorAll('#lab input[type=range]')];
const target = el('lab-target');
const stage = el('stage');
const verSel = el('lab-version');
let doc = null;                         // the live document inside the stage

function loadVersion(id) {
  const f = FRAMES.find(x => x.id === id) || FRAMES[0];
  stage.srcdoc = f.doc;
  el('lab-ver-note').textContent = id === 'working' ? 'live' : 'old';
  stage.onload = () => {
    doc = stage.contentDocument;
    apply();
    if (target.value !== 'all') buildInspector(target.value);
  };
}

const picks = [...document.querySelectorAll('#lab input[type=color]')];
const base = {};                       // slider defaults, straight from the stylesheet
for (const s of sliders) base[s.dataset.k] = s.getAttribute('value');
for (const c of picks) base['pick-' + c.dataset.pick] = c.getAttribute('value');

// sRGB hex -> OKLCH, so a picked colour can drive a whole ramp
function hex2oklch(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const r = f(n >> 16 & 255), g = f(n >> 8 & 255), b = f(n & 255);
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s2 = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  const L = .2104542553*l + .7936177850*m - .0040720468*s2;
  const A = 1.9779984951*l - 2.4285922050*m + .4505937099*s2;
  const B = .0259040371*l + .7827717662*m - .8086757660*s2;
  const C = Math.hypot(A, B);
  let H = Math.atan2(B, A) * 180 / Math.PI; if (H < 0) H += 360;
  return { L, C, H };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let state = { ...base };               // what every element inherits
let scoped = {};                       // { '#kpj-cta': { 'stroke-w': '3' } }

const px = (k, v) => `  --${k}: ${v}px;\\n`;
const rem = (k, v) => `  --${k}: ${(v/16).toFixed(4)}rem;\\n`;

function strokeBlock(v) {
  const k = hex2oklch(v['pick-stroke']);
  return `  --stroke-w: ${v['stroke-w']}px;\\n  --stroke-l: ${k.L.toFixed(3)};\\n`
       + `  --stroke-c: ${k.C.toFixed(3)};\\n  --stroke-h: ${k.H.toFixed(0)};\\n  --stroke-a: ${v['stroke-a']};\\n`
       + `  --stroke-h2: ${((k.H + 180) % 360).toFixed(0)};\\n  --stroke-mix: ${v['stroke-mix']}%;\\n`
       + `  --stroke-angle: ${v['stroke-angle']}deg;\\n`;
}

function globalTokens() {
  const v = state;
  let out = '';
  const sea = hex2oklch(v['pick-sea']), acc = hex2oklch(v['pick-acc']);
  const dSea = sea.L - .500, kSea = sea.C / .066 * v['sea-c'];
  const dAcc = acc.L - .892, kAcc = acc.C / .179 * v['acc-c'];
  for (const [step, L, C] of SEA)
    out += `  --navy-${step}: oklch(${clamp(L + dSea, .02, .99).toFixed(3)} ${(C * kSea).toFixed(3)} ${sea.H.toFixed(0)});\\n`;
  for (const [step, L, C] of ACC)
    out += `  --mint-${step}: oklch(${clamp(L + dAcc, .02, .99).toFixed(3)} ${(C * kAcc).toFixed(3)} ${acc.H.toFixed(0)});\\n`;
  out += px('w', v['w']) + px('r-outer', v['r-outer']) + px('r-inner', v['r-inner']) + px('pad', v['pad']);
  out += px('pad-head', v['pad-head']) + px('gap-row', v['gap-row']) + px('cta-h', v['cta-h']);
  out += rem('fs-body', v['fs-body']) + rem('fs-label', v['fs-label']) + rem('fs-kicker', v['fs-kicker']);
  out += `  --lip-a: ${v['lip-a']};\\n  --lift-a: ${v['lift-a']};\\n`;
  out += strokeBlock(v) + `  --corner-k: ${v['corner-k']};\\n`;
  return out;
}

function scopedTokens(sel) {
  const o = scoped[sel] || {};
  const keys = Object.keys(o);
  if (!keys.length) return '';
  let out = '';
  for (const k of keys) {
    const v = o[k];
    if (k === 'stroke-mix') out += `  --stroke-mix: ${v}%;\\n`;
    else if (k === 'stroke-angle') out += `  --stroke-angle: ${v}deg;\\n`;
    else if (['stroke-w','r-outer','r-inner','pad-head','gap-row','cta-h'].includes(k)) out += px(k, v);
    else out += `  --${k}: ${v};\\n`;
  }
  // elements whose stroke is a plain border need the colour restated
  const opt = [...target.options].find(t => t.value === sel);
  if (opt && opt.dataset.solid === '1' && keys.some(k => k.startsWith('stroke-'))) {
    const m = { ...state, ...o };
    out += `  border-color: oklch(${m['stroke-l']} ${m['stroke-c']} ${m['stroke-h']} / ${m['stroke-a']});\\n`;
  }
  if (keys.includes('r-outer') || keys.includes('r-inner'))
    out += `  border-radius: ${o['r-outer'] ?? o['r-inner']}px;\\n`;
  return `${sel} {\\n${out}}\\n`;
}

let elOver = {};   // { '#kpj-cta': { padding: '12', color: '#fff' } }

function elDecl(sel) {
  const o = elOver[sel] || {};
  const keys = Object.keys(o);
  if (!keys.length) return '';
  let out = '';
  for (const k of keys) {
    const prop = PROPS.find(p => p.k === k);
    if (!prop) continue;
    const v = o[k];
    if (k === 'corner') out += `  corner-shape: superellipse(${v});\\n`;
    else if (k === 'shadow') out += `  box-shadow: 0 ${Math.round(v/3)}px ${v}px rgb(0 0 0 / .45);\\n`;
    else if (k === 'bg') out += `  background: ${v};\\n`;
    else if (prop.kind === 'color') out += `  ${prop.css}: ${v};\\n`;
    else out += `  ${prop.css}: ${v}${prop.unit};\\n`;
  }
  return `${OVERRIDE[sel] || sel} {\\n${out}}\\n`;
}

function css() {
  let out = '#kpj, #kpj-toast {\\n' + globalTokens() + '}\\n';
  for (const sel of Object.keys(scoped)) out += scopedTokens(sel);
  for (const sel of Object.keys(elOver)) out += elDecl(sel);
  return out;
}

const rgbToHex = v => {
  const m = (v || '').match(/[\d.]+/g);
  if (!m) return '#000000';
  return '#' + m.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('');
};

function buildInspector(sel) {
  const node = doc && doc.querySelector(sel);
  const box = el('lab-el-rows');
  box.innerHTML = '';
  if (!node) { box.textContent = 'Not in view.'; return; }
  const cs = getComputedStyle(node);
  for (const p of PROPS) {
    const saved = elOver[sel]?.[p.k];
    let seed;
    if (p.kind === 'color') {
      seed = saved ?? rgbToHex(cs[p.css === 'background' ? 'backgroundColor' : p.css.replace(/-(.)/g, (_, c) => c.toUpperCase())]);
    } else if (p.k === 'corner') {
      seed = saved ?? ((cs.cornerShape || '').match(/[\d.]+/)?.[0] ?? 2);
    } else if (p.k === 'shadow') {
      seed = saved ?? 0;
    } else {
      const raw = cs[p.css.replace(/-(.)/g, (_, c) => c.toUpperCase())];
      seed = saved ?? (parseFloat(raw) || 0);
    }
    const row = document.createElement('label');
    row.className = 'lab-row';
    row.innerHTML = `<span>${p.label}<i class="lab-i" tabindex="0" data-info="${p.info}">i</i></span>`
      + (p.kind === 'color'
          ? `<input type="color" data-el="${p.k}" value="${seed}">`
          : `<input type="range" data-el="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${seed}">`)
      + `<output>${seed}${p.kind === 'color' ? '' : p.unit}</output>`;
    const input = row.querySelector('input');
    const out = row.querySelector('output');
    if (saved !== undefined) out.classList.add('overridden');
    input.addEventListener('input', () => {
      (elOver[sel] ||= {})[p.k] = input.value;
      out.textContent = input.value + (p.kind === 'color' ? '' : p.unit);
      out.classList.add('overridden');
      apply();
    });
    box.appendChild(row);
  }
}

function apply() {
  const out = css();
  if (doc) {
    const tag = doc.getElementById('kpj-override');
    if (tag) tag.textContent = out;
  }
  el('lab-out').textContent = out;
  try { localStorage.setItem('kpj-lab', JSON.stringify({ state, scoped, elOver })); } catch {}
}

function show(s) {
  const sel = target.value;
  const scopedOn = sel !== 'all' && s.dataset.scoped === '1';
  const v = scopedOn ? (scoped[sel]?.[s.dataset.k] ?? state[s.dataset.k]) : state[s.dataset.k];
  s.value = v;
  s.disabled = sel !== 'all' && s.dataset.scoped !== '1';
  const o = document.querySelector(`output[data-for="${s.dataset.k}"]`);
  if (o) {
    o.textContent = v + s.dataset.unit;
    o.classList.toggle('overridden', scopedOn && scoped[sel]?.[s.dataset.k] !== undefined);
  }
}

function refresh() {
  for (const s of sliders) show(s);
  const sel = target.value;
  const single = sel !== 'all';
  el('lab-global').hidden = single;
  el('lab-el').hidden = !single;
  el('lab-clear').hidden = !single;
  if (single) {
    el('lab-el-name').textContent = target.selectedOptions[0].textContent;
    buildInspector(sel);
  }
  const n = (Object.keys(scoped[sel] || {}).length + Object.keys(elOver[sel] || {}).length);
  el('lab-scope-note').textContent = single ? n + ' set' : 'all';
}

try {
  const saved = JSON.parse(localStorage.getItem('kpj-lab') || '{}');
  if (saved.state) state = { ...base, ...saved.state };
  if (saved.scoped) scoped = saved.scoped;
  if (saved.elOver) elOver = saved.elOver;
} catch {}

for (const s of sliders) {
  s.addEventListener('input', () => {
    const sel = target.value;
    if (sel === 'all') {
      state[s.dataset.k] = s.value;
      for (const o of Object.values(scoped)) delete o[s.dataset.k];   // a global edit wins
    } else {
      (scoped[sel] ||= {})[s.dataset.k] = s.value;
    }
    show(s);
    el('lab-scope-note').textContent = sel === 'all' ? 'all' : (Object.keys(scoped[sel] || {}).length + ' set');
    apply();
  });
}
for (const c of picks) {
  if (state['pick-' + c.dataset.pick]) c.value = state['pick-' + c.dataset.pick];
  c.addEventListener('input', () => {
    state['pick-' + c.dataset.pick] = c.value;
    const o = document.querySelector(`output[data-for="pick-${c.dataset.pick}"]`);
    if (o) o.textContent = c.value;
    apply();
  });
}
target.addEventListener('change', refresh);
verSel.addEventListener('change', () => loadVersion(verSel.value));
refresh();
loadVersion(verSel.value);

el('lab-note').textContent = CSS.supports('corner-shape: superellipse(2)')
  ? 'Corner smoothing is live in this browser.'
  : 'Corner smoothing needs corner-shape support; that slider does nothing here.';

el('lab-copy').onclick = async () => {
  const text = '/* paste over the token block in extension/content.css */\\n@supports (color: oklch(0.5 0.1 250)) {\\n'
    + css().replace(/^/gm, '  ') + '}';
  try { await navigator.clipboard.writeText(text); el('lab-copy').textContent = 'Copied'; }
  catch { el('lab-out').textContent = text; }
  setTimeout(() => el('lab-copy').textContent = 'Copy tokens', 1200);
};
el('lab-clear').onclick = () => { delete scoped[target.value]; delete elOver[target.value]; refresh(); apply(); };
el('lab-reset').onclick = () => {
  state = { ...base }; scoped = {}; elOver = {};
  for (const c of picks) c.value = base['pick-' + c.dataset.pick];
  refresh(); apply();
};
</script>
</body></html>"""

HTML = HTML.replace('FRAMES_PLACEHOLDER', json.dumps(FRAMES)).replace('VERSION_OPTIONS', VERSION_OPTIONS).replace('PROPS_PLACEHOLDER', PROPS_JSON).replace('ELEMENTS_PLACEHOLDER', ELEMENTS_JSON)
(ROOT / 'ui-preview.html').write_text(HTML)
print('ui-preview.html rebuilt with the design lab')

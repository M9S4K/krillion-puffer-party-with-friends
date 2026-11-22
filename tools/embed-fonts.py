#!/usr/bin/env python3
"""Inline the woff2 faces into content.css as data: URIs.

A chrome-extension:// font referenced from a content script's stylesheet does
not load on krillion.io - both faces come back with status "error" even with
the files in web_accessible_resources. A data: URI needs no cross-origin fetch
and was measured loading fine on the same page, so the bytes live in the CSS.

Run after changing extension/fonts/*.woff2. The faces are regenerated between
the BEGIN/END markers; everything else in content.css is left alone.
"""
import base64, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = ROOT / "extension" / "content.css"
FACES = [
    ("KPJ Pixelify", "pixelify-sans-latin.woff2", "400 700"),
    ("KPJ VT323", "vt323-latin.woff2", "400"),
]
BEGIN = "/* --- BEGIN embedded faces (tools/embed-fonts.py) --- */"
END = "/* --- END embedded faces --- */"

def block():
    out = [BEGIN,
           "/* Pixelify Sans and VT323, SIL Open Font License 1.1, inlined so the panel",
           "   renders its own type with no network and no extension-URL fetch. */"]
    for family, name, weight in FACES:
        data = (ROOT / "extension" / "fonts" / name).read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        out += ["@font-face {",
                f'  font-family: "{family}";',
                f'  src: url(data:font/woff2;base64,{b64}) format("woff2");',
                f"  font-weight: {weight};",
                "  font-style: normal;",
                "  font-display: swap;",
                "}"]
    out.append(END)
    return "\n".join(out)

css = CSS.read_text(encoding="utf-8")
if BEGIN in css and END in css:
    css = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block(), css, flags=re.S)
else:
    sys.exit("markers not found in content.css - add them around the @font-face rules")
CSS.write_text(css, encoding="utf-8")
print(f"embedded {len(FACES)} faces, content.css is now {len(css):,} bytes")

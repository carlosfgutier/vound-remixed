#!/usr/bin/env python3
"""Generate a styled PDF from the presentation-prep markdown source.

Kiln-ish design language: generous margins, restrained palette, mono for
code, serif for body, sans for headers. Uses WeasyPrint for rendering.
"""

from __future__ import annotations

import pathlib

import markdown
from weasyprint import CSS, HTML

HERE = pathlib.Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent
SRC = PROJECT_DIR / "presentation-prep.md"
OUT = PROJECT_DIR / "pdfs" / "presentation-prep.pdf"

CSS_STR = """
@page {
  size: Letter;
  margin: 0.9in 0.85in 0.9in 0.85in;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: "IBM Plex Mono", "SF Mono", Menlo, monospace;
    font-size: 8pt;
    color: #8a8a8a;
    letter-spacing: 0.08em;
  }
  @top-left {
    content: "vound-remixed · presentation prep";
    font-family: "IBM Plex Mono", "SF Mono", Menlo, monospace;
    font-size: 8pt;
    color: #8a8a8a;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  font-family: "Charter", "Iowan Old Style", Georgia, serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1a1a1a;
}

h1, h2, h3, h4 {
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  font-weight: 600;
  color: #0a0a0a;
  letter-spacing: -0.01em;
}

h1 { font-size: 22pt; margin-top: 0; margin-bottom: 0.4em; line-height: 1.15; }
h2 {
  font-size: 15pt;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
  padding-bottom: 0.2em;
  border-bottom: 1px solid #e2e2e2;
  page-break-after: avoid;
}
h3 {
  font-size: 12pt;
  margin-top: 1.3em;
  margin-bottom: 0.35em;
  color: #2a2a2a;
  page-break-after: avoid;
}
h4 { font-size: 10.5pt; margin-top: 1em; margin-bottom: 0.25em; color: #3a3a3a; }

p { margin: 0 0 0.7em 0; }

a { color: #0b5bd3; text-decoration: none; }

code {
  font-family: "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: #f3f3f1;
  padding: 0.08em 0.32em;
  border-radius: 2px;
}

pre {
  font-family: "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace;
  font-size: 8.6pt;
  line-height: 1.45;
  background: #f7f7f5;
  border: 1px solid #e6e6e2;
  border-left: 3px solid #1a1a1a;
  padding: 0.7em 0.9em;
  margin: 0.5em 0 1em 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  page-break-inside: avoid;
}

pre code {
  background: transparent;
  padding: 0;
  font-size: inherit;
}

blockquote {
  border-left: 3px solid #c9c9c2;
  margin: 0.8em 0;
  padding: 0.1em 0 0.1em 1em;
  color: #4a4a4a;
  font-style: italic;
}

ul, ol { margin: 0.3em 0 0.8em 1.2em; padding: 0; }
li { margin-bottom: 0.25em; }

hr {
  border: none;
  border-top: 1px solid #d8d8d2;
  margin: 1.8em 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.6em 0 1em 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}

th, td {
  border: 1px solid #dcdcd4;
  padding: 0.4em 0.6em;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f3f3f1;
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  font-weight: 600;
  font-size: 9pt;
  letter-spacing: 0.02em;
}

strong { color: #0a0a0a; }
"""


def main() -> None:
    md_source = SRC.read_text(encoding="utf-8")
    html_body = markdown.markdown(
        md_source,
        extensions=["fenced_code", "tables", "toc", "sane_lists"],
    )
    html_doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vound-remixed — presentation prep</title></head>
<body>{html_body}</body></html>"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=html_doc).write_pdf(str(OUT), stylesheets=[CSS(string=CSS_STR)])
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Regenerate logs/survey-data.js from logs/survey.csv.

Run this once, any time you've edited/replaced logs/survey.csv:
    python3 convert.py

Then just refresh the page in your browser (or click "Reload page").
No server, no Node, no dependencies beyond Python's standard library.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
csv_path = HERE / "logs" / "survey.csv"
out_path = HERE / "logs" / "survey-data.js"

if not csv_path.exists():
    sys.exit(f"Couldn't find {csv_path} — put your survey CSV there first.")

csv_text = csv_path.read_text(encoding="utf-8")
out_path.write_text("window.SURVEY_CSV = " + json.dumps(csv_text) + ";\n", encoding="utf-8")

print(f"Wrote {out_path} from {csv_path} ({len(csv_text)} characters, "
      f"{csv_text.count(chr(10))} lines). Refresh the page to see it.")

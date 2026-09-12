"""Locate the research data directory.

The pipeline needs bulk files that are NOT stored in this repository
(connectome tables, neuron annotations, generated positions/features).
Point FLYOTHELLO_DATA at the directory holding them, or pass --data.
See tools/README.md for how to obtain each file.
"""
import argparse
import os
from pathlib import Path


def data_dir() -> Path:
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--data", default=os.environ.get("FLYOTHELLO_DATA", "./data"))
    args, _ = ap.parse_known_args()
    p = Path(args.data).expanduser().resolve()
    if not p.is_dir():
        raise SystemExit(
            f"data directory not found: {p}\n"
            "Set FLYOTHELLO_DATA or pass --data <dir>. See tools/README.md."
        )
    return p


def asset_dir() -> Path:
    p = Path(__file__).resolve().parent.parent / "public" / "assets"
    p.mkdir(parents=True, exist_ok=True)
    return p

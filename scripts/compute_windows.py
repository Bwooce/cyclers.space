"""
Generate the next N synodic encounter schedules for each cycler in
src/data/seed_cyclers.yaml. Writes a single JSON file at
src/data/windows.json for the site to render.

NOT real phase-matching — that's M6 in cyclerfinder. This is interim
synodic-cadence scheduling: each cycler's `period.years` value sets
the cadence; reference epoch is an arbitrary anchor (2026-01-01)
until M6 lands real conjunction-based epochs.

When the cyclerfinder package gains phase-matching (M6), replace
`compute_next_windows()` with a call to `cyclerfinder.search.phase_match`
— the JSON schema does not change, so the site does not need to change.
"""
import datetime
import json
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = REPO_ROOT / "src" / "data" / "seed_cyclers.yaml"
OUTPUT = REPO_ROOT / "src" / "data" / "windows.json"
N_WINDOWS = 5                                    # next 5 windows per cycler
REFERENCE_EPOCH = datetime.date(2026, 1, 1)     # arbitrary anchor; M6 will pick real epochs


def compute_next_windows(entry, reference_epoch, n):
    """Generate n future encounter dates spaced by the cycler's period."""
    period = entry.get("period") or {}
    period_years = period.get("years")
    if period_years is None:
        return []
    days = float(period_years) * 365.25
    return [
        (reference_epoch + datetime.timedelta(days=int(i * days))).isoformat()
        for i in range(n)
    ]


def main():
    with CATALOGUE.open() as f:
        catalogue = yaml.safe_load(f)

    windows = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "method": "synodic-cadence-preview",
        "reference_epoch": REFERENCE_EPOCH.isoformat(),
        "n_per_cycler": N_WINDOWS,
        "disclaimer": (
            "Preview: cadence-only schedule using cycler period.years from "
            "the seed catalogue. Real phase-matched launch windows require "
            "M6 phase-matching in the cyclerfinder package; this script will "
            "switch to that when available."
        ),
        "entries": [],
    }
    for entry in catalogue:
        windows["entries"].append({
            "id": entry["id"],
            "name": entry.get("name", entry["id"]),
            "period_years": (entry.get("period") or {}).get("years"),
            "primary": entry.get("primary", "Sun"),
            "bodies": entry.get("bodies", []),
            "next_encounters_iso": compute_next_windows(
                entry, REFERENCE_EPOCH, N_WINDOWS
            ),
        })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(windows, indent=2) + "\n")
    print(f"Wrote {len(windows['entries'])} cycler schedules to {OUTPUT}")


if __name__ == "__main__":
    main()

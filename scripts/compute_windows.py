"""Generate real-ephemeris launch-window dates for each cycler in the catalogue.

Calls into the upstream cyclerfinder package's `search.phase_match` module to
find calendar dates where the planetary geometry matches each ballistic
cycler's V_inf signature. Writes a JSON file at `src/data/windows.json` for
the site to render.

Honest scope (per the 2026-06-01 launch-windows slice of M6 in upstream):

- DATES are real. They come from astropy + JPL DE440 ephemeris + a Lambert
  solve at each grid date; the N best-matching dates per cycler are kept.
- V_inf at departure is real (Lambert output).
- C_3, time-of-flight, and TCM-budget cost columns are NOT computed - they
  require the multi-lap propagation + ephemeris-mode optimisation that
  remains in the full M6 milestone. The site renders dashes for them.

When the upstream cyclerfinder ships full M6, this script can be extended to
populate the missing columns; the JSON schema is already shaped for it.
"""

from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = REPO_ROOT / "src" / "data" / "catalogue.yaml"
OUTPUT = REPO_ROOT / "src" / "data" / "windows.json"

# Search horizon: 10 years from "now" (the date this script runs).
HORIZON_YEARS = 10
N_WINDOWS = 5
STEP_DAYS = 10.0  # grid resolution for the date scan
MISMATCH_CAP_KMS = 3.0  # discard candidates above this V_inf mismatch

# Reference start date is "today UTC" rounded down to the day. The cron
# workflow runs weekly, so the horizon slides forward over time.
NOW = datetime.datetime.now(tz=datetime.UTC).replace(hour=0, minute=0, second=0, microsecond=0)
HORIZON_END = NOW + datetime.timedelta(days=int(365.25 * HORIZON_YEARS))


def main() -> int:
    try:
        from cyclerfinder.core.ephemeris import Ephemeris
        from cyclerfinder.search.phase_match import (
            find_real_windows,
            phase_signature_from_catalogue_entry,
        )
    except ImportError as exc:
        print(
            f"ERROR: cyclerfinder package not importable: {exc}\n"
            "Install with: pip install git+https://github.com/Bwooce/cyclers.git@main",
            file=sys.stderr,
        )
        return 1

    with CATALOGUE.open() as f:
        catalogue = yaml.safe_load(f)

    ephem = Ephemeris(model="astropy")

    windows: dict[str, object] = {
        "generated_at": NOW.isoformat().replace("+00:00", "Z"),
        "method": "ephemeris-geometric-match",
        "horizon_start": NOW.date().isoformat(),
        "horizon_end": HORIZON_END.date().isoformat(),
        "horizon_years": HORIZON_YEARS,
        "n_per_cycler": N_WINDOWS,
        "step_days": STEP_DAYS,
        "mismatch_cap_kms": MISMATCH_CAP_KMS,
        "disclaimer": (
            "Geometric-match launch windows from real JPL DE440 ephemeris "
            "(via astropy). Dates are real and verifiable; the V_inf at "
            "departure column is the actual Lambert output at the matched "
            "date. C_3, time-of-flight, and TCM-budget cost columns are NOT "
            "computed - those require multi-lap propagation + ephemeris-mode "
            "optimisation (full M6 in cyclerfinder)."
        ),
        "entries": [],
    }
    entries_list: list[dict[str, object]] = []

    for entry in catalogue:
        out: dict[str, object] = {
            "id": entry["id"],
            "name": entry.get("name", entry["id"]),
            "period_years": (entry.get("period") or {}).get("years"),
            "primary": entry.get("primary", "Sun"),
            "trajectory_regime": entry.get("trajectory_regime", "ballistic"),
            "bodies": entry.get("bodies", []),
            "next_encounters_iso": [],
            "vinf_actual_kms": [],
            "mismatch_kms": [],
            "status": "unprocessed",
        }

        # Hard filters: only ballistic, heliocentric, Earth-touching cyclers
        # can be reasoned about by phase_match today.
        if entry.get("trajectory_regime", "ballistic") != "ballistic":
            out["status"] = "skipped: non-ballistic trajectory_regime"
            entries_list.append(out)
            continue
        if entry.get("primary", "Sun") != "Sun":
            out["status"] = f"skipped: non-heliocentric primary={entry.get('primary')}"
            entries_list.append(out)
            continue
        if "E" not in (entry.get("bodies") or []):
            out["status"] = "skipped: not an Earth-touching cycler"
            entries_list.append(out)
            continue

        try:
            sig = phase_signature_from_catalogue_entry(entry)
        except ValueError as exc:
            out["status"] = f"skipped: {exc}"
            entries_list.append(out)
            continue

        try:
            launch_windows = find_real_windows(
                sig,
                ephem,
                (NOW, HORIZON_END),
                n=N_WINDOWS,
                step_days=STEP_DAYS,
                mismatch_cap_kms=MISMATCH_CAP_KMS,
            )
        except Exception as exc:  # noqa: BLE001 -- ephemeris fetch can fail many ways
            out["status"] = f"error: {exc}"
            entries_list.append(out)
            continue

        out["next_encounters_iso"] = [w.departure_date.date().isoformat() for w in launch_windows]
        out["vinf_actual_kms"] = [
            [round(v, 3) for v in w.vinf_actual_kms] for w in launch_windows
        ]
        out["mismatch_kms"] = [round(w.mismatch_kms, 4) for w in launch_windows]
        out["status"] = "ok" if launch_windows else "no-windows-found"
        entries_list.append(out)

    windows["entries"] = entries_list
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(windows, indent=2) + "\n")
    n_with_windows = sum(1 for e in entries_list if len(e.get("next_encounters_iso", [])) > 0)  # type: ignore[arg-type]
    print(
        f"Wrote {len(entries_list)} entries to {OUTPUT} "
        f"({n_with_windows} with real windows; rest skipped or errored)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

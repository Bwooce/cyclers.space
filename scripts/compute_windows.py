"""Generate real-ephemeris launch-window dates for each cycler in the catalogue.

Calls into the upstream cyclerfinder package's `search.phase_match` module to
find calendar dates where the planetary geometry matches each ballistic
cycler's V_inf signature. Writes a JSON file at `src/data/windows.json` for
the site to render.

Honest scope (per the 2026-06-01 launch-windows slice of M6 in upstream):

- DATES are real. They come from astropy + JPL DE440 ephemeris + a Lambert
  solve at each grid date; the N best-matching dates per cycler are kept.
- V_inf at departure is real (Lambert output).
- C_3 at departure is now emitted per window: C_3 = |V_inf,depart|^2, derived
  directly from the Lambert output the date scan already produces (the first
  encounter's actual V_inf). No extra computation.
- Time-of-flight to the first encounter is now emitted per cycler: the first
  leg ToF of the cycler's phase signature (the same value the Lambert solve
  uses at every candidate date). No extra computation.
- Maintenance-ΔV budget is DEFERRED to an optional, opt-in column
  (``--maintenance-dv``). It is null by default. Rationale (Task #103,
  measured 2026-06-05): cyclerfinder's ``optimise_maintenance_dv`` is a global
  ``differential_evolution`` + multi-start SLSQP optimiser over real DE440
  states; one E-M-E cycler costs ~12 s with the astropy ephemeris. The
  catalogue carries ~229 ballistic Earth-touching cyclers, so a full-catalogue
  run is ~46 min — over the weekly CI budget (~20 min). It also needs a
  *closed* sequence (first == last body) plus per-entry leg bounds/guesses and
  an Earth-closure flyby config, which the open-chain catalogue ``bodies``
  (e.g. ``["E", "M"]``) don't supply. Until that mapping + a tractable CI
  story exist, the column stays null. Pass ``--maintenance-dv`` to populate it
  for the Aldrin-style closed E-M-E cyclers locally (slow).

When the upstream cyclerfinder ships full M6, the maintenance-ΔV column can be
populated in CI; the JSON schema already carries the nullable field.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

import yaml

SECONDS_PER_DAY = 86400.0

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


def _maintenance_dv_for_entry(entry: dict, sig: object, ephem: object) -> float | None:
    """Compute the per-cycler maintenance ΔV, or None when not applicable.

    Only closed E-M-E (Aldrin-style) cyclers are handled today: the upstream
    optimiser needs a closed sequence and an Earth-closure flyby config. The
    open-chain catalogue ``bodies`` (e.g. ``["E", "M"]``) are treated as the
    canonical Aldrin E→M→E loop. Anything else returns None (deferred).

    This is SLOW (~12 s/cycler with the astropy ephemeris) and only runs under
    the ``--maintenance-dv`` flag; see the module docstring for the rationale.
    """
    from cyclerfinder.search.maintain import optimise_aldrin_maintenance_dv

    bodies = tuple(entry.get("bodies") or [])
    if bodies != ("E", "M"):
        return None
    result = optimise_aldrin_maintenance_dv(ephem, n_starts=5, seed=0)  # type: ignore[arg-type]
    return float(result.maintenance_dv_kms)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--maintenance-dv",
        action="store_true",
        help=(
            "Populate the per-cycler maintenance_dv_kms column. SLOW "
            "(~12 s/cycler, astropy); off by default and skipped in weekly CI."
        ),
    )
    args = parser.parse_args()

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
        "maintenance_dv_computed": bool(args.maintenance_dv),
        "schema_note": (
            "Per-window c3_km2_s2 = |V_inf,depart|^2 (Lambert output). "
            "Per-cycler tof_first_leg_days is the cycler's first-leg ToF. "
            "Per-cycler maintenance_dv_kms is null unless this export ran "
            "with --maintenance-dv (deferred from weekly CI for runtime)."
        ),
        "disclaimer": (
            "Geometric-match launch windows from real JPL DE440 ephemeris "
            "(via astropy). Dates are real and verifiable; the V_inf at "
            "departure column is the actual Lambert output at the matched "
            "date. C_3 at departure and time-of-flight to the first encounter "
            "are now emitted (both derived from the same Lambert solve / phase "
            "signature). The maintenance-ΔV (TCM-budget) column is deferred to "
            "an opt-in run: the upstream optimiser is too slow for the weekly "
            "CI job (~12 s/cycler), so it is null by default."
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
            "c3_km2_s2": [],
            "mismatch_kms": [],
            "tof_first_leg_days": None,
            "maintenance_dv_kms": None,
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
        # C_3 at departure = |V_inf,depart|^2; departure body is encounter 0.
        out["c3_km2_s2"] = [
            round(w.vinf_actual_kms[0] ** 2, 3) if w.vinf_actual_kms else None
            for w in launch_windows
        ]
        out["mismatch_kms"] = [round(w.mismatch_kms, 4) for w in launch_windows]
        # ToF to first encounter: the cycler's first-leg ToF (same at every
        # candidate date), straight from the phase signature in days.
        if sig.leg_durations_s:
            out["tof_first_leg_days"] = round(sig.leg_durations_s[0] / SECONDS_PER_DAY, 1)
        if args.maintenance_dv:
            try:
                out["maintenance_dv_kms"] = _maintenance_dv_for_entry(entry, sig, ephem)
            except Exception as exc:  # noqa: BLE001 -- optimiser can fail many ways
                out["maintenance_dv_note"] = f"maintenance-dv error: {exc}"
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

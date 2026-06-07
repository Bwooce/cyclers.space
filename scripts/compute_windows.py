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
- Maintenance-ΔV budget is an opt-in column (``--maintenance-dv``), computed
  by a row-level parallel batch (``scripts/maintenance_batch.py``). cyclerfinder's
  ``optimise_aldrin_maintenance_dv`` is a global ``differential_evolution`` +
  multi-start SLSQP optimiser over real DE440 states costing ~12-19 s per solve.
  The batch fans out over rows with a ``ProcessPoolExecutor`` (each worker builds
  its own Ephemeris; no live object is pickled), and deduplicates: the upstream
  solve takes no row-specific input, so every closed E-M (Aldrin) row resolves to
  the identical Aldrin E→M→E ΔV — it is computed once and broadcast. Rows whose
  ``bodies`` are not ``["E", "M"]`` stay null (the optimiser needs a closed
  sequence + Earth-closure flyby config the open-chain rows don't supply);
  ``maintenance_dv_status`` records the reason per row.

CI story (Task #114, measured 2026-06-06): even parallelised, the cold-cache
DE440 solve is too slow for GitHub's free 2-4-core runners, so the weekly cron
does NOT recompute the column. Instead the populated values are computed locally
once with ``--maintenance-dv`` and committed; the cron runs with
``--preserve-maintenance-dv`` so a dates refresh keeps the existing ΔV column
intact rather than nulling it. Re-run ``--maintenance-dv`` locally to refresh.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
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


def _vet_maintenance_dv(dv_kms: float) -> tuple[float | None, str | None]:
    """Apply the publication-layer plausibility gate to a maintenance ΔV.

    Returns ``(publishable_value, refusal_reason)``: a plausible ΔV is returned
    rounded with ``refusal_reason=None``; an implausible one (the 55.32 km/s
    off-family degenerate-basin class) returns ``(None, reason)`` so the caller
    records the refusal instead of publishing the value. Imports the predicate
    lazily so the deferred (non-E-M) path never needs cyclerfinder loaded.
    """
    from cyclerfinder.verify.plausibility import QuantityKind, check_publishable

    verdict = check_publishable(QuantityKind.MAINTENANCE_DV_KMS, dv_kms)
    if not verdict.ok:
        return (None, f"refused: {verdict.reason}")
    return (round(dv_kms, 4), None)


def _eligible_for_maintenance(entry: dict) -> bool:
    """True when this catalogue row is a candidate for the maintenance solve.

    Only closed E-M (Aldrin-style) cyclers are handled today: the upstream
    optimiser needs a closed sequence and an Earth-closure flyby config. The
    open-chain catalogue ``bodies`` ``["E", "M"]`` are treated as the canonical
    Aldrin E→M→E loop. Everything else is deferred (null) honestly.
    """
    return tuple(entry.get("bodies") or []) == ("E", "M")


def _populate_maintenance_dv(
    catalogue: list[dict],
    entries_list: list[dict],
    *,
    max_workers: int | None,
) -> None:
    """Run the row-level parallel maintenance batch and write results back.

    Eligible rows (closed E-M cyclers) get a real, computed ΔV. Every other row
    keeps ``maintenance_dv_kms = None`` with a deferred status recorded in
    ``maintenance_dv_status``. The batch lives in ``maintenance_batch`` (this
    repo); the upstream cyclerfinder optimiser is not modified.
    """
    from maintenance_batch import MaintenanceRow, run_maintenance_batch

    eligible_ids = {e["id"] for e in catalogue if _eligible_for_maintenance(e)}
    rows = [
        MaintenanceRow(row_id=str(e["id"]), bodies=tuple(e.get("bodies") or []))
        for e in entries_list
        if e["id"] in eligible_ids
    ]
    workers = max_workers if max_workers is not None else (os.cpu_count() or 1)
    print(
        f"maintenance-dv: solving {len(rows)} eligible (closed E-M) rows "
        f"on {min(workers, max(1, len(rows)))} worker(s)..."
    )
    results = run_maintenance_batch(rows, ephem_model="astropy", max_workers=max_workers)
    by_id = {r.row_id: r for r in results}

    n_ok = 0
    n_refused = 0
    for out in entries_list:
        res = by_id.get(str(out["id"]))
        if res is None:
            out["maintenance_dv_kms"] = None
            out["maintenance_dv_status"] = (
                "deferred: only closed E-M (Aldrin) cyclers are solved today"
            )
            continue
        if res.dv_kms is None:
            out["maintenance_dv_kms"] = None
            out["maintenance_dv_status"] = res.status
            continue
        # Refuse-with-reason: never write an implausible ΔV (the 55.32 km/s
        # off-family degenerate-basin class) into windows.json.
        value, refusal = _vet_maintenance_dv(res.dv_kms)
        if refusal is not None:
            out["maintenance_dv_kms"] = None
            out["maintenance_dv_status"] = refusal
            n_refused += 1
            continue
        out["maintenance_dv_kms"] = value
        out["maintenance_dv_status"] = res.status
        n_ok += 1
    print(
        f"maintenance-dv: {n_ok} rows got a real ΔV; "
        f"{n_refused} refused as implausible (plausibility gate); "
        f"{len(rows) - n_ok - n_refused} eligible rows failed; "
        f"{len(entries_list) - len(rows)} deferred (non-E-M)."
    )


def _preserve_maintenance_dv(entries_list: list[dict]) -> None:
    """Copy existing maintenance ΔV values from the prior windows.json.

    Used by the weekly cron (which does NOT recompute the slow column): a dates
    refresh should not null out a column that was populated by a local opt-in
    run. Missing or unreadable prior output leaves the column null.
    """
    if not OUTPUT.exists():
        return
    try:
        prior = json.loads(OUTPUT.read_text())
    except (OSError, json.JSONDecodeError):
        return
    prior_by_id = {e.get("id"): e for e in prior.get("entries", [])}
    n_kept = 0
    for out in entries_list:
        prev = prior_by_id.get(out["id"])
        if prev is None:
            continue
        dv = prev.get("maintenance_dv_kms")
        if dv is not None:
            out["maintenance_dv_kms"] = dv
            out["maintenance_dv_status"] = prev.get(
                "maintenance_dv_status", "preserved from prior run"
            )
            n_kept += 1
    print(f"maintenance-dv: preserved {n_kept} existing values from prior windows.json.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--maintenance-dv",
        action="store_true",
        help=(
            "Populate the per-cycler maintenance_dv_kms column. SLOW "
            "(~12-19 s/solve, astropy) but parallelised row-level across a "
            "process pool; off by default and skipped in weekly CI."
        ),
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=None,
        help=(
            "Worker processes for the --maintenance-dv batch. "
            "Default: os.cpu_count(). Lower it to share the box."
        ),
    )
    parser.add_argument(
        "--preserve-maintenance-dv",
        action="store_true",
        help=(
            "When NOT computing maintenance ΔV, copy any existing "
            "maintenance_dv_kms values from the current windows.json into the "
            "new output instead of nulling them. Used by the weekly cron so it "
            "refreshes dates without wiping the locally-computed ΔV column."
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
            "Per-cycler maintenance_dv_kms is the computed per-synodic TCM "
            "budget for closed E-M (Aldrin) cyclers, populated by an opt-in "
            "--maintenance-dv run (row-level parallel) and refreshed on manual "
            "runs only; the weekly cron preserves existing values rather than "
            "recomputing the slow optimiser. Null for non-E-M rows "
            "(maintenance_dv_status records the reason)."
        ),
        "disclaimer": (
            "Geometric-match launch windows from real JPL DE440 ephemeris "
            "(via astropy). Dates are real and verifiable; the V_inf at "
            "departure column is the actual Lambert output at the matched "
            "date. C_3 at departure and time-of-flight to the first encounter "
            "are now emitted (both derived from the same Lambert solve / phase "
            "signature). The maintenance-ΔV (TCM-budget) column carries the "
            "upstream optimiser's computed per-synodic value for closed E-M "
            "(Aldrin) cyclers; it is too slow for the weekly CI runner so it is "
            "computed by an opt-in local run and refreshed manually, with the "
            "cron preserving existing values. Null for rows the optimiser does "
            "not yet model."
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
            "maintenance_dv_status": "not-computed",
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
        out["status"] = "ok" if launch_windows else "no-windows-found"
        entries_list.append(out)

    # --- Maintenance-ΔV column -------------------------------------------------
    # Either compute it (row-level parallel batch) or, for the weekly cron,
    # preserve any values already present in the prior windows.json so a dates
    # refresh does not wipe a locally-computed column.
    if args.maintenance_dv:
        _populate_maintenance_dv(catalogue, entries_list, max_workers=args.max_workers)
    elif args.preserve_maintenance_dv:
        _preserve_maintenance_dv(entries_list)

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

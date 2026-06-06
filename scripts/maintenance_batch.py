"""Row-level parallel driver for the per-cycler maintenance-ΔV column.

The serial ``--maintenance-dv`` path in :mod:`compute_windows` runs the upstream
``cyclerfinder.search.maintain.optimise_aldrin_maintenance_dv`` once per
Earth-touching closed cycler. Each solve is a global ``differential_evolution``
+ multi-start SLSQP run over real DE440 states and costs ~12-19 s, so a serial
full-catalogue pass is ~45-70 min — over the weekly CI budget.

This module parallelises that work at the **driver / row level**, mirroring the
canonical outer-grid pattern in ``cyclerfinder.search.scan``: a
``ProcessPoolExecutor`` over the rows, where each worker receives only
*primitives* (a row id plus the body-code tuple), builds its **own**
``Ephemeris`` inside the worker process, runs the solve, and returns a small
frozen result. A live ``Ephemeris``/``Cell`` is **never** pickled per evaluation
(the documented ``optimize.py:885`` constraint). The upstream optimiser itself is
left untouched — parallelism lives entirely here, in the site repo.

Determinism
-----------
Results are returned ordered by ``row_id`` (string sort), independent of worker
completion order, so a parallel run is reproducible and matches a serial run.

Work deduplication
------------------
Today the upstream ``optimise_aldrin_maintenance_dv`` is invoked with *no
row-specific input* — every closed E-M cycler row resolves to the identical
Aldrin E→M→E solve (same sequence, same seed, same guesses). Running 200+
byte-identical 18 s solves would be pure waste and would falsely imply per-row
variation that does not exist. So the driver groups rows by their *solve key*
(the body-code tuple that selects the solve), computes each distinct key once in
the pool, and broadcasts the result to every row sharing that key. The
per-row output contract — ``(row_id, dv_kms | None, status)`` for every row —
is preserved exactly; only the redundant compute is collapsed. ``dedup=False``
forces one solve per row for measurement/validation.
"""

from __future__ import annotations

import os
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass

# The body-code tuple that the upstream optimiser currently understands as a
# closed, Earth-closure cycler. Only these rows get a real solve; everything
# else is reported as deferred (null) honestly.
ALDRIN_BODIES: tuple[str, ...] = ("E", "M")


@dataclass(frozen=True)
class MaintenanceRow:
    """One catalogue row reduced to the primitives a worker needs.

    ``solve_key`` is the body-code tuple that selects the upstream solve; rows
    sharing a key produce an identical ΔV and are computed once (see module
    docstring).
    """

    row_id: str
    bodies: tuple[str, ...]

    @property
    def solve_key(self) -> tuple[str, ...]:
        return self.bodies


@dataclass(frozen=True)
class MaintenanceResult:
    """Outcome for one row: real ΔV (km/s) or ``None`` plus an honest status."""

    row_id: str
    dv_kms: float | None
    status: str


# Ephemeris model is pinned per worker process via the pool initialiser so the
# (heavy) Ephemeris is constructed once per worker, never pickled per solve.
_EPHEM_MODEL: str = "astropy"


def _init_worker(model: str) -> None:
    """Pool initialiser: pin the ephemeris model for this worker process."""
    global _EPHEM_MODEL
    _EPHEM_MODEL = model


def _solve_key(key: tuple[str, ...]) -> tuple[tuple[str, ...], float | None, str]:
    """Worker entry point: run the upstream solve for one distinct solve key.

    Builds a fresh ``Ephemeris(model=_EPHEM_MODEL)`` inside the worker, runs the
    upstream optimiser, and returns ``(key, dv_kms | None, status)``. Only
    primitives cross the process boundary. The upstream optimiser is imported
    inside the worker so the parent never needs cyclerfinder loaded to fan out.
    """
    if key != ALDRIN_BODIES:
        return (key, None, "deferred: only closed E-M (Aldrin) cyclers are solved today")
    try:
        from cyclerfinder.core.ephemeris import Ephemeris
        from cyclerfinder.search.maintain import optimise_aldrin_maintenance_dv

        ephem = Ephemeris(model=_EPHEM_MODEL)
        result = optimise_aldrin_maintenance_dv(ephem, n_starts=5, seed=0)
        if not result.converged:
            return (key, None, "no-converge: optimiser hit the Lambert penalty")
        return (key, float(result.maintenance_dv_kms), "ok")
    except Exception as exc:  # noqa: BLE001 -- optimiser/ephemeris can fail many ways
        return (key, None, f"error: {type(exc).__name__}: {exc}")


def run_maintenance_batch(
    rows: Sequence[MaintenanceRow],
    *,
    ephem_model: str = "astropy",
    max_workers: int | None = None,
    dedup: bool = True,
) -> list[MaintenanceResult]:
    """Compute per-row maintenance ΔV in parallel, deterministically ordered.

    Parameters
    ----------
    rows:
        The catalogue rows (primitives only) to solve.
    ephem_model:
        Ephemeris model string handed to every worker (``"astropy"`` = DE440).
    max_workers:
        Worker process count. ``None`` -> ``os.cpu_count()``.
    dedup:
        When ``True`` (default), each distinct ``solve_key`` is computed once and
        broadcast to all rows sharing it. When ``False``, one solve runs per row
        (used to measure raw per-row cost).

    Returns
    -------
    list[MaintenanceResult]
        One result per input row, ordered by ``row_id``.
    """
    if not rows:
        return []
    if max_workers is None:
        max_workers = os.cpu_count() or 1

    if dedup:
        keys = sorted({r.solve_key for r in rows})
        n_workers = max(1, min(max_workers, len(keys)))
        solved = _map_keys(keys, ephem_model=ephem_model, max_workers=n_workers)
        key_to_outcome = {k: (dv, status) for k, dv, status in solved}
        results = [
            MaintenanceResult(r.row_id, *key_to_outcome[r.solve_key]) for r in rows
        ]
    else:
        # One solve per row: replicate the key per row (keeps the same worker
        # path) and zip outcomes back by position.
        keys = [r.solve_key for r in rows]
        n_workers = max(1, min(max_workers, len(keys)))
        solved = _map_keys(keys, ephem_model=ephem_model, max_workers=n_workers)
        results = [
            MaintenanceResult(r.row_id, dv, status)
            for r, (_k, dv, status) in zip(rows, solved, strict=True)
        ]

    return sorted(results, key=lambda r: r.row_id)


def _map_keys(
    keys: Sequence[tuple[str, ...]],
    *,
    ephem_model: str,
    max_workers: int,
) -> list[tuple[tuple[str, ...], float | None, str]]:
    """Run ``_solve_key`` over ``keys``, serial when ``max_workers == 1``.

    Preserves input order (``ProcessPoolExecutor.map`` is order-preserving), so
    the ``dedup=False`` positional zip in the caller is safe.
    """
    if max_workers == 1:
        global _EPHEM_MODEL
        saved = _EPHEM_MODEL
        _EPHEM_MODEL = ephem_model
        try:
            return [_solve_key(k) for k in keys]
        finally:
            _EPHEM_MODEL = saved
    with ProcessPoolExecutor(
        max_workers=max_workers,
        initializer=_init_worker,
        initargs=(ephem_model,),
    ) as pool:
        return list(pool.map(_solve_key, keys))


__all__ = [
    "ALDRIN_BODIES",
    "MaintenanceResult",
    "MaintenanceRow",
    "run_maintenance_batch",
]

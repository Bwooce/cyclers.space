"""Fast, self-contained checks for the maintenance-ΔV batch driver.

The site repo has no Python test framework; this file is a plain
assert-based script runnable with ``python scripts/test_maintenance_batch.py``
(it needs no cyclerfinder, scipy, or ephemeris — it exercises the *driver*
ordering / dedup / status logic, not the slow optimiser). Exits non-zero on
failure.

The non-E-M (deferred) path returns immediately without importing cyclerfinder,
so these run in milliseconds and are safe in any environment.
"""

from __future__ import annotations

import sys

from maintenance_batch import (
    ALDRIN_BODIES,
    MaintenanceResult,
    MaintenanceRow,
    run_maintenance_batch,
)


def test_empty_returns_empty() -> None:
    assert run_maintenance_batch([]) == []


def test_deferred_rows_get_null_and_status() -> None:
    rows = [
        MaintenanceRow("vem", ("V", "E", "M")),
        MaintenanceRow("emv", ("E", "M", "V")),
    ]
    results = run_maintenance_batch(rows, max_workers=1)
    assert len(results) == 2
    for r in results:
        assert r.dv_kms is None
        assert r.status.startswith("deferred")


def test_deterministic_ordering_by_row_id() -> None:
    # Deferred (non-E-M) rows only, so no optimiser is invoked; insertion order
    # is intentionally scrambled to prove the driver sorts by row_id.
    rows = [
        MaintenanceRow("zeta", ("V", "E")),
        MaintenanceRow("alpha", ("E", "V")),
        MaintenanceRow("mike", ("E", "Moon")),
    ]
    results = run_maintenance_batch(rows, max_workers=1)
    assert [r.row_id for r in results] == ["alpha", "mike", "zeta"]


def test_dedup_collapses_identical_keys() -> None:
    # All-deferred keys still exercise the dedup grouping: three rows, one
    # distinct solve key -> still one result per row, all null + deferred.
    rows = [MaintenanceRow(f"r{i}", ("V", "E")) for i in range(3)]
    results = run_maintenance_batch(rows, max_workers=1, dedup=True)
    assert len(results) == 3
    assert {r.row_id for r in results} == {"r0", "r1", "r2"}
    assert all(r.dv_kms is None for r in results)


def test_result_is_frozen_contract() -> None:
    res = MaintenanceResult("x", 1.5, "ok")
    assert res.row_id == "x"
    assert res.dv_kms == 1.5
    assert res.status == "ok"
    assert ALDRIN_BODIES == ("E", "M")


def main() -> int:
    tests = [obj for name, obj in sorted(globals().items()) if name.startswith("test_")]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS {test.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

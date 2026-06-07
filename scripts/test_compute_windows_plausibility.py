"""Plausibility-gate regression for the maintenance-ΔV export (task #127).

The 55.32 km/s near-miss: an off-family degenerate maintenance-ΔV solve once
reached a publication surface, caught only by a manual cross-check. This script
proves the export now REFUSES that value (recording a reason) while the
in-family 2.9138 km/s value still PUBLISHES.

Plain assert-based script (the site repo has no pytest), runnable with
``python scripts/test_compute_windows_plausibility.py``. It needs the
cyclerfinder package; when not pip-installed it falls back to the sibling
checkout's ``src`` (mirrors how CI installs cyclerfinder from git).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make cyclerfinder importable from a sibling checkout when not pip-installed.
_SIBLING_SRC = Path(__file__).resolve().parent.parent.parent / "cyclers" / "src"
if _SIBLING_SRC.is_dir():
    sys.path.insert(0, str(_SIBLING_SRC))

from compute_windows import _vet_maintenance_dv  # noqa: E402


def test_off_family_5532_is_refused() -> None:
    value, refusal = _vet_maintenance_dv(55.32)
    assert value is None, f"the 55.32 km/s off-family value must NOT be published, got {value}"
    assert refusal is not None and refusal.startswith("refused:"), refusal
    assert "55.32" in refusal or "55.3" in refusal, refusal


def test_in_family_29138_publishes() -> None:
    value, refusal = _vet_maintenance_dv(2.9138)
    assert refusal is None, f"in-family 2.9138 must publish, got refusal {refusal}"
    assert value == 2.9138, value


def test_value_is_rounded_to_four_places() -> None:
    value, refusal = _vet_maintenance_dv(2.914159)
    assert refusal is None
    assert value == 2.9142, value


def _main() -> int:
    tests = [
        test_off_family_5532_is_refused,
        test_in_family_29138_publishes,
        test_value_is_rounded_to_four_places,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    if failed:
        print(f"\n{failed}/{len(tests)} failed")
        return 1
    print(f"\nall {len(tests)} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

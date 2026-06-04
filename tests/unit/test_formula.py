from __future__ import annotations

import pytest

from obs.core.formula import apply_formula, validate_formula


def test_validate_formula_allows_math_constants() -> None:
    assert validate_formula("math.pi * x + math.e") is None


def test_validate_formula_allows_direct_math_constants() -> None:
    assert validate_formula("pi * x + e") is None


def test_apply_formula_with_math_constants() -> None:
    result = apply_formula("math.pi * x", 2)
    assert result == pytest.approx(2 * 3.141592653589793)


def test_apply_formula_rejects_attribute_escape() -> None:
    payload = "abs.__self__.__dict__.get('__import__')('math').pi + x"
    assert apply_formula(payload, 2) == 2


def test_apply_formula_preserves_int_precision_for_large_counter64() -> None:
    # Values > 2^53 lose integer precision when cast to float first.
    # With int input, Python uses exact int / float arithmetic.
    large = 10_000_000_000_000_001  # 10^16 + 1 — not exactly representable as float
    result = apply_formula("x / 1_000_000_000.0", large)
    assert result == pytest.approx(10_000_000.000_000_001, rel=1e-12)
    # Two consecutive counter values must produce distinct results
    result2 = apply_formula("x / 1_000_000_000.0", large + 1_000_000)
    assert result2 != result


def test_apply_formula_int_result_stays_int_for_pure_int_arithmetic() -> None:
    # x + 1 on an int input should return int (Python eval keeps it int)
    result = apply_formula("x + 1", 42)
    assert result == 43
    assert isinstance(result, int)


def test_apply_formula_bool_input_converted_to_float() -> None:
    # bool is a subclass of int; treat as 0.0/1.0, not as integer path
    assert apply_formula("x * 2", True) == pytest.approx(2.0)
    assert apply_formula("x * 2", False) == pytest.approx(0.0)

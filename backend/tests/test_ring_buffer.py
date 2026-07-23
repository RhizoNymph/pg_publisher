from __future__ import annotations

import pytest
from pg_publisher.metrics.ring import RingBuffer


def test_capacity_must_be_positive() -> None:
    with pytest.raises(ValueError):
        RingBuffer[int](0)


def test_push_and_snapshot() -> None:
    rb: RingBuffer[int] = RingBuffer(3)
    rb.push(1)
    rb.push(2)
    assert rb.snapshot() == [1, 2]


def test_overflow_drops_oldest() -> None:
    rb: RingBuffer[int] = RingBuffer(3)
    rb.extend([1, 2, 3, 4, 5])
    assert rb.snapshot() == [3, 4, 5]
    assert len(rb) == 3

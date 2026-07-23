from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from typing import Generic, TypeVar

T = TypeVar("T")


class RingBuffer(Generic[T]):
    """Bounded FIFO that drops oldest items when full."""

    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self._buf: deque[T] = deque(maxlen=capacity)

    def push(self, item: T) -> None:
        self._buf.append(item)

    def extend(self, items: Iterable[T]) -> None:
        self._buf.extend(items)

    def snapshot(self) -> list[T]:
        return list(self._buf)

    def __len__(self) -> int:
        return len(self._buf)

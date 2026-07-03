import asyncio
import threading
from typing import List

_sse_subscribers: List[asyncio.Queue] = []
_sse_lock = threading.Lock()


def notify(event_type: str, data: dict):
    with _sse_lock:
        dead = []
        for q in _sse_subscribers:
            try:
                q.put_nowait({"event": event_type, "data": data})
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            _sse_subscribers.remove(q)


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    with _sse_lock:
        _sse_subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue):
    with _sse_lock:
        if q in _sse_subscribers:
            _sse_subscribers.remove(q)

import asyncio
import threading
from typing import List, Tuple, Optional

_sse_subscribers: List[Tuple[asyncio.Queue, asyncio.AbstractEventLoop, Optional[str]]] = []
_sse_lock = threading.Lock()


def notify(event_type: str, data: dict, user_id: Optional[str] = None):
    with _sse_lock:
        dead = []
        for q, loop, sub_uid in _sse_subscribers:
            if user_id and sub_uid and sub_uid != user_id:
                continue
            try:
                loop.call_soon_threadsafe(q.put_nowait, {"event": event_type, "data": data})
            except Exception:
                dead.append((q, loop, sub_uid))
        for item in dead:
            _sse_subscribers.remove(item)


def subscribe(user_id: Optional[str] = None) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=1000)
    loop = asyncio.get_running_loop()
    with _sse_lock:
        _sse_subscribers.append((q, loop, user_id))
    return q


def unsubscribe(q: asyncio.Queue):
    with _sse_lock:
        _sse_subscribers[:] = [(sq, loop, uid) for sq, loop, uid in _sse_subscribers if sq != q]

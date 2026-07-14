"""
Job Queue System
================
In-process job queue with status tracking for document processing.
"""
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor, Future
from enum import Enum
from typing import Optional, Callable, Any
from app.config import MAX_WORKERS


class JobType(str, Enum):
    DOCUMENT_PROCESSING = "document_processing"
    VALIDATION = "validation"
    REVIEW = "review"
    REPORT = "report"
    EXPORT = "export"


class JobQueue:
    """
    Simple in-process job queue with status tracking.
    In production, replace with Redis/Celery or RabbitMQ.
    """

    def __init__(self, max_workers: int = 4):
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._futures: dict[str, Future] = {}
        self._status: dict[str, str] = {}
        self._lock = threading.Lock()

    @property
    def max_workers(self) -> int:
        return self._executor._max_workers

    def enqueue(
        self,
        job_type: JobType,
        doc_id: str,
        handler: Callable,
        *args,
        **kwargs,
    ) -> str:
        """Submit a job to the queue."""
        jtype_str = job_type.value if hasattr(job_type, "value") else str(job_type)
        job_id = f"{jtype_str}_{doc_id}_{uuid.uuid4().hex[:8]}"

        with self._lock:
            self._status[job_id] = "queued"

        def _wrapped():
            with self._lock:
                self._status[job_id] = "processing"
            try:
                result = handler(*args, **kwargs)
                with self._lock:
                    self._status[job_id] = "completed"
                return result
            except Exception as e:
                with self._lock:
                    self._status[job_id] = "failed"
                raise e

        future = self._executor.submit(_wrapped)

        with self._lock:
            self._futures[job_id] = future

        return job_id

    def get_status(self, job_id: str) -> Optional[str]:
        """Get the current status of a job."""
        with self._lock:
            return self._status.get(job_id)

    def get_result(self, job_id: str, timeout: Optional[float] = None):
        """Get the result of a completed job."""
        with self._lock:
            future = self._futures.get(job_id)
        if not future:
            return None
        try:
            return future.result(timeout=timeout)
        except Exception:
            return None


# ── Global Queue Instance ────────────────────────────────────

_queue = None
_queue_lock = threading.Lock()


def get_job_queue() -> JobQueue:
    global _queue
    if _queue is None:
        with _queue_lock:
            if _queue is None:
                _queue = JobQueue(max_workers=MAX_WORKERS)
    return _queue


def get_worker_count() -> int:
    """Public accessor for the processing worker pool size."""
    q = get_job_queue()
    return q.max_workers

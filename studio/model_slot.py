"""Serialize local inference across Studio processes. Video keeps its separate CPU lock."""
import fcntl
from contextlib import contextmanager


@contextmanager
def model_slot(work):
    with (work / "ollama.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield

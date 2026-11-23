"""Yield the Studio CPU slot to edits, including edits queued after a batch starts."""
import fcntl
import os
import signal
import subprocess


class EditingPending(Exception):
    pass


def editing_pending(db):
    return db.execute("SELECT 1 FROM jobs WHERE state IN ('running','queued') LIMIT 1").fetchone() is not None


def run_background(db, work, args, cancelled=None):
    if editing_pending(db):
        raise EditingPending()
    with (work/'cpu.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise EditingPending() from exc
        if editing_pending(db):
            raise EditingPending()
        child = subprocess.Popen(args, start_new_session=True)
        try:
            while True:
                try:
                    code = child.wait(timeout=.5)
                except subprocess.TimeoutExpired:
                    if cancelled and cancelled():
                        return
                    if editing_pending(db):
                        raise EditingPending()
                    continue
                if code:
                    raise subprocess.CalledProcessError(code, args)
                return
        finally:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()

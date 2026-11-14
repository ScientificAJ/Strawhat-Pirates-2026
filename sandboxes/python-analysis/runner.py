"""Persistent guest command loop; all submitted code remains inside gVisor."""

import codecs
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import traceback
from uuid import uuid4

LIMIT = 65536
PROTOCOL = os.fdopen(os.dup(1), "w", buffering=1)
PROTOCOL_LOCK = threading.Lock()


def emit(value):
    with PROTOCOL_LOCK:
        PROTOCOL.write(json.dumps(value) + "\n")
        PROTOCOL.flush()


class CapturedStreams:
    def __init__(self, command_id):
        self.command_id = command_id
        self.files = {name: tempfile.TemporaryFile(dir="/tmp") for name in ["stdout", "stderr"]}
        self.positions = dict.fromkeys(self.files, 0)
        self.captured = dict.fromkeys(self.files, 0)
        self.hashes = {name: hashlib.sha256() for name in self.files}
        self.decoders = {
            name: codecs.getincrementaldecoder("utf-8")("replace") for name in self.files
        }
        self.final_sizes = None
        self.stop = threading.Event()
        for descriptor, name in [(1, "stdout"), (2, "stderr")]:
            os.dup2(self.files[name].fileno(), descriptor)
        self.thread = threading.Thread(target=self.stream, daemon=True)
        self.thread.start()

    def stream(self):
        while True:
            drained = True
            for name, file in self.files.items():
                available = (
                    self.final_sizes[name]
                    if self.final_sizes is not None
                    else os.fstat(file.fileno()).st_size
                )
                if self.positions[name] >= available:
                    continue
                drained = False
                chunk = os.pread(
                    file.fileno(), min(4096, available - self.positions[name]), self.positions[name]
                )
                self.positions[name] += len(chunk)
                retained = chunk[: max(0, LIMIT - self.captured[name])]
                self.captured[name] += len(retained)
                self.hashes[name].update(retained)
                text = self.decoders[name].decode(retained)
                if text:
                    emit(
                        {
                            "command_id": self.command_id,
                            "event": "output",
                            "stream": name,
                            "text": text,
                        }
                    )
            if self.stop.is_set() and drained:
                break
            if drained:
                self.stop.wait(0.05)

    def finish(self):
        sys.stdout.flush()
        sys.stderr.flush()
        ctypes.CDLL(None).fflush(None)
        self.final_sizes = {
            name: os.fstat(file.fileno()).st_size for name, file in self.files.items()
        }
        self.stop.set()
        self.thread.join(timeout=2)
        if self.thread.is_alive():
            raise RuntimeError("The bounded output stream did not finish.")
        for name in self.files:
            suffix = self.decoders[name].decode(b"", final=True)
            if suffix:
                emit(
                    {
                        "command_id": self.command_id,
                        "event": "output",
                        "stream": name,
                        "text": suffix,
                    }
                )
        result = {
            "output_truncated": any(size > LIMIT for size in self.final_sizes.values()),
            "stdout_encoding": "utf-8-with-replacement",
            "captured_stream_bytes": self.captured,
            "captured_stream_sha256": {
                name: digest.hexdigest() for name, digest in self.hashes.items()
            },
        }
        for file in self.files.values():
            file.close()
        return result


class PersistentShell:
    def __init__(self):
        self.process = subprocess.Popen(
            ["/bin/sh"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
            bufsize=1,
        )
        self.process.stdin.write(
            'nova_ember_report_status() { printf \'%s %s\\n\' "$2" "$1"; '
            'printf \'%s\\n\' "$3" >&2; return "$1"; }\n'
        )
        self.process.stdin.flush()
        self.marker = ""
        self.stderr_done = threading.Event()
        self.stderr_thread = threading.Thread(target=self.read_errors, daemon=True)
        self.stderr_thread.start()

    def read_errors(self):
        for line in self.process.stderr:
            if self.marker and self.marker in line:
                prefix = line.partition(self.marker)[0]
                if prefix:
                    sys.stderr.write(prefix)
                self.stderr_done.set()
            else:
                sys.stderr.write(line)
        self.stderr_done.set()

    def execute(self, code):
        marker = "NOVA_END_" + uuid4().hex
        self.marker = marker + "_STDERR"
        self.stderr_done.clear()
        self.process.stdin.write(
            code + '\nnova_ember_report_status "$?" ' + marker + " " + self.marker + "\n"
        )
        self.process.stdin.flush()
        for line in self.process.stdout:
            if marker + " " in line:
                prefix, _, status_text = line.partition(marker + " ")
                if prefix:
                    sys.stdout.write(prefix)
                status = int(status_text)
                if not self.stderr_done.wait(2):
                    raise RuntimeError("Shell stderr did not reach its command boundary.")
                return status
            sys.stdout.write(line)
        self.stderr_done.wait(2)
        return self.process.wait()


namespace = {"__name__": "__main__"}
shell = None
for line in sys.stdin:
    request = json.loads(line)
    captured = CapturedStreams(request["command_id"])
    exit_code = 0
    try:
        if request["language"] == "python":
            exec(compile(request["code"], "<research-cell>", "exec"), namespace)
        else:
            if shell is None or shell.process.poll() is not None:
                shell = PersistentShell()
            exit_code = shell.execute(request["code"])
    except BaseException:
        traceback.print_exc(file=sys.stderr)
        exit_code = 1
    answer = {"command_id": request["command_id"], "exit_code": exit_code, **captured.finish()}
    emit(answer)

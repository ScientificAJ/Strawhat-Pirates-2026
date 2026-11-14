"""Execute one registered calculation under a fixed trusted CPU/memory profile."""

import json
import os
import resource
import sys


def main() -> None:
    if sys.platform == "linux":
        import ctypes
        import signal

        parent = os.getppid()
        if parent == 1 or ctypes.CDLL(None).prctl(1, signal.SIGKILL) != 0 or os.getppid() != parent:
            raise RuntimeError("The registered calculation lost its supervising process.")
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024 * 1024,) * 2)
    from .methods import MethodCall, implementation_hash, run_method

    content = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise ValueError("Selected calculation inputs exceed the two MiB limit.")
    request = MethodCall.model_validate_json(content)
    result = run_method(request)
    usage = resource.getrusage(resource.RUSAGE_SELF)
    print(
        json.dumps(
            {
                "result": result,
                "resources": {
                    "peak_rss_kib": usage.ru_maxrss,
                    "user_cpu_seconds": usage.ru_utime,
                    "system_cpu_seconds": usage.ru_stime,
                    "memory_limit_mib": 512,
                    "elapsed_limit_seconds": 30,
                    "numerical_threads": 1,
                    "implementation_sha256": implementation_hash(),
                    "python_version": sys.version.split()[0],
                },
            },
            allow_nan=False,
        )
    )


if __name__ == "__main__":
    main()

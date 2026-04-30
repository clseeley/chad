from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/api/auth/register": (5, 60),
    "/api/auth/login": (10, 60),
    "/api/conversations/message": (20, 60),
    "/api/training/generate": (3, 60),
}

_buckets: dict[str, list[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit_config = RATE_LIMITS.get(path)
        if limit_config and request.method == "POST":
            max_requests, window = limit_config
            ip = request.client.host if request.client else "unknown"
            key = f"{ip}:{path}"

            now = time.time()
            _buckets[key] = [t for t in _buckets[key] if now - t < window]

            if len(_buckets[key]) >= max_requests:
                return Response(
                    content='{"detail":"Rate limit exceeded"}',
                    status_code=429,
                    media_type="application/json",
                )
            _buckets[key].append(now)

        return await call_next(request)

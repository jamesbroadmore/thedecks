"""
Reverse proxy backend for "thedecks".

The Emergent ingress routes every request whose path starts with /api to this
service (uvicorn on :8001) and everything else to the Next.js dev server (:3000).
Because this is a Next.js full-stack app, its API route handlers live inside the
Next.js process on :3000, so this backend simply forwards /api/* traffic there,
streaming both the request and response bodies so that large audio uploads and
ranged audio playback keep working.
"""
import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

NEXT_ORIGIN = os.environ.get("NEXT_ORIGIN", "http://127.0.0.1:3000")

# Hop-by-hop headers that must not be forwarded verbatim.
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
}

app = FastAPI(title="thedecks-proxy")
client = httpx.AsyncClient(base_url=NEXT_ORIGIN, timeout=None)


@app.get("/api/_proxy/health")
async def health():
    return {"status": "ok", "proxy": "thedecks", "next_origin": NEXT_ORIGIN}


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    url = httpx.URL(path="/" + path, query=request.url.query.encode("utf-8"))

    # The Emergent/Cloudflare edge rewrites the Origin header to an internal
    # cluster host, which breaks better-auth's CSRF origin check. Rebuild a
    # clean Origin from x-forwarded-host so it matches BETTER_AUTH_URL.
    xf_host = request.headers.get("x-forwarded-host")
    xf_proto = request.headers.get("x-forwarded-proto", "https")
    clean_origin = f"{xf_proto}://{xf_host}".encode("latin-1") if xf_host else None

    fwd_headers = []
    for k, v in request.headers.raw:
        kl = k.decode("latin-1").lower()
        if kl in HOP_BY_HOP or kl == "host":
            continue
        if kl == "origin" and clean_origin:
            v = clean_origin
        fwd_headers.append((k, v))

    upstream_req = client.build_request(
        request.method,
        url,
        headers=fwd_headers,
        content=request.stream(),
    )
    upstream_resp = await client.send(upstream_req, stream=True)

    resp_headers = [
        (k, v)
        for k, v in upstream_resp.headers.raw
        if k.decode("latin-1").lower() not in HOP_BY_HOP
    ]

    return StreamingResponse(
        upstream_resp.aiter_raw(),
        status_code=upstream_resp.status_code,
        headers=dict(
            (k.decode("latin-1"), v.decode("latin-1")) for k, v in resp_headers
        ),
        background=BackgroundTask(upstream_resp.aclose),
    )

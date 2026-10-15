#!/usr/bin/env python3
"""No-cache dev server for the game. In a git worktree, /assets/* comes from the
main checkout, everything else from this worktree. Override with --assets-root.

The kids' guide's tutor (learn/tutor/) talks to an AI model. Started with
RADIUS_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY set, the server passes the tutor's
requests on under /llm/<provider>/ and adds the key, so the key never reaches the browser.
GET /llm/providers lists the providers it has a key for. A key pasted into the tutor goes
from the browser straight to the provider and never passes through here.

Usage: uv run --no-project tools/serve.py [port] [--assets-root REPO]
"""
import argparse
import http.server
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def default_assets_root():
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=ROOT, text=True, capture_output=True, check=True,
        ).stdout.strip()
        main = Path(common).parent
        if (main / "assets").is_dir():
            return main
    except (OSError, subprocess.CalledProcessError):
        pass
    return ROOT


# provider -> (upstream, environment variable with the key, header that carries it)
LLM = {
    "radius": ("https://radius.pi.dev", "RADIUS_API_KEY", lambda key: {"Authorization": f"Bearer {key}"}),
    "anthropic": ("https://api.anthropic.com", "ANTHROPIC_API_KEY", lambda key: {"x-api-key": key}),
    "openai": ("https://api.openai.com", "OPENAI_API_KEY", lambda key: {"Authorization": f"Bearer {key}"}),
}
# request headers passed on (the SDKs' own), and response headers passed back
LLM_REQUEST_HEADERS = {"content-type", "accept", "anthropic-version", "anthropic-beta", "openai-beta", "user-agent"}
LLM_RESPONSE_HEADERS = {"content-type", "request-id", "x-request-id", "retry-after"}


def llm_keys():
    return {name: os.environ[var] for name, (_, var, _) in LLM.items() if os.environ.get(var)}


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    assets = ROOT / "assets"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        local = Path(super().translate_path(path))
        if local.is_relative_to(ROOT / "assets"):
            asset = (self.assets / local.relative_to(ROOT / "assets")).resolve()
            # Do not follow an asset symlink out of the designated asset directory.
            if asset.is_relative_to(self.assets):
                return str(asset)
            return str(ROOT / ".not-served")
        return str(local)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/llm/providers":
            body = json.dumps(sorted(llm_keys())).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        parts = self.path.split("/", 3)  # "", "llm", provider, rest
        if len(parts) < 4 or parts[1] != "llm" or parts[2] not in LLM or not parts[3].startswith("v1/"):
            self.send_error(404)
            return
        # only the guide itself may spend the key: same origin, JSON
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            self.send_error(403, "cross-origin request")
            return
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            self.send_error(415)
            return
        upstream, _, auth = LLM[parts[2]]
        key = llm_keys().get(parts[2])
        if not key:
            self.send_error(503, f"no key for {parts[2]} on the dev server")
            return
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        headers = {k: v for k, v in self.headers.items() if k.lower() in LLM_REQUEST_HEADERS}
        headers.update(auth(key))
        request = urllib.request.Request(f"{upstream}/{parts[3]}", data=body, headers=headers, method="POST")
        try:
            response = urllib.request.urlopen(request, timeout=300)
        except urllib.error.HTTPError as error:
            response = error
        except OSError as error:
            self.send_error(502, str(error))
            return
        with response:
            self.send_response(response.status)
            for k, v in response.headers.items():
                if k.lower() in LLM_RESPONSE_HEADERS or k.lower().startswith("anthropic-"):
                    self.send_header(k, v)
            self.end_headers()
            # streamed answers (server-sent events) go on as they arrive; the end of the
            # body is the end of the connection
            read = getattr(response, "read1", response.read)
            while chunk := read(65536):
                self.wfile.write(chunk)
                self.wfile.flush()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--assets-root", type=Path, default=default_assets_root(), help="checkout containing assets/")
    parser.add_argument("--bind", default="0.0.0.0")
    args = parser.parse_args()
    NoCacheHandler.assets = (args.assets_root.expanduser().resolve() / "assets")
    if not NoCacheHandler.assets.is_dir():
        parser.error("--assets-root must contain assets/")
    print(f"serving on http://{args.bind}:{args.port}/", flush=True)
    print(f"Assets: {NoCacheHandler.assets}", flush=True)
    if llm_keys():
        print(f"Tutor models via /llm/: {', '.join(sorted(llm_keys()))}", flush=True)
        if args.bind not in ("127.0.0.1", "localhost", "::1"):
            print("Warning: anyone who can reach this server can use these API keys.", flush=True)
    http.server.ThreadingHTTPServer((args.bind, args.port), NoCacheHandler).serve_forever()

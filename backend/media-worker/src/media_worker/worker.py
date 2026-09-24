import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            status = 200
            body = {"status": "up", "service": "media-worker"}
        elif self.path == "/ready":
            status = 503
            missing = [name for name in ("CORE_INTERNAL_URL", "MEDIA_SERVICE_TOKEN") if not os.getenv(name)]
            body = {"ready": False, "missing": missing or ["media processing integration (PR-18)"]}
        else:
            status = 404
            body = {"error": "not_found"}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    port = int(os.getenv("MEDIA_STATUS_PORT", "4200"))
    HTTPServer(("0.0.0.0", port), StatusHandler).serve_forever()


if __name__ == "__main__":
    main()

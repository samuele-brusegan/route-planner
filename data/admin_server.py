#!/usr/bin/env python3
"""
Valhalla admin server.

Runs inside the valhalla container alongside valhalla_service. Exposes a
small HTTP admin API used by the routing service to:
- inspect local tile status
- download a Geofabrik PBF and build Valhalla tiles
- restart valhalla_service after a successful build
- track progress of long-running build jobs

Endpoints:
  GET  /health
  GET  /tiles/status
  GET  /tiles/regions
  POST /tiles/build       body: {"region": "<id>"}    -> {"jobId": "..."}
  GET  /tiles/jobs/<id>
  POST /service/restart
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen, Request

DATA_DIR = "/data"
TILE_DIR = os.path.join(DATA_DIR, "valhalla_tiles")
TILE_EXTRACT = os.path.join(DATA_DIR, "valhalla_tiles.tar")
CONFIG_FILE = os.path.join(DATA_DIR, "valhalla.generated.json")
STATE_FILE = os.path.join(DATA_DIR, "tiles-state.json")
ADMIN_PORT = int(os.environ.get("ADMIN_PORT", "8003"))
VALHALLA_PORT = int(os.environ.get("VALHALLA_PORT", "8002"))

# Curated Geofabrik regions
REGIONS = [
    {"id": "italy", "label": "Italia (intera)", "url": "https://download.geofabrik.de/europe/italy-latest.osm.pbf", "estMb": 2200},
    {"id": "italy-nord-ovest", "label": "Italia Nord-Ovest", "url": "https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf", "estMb": 600},
    {"id": "italy-nord-est", "label": "Italia Nord-Est", "url": "https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf", "estMb": 500},
    {"id": "italy-centro", "label": "Italia Centro", "url": "https://download.geofabrik.de/europe/italy/centro-latest.osm.pbf", "estMb": 400},
    {"id": "italy-sud", "label": "Italia Sud", "url": "https://download.geofabrik.de/europe/italy/sud-latest.osm.pbf", "estMb": 350},
    {"id": "italy-isole", "label": "Italia Isole", "url": "https://download.geofabrik.de/europe/italy/isole-latest.osm.pbf", "estMb": 250},
    {"id": "germany", "label": "Germania", "url": "https://download.geofabrik.de/europe/germany-latest.osm.pbf", "estMb": 4200},
    {"id": "france", "label": "Francia", "url": "https://download.geofabrik.de/europe/france-latest.osm.pbf", "estMb": 4500},
    {"id": "switzerland", "label": "Svizzera", "url": "https://download.geofabrik.de/europe/switzerland-latest.osm.pbf", "estMb": 450},
    {"id": "austria", "label": "Austria", "url": "https://download.geofabrik.de/europe/austria-latest.osm.pbf", "estMb": 700},
]
REGIONS_BY_ID = {r["id"]: r for r in REGIONS}

# In-memory job tracking
_jobs_lock = threading.Lock()
_jobs = {}

# valhalla_service process management
_valhalla_lock = threading.Lock()
_valhalla_proc = None


def log(*args):
    print("[admin]", *args, file=sys.stderr, flush=True)


def load_state():
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)


def has_built_tiles():
    if not os.path.isdir(TILE_DIR):
        return False
    # Look for any .gph tile file at any depth
    for root, _, files in os.walk(TILE_DIR):
        for name in files:
            if name.endswith(".gph"):
                return True
    return False


def tiles_status():
    state = load_state()
    return {
        "hasLocalTiles": has_built_tiles(),
        "extractExists": os.path.isfile(TILE_EXTRACT),
        "region": state.get("region"),
        "builtAt": state.get("builtAt"),
        "pbfFile": state.get("pbfFile"),
        "tileDir": TILE_DIR,
        "extractFile": TILE_EXTRACT,
    }


def start_valhalla():
    global _valhalla_proc
    with _valhalla_lock:
        if _valhalla_proc and _valhalla_proc.poll() is None:
            return
        if not has_built_tiles():
            log("not starting valhalla_service: no local tiles")
            _valhalla_proc = None
            return
        log("starting valhalla_service")
        _valhalla_proc = subprocess.Popen(
            ["valhalla_service", CONFIG_FILE, "1"],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )


def stop_valhalla(timeout=10):
    global _valhalla_proc
    with _valhalla_lock:
        proc = _valhalla_proc
        _valhalla_proc = None
    if proc and proc.poll() is None:
        log("stopping valhalla_service")
        try:
            proc.terminate()
            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        except Exception as e:
            log("stop error", e)


def supervise_valhalla():
    """Restart valhalla_service if it dies unexpectedly while tiles exist."""
    global _valhalla_proc
    while True:
        time.sleep(5)
        with _valhalla_lock:
            proc = _valhalla_proc
        if proc is None:
            if has_built_tiles():
                start_valhalla()
            continue
        if proc.poll() is not None:
            log("valhalla_service exited with code", proc.returncode)
            with _valhalla_lock:
                if _valhalla_proc is proc:
                    _valhalla_proc = None
            time.sleep(2)
            if has_built_tiles():
                start_valhalla()


def update_job(job_id, **fields):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(fields)
        job["updatedAt"] = time.time()


def get_job(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def new_job(region_id):
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            "id": job_id,
            "region": region_id,
            "phase": "queued",
            "progress": 0,
            "message": "",
            "error": None,
            "createdAt": time.time(),
            "updatedAt": time.time(),
        }
    return job_id


def download_pbf(region, job_id):
    pbf_path = os.path.join(DATA_DIR, f"{region['id']}-latest.osm.pbf")
    update_job(job_id, phase="download", progress=0, message=f"Scaricamento {region['label']}")

    # Skip if file looks valid
    if os.path.isfile(pbf_path) and os.path.getsize(pbf_path) > 5_000_000:
        update_job(job_id, message=f"PBF già presente ({os.path.getsize(pbf_path)//1024//1024}MB)", progress=100)
        return pbf_path

    tmp = pbf_path + ".part"
    req = Request(region["url"], headers={"User-Agent": "RoutePlanner/1.0"})
    with urlopen(req, timeout=60) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        downloaded = 0
        chunk = 1024 * 256
        last_emit = 0
        with open(tmp, "wb") as out:
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                out.write(buf)
                downloaded += len(buf)
                now = time.time()
                if now - last_emit > 0.5:
                    pct = int(downloaded * 100 / total) if total else 0
                    mb = downloaded // 1024 // 1024
                    total_mb = total // 1024 // 1024 if total else region.get("estMb", 0)
                    update_job(job_id, progress=pct, message=f"Scaricati {mb}MB / ~{total_mb}MB")
                    last_emit = now
    os.replace(tmp, pbf_path)
    update_job(job_id, progress=100, message="Download completato")
    return pbf_path


def run_command_streaming(cmd, job_id, phase, message_prefix):
    update_job(job_id, phase=phase, progress=0, message=f"{message_prefix} in corso")
    log("running:", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    last_line = ""
    for line in proc.stdout:
        last_line = line.rstrip()
        if last_line:
            sys.stderr.write(last_line + "\n")
            sys.stderr.flush()
            update_job(job_id, message=last_line[:200])
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"{message_prefix} fallito (exit {rc}): {last_line}")
    update_job(job_id, progress=100)


def patch_config():
    patcher = "/data/patch_config.py"
    if os.path.isfile(patcher):
        log("patching config")
        subprocess.run([sys.executable, patcher], check=True)


def build_job(region_id):
    region = REGIONS_BY_ID.get(region_id)
    if not region:
        raise ValueError(f"Unknown region: {region_id}")

    job_id = new_job(region_id)

    def runner():
        try:
            patch_config()
            pbf = download_pbf(region, job_id)

            # Stop valhalla_service so it releases tiles
            update_job(job_id, phase="stopping", message="Arresto motore Valhalla")
            stop_valhalla()

            # Clean previous tiles
            update_job(job_id, phase="clean", message="Pulizia tile esistenti")
            if os.path.isdir(TILE_DIR):
                shutil.rmtree(TILE_DIR, ignore_errors=True)
            if os.path.isfile(TILE_EXTRACT):
                try:
                    os.remove(TILE_EXTRACT)
                except OSError:
                    pass
            os.makedirs(TILE_DIR, exist_ok=True)

            # Build tiles (long)
            run_command_streaming(
                ["valhalla_build_tiles", "-c", CONFIG_FILE, pbf],
                job_id, "build", "Build tile"
            )

            # Build extract tar
            run_command_streaming(
                ["valhalla_build_extract", "-c", CONFIG_FILE, "-v"],
                job_id, "extract", "Build extract"
            )

            save_state({
                "region": region_id,
                "regionLabel": region["label"],
                "builtAt": time.time(),
                "pbfFile": os.path.basename(pbf),
            })

            # Restart valhalla_service with new tiles
            update_job(job_id, phase="restart", message="Riavvio motore Valhalla")
            start_valhalla()

            update_job(job_id, phase="done", progress=100, message="Tile pronte")
        except Exception as e:
            log("build job error:", e)
            update_job(job_id, phase="error", error=str(e), message=str(e))

    threading.Thread(target=runner, daemon=True).start()
    return job_id


class AdminHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write("[admin] " + format % args + "\n")

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/health":
            return self._send(200, {"ok": True})
        if path == "/tiles/status":
            return self._send(200, tiles_status())
        if path == "/tiles/regions":
            return self._send(200, {"regions": REGIONS})
        if path.startswith("/tiles/jobs/"):
            jid = path.rsplit("/", 1)[-1]
            job = get_job(jid)
            if not job:
                return self._send(404, {"error": "job not found"})
            return self._send(200, job)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/tiles/build":
            data = self._read_json()
            region_id = data.get("region")
            if region_id not in REGIONS_BY_ID:
                return self._send(400, {"error": f"unknown region: {region_id}"})
            try:
                jid = build_job(region_id)
                return self._send(202, {"jobId": jid})
            except Exception as e:
                return self._send(500, {"error": str(e)})
        if path == "/service/restart":
            stop_valhalla()
            start_valhalla()
            return self._send(200, {"ok": True})
        return self._send(404, {"error": "not found"})


def main():
    log(f"listening on 0.0.0.0:{ADMIN_PORT}")
    threading.Thread(target=supervise_valhalla, daemon=True).start()
    # Initial start if tiles exist
    if has_built_tiles():
        start_valhalla()
    else:
        log("no local tiles yet; valhalla_service will start after first build")

    def handle_signal(signum, _frame):
        log("signal", signum)
        stop_valhalla()
        sys.exit(0)
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    server = ThreadingHTTPServer(("0.0.0.0", ADMIN_PORT), AdminHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
LIBRARY_NAME = "library"
MEDIA_SUFFIXES = {".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac"}


class ListeningHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/library":
            self.serve_library()
            return
        if self.is_root_request(parsed.path):
            self.serve_index()
            return
        if self.is_media_request(parsed.path):
            self.handle_media(parsed, head_only=False)
            return
        super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/library":
            self.serve_library(head_only=True)
            return
        if self.is_root_request(parsed.path):
            self.serve_index(head_only=True)
            return
        if self.is_media_request(parsed.path):
            self.handle_media(parsed, head_only=True)
            return
        super().do_HEAD()

    def do_POST(self):
        self.send_error(404, "File not found")

    def is_root_request(self, request_path):
        return request_path in {"", "/"}

    def is_media_request(self, request_path):
        return Path(request_path).suffix.lower() in MEDIA_SUFFIXES

    def serve_index(self, head_only=False):
        self.serve_file(ROOT / "index.html", head_only=head_only)

    def serve_library(self, head_only=False):
        self.send_json(scan_library(), head_only=head_only)

    def serve_file(self, file_path, head_only=False):
        if not file_path.is_file():
            self.send_error(404, "File not found")
            return

        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(file_path)))
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()

        if head_only:
            return

        with file_path.open("rb") as file:
            self.copyfile(file, self.wfile)

    def send_json(self, payload, status=200, head_only=False):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def handle_media(self, parsed, head_only=False):
        file_path = Path(self.translate_path(parsed.path))
        if not file_path.is_file():
            self.send_error(404, "File not found")
            return

        file_size = file_path.stat().st_size
        byte_range = parse_range(self.headers.get("Range"), file_size)

        if byte_range == "invalid":
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if byte_range:
            start, end = byte_range
            status = 206
            content_length = end - start + 1
        else:
            start, end = 0, file_size - 1
            status = 200
            content_length = file_size

        self.send_response(status)
        self.send_header("Content-Type", self.guess_type(str(file_path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(content_length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.end_headers()

        if head_only:
            return

        with file_path.open("rb") as file:
            file.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk = file.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                    return
                remaining -= len(chunk)

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))


def scan_library(root=None):
    """遍历 library/，按 basename 配对 mp3+srt，输出 Source→Collection→Item 三层结构。

    - Item = 同目录、同 basename 的音频 + .srt；缺任一不构成 item。
    - Source = 路径相对 library/ 的第 1 段目录；Collection = 第 2 段。
      若 item 直接位于 Source 下（相对路径 2 段）则无 Collection、归属 Source 自身；
      根层级（相对路径 1 段）归入借位 Source ""。
    - Title = 同目录下 <stem>.txt 或 title.txt 的首行，否则人性化 basename。
    - root 可注入以便单测（传项目根，库目录恒为 <root>/library）。
    """
    project_root = ROOT if root is None else root
    base = (project_root / LIBRARY_NAME).resolve()
    if not base.is_dir():
        return {"sources": []}

    pairs: dict[tuple[str, str], list[dict]] = {}
    for audio in sorted(base.rglob("*")):
        if not audio.is_file() or audio.suffix.lower() not in MEDIA_SUFFIXES:
            continue
        srt = audio.with_suffix(".srt")
        if not srt.is_file():
            continue

        parts = audio.relative_to(base).parts
        if len(parts) >= 3:
            source_name, collection_name = parts[0], parts[1]
        elif len(parts) == 2:
            source_name, collection_name = parts[0], ""
        else:
            source_name, collection_name = "", ""

        stem = audio.stem
        item = {
            "id": stem,
            "title": item_title(audio) or humanize_title(stem),
            "audio": library_relative(base, audio),
            "transcript": library_relative(base, srt),
            "available": True,
        }
        pairs.setdefault((source_name, collection_name), []).append(item)

    source_map: dict[str, dict] = {}
    for (source_name, collection_name), items in pairs.items():
        source = source_map.setdefault(
            source_name,
            {
                "id": source_name or "library",
                "title": humanize_title(source_name) if source_name else "Library",
                "items": [],
                "collections": [],
            },
        )
        if collection_name:
            collection = next(
                (entry for entry in source["collections"] if entry["id"] == collection_name),
                None,
            )
            if collection is None:
                collection = {
                    "id": collection_name,
                    "title": humanize_title(collection_name),
                    "items": [],
                }
                source["collections"].append(collection)
            collection["items"].extend(items)
        else:
            source["items"].extend(items)

    for source in source_map.values():
        source["items"].sort(key=lambda item: item["title"].lower())
        for collection in source["collections"]:
            collection["items"].sort(key=lambda item: item["title"].lower())
        source["collections"].sort(key=lambda collection: collection["title"].lower())

    sources = sorted(source_map.values(), key=lambda source: source["title"].lower())
    return {"sources": sources}


def item_title(audio):
    for candidate in (audio.with_suffix(".txt"), audio.parent / "title.txt"):
        try:
            if candidate.is_file():
                line = candidate.read_text(encoding="utf-8", errors="replace").strip()
                if line:
                    return line.splitlines()[0]
        except OSError:
            continue
    return None


def humanize_title(stem):
    text = re.sub(r"^\d{4}[-_]\d{2}[-_]\d{2}", "", stem)
    text = re.sub(r"^\d{4}[-_]\d{2}", "", text)
    text = re.sub(r"^\d{6,8}", "", text)
    text = re.sub(r"[-_]+", " ", text).strip()
    text = re.sub(r"^\d+\s+", "", text)
    words = [word for word in re.split(r"\s+", text) if word]
    if not words:
        return stem
    return " ".join(word[:1].upper() + word[1:] for word in words)


def library_relative(base, path):
    return f"{LIBRARY_NAME}/{path.relative_to(base).as_posix()}"


def parse_range(range_header, file_size):
    if not range_header:
        return None
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not match:
        return "invalid"

    start_text, end_text = match.groups()
    if not start_text and not end_text:
        return "invalid"

    if start_text:
        start = int(start_text)
        end = int(end_text) if end_text else file_size - 1
    else:
        suffix_length = int(end_text)
        if suffix_length <= 0:
            return "invalid"
        start = max(0, file_size - suffix_length)
        end = file_size - 1

    if start >= file_size or end < start:
        return "invalid"

    return start, min(end, file_size - 1)


def run():
    start_port = int(os.environ.get("PORT", "5173"))
    server = None
    port = start_port

    for candidate in range(start_port, start_port + 50):
        try:
            server = ThreadingHTTPServer(("0.0.0.0", candidate), ListeningHandler)
            port = candidate
            break
        except OSError:
            continue

    if server is None:
        raise RuntimeError("No available local port found.")

    print(f"Echo listening player: http://0.0.0.0:{port}/")
    print("Add English audio by dropping an MP3 and its matching .srt into the library/ folder.")
    print("\n[IMPORTANT] If the page looks broken, please press Ctrl + F5 to force refresh your browser cache.")
    server.serve_forever()


if __name__ == "__main__":
    run()

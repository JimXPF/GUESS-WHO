# -*- coding: utf-8 -*-
"""Restore Wiki gallery to Figma shots 01-05 only; sync MD macros."""
from __future__ import annotations

import base64
import json
import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

PAGE_ID = "119716471"
DOCS = Path(r"E:\GUESS Who\docs")
ENV = Path(r"C:\Users\user\Desktop\wiki.env")
DESIGN = DOCS / "GAME_DESIGN.md"
UI = DOCS / "UI_SCREENS.md"
BASE = "https://wiki.shdev.net"

SHOT_META = [
    ("01-home-mode-select.png", "Frame 987 玩法/主题选择", "39521:2246"),
    ("02-progressive.png", "逐步", "39544:2617"),
    ("03-battle.png", "对战", "39571:7195"),
    ("04-relay-start.png", "接龙-开始", "39594:2766"),
    ("05-relay-waiting.png", "接龙-轮流答题", "39596:2851"),
]
REMOVE = [
    "06-classic-start.png",
    "07-classic-guessing.png",
    "08-result-classic.png",
    "09-lobby-create.png",
    "10-lobby-waiting.png",
    "11-leaderboard.png",
]


def auth_header() -> str:
    lines = ENV.read_text(encoding="utf-8").splitlines()
    user = next(x.split(":", 1)[1].strip() for x in lines if x.startswith("wikiAccount"))
    password = next(x.split(":", 1)[1].strip() for x in lines if x.startswith("wikiPassword"))
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


CTX = ssl._create_unverified_context()
AUTH = auth_header()


def req(method: str, url: str, data: bytes | None = None, headers: dict | None = None):
    h = {"Authorization": AUTH, "Accept": "application/json", **(headers or {})}
    request = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(request, context=CTX, timeout=120) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} -> {e.code}: {err[:400]}") from e


def md_macro(md: str) -> str:
    return (
        '<ac:structured-macro ac:name="markdown" ac:schema-version="1">'
        f"<ac:plain-text-body><![CDATA[{md}]]></ac:plain-text-body>"
        "</ac:structured-macro>"
    )


def gallery_html() -> str:
    parts = [
        "<h2>界面截图画廊</h2>",
        "<p>Figma「小游戏」关键帧预览（设计稿）。点标题可跳转对应节点。</p>",
        '<ac:structured-macro ac:name="gallery" ac:schema-version="1">'
        '<ac:parameter ac:name="columns">2</ac:parameter>'
        "</ac:structured-macro>",
        "<table><tbody>",
    ]
    for file, layer, node in SHOT_META:
        nid = node.replace(":", "-")
        link = (
            "https://www.figma.com/design/rq2qU0Z6rNG97H4xz1xioU/"
            f"PWA%E8%AE%BE%E8%AE%A1%E6%9C%80%E6%96%B0%E6%96%87%E4%BB%B6-2023-2025?node-id={nid}"
        )
        parts.append(
            "<tr><td>"
            f"<p><strong>{escape(layer)}</strong> · "
            f'<a href="{escape(link)}">{escape(node)}</a></p>'
            f'<p><ac:image ac:width="480"><ri:attachment ri:filename="{escape(file)}" /></ac:image></p>'
            "</td></tr>"
        )
    parts.append("</tbody></table>")
    return "\n".join(parts)


def delete_attachment(filename: str) -> None:
    list_url = f"{BASE}/rest/api/content/{PAGE_ID}/child/attachment?filename={filename}&limit=5"
    _, raw = req("GET", list_url)
    results = json.loads(raw.decode()).get("results", [])
    if not results:
        print("no attach", filename)
        return
    att_id = results[0]["id"]
    try:
        req("DELETE", f"{BASE}/rest/api/content/{att_id}?status=current")
        print("deleted", filename, att_id)
    except RuntimeError as e:
        print("delete fail", filename, str(e)[:160])


def main() -> None:
    for name in REMOVE:
        delete_attachment(name)

    _, raw = req(
        "GET",
        f"{BASE}/rest/api/content/{PAGE_ID}?expand=body.storage,version,title",
    )
    page = json.loads(raw.decode())
    storage = page["body"]["storage"]["value"]
    ver = page["version"]["number"]

    macros = list(
        re.finditer(
            r'<ac:structured-macro ac:name="markdown"[^>]*>.*?</ac:structured-macro>',
            storage,
            flags=re.S,
        )
    )
    if len(macros) < 2:
        raise RuntimeError(f"expected >=2 markdown macros, found {len(macros)}")

    m1, m2 = macros[0], macros[1]
    before = storage[: m1.start()]
    after = storage[m2.end() :]
    new_storage = (
        before
        + md_macro(DESIGN.read_text(encoding="utf-8"))
        + "\n"
        + gallery_html()
        + "\n"
        + md_macro(UI.read_text(encoding="utf-8"))
        + after
    )

    payload = {
        "id": PAGE_ID,
        "type": "page",
        "title": page["title"],
        "version": {
            "number": ver + 1,
            "message": "去掉实现态混乱截图，恢复仅保留 Figma 01–05 画廊",
        },
        "body": {"storage": {"value": new_storage, "representation": "storage"}},
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    status, raw = req(
        "PUT",
        f"{BASE}/rest/api/content/{PAGE_ID}",
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    out = json.loads(raw.decode())
    print("published", status, "v" + str(out["version"]["number"]))
    print(f"{BASE}/pages/viewpage.action?pageId={PAGE_ID}")


if __name__ == "__main__":
    main()

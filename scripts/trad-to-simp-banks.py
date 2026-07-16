# -*- coding: utf-8 -*-
"""Convert Traditional Chinese strings in theme JSON banks to Simplified."""
from __future__ import annotations

import json
from pathlib import Path

from opencc import OpenCC

ROOT = Path(r"E:\GUESS Who")
DATA_DIRS = [
    ROOT / "server-go" / "data",
    ROOT / "server" / "data",
]
cc = OpenCC("t2s")


def convert_value(value, path: str, changes: list):
    if isinstance(value, str):
        converted = cc.convert(value)
        if converted != value:
            changes.append((path, value, converted))
        return converted
    if isinstance(value, list):
        return [convert_value(v, f"{path}[{i}]", changes) for i, v in enumerate(value)]
    if isinstance(value, dict):
        return {k: convert_value(v, f"{path}.{k}", changes) for k, v in value.items()}
    return value


def process_file(path: Path) -> list:
    raw = path.read_bytes()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    data = json.loads(text)
    changes: list = []
    new_data = convert_value(data, path.name, changes)
    if not changes:
        return changes

    # Prefer in-place string replacements to keep formatting/order stable.
    new_text = text
    # Replace longer strings first to avoid partial overlaps.
    pairs = sorted({(old, new) for _, old, new in changes}, key=lambda x: len(x[0]), reverse=True)
    for old, new in pairs:
        if old not in new_text:
            # Fallback: full dump if literal missing (escaped differently)
            new_text = None
            break
        new_text = new_text.replace(old, new)

    if new_text is None:
        new_text = json.dumps(new_data, ensure_ascii=False, indent=2) + "\n"

    out_bytes = new_text.encode("utf-8")
    if has_bom:
        out_bytes = b"\xef\xbb\xbf" + out_bytes
    path.write_bytes(out_bytes)
    return changes


def main():
    all_changes = []
    report_lines = []
    for data_dir in DATA_DIRS:
        if not data_dir.is_dir():
            continue
        for path in sorted(data_dir.rglob("*.json")):
            changes = process_file(path)
            rel = path.relative_to(ROOT)
            if not changes:
                report_lines.append(f"OK  {rel} (no trad chars)")
                continue
            report_lines.append(f"FIX {rel} ({len(changes)} strings)")
            for p, old, new in changes[:80]:
                report_lines.append(f"  - {old!r} -> {new!r}  @ {p}")
            if len(changes) > 80:
                report_lines.append(f"  ... and {len(changes) - 80} more")
            all_changes.extend(changes)

    out = ROOT / "docs" / "_trad_to_simp_report.txt"
    out.write_text(
        "\n".join(report_lines) + f"\n\nTOTAL={len(all_changes)}\n",
        encoding="utf-8",
    )
    print(f"TOTAL={len(all_changes)}")
    print(f"REPORT={out}")


if __name__ == "__main__":
    main()

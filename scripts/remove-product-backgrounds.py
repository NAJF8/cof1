"""Create transparent product-image previews without replacing source files.

The script is intentionally preview-only: it copies opaque source images to a
backup directory, writes PNG results to a separate preview directory, and
produces CSV/JSON reports. It never writes to assets/products or Firebase.

Dependency (install outside the project when needed):
    python -m pip install "rembg[cpu]" pillow

The rembg model is downloaded/cached locally on first use; inference is local.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
import time
import uuid
from pathlib import Path

from PIL import Image


SUPPORTED = {".png", ".jpg", ".jpeg", ".webp"}


def has_real_transparency(path: Path) -> bool:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        return rgba.getchannel("A").getextrema()[0] < 255


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("assets/products"))
    parser.add_argument("--backup", type=Path, default=Path("assets/products-original-backup"))
    parser.add_argument("--output", type=Path, default=Path("assets/products-transparent-preview"))
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    try:
        from rembg import new_session, remove
    except ImportError:
        print("ERROR: rembg is not installed. Install it with: python -m pip install \"rembg[cpu]\" pillow", file=sys.stderr)
        return 2

    args.backup.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.report or args.output / "background-removal-report.csv"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    files = sorted(path for path in args.input.iterdir() if path.is_file() and path.suffix.lower() in SUPPORTED)
    already_transparent = []
    to_process = []
    for path in files:
        if has_real_transparency(path):
            already_transparent.append(path)
        else:
            to_process.append(path)

    # u2net is a local segmentation model. The first run may populate rembg's
    # local model cache; no image or Firebase data is sent to a remote API.
    session = new_session("u2net")
    rows = []
    success = 0
    failed = 0
    started = time.time()

    for source in to_process:
        preview = args.output / f"{source.stem}.png"
        backup = args.backup / source.name
        row = {
            "product_file": source.name,
            "original_format": source.suffix.lower().lstrip("."),
            "processed_file": preview.name,
            "output_format": "png",
            "original_dimensions": "",
            "output_dimensions": "",
            "original_bytes": source.stat().st_size,
            "output_bytes": "",
            "alpha_present": "NO",
            "result": "FAILED",
            "error": "",
        }
        try:
            with Image.open(source) as original:
                row["original_dimensions"] = f"{original.width}x{original.height}"
            if not backup.exists():
                shutil.copy2(source, backup)
            result = remove(source.read_bytes(), session=session, alpha_matting=True,
                            alpha_matting_foreground_threshold=240,
                            alpha_matting_background_threshold=10,
                            alpha_matting_erode_size=10)
            preview.write_bytes(result)
            with Image.open(preview) as output:
                row["output_dimensions"] = f"{output.width}x{output.height}"
                row["alpha_present"] = "YES" if output.convert("RGBA").getchannel("A").getextrema()[0] < 255 else "NO"
            row["output_bytes"] = preview.stat().st_size
            row["result"] = "PASS" if row["alpha_present"] == "YES" else "REVIEW"
            success += 1
        except Exception as error:  # keep the batch going and report the exact file
            row["error"] = f"{type(error).__name__}: {error}"
            failed += 1
        rows.append(row)
        print(f"{row['result']}: {source.name} -> {preview.name}")

    with report_path.open("w", newline="", encoding="utf-8") as report:
        writer = csv.DictWriter(report, fieldnames=rows[0].keys() if rows else ["product_file"])
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        "method": "local rembg u2net segmentation with alpha matting",
        "local_only": True,
        "input": str(args.input),
        "backup": str(args.backup),
        "output": str(args.output),
        "total_source_images": len(files),
        "already_transparent": len(already_transparent),
        "total_to_process": len(to_process),
        "processed_success": success,
        "needs_manual_review": sum(row["result"] == "REVIEW" for row in rows),
        "failed": failed,
        "elapsed_seconds": round(time.time() - started, 2),
        "source_files_skipped_as_transparent": [path.name for path in already_transparent],
        "rows": rows,
    }
    (args.output / "background-removal-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: summary[key] for key in ("total_to_process", "processed_success", "needs_manual_review", "failed")}, ensure_ascii=False))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

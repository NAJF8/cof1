"""Idempotently stage the 38 verified transparent product PNGs."""
from __future__ import annotations
import json
import shutil
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "product-image-migration-manifest.json"
DEST = ROOT / "assets" / "products"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

def validate_png(path: Path):
    data = path.read_bytes()
    if not data or not data.startswith(PNG_SIGNATURE): return False, (0, 0), len(data)
    with Image.open(path) as image:
        alpha_min, _ = image.convert("RGBA").getchannel("A").getextrema()
        dimensions = (image.width, image.height)
        valid = image.format == "PNG" and image.width > 0 and image.height > 0 and alpha_min < 255
    return valid, dimensions, len(data)

def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if len(manifest) != 38 or len({str(row["productId"]) for row in manifest}) != 38:
        raise SystemExit("MANIFEST_GATE_FAILED: expected 38 unique mappings")
    ready = failed = duplicates = 0
    for row in manifest:
        target = DEST / row["finalPngFilename"]
        source = ROOT / "assets" / "products-transparent-preview" / row["transparentSourcePng"]
        if target.exists():
            valid, dimensions, size = validate_png(target)
            if not valid: raise SystemExit("EXISTING_FINAL_INVALID: product " + str(row["productId"]))
        else:
            if not source.is_file(): raise SystemExit("SOURCE_MISSING: product " + str(row["productId"]))
            try:
                with target.open("xb") as output, source.open("rb") as input_file: shutil.copyfileobj(input_file, output)
            except FileExistsError: duplicates += 1; raise SystemExit("REFUSING_OVERWRITE: product " + str(row["productId"]))
            valid, dimensions, size = validate_png(target)
            if not valid: failed += 1; raise SystemExit("VALIDATION_FAILED: product " + str(row["productId"]))
        row["status"] = "ready"
        row["finalPngPath"] = target.relative_to(ROOT).as_posix()
        row["dimensions"] = {"width": dimensions[0], "height": dimensions[1]}
        row["size"] = size
        ready += 1
        print("{}\t{}\tPASS\t{}x{}\t{}".format(row["productId"], target.name, dimensions[0], dimensions[1], size))
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"EXPECTED": 38, "READY": ready, "FAILED": failed, "DUPLICATES": duplicates}))
    return 0 if (ready, failed, duplicates) == (38, 0, 0) else 1

if __name__ == "__main__": raise SystemExit(main())

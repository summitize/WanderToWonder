#!/usr/bin/env python3
"""
Simple local photo sync script.
Usage: python sync-local-photos.py --source "C:\path\to\photos" --trip langkawi
"""

import argparse
import json
import os
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Sync local photos and generate manifest.")
    parser.add_argument("--source", required=True, help="Source folder with photos (e.g., C:\\Photos\\Langkawi)")
    parser.add_argument("--trip", required=True, help="Trip name (e.g., langkawi, singapore)")
    parser.add_argument("--base-url", default="https://res.cloudinary.com/example/image/upload/v1234567890", help="Base Cloudinary URL")
    args = parser.parse_args()

    source_path = Path(args.source).resolve()
    trip = args.trip.lower().strip()

    if not source_path.exists():
        print(f"ERROR: Source folder not found: {source_path}")
        return 1

    if not source_path.is_dir():
        print(f"ERROR: Source is not a directory: {source_path}")
        return 1

    # Find all image files
    image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    photos = []

    for file_path in sorted(source_path.iterdir()):
        if file_path.suffix.lower() not in image_extensions:
            continue
        if file_path.name.startswith("."):
            continue

        # Build manifest entry
        stem = file_path.stem
        title = stem.replace("-", " ").replace("_", " ").strip().title()
        if not title:
            title = f"Photo {len(photos) + 1}"

        photos.append({
            "src": f"{args.base_url}/{trip}/{stem}.jpg",
            "title": title,
            "description": f"Captured during {trip} trip."
        })

    if not photos:
        print(f"ERROR: No image files found in {source_path}")
        return 1

    # Write manifest
    project_root = Path(__file__).parent.parent
    manifest_path = project_root / "data" / f"{trip}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(photos, f, indent=2)

    print(f"✓ Generated manifest: {manifest_path}")
    print(f"✓ Photos: {len(photos)}")

    # Commit and push
    try:
        os.chdir(project_root)
        subprocess.run(["git", "add", str(manifest_path)], check=True)
        subprocess.run([
            "git", "commit", "-m", 
            f"Sync {len(photos)} photos for {trip}"
        ], check=True)
        subprocess.run(["git", "push"], check=True)
        print(f"✓ Committed and pushed to git")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Git operation failed: {e}")
        return 1


if __name__ == "__main__":
    exit(main())

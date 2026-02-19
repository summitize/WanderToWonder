import argparse
import json
import os
import re
from pathlib import Path


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


def slugify(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "photo"


def to_title(file_name: str, fallback: str) -> str:
    stem = Path(file_name).stem.replace("-", " ").replace("_", " ").strip()
    return stem if stem else fallback


def collect_images(source_dir: Path) -> list[Path]:
    files = [p for p in source_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS]
    files.sort(key=lambda p: p.name.lower())
    return files


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing environment variable: {name}")
    return value


def load_cloudinary_sdk():
    try:
        import cloudinary
        import cloudinary.uploader
        import cloudinary.utils
        return cloudinary
    except ImportError as exc:
        raise RuntimeError(
            "Cloudinary SDK is not installed. Run: pip install -r scripts/requirements-cloudinary.txt"
        ) from exc


def should_skip_existing_upload(error: Exception) -> bool:
    message = str(error).lower()
    return "already exists" in message or "duplicate" in message


def upload_and_build_manifest(
    source_dir: Path,
    trip: str,
    folder: str,
    max_files: int | None = None,
    overwrite: bool = False,
) -> list[dict]:
    cloudinary = load_cloudinary_sdk()

    cloudinary.config(
        cloud_name=required_env("CLOUDINARY_CLOUD_NAME"),
        api_key=required_env("CLOUDINARY_API_KEY"),
        api_secret=required_env("CLOUDINARY_API_SECRET"),
        secure=True,
    )

    files = collect_images(source_dir)
    if max_files is not None:
        files = files[:max_files]
    if not files:
        raise ValueError(
            "No supported image files found. Expected one of: "
            + ", ".join(sorted(SUPPORTED_EXTENSIONS))
        )

    normalized_folder = folder.strip("/")
    id_counts: dict[str, int] = {}
    manifest: list[dict] = []

    for index, image_path in enumerate(files, start=1):
        base_id = slugify(image_path.stem)
        id_counts[base_id] = id_counts.get(base_id, 0) + 1
        suffix = f"-{id_counts[base_id]}" if id_counts[base_id] > 1 else ""
        public_leaf = f"{base_id}{suffix}"
        public_id = f"{normalized_folder}/{public_leaf}" if normalized_folder else public_leaf

        try:
            result = cloudinary.uploader.upload(
                str(image_path),
                public_id=public_id,
                overwrite=overwrite,
                resource_type="image",
                use_filename=False,
                unique_filename=False,
            )
            print(f"Uploaded {index}/{len(files)}: {image_path.name}")
        except Exception as exc:
            if overwrite or not should_skip_existing_upload(exc):
                raise

            # Idempotent automation mode: reuse existing asset when public_id already exists.
            result = {"public_id": public_id}
            print(f"Reused existing {index}/{len(files)}: {image_path.name}")

        uploaded_public_id = result.get("public_id", public_id)
        optimized_url, _ = cloudinary.utils.cloudinary_url(
            uploaded_public_id,
            secure=True,
            resource_type="image",
            type="upload",
            fetch_format="auto",
            quality="auto",
            width=1800,
            crop="limit",
        )

        manifest.append(
            {
                "src": optimized_url,
                "title": to_title(image_path.name, f"Photo {index}"),
                "name": image_path.name,
            }
        )

    return manifest


def write_manifest(trip: str, photos: list[dict]) -> Path:
    project_root = Path(__file__).resolve().parent.parent
    data_dir = project_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = data_dir / f"{trip}.json"

    with manifest_path.open("w", encoding="utf-8") as fp:
        json.dump(photos, fp, indent=2)

    return manifest_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload local photos to Cloudinary and generate data/<trip>.json"
    )
    parser.add_argument("--source", required=True, help="Local folder containing photos.")
    parser.add_argument("--trip", required=True, help="Trip slug, e.g. australia or dubai.")
    parser.add_argument(
        "--folder",
        default="",
        help='Cloudinary folder. Default: "wander-to-wonder/<trip>"',
    )
    parser.add_argument(
        "--max",
        dest="max_files",
        type=int,
        default=None,
        help="Optional max number of images to upload.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing Cloudinary assets with the same public_id.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = Path(args.source).expanduser().resolve()
    trip = slugify(args.trip)
    folder = args.folder.strip() or f"wander-to-wonder/{trip}"

    if not source_dir.exists() or not source_dir.is_dir():
        print(f"ERROR: Source folder not found: {source_dir}")
        return 1

    try:
        photos = upload_and_build_manifest(
            source_dir=source_dir,
            trip=trip,
            folder=folder,
            max_files=args.max_files,
            overwrite=args.overwrite,
        )
        manifest_path = write_manifest(trip, photos)
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1

    print(f"Uploaded {len(photos)} photo(s) to Cloudinary folder: {folder}")
    print(f"Manifest updated: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

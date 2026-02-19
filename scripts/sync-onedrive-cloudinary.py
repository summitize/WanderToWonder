import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


def slugify(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "trip"


def run_command(command: list[str], cwd: Path) -> None:
    print("Running:", " ".join(command))
    subprocess.run(command, cwd=str(cwd), check=True)


def parse_trip_map(raw_json: str) -> dict[str, str]:
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON for --map-json: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError("--map-json must be a JSON object: {\"trip\":\"onedrive/path\"}")

    normalized: dict[str, str] = {}
    for trip_key, remote_path in parsed.items():
        if not isinstance(trip_key, str) or not isinstance(remote_path, str):
            raise ValueError("Trip map keys and values must be strings.")

        trip = slugify(trip_key)
        path = remote_path.strip().strip("/")
        if not path:
            raise ValueError(f"Trip '{trip_key}' has an empty OneDrive path.")
        normalized[trip] = path

    if not normalized:
        raise ValueError("Trip map is empty.")

    return normalized


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Automate OneDrive -> Cloudinary sync and regenerate data/<trip>.json"
    )
    parser.add_argument(
        "--map-json",
        required=True,
        help='Trip map JSON, e.g. {"australia":"TravelPhotos/Australia"}',
    )
    parser.add_argument(
        "--remote",
        default="onedrive",
        help="Configured rclone remote name. Default: onedrive",
    )
    parser.add_argument(
        "--workdir",
        default=".tmp/onedrive-sync",
        help="Temporary local workspace for rclone downloads.",
    )
    parser.add_argument(
        "--folder-prefix",
        default="wander-to-wonder",
        help="Cloudinary folder prefix. Final folder is <prefix>/<trip>.",
    )
    parser.add_argument(
        "--max",
        dest="max_files",
        type=int,
        default=None,
        help="Optional max number of files per trip.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing Cloudinary assets with same public IDs.",
    )
    parser.add_argument(
        "--rclone-bin",
        default="rclone",
        help="rclone executable name/path.",
    )
    parser.add_argument(
        "--python-bin",
        default=sys.executable,
        help="Python executable to run sync-cloudinary.py.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = Path(__file__).resolve().parent.parent
    trip_map = parse_trip_map(args.map_json)
    workdir = (project_root / args.workdir).resolve()
    sync_cloudinary_script = (project_root / "scripts" / "sync-cloudinary.py").resolve()

    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True, exist_ok=True)

    failures: list[str] = []

    for trip in sorted(trip_map.keys()):
        remote_path = trip_map[trip]
        local_trip_dir = workdir / trip
        local_trip_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n=== Syncing trip: {trip} ===")
        print(f"Remote path: {args.remote}:{remote_path}")
        print(f"Local temp path: {local_trip_dir}")

        try:
            run_command(
                [
                    args.rclone_bin,
                    "copy",
                    f"{args.remote}:{remote_path}",
                    str(local_trip_dir),
                    "--fast-list",
                    "--transfers",
                    "8",
                    "--checkers",
                    "16",
                ],
                cwd=project_root,
            )

            cloudinary_folder = f"{args.folder_prefix.strip('/')}/{trip}"
            sync_command = [
                args.python_bin,
                str(sync_cloudinary_script),
                "--source",
                str(local_trip_dir),
                "--trip",
                trip,
                "--folder",
                cloudinary_folder,
            ]

            if args.max_files is not None:
                sync_command.extend(["--max", str(args.max_files)])
            if args.overwrite:
                sync_command.append("--overwrite")

            run_command(sync_command, cwd=project_root)
        except Exception as exc:
            failures.append(f"{trip}: {exc}")
            print(f"ERROR syncing trip '{trip}': {exc}")

    if failures:
        print("\nSome trips failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("\nAll trips synced successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

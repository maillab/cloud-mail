#!/usr/bin/env python3
"""Copy Stalwart v1.1.1 Default-blobstore blobs from SQLite into a FileSystem blob store.

Stalwart v1.1.1's Default blob store keeps blobs inside the SQLite data store:

    table t: k = 32-byte blob hash, v = stored blob bytes

The FileSystem backend stores each blob as:

    <path>/<hex(byte0)>/<hex(byte1)>/.../<STALWART_BASE32(k)>

where the number of hex levels is BlobStore `depth` (0..5), each level uses
Rust's non-padded `{:x}` formatting for one byte, and STALWART_BASE32 is the
no-padding base32 alphabet `abcdefghijklmnopqrstuvwxyz792013`.

Stop Stalwart before running this. The database is opened read-only; nothing in
SQLite is changed. The old rows can be left in place after verification.
"""

import argparse
import os
import sqlite3
import sys
from pathlib import Path

ALPHABET = b"abcdefghijklmnopqrstuvwxyz792013"
BLOB_HASH_LEN = 32


def stalwart_base32(data: bytes) -> str:
    """Base32 with Stalwart's alphabet and no padding."""
    value = 0
    bits = 0
    out = []
    for byte in data:
        value = (value << 8) | byte
        bits += 8
        while bits >= 5:
            bits -= 5
            out.append(ALPHABET[(value >> bits) & 31])
    if bits:
        out.append(ALPHABET[(value << (5 - bits)) & 31])
    return "".join(chr(symbol) for symbol in out)


def blob_path(root: Path, key: bytes, depth: int) -> Path:
    if len(key) != BLOB_HASH_LEN:
        raise ValueError(f"expected {BLOB_HASH_LEN}-byte blob key, got {len(key)}")
    path = root
    for byte in key[:depth]:
        # Must match Stalwart's format!("{:x}", byte): no zero padding.
        path /= format(byte, "x")
    return path / stalwart_base32(key)


def iter_blobs(db_path: Path):
    uri = db_path.resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        yield from conn.execute("SELECT k, v FROM t")
    except sqlite3.OperationalError as exc:
        raise SystemExit(
            f"{db_path} does not look like a Stalwart SQLite store (table t missing): {exc}"
        ) from exc
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path, help="SQLite data store file")
    parser.add_argument("--out", required=True, type=Path, help="FileSystem blob store directory")
    parser.add_argument(
        "--depth",
        type=int,
        default=2,
        choices=range(0, 6),
        help="BlobStore depth; must match the new FileSystem config (default: 2)",
    )
    parser.add_argument("--verify", action="store_true", help="read each written file back and compare")
    parser.add_argument("--dry-run", action="store_true", help="list paths without writing")
    args = parser.parse_args()

    if not args.db.is_file():
        parser.error(f"SQLite database not found: {args.db}")
    if not 0 <= args.depth <= 5:
        parser.error("depth must be between 0 and 5")

    if not args.dry_run:
        args.out.mkdir(parents=True, exist_ok=True)

    count = 0
    total = 0
    skipped = 0
    for raw_key, raw_value in iter_blobs(args.db):
        if raw_key is None or raw_value is None:
            skipped += 1
            continue
        key = bytes(raw_key)
        data = bytes(raw_value)
        try:
            target = blob_path(args.out, key, args.depth)
        except ValueError as exc:
            print(f"ERROR: row {count + skipped + 1}: {exc}", file=sys.stderr)
            skipped += 1
            continue

        if args.dry_run:
            print(target)
            count += 1
            total += len(data)
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        try:
            tmp.write_bytes(data)
            os.replace(tmp, target)
        finally:
            if tmp.exists():
                tmp.unlink()

        if args.verify and target.read_bytes() != data:
            print(f"ERROR: verify failed for {target}", file=sys.stderr)
            return 1

        count += 1
        total += len(data)

    if args.dry_run:
        print(f"Would copy {count} blobs ({total} bytes) to {args.out}")
    else:
        print(f"Copied {count} blobs ({total} bytes) to {args.out}")
    if skipped:
        print(f"Skipped {skipped} rows with NULL key/value", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

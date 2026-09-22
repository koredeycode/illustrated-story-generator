"""R2/S3-compatible persistence (optional, env-driven).

Books are uploaded on completion so they survive Kaggle session death.
Local disk stays the hot cache; R2 is the permanent copy. Everything
degrades to local-only when env vars or boto3 are missing.

Env: R2_ENDPOINT, R2_KEY, R2_SECRET, R2_BUCKET (default "storybooks").
"""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any

try:
    from .store import book_dir
except ImportError:
    from store import book_dir

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_KEY = os.environ.get("R2_KEY", "")
R2_SECRET = os.environ.get("R2_SECRET", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "storybooks")
PREFIX = "storybooks/"

_s3: Any = None
_s3_failed = False


def enabled() -> bool:
    return bool(R2_ENDPOINT and R2_KEY and R2_SECRET and R2_BUCKET)


def _client() -> Any | None:
    global _s3, _s3_failed
    if _s3 is not None or _s3_failed:
        return _s3
    try:
        import boto3

        _s3 = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_KEY,
            aws_secret_access_key=R2_SECRET,
        )
    except Exception as e:
        _s3_failed = True
        print(f"[storage] disabled ({type(e).__name__}: {str(e)[:120]})")
        return None
    return _s3


def file_url(book_id: str, name: str, expiry: int = 7 * 86400) -> str | None:
    """Presigned GET URL (works with private buckets)."""
    s3 = _client() if enabled() else None
    if not s3:
        return None
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": f"{PREFIX}{book_id}/{name}"},
            ExpiresIn=expiry,
        )
    except Exception:
        return None


def sync_book(book_id: str) -> dict[str, str] | None:
    """Upload a finished book's files. Returns {filename: url} or None."""
    s3 = _client() if enabled() else None
    if not s3:
        return None
    urls: dict[str, str] = {}
    for f in sorted(book_dir(book_id).glob("*")):
        if not f.is_file() or f.suffix.lower() not in (".png", ".json", ".mp4", ".vtt"):
            continue
        try:
            s3.upload_file(
                str(f),
                R2_BUCKET,
                f"{PREFIX}{book_id}/{f.name}",
                ExtraArgs={"ContentType": mimetypes.guess_type(f.name)[0] or "application/octet-stream"},
            )
            url = file_url(book_id, f.name)
            if url:
                urls[f.name] = url
        except Exception as e:
            print(f"[storage] upload failed for {f.name} ({type(e).__name__})")
            return None
    print(f"[storage] book {book_id} synced ({len(urls)} files)")
    return urls


def list_remote() -> list[str]:
    """Book ids present in the bucket (prefix listing)."""
    s3 = _client() if enabled() else None
    if not s3:
        return []
    try:
        paginator = s3.get_paginator("list_objects_v2")
        ids = []
        for page in paginator.paginate(Bucket=R2_BUCKET, Prefix=PREFIX, Delimiter="/"):
            for p in page.get("CommonPrefixes", []):
                ids.append(p["Prefix"][len(PREFIX):].strip("/"))
        return sorted(ids)
    except Exception:
        return []


def download_book(book_id: str) -> bool:
    """Fetch a remote book into the local dir. True if book.json lands."""
    s3 = _client() if enabled() else None
    if not s3:
        return False
    try:
        d = book_dir(book_id)
        resp = s3.list_objects_v2(Bucket=R2_BUCKET, Prefix=f"{PREFIX}{book_id}/")
        for obj in resp.get("Contents", []):
            name = Path(obj["Key"]).name
            if Path(name).suffix.lower() not in (".png", ".json", ".mp4", ".vtt"):
                continue
            s3.download_file(R2_BUCKET, obj["Key"], str(d / name))
        return (d / "book.json").exists()
    except Exception as e:
        print(f"[storage] download failed for {book_id} ({type(e).__name__})")
        return False

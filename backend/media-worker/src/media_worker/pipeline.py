"""Image loading: EXIF orientation, pixel bounds, BGR numpy for OpenCV."""

from __future__ import annotations

import io
import os

import numpy as np
from PIL import Image, ImageOps


def load_bgr(image_bytes: bytes, max_pixels: int | None = None) -> np.ndarray:
    """Decode bytes to a BGR uint8 array, orientation-corrected and bounded."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        if max_pixels and img.width * img.height > max_pixels:
            scale = (max_pixels / (img.width * img.height)) ** 0.5
            img = img.resize(
                (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
                Image.BILINEAR,
            )
        rgb = np.asarray(img)
    # RGB -> BGR without cv2 dependency at import time.
    return np.ascontiguousarray(rgb[:, :, ::-1])


def default_max_pixels() -> int:
    try:
        return int(os.getenv("MEDIA_MAX_PIXELS", "40000000"))
    except ValueError:
        return 40000000

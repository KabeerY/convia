"""Face detection (YuNet) + embeddings (SFace) via OpenCV DNN.

Both models run on CPU. SFace outputs 128-d vectors; we L2-normalize so
cosine similarity is a dot product, matching Core's pgvector comparison.
"""

from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass

import cv2
import numpy as np

MODEL_VERSION = "sface-2024"

YUNET_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/"
    "models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
SFACE_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/"
    "models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
)


@dataclass
class DetectedFace:
    bbox: dict[str, float]
    embedding: list[float]
    detection_score: float


def ensure_model(path: str, url: str) -> str:
    if path and os.path.exists(path):
        return path
    directory = os.path.dirname(path) if os.path.dirname(path) else "."
    os.makedirs(directory, exist_ok=True)
    print(f"downloading face model {url} -> {path}", flush=True)
    urllib.request.urlretrieve(url, path)
    return path


class FaceEngine:
    def __init__(
        self,
        yunet_path: str | None = None,
        sface_path: str | None = None,
        score_threshold: float = 0.6,
        nms_threshold: float = 0.3,
        top_k: int = 50,
        max_faces: int = 50,
    ) -> None:
        yunet_path = ensure_model(
            yunet_path or os.getenv("YUNET_MODEL_PATH", "/models/yunet.onnx"),
            YUNET_URL,
        )
        sface_path = ensure_model(
            sface_path or os.getenv("SFACE_MODEL_PATH", "/models/sface.onnx"),
            SFACE_URL,
        )
        self._detector = cv2.FaceDetectorYN.create(
            yunet_path, "", (320, 320), score_threshold, nms_threshold, top_k
        )
        self._recognizer = cv2.FaceRecognizerSF.create(sface_path, "")
        self._max_faces = max_faces

    def extract(self, bgr: np.ndarray) -> list[DetectedFace]:
        """Detect every face and embed it. Returns [] when no face found."""
        height, width = bgr.shape[:2]
        self._detector.setInputSize((width, height))
        _, faces = self._detector.detect(bgr)
        if faces is None or len(faces) == 0:
            return []
        out: list[DetectedFace] = []
        for row in faces[: self._max_faces]:
            x, y, w, h = (float(v) for v in row[:4])
            score = float(row[14])
            try:
                aligned = self._recognizer.alignCrop(bgr, row)
                embedding = self._recognizer.feature(aligned).flatten()
            except cv2.error:
                continue
            norm = float(np.linalg.norm(embedding))
            if norm < 1e-9:
                continue
            embedding = (embedding / norm).astype(np.float64)
            out.append(
                DetectedFace(
                    bbox={"x": x, "y": y, "w": w, "h": h},
                    embedding=[float(v) for v in embedding.tolist()],
                    detection_score=score,
                )
            )
        return out

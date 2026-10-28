"""MediaPipe pose landmarks for every frame of a video.

Defaults reproduce the original behaviour when run from hd_camera/:
    python scripts/extract_landmarks.py
Session use (paths from anywhere):
    python scripts/extract_landmarks.py --video V.mp4 --model M.task --output landmarks.csv

'timestamp' is seconds since the first frame ((frame-1)/fps), not wall clock.
"""

import argparse
import os

import cv2
import mediapipe as mp
import pandas as pd


# =========================
# FILE PATHS
# =========================

_parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
_parser.add_argument("--video", default="videos/raw/test.mp4")
_parser.add_argument("--model", default="models/pose_landmarker_full.task")
_parser.add_argument("--output", default="features/test_landmarks.csv")
_parser.add_argument("--max-frames", type=int, default=None, help="stop after N frames (testing)")
_args = _parser.parse_args()

VIDEO = _args.video
MODEL = _args.model
OUTPUT = _args.output
MAX_FRAMES = _args.max_frames

if not os.path.isfile(MODEL):
    raise SystemExit(f"Model not found: {MODEL}")


# =========================
# MEDIAPIPE SETUP
# =========================

BaseOptions = mp.tasks.BaseOptions
VisionRunningMode = mp.tasks.vision.RunningMode
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions


LANDMARK_NAMES = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index"
]


options = PoseLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path=MODEL
    ),
    running_mode=VisionRunningMode.VIDEO,
    num_poses=1,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5
)


# =========================
# OPEN VIDEO
# =========================

cap = cv2.VideoCapture(VIDEO)

if not cap.isOpened():
    raise RuntimeError(
        f"Could not open video: {VIDEO}"
    )


fps = cap.get(cv2.CAP_PROP_FPS)

if fps <= 0:
    raise RuntimeError("Could not determine video FPS")


print("Video opened successfully")
print("FPS:", fps)


# =========================
# PROCESS VIDEO
# =========================

rows = []
frame_number = 0

with PoseLandmarker.create_from_options(options) as landmarker:

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        if MAX_FRAMES is not None and frame_number >= MAX_FRAMES:
            break

        frame_number += 1

        # OpenCV uses BGR
        # MediaPipe expects RGB
        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        # Convert to MediaPipe Image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb
        )

        # Timestamp in milliseconds
        timestamp_ms = int(
            (frame_number - 1) * 1000 / fps
        )

        # Run Pose Landmarker
        result = landmarker.detect_for_video(
            mp_image,
            timestamp_ms
        )

        # Basic information for every frame
        row = {
            "frame": frame_number,
            "timestamp": (frame_number - 1) / fps
        }

        # =========================
        # POSE DETECTED
        # =========================

        if result.pose_landmarks:

            landmarks = result.pose_landmarks[0]

            for i, landmark in enumerate(landmarks):

                name = LANDMARK_NAMES[i]

                row[f"{name}_x"] = landmark.x
                row[f"{name}_y"] = landmark.y
                row[f"{name}_z"] = landmark.z
                row[f"{name}_visibility"] = landmark.visibility

        # =========================
        # NO POSE DETECTED
        # =========================

        else:

            for name in LANDMARK_NAMES:

                row[f"{name}_x"] = None
                row[f"{name}_y"] = None
                row[f"{name}_z"] = None
                row[f"{name}_visibility"] = None

        rows.append(row)

        # Progress every 100 frames
        if frame_number % 100 == 0:
            print(f"Processed {frame_number} frames...")


# =========================
# SAVE CSV
# =========================

cap.release()

df = pd.DataFrame(rows)

df.to_csv(
    OUTPUT,
    index=False
)


print()
print("========== COMPLETE ==========")
print("Frames processed:", len(df))
print("Columns:", len(df.columns))
print("Output:", OUTPUT)
print()
print(df.head())
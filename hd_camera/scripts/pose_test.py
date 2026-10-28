import argparse

import cv2
import mediapipe as mp

# Defaults = original paths (run from hd_camera/)
_p = argparse.ArgumentParser(description="Pose detection rate on the first 300 frames.")
_p.add_argument("--video", default="videos/raw/test.mp4")
_p.add_argument("--model", default="models/pose_landmarker_full.task")
_a = _p.parse_args()
VIDEO = _a.video
MODEL = _a.model

# MediaPipe Tasks
BaseOptions = mp.tasks.BaseOptions
VisionRunningMode = mp.tasks.vision.RunningMode
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions


# Configure Pose Landmarker
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


cap = cv2.VideoCapture(VIDEO)

if not cap.isOpened():
    print("Could not open video")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)

frame_count = 0
detected_count = 0


with PoseLandmarker.create_from_options(options) as landmarker:

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        frame_count += 1

        # OpenCV BGR → RGB
        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        # Convert to MediaPipe Image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb
        )

        # Timestamp MUST be monotonically increasing
        timestamp_ms = int(
            frame_count * 1000 / fps
        )

        # Run pose detection
        result = landmarker.detect_for_video(
            mp_image,
            timestamp_ms
        )

        if result.pose_landmarks:
            detected_count += 1

        # Test only first 300 frames
        if frame_count >= 300:
            break


cap.release()


print()
print("========== RESULT ==========")
print("Frames processed:", frame_count)
print("Pose detected:", detected_count)

if frame_count > 0:
    rate = detected_count / frame_count * 100
    print("Detection rate:", round(rate, 2), "%")
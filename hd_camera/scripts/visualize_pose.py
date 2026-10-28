import cv2
import mediapipe as mp


VIDEO = "videos/raw/test.mp4"
MODEL = "models/pose_landmarker_full.task"
OUTPUT = "videos/processed/pose_visualized.mp4"


# ==========================================
# MediaPipe
# ==========================================

BaseOptions = mp.tasks.BaseOptions
VisionRunningMode = mp.tasks.vision.RunningMode
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions


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


# ==========================================
# Open video
# ==========================================

cap = cv2.VideoCapture(VIDEO)

if not cap.isOpened():
    raise RuntimeError("Could not open video")


fps = cap.get(cv2.CAP_PROP_FPS)

width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))


# ==========================================
# Output video
# ==========================================

fourcc = cv2.VideoWriter_fourcc(*"mp4v")

out = cv2.VideoWriter(
    OUTPUT,
    fourcc,
    fps,
    (width, height)
)


# ==========================================
# Pose Landmarker
# ==========================================

with PoseLandmarker.create_from_options(options) as landmarker:

    frame_number = 0

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        frame_number += 1

        # BGR → RGB
        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb
        )

        timestamp_ms = int(
            (frame_number - 1) * 1000 / fps
        )

        result = landmarker.detect_for_video(
            mp_image,
            timestamp_ms
        )


        # ==================================
        # Draw landmarks
        # ==================================

        if result.pose_landmarks:

            landmarks = result.pose_landmarks[0]

            # Draw connections
            for connection in mp.tasks.vision.PoseLandmarksConnections.POSE_LANDMARKS:

                start = landmarks[connection.start]
                end = landmarks[connection.end]

                x1 = int(start.x * width)
                y1 = int(start.y * height)

                x2 = int(end.x * width)
                y2 = int(end.y * height)

                cv2.line(
                    frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )


            # Draw landmark points
            for landmark in landmarks:

                x = int(landmark.x * width)
                y = int(landmark.y * height)

                cv2.circle(
                    frame,
                    (x, y),
                    5,
                    (0, 0, 255),
                    -1
                )


        # Frame number
        cv2.putText(
            frame,
            f"Frame: {frame_number}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2
        )


        out.write(frame)

        if frame_number % 100 == 0:
            print(
                f"Processed {frame_number} frames..."
            )


cap.release()
out.release()


print()
print("========== COMPLETE ==========")
print("Output:", OUTPUT)
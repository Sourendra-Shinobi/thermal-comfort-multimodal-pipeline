import argparse

import cv2

# Default = original path (run from hd_camera/); any video: --video PATH
_p = argparse.ArgumentParser(description="Print resolution, FPS and frame count of a video.")
_p.add_argument("--video", default="videos/raw/test.mp4")
video = _p.parse_args().video

cap = cv2.VideoCapture(video)

if not cap.isOpened():
    print("ERROR: Could not open video")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

print("Video opened successfully")
print("Resolution:", width, "x", height)
print("FPS:", fps)
print("Frames:", frames)

cap.release()
"""Behaviour features from pose landmarks (output of extract_landmarks.py).

Defaults reproduce the original behaviour when run from hd_camera/:
    python scripts/calculate_features.py
Session use:
    python scripts/calculate_features.py --input landmarks.csv --output behaviour.csv
"""

import argparse

import pandas as pd
import numpy as np


_parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
_parser.add_argument("--input", default="features/test_landmarks.csv")
_parser.add_argument("--output", default="features/test_behaviour.csv")
_args = _parser.parse_args()

INPUT = _args.input
OUTPUT = _args.output


df = pd.read_csv(INPUT)


# ==========================================
# Helper functions
# ==========================================

def distance(x1, y1, x2, y2):

    return np.sqrt(
        (x2 - x1) ** 2 +
        (y2 - y1) ** 2
    )


# ==========================================
# 1. SHOULDER CENTER
# ==========================================

df["shoulder_center_x"] = (
    df["left_shoulder_x"] +
    df["right_shoulder_x"]
) / 2

df["shoulder_center_y"] = (
    df["left_shoulder_y"] +
    df["right_shoulder_y"]
) / 2


# ==========================================
# 2. HIP CENTER
# ==========================================

df["hip_center_x"] = (
    df["left_hip_x"] +
    df["right_hip_x"]
) / 2

df["hip_center_y"] = (
    df["left_hip_y"] +
    df["right_hip_y"]
) / 2


# ==========================================
# 3. SHOULDER WIDTH
# ==========================================

df["shoulder_width"] = distance(
    df["left_shoulder_x"],
    df["left_shoulder_y"],
    df["right_shoulder_x"],
    df["right_shoulder_y"]
)


# ==========================================
# 4. HEAD MOVEMENT
# ==========================================

df["head_movement"] = distance(
    df["nose_x"].shift(1),
    df["nose_y"].shift(1),
    df["nose_x"],
    df["nose_y"]
)


# ==========================================
# 5. HEAD LATERAL OFFSET
# ==========================================

df["head_offset"] = (
    df["nose_x"] -
    df["shoulder_center_x"]
) / (df["shoulder_width"] + 1e-8)


# ==========================================
# 6. TORSO LEAN
# ==========================================

dx = (
    df["shoulder_center_x"] -
    df["hip_center_x"]
)

dy = (
    df["shoulder_center_y"] -
    df["hip_center_y"]
)

df["torso_lean"] = np.degrees(
    np.arctan2(
        abs(dx),
        abs(dy) + 1e-8
    )
)


# ==========================================
# 7. SHOULDER ASYMMETRY
# ==========================================

df["shoulder_asymmetry"] = (
    abs(
        df["left_shoulder_y"] -
        df["right_shoulder_y"]
    )
    / (df["shoulder_width"] + 1e-8)
)


# ==========================================
# 8. LEFT HAND MOVEMENT
# ==========================================

df["left_hand_movement"] = distance(
    df["left_wrist_x"].shift(1),
    df["left_wrist_y"].shift(1),
    df["left_wrist_x"],
    df["left_wrist_y"]
)


# ==========================================
# 9. RIGHT HAND MOVEMENT
# ==========================================

df["right_hand_movement"] = distance(
    df["right_wrist_x"].shift(1),
    df["right_wrist_y"].shift(1),
    df["right_wrist_x"],
    df["right_wrist_y"]
)


# ==========================================
# 10. OVERALL HAND ACTIVITY
# ==========================================

df["hand_activity"] = (
    df["left_hand_movement"] +
    df["right_hand_movement"]
) / 2


# ==========================================
# SAVE
# ==========================================

features = [
    "frame",
    "timestamp",
    "head_movement",
    "head_offset",
    "torso_lean",
    "shoulder_asymmetry",
    "left_hand_movement",
    "right_hand_movement",
    "hand_activity"
]

output = df[features]

output.to_csv(
    OUTPUT,
    index=False
)

print("\n========== COMPLETE ==========")
print("Rows:", len(output))
print("Features:", len(output.columns))
print("Saved:", OUTPUT)

print("\n========== SUMMARY ==========")
print(output.describe())
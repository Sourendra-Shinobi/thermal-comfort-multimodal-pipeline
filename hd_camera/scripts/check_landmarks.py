import argparse

import pandas as pd

# Default = original path (run from hd_camera/)
_p = argparse.ArgumentParser(description="Summarise a landmarks CSV.")
_p.add_argument("--input", default="features/test_landmarks.csv")
INPUT = _p.parse_args().input

df = pd.read_csv(INPUT)

print("\n========== DATASET ==========")
print("Rows:", len(df))
print("Columns:", len(df.columns))

print("\n========== FIRST 5 ROWS ==========")
print(df.head())

print("\n========== MISSING VALUES ==========")
print(df.isna().sum().sort_values(ascending=False).head(15))

print("\n========== VISIBILITY ==========")

visibility_cols = [
    c for c in df.columns
    if c.endswith("_visibility")
]

print(df[visibility_cols].mean().sort_values())
# hd_camera — RGB video analysis

Recording is done by OBS, driven by the experiment controller
(`experiment/adapters/obs_camera.py`); this folder holds the offline analysis.
Run the scripts from `hd_camera/` to use the original default paths, or pass
paths from anywhere. Packages: `requirements.txt`.

| Script | Does | Defaults (unchanged) |
|---|---|---|
| `scripts/test_video.py [--video V]` | resolution / FPS / frames | `videos/raw/test.mp4` |
| `scripts/pose_test.py [--video V --model M]` | pose detection rate, first 300 frames | |
| `scripts/extract_landmarks.py [--video --model --output --max-frames]` | 33 MediaPipe pose landmarks per frame | → `features/test_landmarks.csv` |
| `scripts/check_landmarks.py [--input]` | missing values, visibility | |
| `scripts/calculate_features.py [--input --output]` | head movement/offset, torso lean, shoulder asymmetry, hand movement | → `features/test_behaviour.csv` |
| `scripts/visualize_pose.py` | skeleton overlay video (unchanged) | → `videos/processed/pose_visualized.mp4` |
| `scripts/detect_sync_marker.py --video --roi x,y,w,h --output [...]` | **new**: finds the game's sync flash, aligns with `events.csv` | |

For a session: `python -m experiment postprocess experiment_output\session_<id> [--sync-roi x,y,w,h]`
writes into the session's `processing\` folder.

`timestamp` in landmark/feature CSVs is seconds since the first video frame.
The refactored `extract_landmarks.py` and `calculate_features.py` reproduce
the committed `features/*.csv` exactly (max difference 0.0, verified
2026-10-28; `tests/test_camera_scripts.py`).

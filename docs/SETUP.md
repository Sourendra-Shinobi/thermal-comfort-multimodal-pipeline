# Setup

All commands are for **Windows PowerShell**, run from the project root unless
stated otherwise:

```powershell
cd C:\Users\<you>\OneDrive\Desktop\IIT_KGP\BTP_2026
```

Hardware-specific validation is in [HARDWARE_TESTING.md](HARDWARE_TESTING.md).

## 1. Controller (required)

Python ≥ 3.11, standard library only — nothing to install.

```powershell
python --version                 # 3.11 or newer
python -m experiment modes       # lists the 5 modes -> install OK
python -m unittest discover -s tests -t .   # optional: full software test suite (~75 s)
```

## 2. Games (required)

Node.js ≥ 18. Both games have `node_modules` already; on a fresh machine:

```powershell
cd Games\NO-GO;       npm install; npm test; npm run build; cd ..\..
cd Games\ODD-ONE-OUT; npm install; npm test; npm run build; cd ..\..
```

**Rebuild after every change to a game's `src/`**: the controller serves
`dist/`, and its preflight fails if `dist/` is older than `src/`.

## 3. Machine-specific settings

Create `config/experiment_config.local.toml` (git-ignored; merged over
`experiment_config.toml`). Only put keys you need to change:

```toml
[obs]
password = "the password from OBS > Tools > WebSocket Server Settings"

[shimmer]
python = ".venv-shimmer/Scripts/python.exe"      # relative to BTP_2026/
api_dir = "C:/ShimmerAPI/netstandard2.0"          # folder with ShimmerAPI.dll + Google.Protobuf.dll
ports_dll = "C:/Users/<you>/.nuget/packages/system.io.ports/9.0.8/runtimes/win/lib/net9.0/System.IO.Ports.dll"
com_port = "COM10"
device_name = "A406"

[postprocess]
python = "python"                                 # interpreter with mediapipe

[browser]
command = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "--new-window", "--start-fullscreen", "{url}"]
```

Instead of `[obs] password` you may set `$env:OBS_WEBSOCKET_PASSWORD` in the
PowerShell window that runs the controller.

## 4. OBS Studio + Logitech camera (camera modes)

1. Install OBS Studio **30 or newer** (obs-websocket 5.3+ is built in; 5.3 is
   needed for the controller to put recordings in the session folder).
2. *Tools → WebSocket Server Settings*: tick **Enable WebSocket server**,
   port **4455**, tick **Enable Authentication**, copy the password into the
   local config (step 3).
3. In the scene that will be live during sessions add *Sources → + → Video
   Capture Device* and select the Logitech camera. Resolution/FPS: set in the
   source properties (record what you choose in the session `--notes`).
4. *Settings → Output → Recording*: format **MKV** or **Hybrid MP4** (both
   survive an OBS crash; plain MP4 does not). Leave the recording path — the
   controller sets it per session and restores it afterwards.
5. Keep OBS open whenever the controller runs.

Details and verification: [CAMERA_TESTING.md](CAMERA_TESTING.md).

## 5. Shimmer (Shimmer modes)

Three things outside pip are needed. None were present on the machine this
integration was developed on, so these steps are **not verified here**:

1. **.NET runtime.** The original setup loaded `System.IO.Ports.dll` from the
   `net9.0` folder of the NuGet package, i.e. the **.NET 9 runtime**
   (`winget install Microsoft.DotNet.Runtime.9`). Check: `dotnet --list-runtimes`
   shows `Microsoft.NETCore.App 9.x`.
2. **Shimmer C# API DLLs.** `ShimmerAPI.dll` and `Google.Protobuf.dll`
   (netstandard2.0 build of Shimmer-C-API). Easiest: copy the folder
   `...\ShimmerAPI\ShimmerAPI\bin\Debug\netstandard2.0` from the PC where
   `test_shimmer.py` originally worked. Building it yourself
   (`dotnet build ShimmerAPI.csproj -p:CopyLocalLockFileAssemblies=true`)
   should also place `Google.Protobuf.dll` next to `ShimmerAPI.dll` — verify the
   file is there. `System.IO.Ports.dll`: from the NuGet cache
   (`%USERPROFILE%\.nuget\packages\system.io.ports\<ver>\runtimes\win\lib\net9.0\`)
   or download the package from nuget.org and unzip it.
3. **pythonnet in Python ≤ 3.13** (pythonnet does not support 3.14):

```powershell
py -3.13 -m venv .venv-shimmer
.venv-shimmer\Scripts\python -m pip install -r Shimmer\requirements.txt
.venv-shimmer\Scripts\python -c "import pythonnet, clr_loader; print('pythonnet ok')"
```

Then pair the device (see [SHIMMER_TESTING.md](SHIMMER_TESTING.md) §2) and set
`[shimmer] python/api_dir/ports_dll/com_port` in the local config.

## 6. Post-processing (optional)

Any interpreter with the packages in `hd_camera/requirements.txt`
(on the development PC: the default `python`, 3.14.7):

```powershell
python -m pip install -r hd_camera\requirements.txt
python -c "import mediapipe, cv2, pandas; print(mediapipe.__version__)"
```

## 7. Check the installation

```powershell
python -m experiment check --mode GAME_ONLY_TEST --game nogo      # must PASS everywhere
python -m experiment check --mode FULL_MULTIMODAL --game nogo     # PASS only with OBS + Shimmer ready
```

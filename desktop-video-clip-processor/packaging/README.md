# Desktop Video Clip Processor — Windows Desktop Architecture & Packaging Guide

This document describes the complete standalone Windows Desktop packaging architecture for the **Desktop Video Clip Processor**.

---

## 1. System Architecture & Zero-Configuration Guarantee

The Desktop Video Clip Processor is designed to run on any 64-bit Windows machine (Windows 10/11) without requiring the user to install:
- ❌ Node.js
- ❌ Python / PyTorch / CUDA
- ❌ FFmpeg / FFprobe
- ❌ C++ compilers or build tools
- ❌ Environment variables (such as `FFMPEG_PATH` or `PATH` modifications)
- ❌ Cloud API keys or external server logins

All processing is executed **100% locally and offline**.

```
┌─────────────────────────────────────────────────────────────┐
│             Windows Electron Desktop Container              │
├──────────────────────────────┬──────────────────────────────┤
│    Electron Main Process     │      Express Media Server    │
│  (packaging/electron-main)   │       (dist/server.cjs)      │
│  - Dynamic port discovery    │  - Media inspection & probe  │
│  - /api/health verification  │  - Session management        │
│  - Resource path resolution  │  - Cancellation controller   │
│  - Clean process lifecycle   │  - Temp workspace cleanup    │
├──────────────────────────────┴──────────────────────────────┤
│               Local Processing Engines                      │
│                                                             │
│   [Bundled FFmpeg & FFprobe]    [Embedded Whisper ONNX]     │
│    bin/ffmpeg.exe (Windows)      models/Xenova/whisper-tiny │
│    bin/ffprobe.exe (Windows)     100% Local CPU Inference   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Bundled Binaries and Models

The application bundles all executables and neural weights directly in the distribution installer:

### A. FFmpeg & FFprobe Executables
- Location in repository: `bin/ffmpeg.exe`, `bin/ffprobe.exe`
- Packaging configuration: Included via `extraResources` in `package.json`:
  ```json
  "extraResources": [
    {
      "from": "bin",
      "to": "bin",
      "filter": ["**/*"]
    }
  ]
  ```
- Runtime resolution:
  - Packaged production: `path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')`
  - Development / fallback: `path.join(process.cwd(), 'bin', 'ffmpeg.exe')` or system PATH.

### B. Local Whisper Speech-to-Text Model
- Location in repository: `models/Xenova/whisper-tiny.en/`
- Included weights:
  - `onnx/encoder_model_quantized.onnx` (~9.7 MB)
  - `onnx/decoder_model_merged_quantized.onnx` (~30 MB)
  - Tokenizer, vocab, preprocessor, and generation configs
- Packaging configuration: Included via `extraResources`:
  ```json
  "extraResources": [
    {
      "from": "models",
      "to": "models",
      "filter": ["**/*"]
    }
  ]
  ```
- Runtime resolution:
  - Loaded locally via `@xenova/transformers` with:
    ```js
    env.localModelPath = path.join(process.resourcesPath, 'models');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    ```
  - Guaranteed zero internet calls or remote HuggingFace downloads.

---

## 3. Native Windows Filesystem & Directory Integration

1. **User Downloads Directory**:
   - Resolved automatically via `app.getPath('downloads')` or `%USERPROFILE%\Downloads`.
   - Default output location: `%USERPROFILE%\Downloads\ViralClips\`.
   - No hardcoded usernames or fixed drive letters.

2. **Temporary Processing Directory**:
   - Intermediate chunk WAV files and upload caches are isolated in `%TEMP%\desktop-video-processor\`.
   - One-click purge cleans temporary WAV files without touching generated clips or source videos.

3. **NTFS Filename Sanitization**:
   - Clip filenames automatically sanitize invalid Windows NTFS characters (`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) and enforce safe length limits.

---

## 4. Building the Application

### Development
```bash
# Run the full-stack workstation locally
npm run dev

# Run Electron desktop window pointing to dev server
npm run electron:dev
```

### Production Build
```bash
# Compiles Vite UI to dist/ and bundles Express backend to dist/server.cjs
npm run build
```

### Package Windows Installer (.exe)
```bash
# Generate standalone NSIS Windows Installer and Portable .exe
npm run package:win

# Or inspect unpacked directory structure
npm run package:dir
```

The output installer is generated in `release/`:
- `release/Desktop Video Clip Processor Setup 0.0.0.exe` (NSIS Installer)
- `release/Desktop Video Clip Processor 0.0.0.exe` (Portable executable)
- `release/win-unpacked/` (Unpacked binary tree)

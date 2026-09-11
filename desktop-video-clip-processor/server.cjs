var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path4 = __toESM(require("path"), 1);
var import_fs5 = __toESM(require("fs"), 1);
var import_multer = __toESM(require("multer"), 1);

// server/ffmpegService.ts
var import_child_process = require("child_process");
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);

// src/utils/timestamps.ts
function parseTimestampToSeconds(ts) {
  if (typeof ts === "number") {
    if (isNaN(ts) || ts < 0) {
      throw new Error(`Invalid numeric timestamp: ${ts}`);
    }
    return Math.round(ts * 1e3) / 1e3;
  }
  if (typeof ts !== "string") {
    throw new Error(`Timestamp must be a string or number, received ${typeof ts}`);
  }
  const clean = ts.trim();
  if (!clean) {
    throw new Error("Timestamp cannot be empty");
  }
  const parts = clean.split(":");
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
      throw new Error(`Invalid MM:SS timestamp format: "${ts}"`);
    }
    const totalMs = Math.round((minutes * 60 + seconds) * 1e3);
    return totalMs / 1e3;
  } else if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
      throw new Error(`Invalid HH:MM:SS timestamp format: "${ts}"`);
    }
    const totalMs = Math.round((hours * 3600 + minutes * 60 + seconds) * 1e3);
    return totalMs / 1e3;
  } else {
    const raw = parseFloat(clean);
    if (!isNaN(raw) && raw >= 0) {
      return Math.round(raw * 1e3) / 1e3;
    }
    throw new Error(`Unrecognized timestamp format: "${ts}". Expected HH:MM:SS or MM:SS`);
  }
}
function formatSecondsToTimestamp(totalSec, includeMs = false) {
  if (isNaN(totalSec) || totalSec < 0) {
    return "00:00:00";
  }
  const totalMs = Math.round(totalSec * 1e3);
  const totalSecondsInt = Math.floor(totalMs / 1e3);
  const ms = totalMs % 1e3;
  const hours = Math.floor(totalSecondsInt / 3600);
  const minutes = Math.floor(totalSecondsInt % 3600 / 60);
  const seconds = totalSecondsInt % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (includeMs && ms > 0) {
    const mmm = String(ms).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${mmm}`;
  }
  return `${hh}:${mm}:${ss}`;
}
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// server/resourcePaths.ts
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_os = __toESM(require("os"), 1);
function isPackaged() {
  if (process.env.IS_PACKAGED === "true") return true;
  if (process.resourcesPath && !process.defaultApp && process.env.NODE_ENV === "production") {
    return true;
  }
  if (process.env.RESOURCES_PATH && process.env.NODE_ENV === "production" && !process.env.DEV_MODE) {
    return true;
  }
  return false;
}
function getResourcesPath() {
  if (process.env.RESOURCES_PATH) {
    return process.env.RESOURCES_PATH;
  }
  if (process.resourcesPath) {
    return process.resourcesPath;
  }
  const execResources = import_path.default.join(import_path.default.dirname(process.execPath), "resources");
  if (import_fs.default.existsSync(execResources)) {
    return execResources;
  }
  const cwdResources = import_path.default.join(process.cwd(), "resources");
  if (import_fs.default.existsSync(cwdResources)) {
    return cwdResources;
  }
  return process.cwd();
}
function getFfmpegBinary() {
  const isWindows = process.platform === "win32";
  const exeName = isWindows ? "ffmpeg.exe" : "ffmpeg";
  const resPath = getResourcesPath();
  if (isPackaged()) {
    const packagedExe = import_path.default.join(resPath, "bin", exeName);
    if (import_fs.default.existsSync(packagedExe)) {
      return packagedExe;
    }
    const packagedWinExe = import_path.default.join(resPath, "bin", "ffmpeg.exe");
    if (import_fs.default.existsSync(packagedWinExe)) {
      return packagedWinExe;
    }
    throw new Error(
      `Bundled FFmpeg executable is missing from application resources at "${packagedExe}". The Windows package requires "ffmpeg.exe" in "resources/bin/ffmpeg.exe" (or "bin/ffmpeg.exe" before packaging). Please supply the official Windows x64 FFmpeg executable.`
    );
  }
  if (isWindows) {
    const localBinExe = import_path.default.join(process.cwd(), "bin", "ffmpeg.exe");
    if (import_fs.default.existsSync(localBinExe)) {
      return localBinExe;
    }
  } else {
    const localBin = import_path.default.join(process.cwd(), "bin", "ffmpeg");
    if (import_fs.default.existsSync(localBin)) {
      return localBin;
    }
  }
  return exeName;
}
function getFfprobeBinary() {
  const isWindows = process.platform === "win32";
  const exeName = isWindows ? "ffprobe.exe" : "ffprobe";
  const resPath = getResourcesPath();
  if (isPackaged()) {
    const packagedExe = import_path.default.join(resPath, "bin", exeName);
    if (import_fs.default.existsSync(packagedExe)) {
      return packagedExe;
    }
    const packagedWinExe = import_path.default.join(resPath, "bin", "ffprobe.exe");
    if (import_fs.default.existsSync(packagedWinExe)) {
      return packagedWinExe;
    }
    throw new Error(
      `Bundled FFprobe executable is missing from application resources at "${packagedExe}". The Windows package requires "ffprobe.exe" in "resources/bin/ffprobe.exe" (or "bin/ffprobe.exe" before packaging). Please supply the official Windows x64 FFprobe executable.`
    );
  }
  if (isWindows) {
    const localBinExe = import_path.default.join(process.cwd(), "bin", "ffprobe.exe");
    if (import_fs.default.existsSync(localBinExe)) {
      return localBinExe;
    }
  } else {
    const localBin = import_path.default.join(process.cwd(), "bin", "ffprobe");
    if (import_fs.default.existsSync(localBin)) {
      return localBin;
    }
  }
  return exeName;
}
function getWhisperModelsDirectory() {
  const resModels = import_path.default.join(getResourcesPath(), "models");
  const resWhisper = import_path.default.join(resModels, "Xenova", "whisper-tiny.en");
  if (import_fs.default.existsSync(import_path.default.join(resWhisper, "onnx", "encoder_model_quantized.onnx")) && import_fs.default.existsSync(import_path.default.join(resWhisper, "onnx", "decoder_model_merged_quantized.onnx"))) {
    return resModels;
  }
  const localModels = import_path.default.join(process.cwd(), "models");
  const localWhisper = import_path.default.join(localModels, "Xenova", "whisper-tiny.en");
  if (import_fs.default.existsSync(import_path.default.join(localWhisper, "onnx", "encoder_model_quantized.onnx")) && import_fs.default.existsSync(import_path.default.join(localWhisper, "onnx", "decoder_model_merged_quantized.onnx"))) {
    return localModels;
  }
  if (isPackaged()) {
    throw new Error(
      `Bundled Whisper model is missing from application resources at "${resWhisper}". Please reinstall the application.`
    );
  }
  return localModels;
}
function getDownloadsDirectory() {
  if (process.env.DOWNLOADS_PATH && import_fs.default.existsSync(process.env.DOWNLOADS_PATH)) {
    return process.env.DOWNLOADS_PATH;
  }
  const isWindows = process.platform === "win32";
  if (isWindows && process.env.USERPROFILE) {
    const winDownloads = import_path.default.join(process.env.USERPROFILE, "Downloads");
    if (import_fs.default.existsSync(winDownloads)) return winDownloads;
  }
  const homeDownloads = import_path.default.join(import_os.default.homedir(), "Downloads");
  if (import_fs.default.existsSync(homeDownloads)) return homeDownloads;
  return import_os.default.homedir();
}
function getWorkstationTempDir() {
  if (process.env.WORKSTATION_TEMP) {
    try {
      if (!import_fs.default.existsSync(process.env.WORKSTATION_TEMP)) {
        import_fs.default.mkdirSync(process.env.WORKSTATION_TEMP, { recursive: true });
      }
      return process.env.WORKSTATION_TEMP;
    } catch {
    }
  }
  if (isPackaged()) {
    const osTemp = import_path.default.join(import_os.default.tmpdir(), "desktop-video-processor");
    if (!import_fs.default.existsSync(osTemp)) {
      try {
        import_fs.default.mkdirSync(osTemp, { recursive: true });
      } catch {
      }
    }
    return osTemp;
  }
  try {
    const devTemp = import_path.default.join(process.cwd(), "temp");
    if (!import_fs.default.existsSync(devTemp)) {
      import_fs.default.mkdirSync(devTemp, { recursive: true });
    }
    return devTemp;
  } catch {
    const osTemp = import_path.default.join(import_os.default.tmpdir(), "desktop-video-processor");
    if (!import_fs.default.existsSync(osTemp)) {
      try {
        import_fs.default.mkdirSync(osTemp, { recursive: true });
      } catch {
      }
    }
    return osTemp;
  }
}
function validateAllResources() {
  const errors = [];
  const packaged = isPackaged();
  let ffmpegPath = "";
  let ffmpegValid = false;
  try {
    ffmpegPath = getFfmpegBinary();
    if (import_path.default.isAbsolute(ffmpegPath)) {
      ffmpegValid = import_fs.default.existsSync(ffmpegPath);
      if (!ffmpegValid) errors.push(`FFmpeg binary not found at ${ffmpegPath}`);
    } else {
      ffmpegValid = true;
    }
  } catch (err) {
    errors.push(err.message);
  }
  let ffprobePath = "";
  let ffprobeValid = false;
  try {
    ffprobePath = getFfprobeBinary();
    if (import_path.default.isAbsolute(ffprobePath)) {
      ffprobeValid = import_fs.default.existsSync(ffprobePath);
      if (!ffprobeValid) errors.push(`FFprobe binary not found at ${ffprobePath}`);
    } else {
      ffprobeValid = true;
    }
  } catch (err) {
    errors.push(err.message);
  }
  let whisperModelsDir = "";
  let whisperValid = false;
  try {
    whisperModelsDir = getWhisperModelsDirectory();
    const encoder = import_path.default.join(whisperModelsDir, "Xenova", "whisper-tiny.en", "onnx", "encoder_model_quantized.onnx");
    const decoder = import_path.default.join(whisperModelsDir, "Xenova", "whisper-tiny.en", "onnx", "decoder_model_merged_quantized.onnx");
    whisperValid = import_fs.default.existsSync(encoder) && import_fs.default.existsSync(decoder);
    if (!whisperValid) {
      errors.push(`Whisper ONNX models not found in ${whisperModelsDir}`);
    }
  } catch (err) {
    errors.push(err.message);
  }
  return {
    allValid: errors.length === 0 && ffmpegValid && ffprobeValid && whisperValid,
    isPackaged: packaged,
    ffmpegPath,
    ffmpegValid,
    ffprobePath,
    ffprobeValid,
    whisperModelsDir,
    whisperValid,
    errors
  };
}

// server/ffmpegService.ts
function runProcess(bin, args, onData, abortSignal) {
  return new Promise((resolve, reject) => {
    const child = (0, import_child_process.spawn)(bin, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    if (abortSignal) {
      const abortHandler = () => {
        try {
          child.kill("SIGKILL");
        } catch {
        }
        reject(new Error("Process was cancelled by user."));
      };
      if (abortSignal.aborted) {
        abortHandler();
        return;
      }
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }
    child.stdout?.on("data", (d) => {
      const str = d.toString();
      stdout += str;
      if (onData) onData(str);
    });
    child.stderr?.on("data", (d) => {
      const str = d.toString();
      stderr += str;
      if (onData) onData(str);
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to start ${bin}: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const lines = stderr.trim().split("\n");
        const lastFew = lines.slice(-5).join(" ").trim();
        reject(
          new Error(
            `${bin} exited with code ${code}. Details: ${lastFew || stderr.slice(-300)}`
          )
        );
      }
    });
  });
}
async function checkSystemDependencies() {
  try {
    const probeBin = getFfprobeBinary();
    const ffmpegBin = getFfmpegBinary();
    const { stdout: ffprobeOut } = await runProcess(probeBin, ["-version"]);
    const { stdout: ffmpegOut } = await runProcess(ffmpegBin, ["-version"]);
    const firstLine = ffmpegOut.split("\n")[0] || "";
    return {
      ffmpeg: true,
      ffprobe: true,
      ffmpegVersion: firstLine.trim()
    };
  } catch (err) {
    return {
      ffmpeg: false,
      ffprobe: false,
      error: err.message
    };
  }
}
async function probeVideoFile(filePath) {
  if (!import_fs2.default.existsSync(filePath)) {
    throw new Error(`Video file not found at: ${filePath}`);
  }
  const stat = import_fs2.default.statSync(filePath);
  const args = [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ];
  const { stdout } = await runProcess(getFfprobeBinary(), args);
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse FFprobe JSON output: ${err.message}`);
  }
  const format = parsed.format || {};
  const streams = parsed.streams || [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");
  if (!videoStream) {
    throw new Error("No video stream found in the selected file. Only valid video files are accepted.");
  }
  const durationSec = parseFloat(format.duration || videoStream.duration || "0");
  if (durationSec <= 0) {
    throw new Error("Could not determine valid video duration. The video file may be corrupted or unreadable.");
  }
  const width = parseInt(videoStream.width || "0", 10);
  const height = parseInt(videoStream.height || "0", 10);
  let fps = 30;
  if (videoStream.avg_frame_rate && videoStream.avg_frame_rate.includes("/")) {
    const [num, den] = videoStream.avg_frame_rate.split("/").map(Number);
    if (den > 0 && num > 0) {
      fps = Math.round(num / den * 100) / 100;
    }
  } else if (videoStream.r_frame_rate && videoStream.r_frame_rate.includes("/")) {
    const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
    if (den > 0 && num > 0) {
      fps = Math.round(num / den * 100) / 100;
    }
  }
  const aspectRatio = width && height ? `${width}:${height}` : "unknown";
  return {
    filename: import_path2.default.basename(filePath),
    originalPath: filePath,
    durationSec: Math.round(durationSec * 100) / 100,
    formattedDuration: formatSecondsToTimestamp(durationSec),
    width,
    height,
    aspectRatio,
    fps,
    fileSizeBytes: stat.size,
    formattedSize: formatBytes(stat.size),
    formatName: format.format_long_name || format.format_name || "Video",
    videoCodec: videoStream.codec_long_name || videoStream.codec_name || "unknown",
    audioCodec: audioStream ? audioStream.codec_long_name || audioStream.codec_name : void 0,
    audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : void 0,
    audioChannels: audioStream?.channels
  };
}
async function extractAudioFromVideo(videoPath, outputWavPath, abortSignal) {
  const dir = import_path2.default.dirname(outputWavPath);
  if (!import_fs2.default.existsSync(dir)) {
    import_fs2.default.mkdirSync(dir, { recursive: true });
  }
  const args = [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    outputWavPath
  ];
  await runProcess(getFfmpegBinary(), args, void 0, abortSignal);
  if (!import_fs2.default.existsSync(outputWavPath) || import_fs2.default.statSync(outputWavPath).size < 100) {
    throw new Error("Audio extraction failed: Output WAV file was not generated or is empty.");
  }
}
async function extractAudioChunkWav(audioWavPath, startSec, durationSec, outputChunkWavPath, abortSignal) {
  const dir = import_path2.default.dirname(outputChunkWavPath);
  if (!import_fs2.default.existsSync(dir)) {
    import_fs2.default.mkdirSync(dir, { recursive: true });
  }
  const args = [
    "-y",
    "-ss",
    startSec.toString(),
    "-t",
    durationSec.toString(),
    "-i",
    audioWavPath,
    "-c",
    "copy",
    outputChunkWavPath
  ];
  await runProcess(getFfmpegBinary(), args, void 0, abortSignal);
}
async function extractVerticalClip(sourceVideoPath, startSec, durationSec, outputClipPath, sourceWidth, sourceHeight, abortSignal) {
  const dir = import_path2.default.dirname(outputClipPath);
  if (!import_fs2.default.existsSync(dir)) {
    import_fs2.default.mkdirSync(dir, { recursive: true });
  }
  const targetHeight = sourceHeight >= 1080 ? 1920 : sourceHeight >= 720 ? 1280 : Math.round(sourceHeight * 16 / 9 / 2) * 2;
  const targetWidth = Math.round(targetHeight * 9 / 16 / 2) * 2;
  const videoFilter = `crop=w='min(iw,ih*9/16)':h='min(ih,iw*16/9)':x='(iw-ow)/2':y='(ih-oh)/2',scale=${targetWidth}:${targetHeight}`;
  const args = [
    "-y",
    "-ss",
    startSec.toString(),
    "-i",
    sourceVideoPath,
    "-t",
    durationSec.toString(),
    "-vf",
    videoFilter,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputClipPath
  ];
  await runProcess(getFfmpegBinary(), args, void 0, abortSignal);
  if (!import_fs2.default.existsSync(outputClipPath) || import_fs2.default.statSync(outputClipPath).size < 1e3) {
    throw new Error("Clip generation failed: Output video file was not generated.");
  }
}
async function generateSampleTestVideo(outputPath) {
  const dir = import_path2.default.dirname(outputPath);
  if (!import_fs2.default.existsSync(dir)) {
    import_fs2.default.mkdirSync(dir, { recursive: true });
  }
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=15:size=640x360:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=15",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    outputPath
  ];
  await runProcess(getFfmpegBinary(), args);
  return await probeVideoFile(outputPath);
}

// server/sessionManager.ts
var import_fs4 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_archiver = require("archiver");

// src/utils/chunking.ts
function generateChunkPlan(totalDurationSec, chunkDurationSec) {
  if (totalDurationSec <= 0 || chunkDurationSec <= 0) {
    return [];
  }
  const chunks = [];
  const totalMs = Math.round(totalDurationSec * 1e3);
  const chunkMs = Math.round(chunkDurationSec * 1e3);
  let currentStartMs = 0;
  let chunkIndex = 1;
  while (currentStartMs < totalMs) {
    const currentEndMs = Math.min(currentStartMs + chunkMs, totalMs);
    const durationMs = currentEndMs - currentStartMs;
    if (durationMs > 200 || chunks.length === 0) {
      const startSec = currentStartMs / 1e3;
      const endSec = currentEndMs / 1e3;
      const durationSec = durationMs / 1e3;
      chunks.push({
        chunkIndex,
        startSec,
        endSec,
        durationSec,
        formattedRange: `${formatSecondsToTimestamp(startSec)} \u2013 ${formatSecondsToTimestamp(endSec)}`
      });
      chunkIndex++;
    }
    currentStartMs = currentEndMs;
  }
  return chunks;
}
function aggregateMasterTranscript(chunks, totalDurationSec) {
  const sortedChunks = [...chunks].sort((a, b) => a.startOffsetSec - b.startOffsetSec);
  const items = [];
  let itemId = 1;
  for (const chunk of sortedChunks) {
    if (chunk.status !== "completed" && (!chunk.segments || chunk.segments.length === 0)) {
      continue;
    }
    const baseOffsetSec = chunk.startOffsetSec;
    if (chunk.segments && chunk.segments.length > 0) {
      for (const seg of chunk.segments) {
        const text = seg.text.trim();
        if (!text || text === "[BLANK_AUDIO]") continue;
        const globalStartSec = Math.max(0, baseOffsetSec + (seg.start || 0));
        const globalEndSec = Math.min(totalDurationSec, baseOffsetSec + (seg.end || (seg.start || 0) + 1));
        items.push({
          id: itemId++,
          chunkId: chunk.chunkId,
          globalStartSec: Math.round(globalStartSec * 1e3) / 1e3,
          globalEndSec: Math.round(globalEndSec * 1e3) / 1e3,
          formattedTimestamp: formatSecondsToTimestamp(globalStartSec),
          text
        });
      }
    } else if (chunk.text && chunk.text.trim()) {
      const text = chunk.text.trim();
      if (text !== "[BLANK_AUDIO]") {
        items.push({
          id: itemId++,
          chunkId: chunk.chunkId,
          globalStartSec: baseOffsetSec,
          globalEndSec: Math.min(totalDurationSec, baseOffsetSec + chunk.durationSec),
          formattedTimestamp: formatSecondsToTimestamp(baseOffsetSec),
          text
        });
      }
    }
  }
  const rawTextLines = items.map(
    (item) => `[${item.formattedTimestamp}] ${item.text}`
  );
  const rawText = rawTextLines.join("\n");
  return {
    totalChunks: chunks.length,
    totalDurationSec,
    items,
    rawText
  };
}

// src/utils/filenameSanitizer.ts
var WINDOWS_RESERVED_NAMES = /* @__PURE__ */ new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);
function sanitizeWindowsFilename(title, maxLength = 80) {
  if (!title || typeof title !== "string") {
    return "clip";
  }
  let safe = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
  safe = safe.replace(/[. ]+$/, "");
  const upper = safe.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(upper) || !safe) {
    safe = `clip_${safe || "item"}`;
  }
  if (safe.length > maxLength) {
    safe = safe.substring(0, maxLength).trim().replace(/[. ]+$/, "");
  }
  return safe || "clip";
}
function generateClipFilename(index, title, ext = "mp4") {
  const paddedIndex = String(index).padStart(2, "0");
  const safeTitle = sanitizeWindowsFilename(title);
  return `${paddedIndex} - ${safeTitle}.${ext.replace(/^\./, "")}`;
}

// server/whisperService.ts
var import_fs3 = __toESM(require("fs"), 1);
var import_wavefile = __toESM(require("wavefile"), 1);
var WaveFile = import_wavefile.default.WaveFile || import_wavefile.default;
var transcriberPromise = null;
async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      const modelsDir = getWhisperModelsDirectory();
      env.localModelPath = modelsDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useBrowserCache = false;
      return await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
        quantized: true
      });
    })();
  }
  return transcriberPromise;
}
async function transcribeAudioFile(wavFilePath, abortSignal) {
  if (!import_fs3.default.existsSync(wavFilePath)) {
    throw new Error(`Audio file not found: ${wavFilePath}`);
  }
  if (abortSignal?.aborted) {
    throw new Error("Transcription was cancelled by user.");
  }
  const fileBuffer = import_fs3.default.readFileSync(wavFilePath);
  const wav = new WaveFile(fileBuffer);
  wav.toBitDepth("32f");
  wav.toSampleRate(16e3);
  let samples = wav.getSamples();
  if (Array.isArray(samples)) {
    samples = samples[0];
  }
  const float32Samples = samples instanceof Float32Array ? samples : new Float32Array(samples);
  const durationSec = float32Samples.length / 16e3;
  if (abortSignal?.aborted) {
    throw new Error("Transcription was cancelled by user.");
  }
  const transcriber = await getTranscriber();
  if (abortSignal?.aborted) {
    throw new Error("Transcription was cancelled by user.");
  }
  const output = await transcriber(float32Samples, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5
  });
  const fullText = (output.text || "").trim();
  const segments = [];
  if (Array.isArray(output.chunks) && output.chunks.length > 0) {
    for (const chunk of output.chunks) {
      const segText = (chunk.text || "").trim();
      if (!segText || segText === "[BLANK_AUDIO]") continue;
      const start = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] ?? 0 : 0;
      const end = Array.isArray(chunk.timestamp) ? chunk.timestamp[1] ?? start + 2 : start + 2;
      segments.push({
        start: Math.round(start * 100) / 100,
        end: Math.round(end * 100) / 100,
        text: segText
      });
    }
  }
  if (segments.length === 0 && fullText && fullText !== "[BLANK_AUDIO]") {
    segments.push({
      start: 0,
      end: Math.round(durationSec * 100) / 100,
      text: fullText
    });
  }
  return {
    text: fullText,
    segments,
    durationSec
  };
}

// server/sessionManager.ts
function resolveDefaultDownloadsDir() {
  const baseDownloads = getDownloadsDirectory();
  const clipsOutputDir = import_path3.default.join(baseDownloads, "ViralClips");
  try {
    if (!import_fs4.default.existsSync(clipsOutputDir)) {
      import_fs4.default.mkdirSync(clipsOutputDir, { recursive: true });
    }
    return clipsOutputDir;
  } catch {
    return baseDownloads;
  }
}
var sessions = /* @__PURE__ */ new Map();
var activeAbortControllers = /* @__PURE__ */ new Map();
function getSession(sessionId) {
  return sessions.get(sessionId);
}
function createSession() {
  const sessionId = import_crypto.default.randomUUID ? import_crypto.default.randomUUID() : "sess_" + Math.random().toString(36).substring(2, 10);
  const workingDir = import_path3.default.join(getWorkstationTempDir(), "sessions", sessionId);
  const outputDir = resolveDefaultDownloadsDir();
  if (!import_fs4.default.existsSync(workingDir)) {
    import_fs4.default.mkdirSync(workingDir, { recursive: true });
  }
  if (!import_fs4.default.existsSync(outputDir)) {
    try {
      import_fs4.default.mkdirSync(outputDir, { recursive: true });
    } catch {
    }
  }
  const session = {
    sessionId,
    createdAt: Date.now(),
    video: null,
    videoFilePath: null,
    audioFilePath: null,
    workingDir,
    outputDir,
    chunkDurationSec: 300,
    // 5 minutes default
    maxClipDurationSec: 60,
    // 60 seconds default
    chunkPlan: [],
    chunkTranscriptions: [],
    isTranscribing: false,
    transcriptionProgress: {
      currentChunkIndex: 0,
      completedCount: 0,
      failedCount: 0,
      waitingCount: 0,
      totalCount: 0
    },
    masterTranscript: null,
    pastedJson: "",
    validationResult: null,
    clipJobs: [],
    isGeneratingClips: false,
    clipGenProgress: {
      currentClipIndex: 0,
      completedCount: 0,
      failedCount: 0,
      waitingCount: 0,
      totalCount: 0
    }
  };
  sessions.set(sessionId, session);
  activeAbortControllers.set(sessionId, {});
  return session;
}
async function setSessionVideo(sessionId, videoFilePath, chunkDurationSec = 300) {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  const metadata = await probeVideoFile(videoFilePath);
  session.video = metadata;
  session.videoFilePath = videoFilePath;
  session.chunkDurationSec = chunkDurationSec;
  session.chunkPlan = generateChunkPlan(metadata.durationSec, chunkDurationSec);
  session.chunkTranscriptions = session.chunkPlan.map((c) => ({
    chunkId: c.chunkIndex,
    startOffsetSec: c.startSec,
    durationSec: c.durationSec,
    status: "waiting",
    text: "",
    segments: []
  }));
  session.transcriptionProgress = {
    currentChunkIndex: 0,
    completedCount: 0,
    failedCount: 0,
    waitingCount: session.chunkPlan.length,
    totalCount: session.chunkPlan.length
  };
  session.masterTranscript = null;
  return session;
}
async function startTranscription(sessionId, chunkDurationSec) {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (!session.videoFilePath || !session.video) {
    throw new Error("No video loaded for this session");
  }
  if (session.isTranscribing) {
    return;
  }
  if (chunkDurationSec && chunkDurationSec !== session.chunkDurationSec) {
    session.chunkDurationSec = chunkDurationSec;
    session.chunkPlan = generateChunkPlan(session.video.durationSec, chunkDurationSec);
    session.chunkTranscriptions = session.chunkPlan.map((c) => ({
      chunkId: c.chunkIndex,
      startOffsetSec: c.startSec,
      durationSec: c.durationSec,
      status: "waiting",
      text: "",
      segments: []
    }));
  }
  const abortController = new AbortController();
  const controllers = activeAbortControllers.get(sessionId) || {};
  controllers.transcription = abortController;
  activeAbortControllers.set(sessionId, controllers);
  session.isTranscribing = true;
  session.transcriptionError = void 0;
  (async () => {
    try {
      const masterAudioPath = import_path3.default.join(session.workingDir, "master_audio.wav");
      if (!import_fs4.default.existsSync(masterAudioPath) || import_fs4.default.statSync(masterAudioPath).size < 100) {
        console.log(`[FFmpeg Pipeline] Starting master audio extraction: "${session.videoFilePath}" -> "${masterAudioPath}"`);
        await extractAudioFromVideo(session.videoFilePath, masterAudioPath, abortController.signal);
        const extractedBytes = import_fs4.default.statSync(masterAudioPath).size;
        console.log(`[FFmpeg Pipeline] Audio extraction completed successfully (${extractedBytes} bytes).`);
      } else {
        console.log(`[FFmpeg Pipeline] Using existing master audio (${import_fs4.default.statSync(masterAudioPath).size} bytes): ${masterAudioPath}`);
      }
      session.audioFilePath = masterAudioPath;
      for (let i = 0; i < session.chunkPlan.length; i++) {
        if (abortController.signal.aborted) break;
        const planItem = session.chunkPlan[i];
        let chunkData = session.chunkTranscriptions.find((c) => c.chunkId === planItem.chunkIndex);
        if (!chunkData) {
          chunkData = {
            chunkId: planItem.chunkIndex,
            startOffsetSec: planItem.startSec,
            durationSec: planItem.durationSec,
            status: "waiting",
            text: "",
            segments: []
          };
          session.chunkTranscriptions.push(chunkData);
        }
        if (chunkData.status === "completed") {
          continue;
        }
        chunkData.status = "processing";
        session.transcriptionProgress.currentChunkIndex = planItem.chunkIndex;
        updateTranscriptionCounts(session);
        const chunkWavPath = import_path3.default.join(session.workingDir, `chunk_${planItem.chunkIndex}.wav`);
        const startTime = Date.now();
        try {
          await extractAudioChunkWav(
            masterAudioPath,
            planItem.startSec,
            planItem.durationSec,
            chunkWavPath,
            abortController.signal
          );
          const whisperRes = await transcribeAudioFile(chunkWavPath, abortController.signal);
          chunkData.status = "completed";
          chunkData.text = whisperRes.text;
          chunkData.segments = whisperRes.segments;
          chunkData.error = void 0;
          chunkData.processingTimeMs = Date.now() - startTime;
        } catch (err) {
          if (abortController.signal.aborted) {
            chunkData.status = "waiting";
            break;
          }
          chunkData.status = "failed";
          chunkData.error = err.message || "Whisper transcription error";
        }
        updateTranscriptionCounts(session);
      }
      session.masterTranscript = aggregateMasterTranscript(
        session.chunkTranscriptions,
        session.video.durationSec
      );
    } catch (err) {
      console.error(`Transcription pipeline error in session ${sessionId}:`, err);
      session.transcriptionError = err.message || "Audio extraction or transcription pipeline failed.";
    } finally {
      session.isTranscribing = false;
      updateTranscriptionCounts(session);
    }
  })();
}
async function retryTranscriptionChunk(sessionId, chunkId) {
  const session = getSession(sessionId);
  if (!session || !session.audioFilePath) throw new Error("Session or audio not ready");
  const chunkData = session.chunkTranscriptions.find((c) => c.chunkId === chunkId);
  const planItem = session.chunkPlan.find((c) => c.chunkIndex === chunkId);
  if (!chunkData || !planItem) throw new Error(`Chunk ${chunkId} not found`);
  chunkData.status = "processing";
  chunkData.error = void 0;
  updateTranscriptionCounts(session);
  const chunkWavPath = import_path3.default.join(session.workingDir, `chunk_${chunkId}.wav`);
  const startTime = Date.now();
  try {
    await extractAudioChunkWav(session.audioFilePath, planItem.startSec, planItem.durationSec, chunkWavPath);
    const whisperRes = await transcribeAudioFile(chunkWavPath);
    chunkData.status = "completed";
    chunkData.text = whisperRes.text;
    chunkData.segments = whisperRes.segments;
    chunkData.processingTimeMs = Date.now() - startTime;
    if (session.video) {
      session.masterTranscript = aggregateMasterTranscript(
        session.chunkTranscriptions,
        session.video.durationSec
      );
    }
  } catch (err) {
    chunkData.status = "failed";
    chunkData.error = err.message || "Retry failed";
  } finally {
    updateTranscriptionCounts(session);
  }
}
function updateTranscriptionCounts(session) {
  let completed = 0;
  let failed = 0;
  let waiting = 0;
  for (const c of session.chunkTranscriptions) {
    if (c.status === "completed") completed++;
    else if (c.status === "failed") failed++;
    else waiting++;
  }
  session.transcriptionProgress.completedCount = completed;
  session.transcriptionProgress.failedCount = failed;
  session.transcriptionProgress.waitingCount = waiting;
  session.transcriptionProgress.totalCount = session.chunkPlan.length;
}
function cancelTranscription(sessionId) {
  const controllers = activeAbortControllers.get(sessionId);
  if (controllers?.transcription) {
    controllers.transcription.abort();
    controllers.transcription = void 0;
  }
  const session = getSession(sessionId);
  if (session) {
    session.isTranscribing = false;
    for (const c of session.chunkTranscriptions) {
      if (c.status === "processing") c.status = "waiting";
    }
    updateTranscriptionCounts(session);
  }
}
function prepareClipJobs(sessionId, validationResult) {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.validationResult = validationResult;
  session.clipJobs = validationResult.clips.map((clip, idx) => {
    const filename = generateClipFilename(idx + 1, clip.title);
    return {
      clipId: clip.id,
      title: clip.title,
      description: clip.description,
      startSec: clip.startSec,
      endSec: clip.endSec,
      durationSec: clip.durationSec,
      status: "waiting",
      outputFilename: filename
    };
  });
  session.clipGenProgress = {
    currentClipIndex: 0,
    completedCount: 0,
    failedCount: 0,
    waitingCount: session.clipJobs.length,
    totalCount: session.clipJobs.length
  };
  return session;
}
async function startClipGeneration(sessionId) {
  const session = getSession(sessionId);
  if (!session || !session.videoFilePath || !session.video) {
    throw new Error("No valid session or video file found");
  }
  if (session.isGeneratingClips) return;
  const abortController = new AbortController();
  const controllers = activeAbortControllers.get(sessionId) || {};
  controllers.clips = abortController;
  activeAbortControllers.set(sessionId, controllers);
  session.isGeneratingClips = true;
  session.clipGenError = void 0;
  (async () => {
    try {
      const outputDir = session.outputDir || import_path3.default.join(session.workingDir, "output_clips");
      if (!import_fs4.default.existsSync(outputDir)) {
        import_fs4.default.mkdirSync(outputDir, { recursive: true });
      }
      for (let i = 0; i < session.clipJobs.length; i++) {
        if (abortController.signal.aborted) break;
        const job = session.clipJobs[i];
        if (job.status === "completed") continue;
        job.status = "processing";
        session.clipGenProgress.currentClipIndex = i + 1;
        updateClipProgress(session);
        const outputPath = import_path3.default.join(outputDir, job.outputFilename || `clip_${i + 1}.mp4`);
        const startTime = Date.now();
        try {
          await extractVerticalClip(
            session.videoFilePath,
            job.startSec,
            job.durationSec,
            outputPath,
            session.video.width,
            session.video.height,
            abortController.signal
          );
          const stat = import_fs4.default.statSync(outputPath);
          job.status = "completed";
          job.outputPath = outputPath;
          job.fileSizeBytes = stat.size;
          job.formattedSize = formatBytes(stat.size);
          job.renderTimeMs = Date.now() - startTime;
          job.error = void 0;
        } catch (err) {
          if (abortController.signal.aborted) {
            job.status = "waiting";
            break;
          }
          job.status = "failed";
          job.error = err.message || "Clip rendering failed";
        }
        updateClipProgress(session);
      }
    } catch (err) {
      console.error(`Clip generation error in session ${sessionId}:`, err);
      session.clipGenError = err.message || "Clip rendering failed";
    } finally {
      session.isGeneratingClips = false;
      updateClipProgress(session);
    }
  })();
}
async function retryClipJob(sessionId, clipId) {
  const session = getSession(sessionId);
  if (!session || !session.videoFilePath || !session.video) throw new Error("Session not ready");
  const job = session.clipJobs.find((j) => String(j.clipId) === String(clipId));
  if (!job) throw new Error(`Clip job ${clipId} not found`);
  job.status = "processing";
  job.error = void 0;
  updateClipProgress(session);
  const outputDir = session.outputDir || import_path3.default.join(session.workingDir, "output_clips");
  const outputPath = import_path3.default.join(outputDir, job.outputFilename || `clip_${clipId}.mp4`);
  const startTime = Date.now();
  try {
    await extractVerticalClip(
      session.videoFilePath,
      job.startSec,
      job.durationSec,
      outputPath,
      session.video.width,
      session.video.height
    );
    const stat = import_fs4.default.statSync(outputPath);
    job.status = "completed";
    job.outputPath = outputPath;
    job.fileSizeBytes = stat.size;
    job.formattedSize = formatBytes(stat.size);
    job.renderTimeMs = Date.now() - startTime;
  } catch (err) {
    job.status = "failed";
    job.error = err.message || "Retry failed";
  } finally {
    updateClipProgress(session);
  }
}
function updateClipProgress(session) {
  let completed = 0;
  let failed = 0;
  let waiting = 0;
  for (const job of session.clipJobs) {
    if (job.status === "completed") completed++;
    else if (job.status === "failed") failed++;
    else waiting++;
  }
  session.clipGenProgress.completedCount = completed;
  session.clipGenProgress.failedCount = failed;
  session.clipGenProgress.waitingCount = waiting;
  session.clipGenProgress.totalCount = session.clipJobs.length;
}
function cancelClipGeneration(sessionId) {
  const controllers = activeAbortControllers.get(sessionId);
  if (controllers?.clips) {
    controllers.clips.abort();
    controllers.clips = void 0;
  }
  const session = getSession(sessionId);
  if (session) {
    session.isGeneratingClips = false;
    for (const j of session.clipJobs) {
      if (j.status === "processing") j.status = "waiting";
    }
    updateClipProgress(session);
  }
}
function streamClipsZip(sessionId, res) {
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).send("Session not found");
    return;
  }
  const completed = session.clipJobs.filter((j) => j.status === "completed" && j.outputPath && import_fs4.default.existsSync(j.outputPath));
  if (completed.length === 0) {
    res.status(400).send("No completed clips available to download");
    return;
  }
  res.attachment(`viral_clips_${sessionId.substring(0, 8)}.zip`);
  const archive = new import_archiver.ZipArchive({ zlib: { level: 5 } });
  archive.pipe(res);
  for (const job of completed) {
    archive.file(job.outputPath, { name: job.outputFilename || import_path3.default.basename(job.outputPath) });
  }
  archive.finalize();
}
function cleanupSessionTemp(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  let cleanedBytes = 0;
  if (import_fs4.default.existsSync(session.workingDir)) {
    const files = import_fs4.default.readdirSync(session.workingDir);
    for (const file of files) {
      if (file.endsWith(".wav") || file.startsWith("chunk_")) {
        const full = import_path3.default.join(session.workingDir, file);
        try {
          const stat = import_fs4.default.statSync(full);
          cleanedBytes += stat.size;
          import_fs4.default.unlinkSync(full);
        } catch {
        }
      }
    }
  }
  return { cleanedBytes };
}

// src/utils/jsonValidator.ts
function validateViralClipsJson(rawInput, videoDurationSec, maxClipDurationSec = 60) {
  const errors = [];
  const warnings = [];
  const normalizedClips = [];
  if (!rawInput || !rawInput.trim()) {
    errors.push({
      message: "JSON input is empty. Please paste the JSON returned by your LLM.",
      severity: "error"
    });
    return { isValid: false, clips: [], errors, warnings };
  }
  let cleaned = rawInput.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    errors.push({
      message: `Malformed JSON syntax: ${err.message}. Check for missing quotes, trailing commas, or brackets.`,
      severity: "error"
    });
    return { isValid: false, clips: [], errors, warnings };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push({
      message: 'Root JSON element must be an object with a "clips" array property (e.g. { "clips": [...] }).',
      severity: "error"
    });
    return { isValid: false, clips: [], errors, warnings };
  }
  if (!Array.isArray(parsed.clips)) {
    errors.push({
      field: "clips",
      message: 'Missing or invalid "clips" array in JSON. Expected: { "clips": [ ... ] }',
      severity: "error"
    });
    return { isValid: false, clips: [], errors, warnings };
  }
  if (parsed.clips.length === 0) {
    warnings.push({
      field: "clips",
      message: 'The "clips" array is empty. No clips found to process.',
      severity: "warning"
    });
  }
  const seenIds = /* @__PURE__ */ new Set();
  parsed.clips.forEach((clip, index) => {
    const clipIndexLabel = `Clip #${index + 1}`;
    const rawId = clip?.id ?? index + 1;
    if (!clip || typeof clip !== "object") {
      errors.push({
        clipId: rawId,
        message: `${clipIndexLabel}: Clip entry is not a valid object.`,
        severity: "error"
      });
      return;
    }
    const idStr = String(rawId).trim();
    if (!idStr) {
      errors.push({
        clipId: rawId,
        field: "id",
        message: `${clipIndexLabel}: Missing required "id" field.`,
        severity: "error"
      });
    } else if (seenIds.has(idStr)) {
      warnings.push({
        clipId: rawId,
        field: "id",
        message: `${clipIndexLabel}: Duplicate clip ID "${idStr}".`,
        severity: "warning"
      });
    } else {
      seenIds.add(idStr);
    }
    if (!clip.title || typeof clip.title !== "string" || !clip.title.trim()) {
      errors.push({
        clipId: rawId,
        field: "title",
        message: `${clipIndexLabel}: Missing or empty "title" field.`,
        severity: "error"
      });
    }
    if (clip.description !== void 0 && typeof clip.description !== "string") {
      warnings.push({
        clipId: rawId,
        field: "description",
        message: `${clipIndexLabel}: "description" should be a text string.`,
        severity: "warning"
      });
    }
    let startSec = 0;
    let hasValidStart = false;
    if (!clip.start) {
      errors.push({
        clipId: rawId,
        field: "start",
        message: `${clipIndexLabel}: Missing required "start" timestamp.`,
        severity: "error"
      });
    } else {
      try {
        startSec = parseTimestampToSeconds(clip.start);
        hasValidStart = true;
      } catch (err) {
        errors.push({
          clipId: rawId,
          field: "start",
          message: `${clipIndexLabel}: Invalid "start" timestamp "${clip.start}". ${err.message}`,
          severity: "error"
        });
      }
    }
    let endSec = 0;
    let hasValidEnd = false;
    if (!clip.end) {
      errors.push({
        clipId: rawId,
        field: "end",
        message: `${clipIndexLabel}: Missing required "end" timestamp.`,
        severity: "error"
      });
    } else {
      try {
        endSec = parseTimestampToSeconds(clip.end);
        hasValidEnd = true;
      } catch (err) {
        errors.push({
          clipId: rawId,
          field: "end",
          message: `${clipIndexLabel}: Invalid "end" timestamp "${clip.end}". ${err.message}`,
          severity: "error"
        });
      }
    }
    if (hasValidStart && hasValidEnd) {
      if (endSec <= startSec) {
        errors.push({
          clipId: rawId,
          field: "end",
          message: `${clipIndexLabel}: End timestamp (${formatSecondsToTimestamp(endSec)}) occurs before or at start timestamp (${formatSecondsToTimestamp(startSec)}).`,
          severity: "error"
        });
      }
      if (videoDurationSec && videoDurationSec > 0) {
        if (startSec >= videoDurationSec) {
          errors.push({
            clipId: rawId,
            field: "start",
            message: `${clipIndexLabel}: Start timestamp (${formatSecondsToTimestamp(startSec)}) is beyond video duration (${formatSecondsToTimestamp(videoDurationSec)}).`,
            severity: "error"
          });
        }
        if (endSec > videoDurationSec) {
          errors.push({
            clipId: rawId,
            field: "end",
            message: `${clipIndexLabel}: End timestamp (${formatSecondsToTimestamp(endSec)}) exceeds video duration (${formatSecondsToTimestamp(videoDurationSec)}).`,
            severity: "error"
          });
        }
      }
      const durationSec = Math.round((endSec - startSec) * 1e3) / 1e3;
      if (durationSec < 5) {
        warnings.push({
          clipId: rawId,
          field: "duration",
          message: `${clipIndexLabel}: Clip duration is very short (${durationSec}s). Most platforms recommend at least 10\u201315s.`,
          severity: "warning"
        });
      }
      if (durationSec > maxClipDurationSec) {
        errors.push({
          clipId: rawId,
          field: "duration",
          message: `${clipIndexLabel}: Clip duration (${durationSec}s) exceeds the maximum allowed limit of ${maxClipDurationSec}s.`,
          severity: "error"
        });
      }
      let hashtags = [];
      if (Array.isArray(clip.hashtags)) {
        hashtags = clip.hashtags.map((h) => String(h).trim()).filter(Boolean);
      } else if (clip.hashtags) {
        warnings.push({
          clipId: rawId,
          field: "hashtags",
          message: `${clipIndexLabel}: "hashtags" should be an array of strings.`,
          severity: "warning"
        });
      }
      let keywords = [];
      if (Array.isArray(clip.keywords)) {
        keywords = clip.keywords.map((k) => String(k).trim()).filter(Boolean);
      } else if (clip.keywords) {
        warnings.push({
          clipId: rawId,
          field: "keywords",
          message: `${clipIndexLabel}: "keywords" should be an array of strings.`,
          severity: "warning"
        });
      }
      normalizedClips.push({
        id: rawId,
        title: (clip.title || `Clip ${rawId}`).trim(),
        description: (clip.description || "").trim(),
        start: formatSecondsToTimestamp(startSec),
        end: formatSecondsToTimestamp(endSec),
        hashtags,
        keywords,
        startSec,
        endSec,
        durationSec
      });
    }
  });
  const isValid = errors.length === 0 && normalizedClips.length > 0;
  return {
    isValid,
    clips: normalizedClips,
    errors,
    warnings
  };
}

// server.ts
var app = (0, import_express.default)();
var PORT = parseInt(process.env.PORT || "3000", 10);
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
var storage = import_multer.default.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.sessionId || req.query.sessionId || "temp_upload";
    const uploadDir = import_path4.default.join(getWorkstationTempDir(), "uploads", sessionId);
    if (!import_fs5.default.existsSync(uploadDir)) {
      import_fs5.default.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = import_path4.default.extname(file.originalname) || ".mp4";
    cb(null, `source_${Date.now()}${ext}`);
  }
});
var upload = (0, import_multer.default)({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
  // 10 GB limit for desktop video
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/") || /\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are accepted. Audio-only or other file types are rejected."));
    }
  }
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});
app.get("/api/system/status", async (req, res) => {
  try {
    const deps = await checkSystemDependencies();
    const defaultDownloads = resolveDefaultDownloadsDir();
    const resourceValidation = validateAllResources();
    res.json({
      ...deps,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      defaultDownloads,
      whisperEngine: "local-onnx-cpu",
      localProcessingOnly: true,
      resourceValidation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/session/create", (req, res) => {
  try {
    const session = createSession();
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/session/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});
app.post("/api/video/upload", upload.single("video"), async (req, res) => {
  try {
    const file = req.file;
    const sessionId = req.body.sessionId;
    if (!file) {
      res.status(400).json({ error: "No video file provided." });
      return;
    }
    let session = getSession(sessionId);
    if (!session) {
      session = createSession();
    }
    const chunkDurationSec = req.body.chunkDurationSec ? parseInt(req.body.chunkDurationSec, 10) : 300;
    session = await setSessionVideo(session.sessionId, file.path, chunkDurationSec);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/video/local-path", async (req, res) => {
  try {
    const { sessionId, filePath, chunkDurationSec } = req.body;
    if (!filePath || !import_fs5.default.existsSync(filePath)) {
      res.status(400).json({ error: "Specified file path does not exist on disk." });
      return;
    }
    let session = getSession(sessionId);
    if (!session) session = createSession();
    session = await setSessionVideo(session.sessionId, filePath, chunkDurationSec || 300);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
if (process.env.NODE_ENV !== "production") {
  app.post("/api/dev/generate-test-fixture", async (req, res) => {
    try {
      const sessionId = req.body.sessionId;
      let session = getSession(sessionId);
      if (!session) session = createSession();
      const samplePath = import_path4.default.join(session.workingDir, "dev_test_fixture.mp4");
      await generateSampleTestVideo(samplePath);
      const chunkDurationSec = req.body.chunkDurationSec ? parseInt(req.body.chunkDurationSec, 10) : 300;
      session = await setSessionVideo(session.sessionId, samplePath, chunkDurationSec);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
var handleSessionSettings = (req, res) => {
  try {
    const { sessionId, outputDir, chunkDurationSec, maxClipDurationSec } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (outputDir) session.outputDir = outputDir;
    if (chunkDurationSec && session.video && !session.isTranscribing) {
      session.chunkDurationSec = chunkDurationSec;
    }
    if (maxClipDurationSec) {
      session.maxClipDurationSec = maxClipDurationSec;
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/session/settings", handleSessionSettings);
app.post("/api/session/output-dir", handleSessionSettings);
var handleStartTranscription = (req, res) => {
  try {
    const { sessionId, chunkDurationSec } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    startTranscription(sessionId, chunkDurationSec).catch((err) => {
      console.error(`Background transcription error:`, err);
    });
    res.json(getSession(sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/transcription/start", handleStartTranscription);
app.post("/api/transcribe/start", handleStartTranscription);
var handleCancelTranscription = (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    cancelTranscription(sessionId);
    res.json(getSession(sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/transcription/cancel/:sessionId", handleCancelTranscription);
app.post("/api/transcription/cancel", handleCancelTranscription);
app.post("/api/transcribe/cancel", handleCancelTranscription);
var handleRetryChunk = async (req, res) => {
  try {
    const { sessionId, chunkId } = req.body;
    retryTranscriptionChunk(sessionId, parseInt(chunkId, 10)).catch((err) => {
      console.error(`Chunk retry error:`, err);
    });
    res.json(getSession(sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/transcription/retry-chunk", handleRetryChunk);
app.post("/api/transcribe/retry-chunk", handleRetryChunk);
app.post("/api/clips/validate-json", (req, res) => {
  try {
    const { sessionId, rawJson, maxDurationSec, maxClipDurationSec } = req.body;
    const session = getSession(sessionId);
    const videoDuration = session?.video?.durationSec || 0;
    const maxDur = maxDurationSec || maxClipDurationSec || session?.maxClipDurationSec || 60;
    const result = validateViralClipsJson(rawJson, videoDuration, maxDur);
    if (result.isValid && session) {
      session.pastedJson = rawJson;
      session.validationResult = result;
      const updated = prepareClipJobs(sessionId, result);
      res.json(updated);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/clips/apply-json", (req, res) => {
  try {
    const { sessionId, rawJson, maxClipDurationSec } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const videoDuration = session.video?.durationSec || 0;
    const maxDur = maxClipDurationSec || session.maxClipDurationSec || 60;
    const result = validateViralClipsJson(rawJson, videoDuration, maxDur);
    if (!result.isValid) {
      res.status(400).json({ error: "JSON validation failed", validationResult: result });
      return;
    }
    session.pastedJson = rawJson;
    const updated = prepareClipJobs(sessionId, result);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var handleStartClips = (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    startClipGeneration(sessionId).catch((err) => {
      console.error(`Clip rendering error:`, err);
    });
    res.json(getSession(sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/clips/start", handleStartClips);
app.post("/api/clips/generate", handleStartClips);
var handleCancelClips = (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    cancelClipGeneration(sessionId);
    res.json(getSession(sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/clips/cancel/:sessionId", handleCancelClips);
app.post("/api/clips/cancel", handleCancelClips);
app.post("/api/clips/retry-clip", async (req, res) => {
  try {
    const { sessionId, clipId } = req.body;
    await retryClipJob(sessionId, clipId);
    res.json(getSession(sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/clips/download/:sessionId/:clipId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).send("Session not found");
    return;
  }
  const job = session.clipJobs.find((j) => String(j.clipId) === String(req.params.clipId));
  if (!job || !job.outputPath || !import_fs5.default.existsSync(job.outputPath)) {
    res.status(404).send("Clip file not found or not yet rendered");
    return;
  }
  res.download(job.outputPath, job.outputFilename || import_path4.default.basename(job.outputPath));
});
app.get("/api/clips/download-all/:sessionId", (req, res) => {
  streamClipsZip(req.params.sessionId, res);
});
app.get("/api/media/stream/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session || !session.videoFilePath || !import_fs5.default.existsSync(session.videoFilePath)) {
    res.status(404).send("Video not found");
    return;
  }
  const videoPath = session.videoFilePath;
  const stat = import_fs5.default.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = import_fs5.default.createReadStream(videoPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4"
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4"
    };
    res.writeHead(200, head);
    import_fs5.default.createReadStream(videoPath).pipe(res);
  }
});
app.get("/api/media/clip-stream/:sessionId/:clipId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).send("Session not found");
    return;
  }
  const job = session.clipJobs.find((j) => String(j.clipId) === String(req.params.clipId));
  if (!job || !job.outputPath || !import_fs5.default.existsSync(job.outputPath)) {
    res.status(404).send("Clip file not found");
    return;
  }
  const clipPath = job.outputPath;
  const stat = import_fs5.default.statSync(clipPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = import_fs5.default.createReadStream(clipPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4"
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4"
    };
    res.writeHead(200, head);
    import_fs5.default.createReadStream(clipPath).pipe(res);
  }
});
var handleCleanupSession = (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const result = cleanupSessionTemp(sessionId);
    res.json({ status: "cleaned", ...result, session: getSession(sessionId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post("/api/session/cleanup/:sessionId", handleCleanupSession);
app.post("/api/session/cleanup", handleCleanupSession);
app.post("/api/session/cleanup-temp", handleCleanupSession);
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production" || process.env.IS_PACKAGED === "true";
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (devErr) {
      console.warn("Vite development server could not be started, falling back to static files:", devErr);
    }
  } else {
    const candidateDistPaths = [
      __dirname,
      import_path4.default.join(__dirname, "dist"),
      import_path4.default.join(process.cwd(), "dist")
    ];
    const distPath = candidateDistPaths.find((p) => import_fs5.default.existsSync(import_path4.default.join(p, "index.html"))) || __dirname;
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path4.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Video Processor Workstation running at http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map

import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Robust resource locator for both dev environment and packaged Windows Electron app.
 *
 * In Electron packaged app:
 * - process.resourcesPath points to <installDir>/resources
 * - Bundled extraResources:
 *     <resourcesPath>/bin/ffmpeg.exe
 *     <resourcesPath>/bin/ffprobe.exe
 *     <resourcesPath>/models/Xenova/whisper-tiny.en/...
 *
 * In Development / Container environment:
 * - process.cwd() points to project root
 * - ./bin/ffmpeg.exe
 * - ./models/Xenova/whisper-tiny.en/...
 */

export function isPackaged(): boolean {
  if (process.env.IS_PACKAGED === 'true') return true;
  if ((process as any).resourcesPath && !(process as any).defaultApp && process.env.NODE_ENV === 'production') {
    return true;
  }
  if (process.env.RESOURCES_PATH && process.env.NODE_ENV === 'production' && !process.env.DEV_MODE) {
    return true;
  }
  return false;
}

export function getResourcesPath(): string {
  // 1. Explicitly passed by Electron or environment
  if (process.env.RESOURCES_PATH) {
    return process.env.RESOURCES_PATH;
  }

  // 2. Standard Electron process.resourcesPath (when running inside Electron)
  if ((process as any).resourcesPath) {
    return (process as any).resourcesPath;
  }

  // 3. Fallback: Check if resources directory exists next to executable
  const execResources = path.join(path.dirname(process.execPath), 'resources');
  if (fs.existsSync(execResources)) {
    return execResources;
  }

  // 4. Fallback: Check if resources directory exists next to current directory
  const cwdResources = path.join(process.cwd(), 'resources');
  if (fs.existsSync(cwdResources)) {
    return cwdResources;
  }

  // 5. Default to current working directory in dev
  return process.cwd();
}

/**
 * Resolves the path to the ffmpeg executable.
 * In a packaged production application, it strictly requires the bundled executable
 * and NEVER falls back to system PATH.
 */
export function getFfmpegBinary(): string {
  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
  const resPath = getResourcesPath();

  // 1. Packaged production application: strictly require the bundled executable
  if (isPackaged()) {
    const packagedExe = path.join(resPath, 'bin', exeName);
    if (fs.existsSync(packagedExe)) {
      return packagedExe;
    }
    const packagedWinExe = path.join(resPath, 'bin', 'ffmpeg.exe');
    if (fs.existsSync(packagedWinExe)) {
      return packagedWinExe;
    }
    throw new Error(
      `Bundled FFmpeg executable is missing from application resources at "${packagedExe}". ` +
      `The Windows package requires "ffmpeg.exe" in "resources/bin/ffmpeg.exe" (or "bin/ffmpeg.exe" before packaging). ` +
      `Please supply the official Windows x64 FFmpeg executable.`
    );
  }

  // 2. Development mode:
  if (isWindows) {
    const localBinExe = path.join(process.cwd(), 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localBinExe)) {
      return localBinExe;
    }
  } else {
    const localBin = path.join(process.cwd(), 'bin', 'ffmpeg');
    if (fs.existsSync(localBin)) {
      return localBin;
    }
  }

  // 3. Development / container fallback only
  return exeName;
}

/**
 * Resolves the path to the ffprobe executable.
 * In a packaged production application, it strictly requires the bundled executable
 * and NEVER falls back to system PATH.
 */
export function getFfprobeBinary(): string {
  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? 'ffprobe.exe' : 'ffprobe';
  const resPath = getResourcesPath();

  // 1. Packaged production application: strictly require the bundled executable
  if (isPackaged()) {
    const packagedExe = path.join(resPath, 'bin', exeName);
    if (fs.existsSync(packagedExe)) {
      return packagedExe;
    }
    const packagedWinExe = path.join(resPath, 'bin', 'ffprobe.exe');
    if (fs.existsSync(packagedWinExe)) {
      return packagedWinExe;
    }
    throw new Error(
      `Bundled FFprobe executable is missing from application resources at "${packagedExe}". ` +
      `The Windows package requires "ffprobe.exe" in "resources/bin/ffprobe.exe" (or "bin/ffprobe.exe" before packaging). ` +
      `Please supply the official Windows x64 FFprobe executable.`
    );
  }

  // 2. Development mode:
  if (isWindows) {
    const localBinExe = path.join(process.cwd(), 'bin', 'ffprobe.exe');
    if (fs.existsSync(localBinExe)) {
      return localBinExe;
    }
  } else {
    const localBin = path.join(process.cwd(), 'bin', 'ffprobe');
    if (fs.existsSync(localBin)) {
      return localBin;
    }
  }

  // 3. Development / container fallback only
  return exeName;
}

/**
 * Resolves the directory containing the bundled Whisper ONNX models.
 */
export function getWhisperModelsDirectory(): string {
  // 1. Packaged Electron resourcesPath/models
  const resModels = path.join(getResourcesPath(), 'models');
  const resWhisper = path.join(resModels, 'Xenova', 'whisper-tiny.en');
  if (
    fs.existsSync(path.join(resWhisper, 'onnx', 'encoder_model_quantized.onnx')) &&
    fs.existsSync(path.join(resWhisper, 'onnx', 'decoder_model_merged_quantized.onnx'))
  ) {
    return resModels;
  }

  // 2. Local workspace models directory
  const localModels = path.join(process.cwd(), 'models');
  const localWhisper = path.join(localModels, 'Xenova', 'whisper-tiny.en');
  if (
    fs.existsSync(path.join(localWhisper, 'onnx', 'encoder_model_quantized.onnx')) &&
    fs.existsSync(path.join(localWhisper, 'onnx', 'decoder_model_merged_quantized.onnx'))
  ) {
    return localModels;
  }

  if (isPackaged()) {
    throw new Error(
      `Bundled Whisper model is missing from application resources at "${resWhisper}". Please reinstall the application.`
    );
  }

  return localModels;
}

/**
 * Resolves the path to the bundled Face Tracking ONNX model.
 * In packaged Electron app: <resourcesPath>/models/face/version-RFB-320.onnx
 * In development: ./models/face/version-RFB-320.onnx
 */
export function getFaceModelPath(): string {
  const modelSubpath = path.join('models', 'face', 'version-RFB-320.onnx');

  // 1. Packaged Electron resourcesPath
  const packagedModel = path.join(getResourcesPath(), modelSubpath);
  if (fs.existsSync(packagedModel)) {
    return packagedModel;
  }

  // 2. Local workspace models directory
  const localModel = path.join(process.cwd(), modelSubpath);
  if (fs.existsSync(localModel)) {
    return localModel;
  }

  if (isPackaged()) {
    throw new Error(
      `Bundled Face Tracking ONNX model is missing from application resources at "${packagedModel}". Please reinstall the application.`
    );
  }

  return localModel;
}

/**
 * Resolves the user's Downloads directory without hardcoding usernames.
 */
export function getDownloadsDirectory(): string {
  if (process.env.DOWNLOADS_PATH && fs.existsSync(process.env.DOWNLOADS_PATH)) {
    return process.env.DOWNLOADS_PATH;
  }

  const isWindows = process.platform === 'win32';
  if (isWindows && process.env.USERPROFILE) {
    const winDownloads = path.join(process.env.USERPROFILE, 'Downloads');
    if (fs.existsSync(winDownloads)) return winDownloads;
  }

  const homeDownloads = path.join(os.homedir(), 'Downloads');
  if (fs.existsSync(homeDownloads)) return homeDownloads;

  return os.homedir();
}

/**
 * Resolves the temporary directory for intermediate chunks and wav files.
 * In packaged production, strictly uses the operating system temporary directory
 * (e.g. %TEMP%/desktop-video-processor) rather than process.cwd().
 */
export function getWorkstationTempDir(): string {
  // 1. Explicitly configured path from environment
  if (process.env.WORKSTATION_TEMP) {
    try {
      if (!fs.existsSync(process.env.WORKSTATION_TEMP)) {
        fs.mkdirSync(process.env.WORKSTATION_TEMP, { recursive: true });
      }
      return process.env.WORKSTATION_TEMP;
    } catch {
      // Fall through to OS temp
    }
  }

  // 2. Packaged production: strictly use the OS temp directory (never assume process.cwd() is writable)
  if (isPackaged()) {
    const osTemp = path.join(os.tmpdir(), 'desktop-video-processor');
    if (!fs.existsSync(osTemp)) {
      try {
        fs.mkdirSync(osTemp, { recursive: true });
      } catch {
        // ignore
      }
    }
    return osTemp;
  }

  // 3. Development mode: use project-local temp folder if convenient and writable
  try {
    const devTemp = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(devTemp)) {
      fs.mkdirSync(devTemp, { recursive: true });
    }
    return devTemp;
  } catch {
    // Fallback to OS temp directory if project directory is unwritable
    const osTemp = path.join(os.tmpdir(), 'desktop-video-processor');
    if (!fs.existsSync(osTemp)) {
      try {
        fs.mkdirSync(osTemp, { recursive: true });
      } catch {
        // ignore
      }
    }
    return osTemp;
  }
}

export interface ResourceValidationResult {
  allValid: boolean;
  isPackaged: boolean;
  ffmpegPath: string;
  ffmpegValid: boolean;
  ffprobePath: string;
  ffprobeValid: boolean;
  whisperModelsDir: string;
  whisperValid: boolean;
  faceModelPath: string;
  faceModelValid: boolean;
  errors: string[];
}

export function validateAllResources(): ResourceValidationResult {
  const errors: string[] = [];
  const packaged = isPackaged();

  let ffmpegPath = '';
  let ffmpegValid = false;
  try {
    ffmpegPath = getFfmpegBinary();
    if (path.isAbsolute(ffmpegPath)) {
      ffmpegValid = fs.existsSync(ffmpegPath);
      if (!ffmpegValid) errors.push(`FFmpeg binary not found at ${ffmpegPath}`);
    } else {
      ffmpegValid = true;
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  let ffprobePath = '';
  let ffprobeValid = false;
  try {
    ffprobePath = getFfprobeBinary();
    if (path.isAbsolute(ffprobePath)) {
      ffprobeValid = fs.existsSync(ffprobePath);
      if (!ffprobeValid) errors.push(`FFprobe binary not found at ${ffprobePath}`);
    } else {
      ffprobeValid = true;
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  let whisperModelsDir = '';
  let whisperValid = false;
  try {
    whisperModelsDir = getWhisperModelsDirectory();
    const encoder = path.join(whisperModelsDir, 'Xenova', 'whisper-tiny.en', 'onnx', 'encoder_model_quantized.onnx');
    const decoder = path.join(whisperModelsDir, 'Xenova', 'whisper-tiny.en', 'onnx', 'decoder_model_merged_quantized.onnx');
    whisperValid = fs.existsSync(encoder) && fs.existsSync(decoder);
    if (!whisperValid) {
      errors.push(`Whisper ONNX models not found in ${whisperModelsDir}`);
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  let faceModelPath = '';
  let faceModelValid = false;
  try {
    faceModelPath = getFaceModelPath();
    faceModelValid = fs.existsSync(faceModelPath);
    if (!faceModelValid) {
      errors.push(`Face tracking ONNX model not found at ${faceModelPath}`);
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    allValid: errors.length === 0 && ffmpegValid && ffprobeValid && whisperValid && faceModelValid,
    isPackaged: packaged,
    ffmpegPath,
    ffmpegValid,
    ffprobePath,
    ffprobeValid,
    whisperModelsDir,
    whisperValid,
    faceModelPath,
    faceModelValid,
    errors,
  };
}

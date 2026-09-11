/**
 * Electron Main Process Entry Point for Windows Desktop Packaging
 *
 * Launches the bundled local Express media server with automatic port discovery,
 * waits for server readiness via /api/health, resolves packaged resources (bin/ffmpeg.exe,
 * models/Xenova/whisper-tiny.en), and creates a native Windows desktop window.
 */

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');

let mainWindow = null;
let activePort = 3000;

// Handle native folder picker from renderer
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Folder for 9:16 Video Clips',
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

/**
 * Finds an available TCP port starting from preferredPort
 */
function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => {
      // Port in use, try next
      resolve(findAvailablePort(startPort + 1));
    });
    tester.once('listening', () => {
      const port = tester.address().port;
      tester.close(() => resolve(port));
    });
    tester.listen(startPort, '127.0.0.1');
  });
}

/**
 * Polls the backend server /api/health endpoint until responsive
 */
function waitForServerReady(port, maxRetries = 60, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts >= maxRetries) {
          reject(new Error(`Server returned unexpected HTTP status: ${res.statusCode}`));
        } else {
          setTimeout(check, intervalMs);
        }
      });

      req.on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error(`Server failed to start after ${maxRetries * intervalMs}ms`));
        } else {
          setTimeout(check, intervalMs);
        }
      });

      req.setTimeout(1500, () => {
        req.destroy();
        if (attempts >= maxRetries) {
          reject(new Error('Server readiness check timed out'));
        } else {
          setTimeout(check, intervalMs);
        }
      });
    };

    check();
  });
}

/**
 * Resolves the server.cjs entry point path
 */
function resolveServerPath() {
  const candidatePaths = [
    // 1. Packaged inside app.asar (or unpacked app)
    path.join(app.getAppPath(), 'dist', 'server.cjs'),
    // 2. Relative to packaging directory
    path.join(__dirname, '..', 'dist', 'server.cjs'),
    // 3. Process cwd
    path.join(process.cwd(), 'dist', 'server.cjs'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find server.cjs in candidates: ${candidatePaths.join(', ')}`);
}

function createWindow(port) {
  const preloadPath = path.join(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    title: 'Desktop Video Clip Processor',
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in default OS browser
    const { shell } = require('electron');
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure single instance lock on Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      // 1. Configure production paths for bundled resources
      const resourcesPath = app.isPackaged ? process.resourcesPath : process.cwd();
      const downloadsPath = app.getPath('downloads');
      const tempPath = path.join(app.getPath('temp'), 'desktop-video-processor');

      process.env.RESOURCES_PATH = resourcesPath;
      process.env.DOWNLOADS_PATH = downloadsPath;
      process.env.WORKSTATION_TEMP = tempPath;
      process.env.NODE_ENV = 'production';
      process.env.IS_PACKAGED = app.isPackaged ? 'true' : 'false';

      // Explicit verification: In packaged production, strictly verify bundled resources exist
      if (app.isPackaged) {
        const isWin = process.platform === 'win32';
        const ffmpegExe = path.join(resourcesPath, 'bin', isWin ? 'ffmpeg.exe' : 'ffmpeg');
        const ffprobeExe = path.join(resourcesPath, 'bin', isWin ? 'ffprobe.exe' : 'ffprobe');
        const whisperModel = path.join(resourcesPath, 'models', 'Xenova', 'whisper-tiny.en', 'onnx', 'encoder_model_quantized.onnx');

        if (!fs.existsSync(ffmpegExe)) {
          throw new Error(`Bundled FFmpeg is missing from the application resources at "${ffmpegExe}". Please reinstall the application.`);
        }
        if (!fs.existsSync(ffprobeExe)) {
          throw new Error(`Bundled FFprobe is missing from the application resources at "${ffprobeExe}". Please reinstall the application.`);
        }
        if (!fs.existsSync(whisperModel)) {
          throw new Error(`Bundled Whisper model is missing from the application resources at "${whisperModel}". Please reinstall the application.`);
        }
      }

      // Ensure temp workstation dir exists
      if (!fs.existsSync(tempPath)) {
        try {
          fs.mkdirSync(tempPath, { recursive: true });
        } catch {
          // ignore
        }
      }

      // 2. Discover available port
      activePort = await findAvailablePort(3000);
      process.env.PORT = String(activePort);

      // 3. Launch the server module in-process
      const serverFile = resolveServerPath();
      console.log(`Starting media server from: ${serverFile} on port ${activePort}`);
      require(serverFile);

      // 4. Wait for server /api/health to confirm readiness
      await waitForServerReady(activePort, 60, 200);
      console.log(`Local Express backend ready at http://127.0.0.1:${activePort}`);

      // 5. Create the native desktop window
      createWindow(activePort);
    } catch (err) {
      console.error('Fatal initialization error:', err);
      dialog.showErrorBox(
        'Application Startup Error',
        `Failed to start local desktop processor:\n${err.message || err}`
      );
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(activePort);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    // Clean exit
  });
}

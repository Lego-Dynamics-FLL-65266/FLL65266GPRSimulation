const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
let visualizerWindow, joystickWindow;
const { fork } = require("child_process");
function createWindows() {
  visualizerWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  joystickWindow = new BrowserWindow({
    width: 800,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  visualizerWindow.loadFile("main.html");
  joystickWindow.loadFile("joystick.html");
  // When any window is closed, quit the app.
  // Use 'closed' event to allow cleanup of child processes and avoid
  // sending to destroyed webContents.
  function onAnyWindowClosed() {
    // Kill BLE child if running
    if (bleProcess && !bleProcess.killed) {
      try {
        bleProcess.kill();
      } catch (e) {
        console.warn(
          "[main.js] Error killing BLE process during window close",
          e
        );
      }
    }
    app.quit();
  }

  visualizerWindow.on("closed", onAnyWindowClosed);
  joystickWindow.on("closed", onAnyWindowClosed);
}
let bleProcess;
let currentPosition = { x: 0, z: 0 };
function startBleProcess() {
  if (bleProcess) {
    bleProcess.kill();
  }
  bleProcess = fork("blereciever.js");
  bleProcess.on("message", (msg) => {
    const doPostProcess = false; // Set to false to skip normalization and decay

    if (msg.type === "vectorCommand") {
      const match = msg.payload.match(/dX=(-?\d+)[,\s]+dY=(-?\d+)/i);
      if (match) {
        const rawX = parseInt(match[1], 10);
        const rawZ = parseInt(match[2], 10);
        let deltaX = rawX / 3000; // or 3000 or whatever feels right
        let deltaZ = rawZ / 3000;
        if (doPostProcess) {
          if (
            Math.abs(rawX) >= movementThreshold ||
            Math.abs(rawZ) >= movementThreshold
          ) {
            deltaX = sigmoid(rawX / 819.2);
            deltaZ = sigmoid(rawZ / 819.2);
          } else {
            deltaX = 0;
            deltaZ = 0;
          }
        } else {
          deltaX = rawX / 8192;
          deltaZ = rawZ / 8192;
        }

        currentPosition.x -= deltaX;
        currentPosition.z += deltaZ;
        console.log(currentPosition);
        const vector = { x: currentPosition.x, y: 0, z: currentPosition.z };
        // Guard against sending to a destroyed or null window
        if (
          visualizerWindow &&
          !visualizerWindow.isDestroyed() &&
          visualizerWindow.webContents
        ) {
          try {
            visualizerWindow.webContents.send("vectorCommand", vector);
          } catch (e) {
            console.warn(
              "[main.js] Failed to send vectorCommand to visualizerWindow",
              e
            );
          }
        } else {
          // If visualizer isn't available, log and retain the vector state
          console.warn(
            "[main.js] visualizerWindow not available to receive vectorCommand"
          );
        }
      } else {
        console.warn("[main.js] Failed to parse vectorCommand:", msg.payload);
      }
    }
  });
}

// Ensure BLE child is killed on app quit (covers cases where windows are closed by OS)
app.on("before-quit", () => {
  if (bleProcess && !bleProcess.killed) {
    try {
      bleProcess.kill();
    } catch (e) {
      console.warn("[main.js] Error killing BLE process during app quit", e);
    }
  }
});
function sigmoid(x) {
  return x / (1 + Math.abs(x)); // smoother than tanh, bounded between -1 and 1
}
app.whenReady().then(() => {
  createWindows();
  startBleProcess();
  /*ipcMain.on("vectorCommand", (event, vec) => {
    //console.log("[main.js] Received vectorCommand:", vec);
    visualizerWindow.webContents.send("vectorCommand", vec);
    //console.log("[main.js] Sent vectorCommand to visualizerWindow:", vec);
  });*/
  ipcMain.on("restartBleProcess", () => {
    console.log("[main.js] Restarting BLE process...");
    startBleProcess();
  });
  // Launch BLE receiver as child process
  let lastValidVector = { x: 0, z: 0 };
  const movementThreshold = 400;
  const decayFactor = 0.9; // how fast it slows down (0.9 = gentle, 0.5 = fast)
  const smoothingFactor = 0.2; // 0 = slow response, 1 = instant snap

  function smoothUpdate(prev, next) {
    return {
      x: smoothingFactor * next.x + (1 - smoothingFactor) * prev.x,
      z: smoothingFactor * next.z + (1 - smoothingFactor) * prev.z,
    };
  }

  function sigmoid(x) {
    return x / (1 + Math.abs(x));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

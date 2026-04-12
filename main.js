const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const WebSocket = require("ws");

let visualizerWindow;
let wsClient;
let currentPosition = { x: 0, z: 0 };

function createWindows() {
  visualizerWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  visualizerWindow.loadFile("main.html");

  visualizerWindow.on("closed", () => {
    if (wsClient) wsClient.close();
    app.quit();
  });
}

function startWifiProcess() {
  const wsUrl = "ws://192.168.4.1:81";
  console.log(`[main.js] Connecting to ESP32 at ${wsUrl}...`);

  wsClient = new WebSocket(wsUrl);

  wsClient.on("open", () => {
    console.log("[main.js] Connected to ESP32 WiFi (Raw Mode)");
  });

  wsClient.on("message", (data) => {
    const payload = data.toString();

    // Format from ESP32: "ACC:x,y,z"
    if (payload.startsWith("ACC:")) {
      const coords = payload.replace("ACC:", "").split(",");
      if (coords.length >= 2) {
        // RAW DATA: No smoothing, no sigmoid
        const rawX = parseInt(coords[0], 10);
        const rawZ = parseInt(coords[1], 10);

        // Direct Scaling: Adjust 8192 if it's too sensitive or not sensitive enough
        let deltaX = rawX / 5000;
        let deltaZ = rawZ / 5000;

        currentPosition.x = -deltaX;
        currentPosition.z = deltaZ;

        const vector = { x: currentPosition.x, y: 0, z: currentPosition.z };

        if (visualizerWindow && !visualizerWindow.isDestroyed()) {
          visualizerWindow.webContents.send("vectorCommand", vector);
        }
      }
    }
  });

  wsClient.on("close", () => {
    console.log("[main.js] Connection lost. Retrying...");
    setTimeout(startWifiProcess, 1000);
  });

  wsClient.on("error", (err) => {
    // Silence errors to keep the console clean during retries
  });
}

app.whenReady().then(() => {
  createWindows();
  startWifiProcess();

  ipcMain.on("restartBleProcess", () => {
    if (wsClient) wsClient.close();
    startWifiProcess();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

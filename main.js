const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const WebSocket = require("ws");

let visualizerWindow;
let wsClient;
let currentPosition = { x: 0, z: 0 };

function createWindows() {
  visualizerWindow = new BrowserWindow({
    width: 1134,
    height: 1600,
    fullscreen: false,
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

app.whenReady().then(() => {
  createWindows();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

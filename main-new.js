const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");

let visualizerWindow, joystickWindow;

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
}

function startHttpServer() {
  const server = express();
  server.use(bodyParser.json());

  server.post("/data", (req, res) => {
    const { message } = req.body;
    console.log("[ESP32] says:", message);

    // Forward to visualizer window
    if (visualizerWindow) {
      visualizerWindow.webContents.send("vectorCommand", message);
    }

    res.sendStatus(200);
  });

  server.listen(3000, () => {
    console.log("HTTP server listening on port 3000");
  });
}

app.whenReady().then(() => {
  createWindows();
  startHttpServer();

  ipcMain.on("vectorCommand", (event, vec) => {
    visualizerWindow.webContents.send("vectorCommand", vec);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

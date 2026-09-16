"use strict";

const { app, BrowserWindow } = require("electron");
const path = require("path");

const PORT = 4173;
process.env.PORT = String(PORT);

function startServer(){
  // Runs the Express server in-process so the desktop app owns its own
  // local port and SQLite file — no separate process to manage.
  require(path.join(__dirname, "..", "server.js"));
}

function createWindow(){
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "A3Solution Pipeline",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 300);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

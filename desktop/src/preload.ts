/**
 * The only bridge between the pages and the desktop shell: a few backup/setup calls.
 * No Node.js, no file system and no IPC channels beyond these reach the page.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("taDesktop", {
  status: () => ipcRenderer.invoke("backup:status"),
  chooseFolder: () => ipcRenderer.invoke("backup:chooseFolder"),
  setPassword: (pw: string) => ipcRenderer.invoke("backup:setPassword", pw),
  backupNow: () => ipcRenderer.invoke("backup:now"),
  chooseRestoreFile: () => ipcRenderer.invoke("backup:chooseRestoreFile"),
  restore: (file: string, pw: string) => ipcRenderer.invoke("backup:restore", file, pw),
  openFolder: () => ipcRenderer.invoke("backup:openFolder"),
});

contextBridge.exposeInMainWorld("taSetup", {
  complete: (d: { email: string; password: string; demo: boolean }) => ipcRenderer.invoke("setup:complete", d),
});

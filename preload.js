const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: (notes) => ipcRenderer.send('save', notes),
  ignore: (v) => ipcRenderer.send('ignore', v),
  focus: () => ipcRenderer.send('focus'),
  release: () => ipcRenderer.send('release'),
  menu: () => ipcRenderer.send('menu'),
  on: (channel, fn) => ipcRenderer.on(channel, (_e, ...args) => fn(...args)),
});

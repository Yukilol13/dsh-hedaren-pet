const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('heshen', {
  readState: () => ipcRenderer.invoke('state:read'),
  writeState: (next) => ipcRenderer.invoke('state:write', next),
  metrics: (payload) => ipcRenderer.send('pet:metrics', payload),
  moveBy: (dx, dy) => ipcRenderer.send('win:move', dx, dy),
  throwPet: (vx, vy) => ipcRenderer.send('win:throw', vx, vy),
  stopThrow: () => ipcRenderer.send('win:stop'),
  onBounce: (cb) => ipcRenderer.on('win:bounce', (_event, edge) => cb(edge)),
  onFacing: (cb) => ipcRenderer.on('win:facing', (_event, dir) => cb(dir)),
  onThrowEnd: (cb) => ipcRenderer.on('win:throwEnd', () => cb()),
  onThrowState: (cb) => ipcRenderer.on('win:throwState', (_event, state) => cb(state)),
  prefetchFish: () => ipcRenderer.send('fish:prefetch'),
  // 欠债阈值窗口
  onThresholdInit: (cb) => ipcRenderer.on('jail:threshold-init', (_event, value) => cb(value)),
  saveThreshold: (value) => ipcRenderer.send('jail:threshold-save', value),
  closeThreshold: () => ipcRenderer.send('jail:threshold-close'),
  setIgnore: (ignore) => ipcRenderer.send('win:ignore', ignore),
  hide: () => ipcRenderer.send('win:hide'),
  show: () => ipcRenderer.send('win:show'),
  quit: () => ipcRenderer.send('app:quit'),

  resizeBubble: (height) => ipcRenderer.send('bubble:height', height),
  openMenu: (point) => ipcRenderer.send('menu:open', point),
  closeMenu: () => ipcRenderer.send('menu:close'),
  resizeMenu: (height) => ipcRenderer.send('menu:resize', height),
  menuAction: (payload) => ipcRenderer.send('menu:action', payload),
  onMenuOpened: (cb) => ipcRenderer.on('menu:opened', () => cb()),

  openChat: () => ipcRenderer.send('chat:open'),
  closeChat: () => ipcRenderer.send('chat:close'),
  onScale: (cb) => ipcRenderer.on('pet:scale', (_event, value) => cb(value)),
  onThrowSettle: (cb) => ipcRenderer.on('pet:throwSettle', (_event, value) => cb(value)),
  throwSkip: (info) => ipcRenderer.send('win:throwSkip', info),
})

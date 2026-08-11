import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path, { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupApiHandlers } from './api-handlers'
import { parseSct, serializeSct, parseKnownSections } from './sect-parser'
import { dialog } from 'electron'
import { WINDOW_OFFSET_X, WINDOW_OFFSET_Y } from '../../awos_config.json'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    show: false,
    x: WINDOW_OFFSET_X,
    y: WINDOW_OFFSET_Y,
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()
  setupApiHandlers()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('get-awos-config', (): object => {
  const configPath = path.join(app.getAppPath(), 'awos_config.json')
  const rawData = fs.readFileSync(configPath, 'utf-8')
  return JSON.parse(rawData) as object
})

ipcMain.handle('sector-load', async (_evt, filePath: string) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const doc = parseSct(raw)
    const parsed = parseKnownSections(doc)
    return { ok: true, doc, parsed }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('sector-save', async (_evt, { filePath, doc }: { filePath: string; doc: any }) => {
  try {
    const text = serializeSct(doc)
    fs.writeFileSync(filePath, text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('sector-open-dialog', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Sector files', extensions: ['sct', 'ese'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
})

ipcMain.handle('sector-show-save-dialog', async (_evt, defaultPath?: string) => {
  const res = await dialog.showSaveDialog({
    defaultPath: defaultPath ?? 'sector.sct',
    filters: [
      { name: 'Sector files', extensions: ['sct', 'ese'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (res.canceled || !res.filePath) return null
  return res.filePath
})

ipcMain.handle('sector-load-pair', async (_evt, filePath: string) => {
  try {
    const readAndParse = (p: string) => {
      const raw = fs.readFileSync(p, 'utf8')
      return parseSct(raw)
    }
    const ext = path.extname(filePath).toLowerCase()
    const base = filePath.substring(0, filePath.length - ext.length)
    const candidates = [] as string[]
    if (fs.existsSync(filePath)) candidates.push(filePath)
    const otherExt = ext === '.sct' ? '.ese' : '.sct'
    const otherPath = base + otherExt
    if (fs.existsSync(otherPath)) candidates.push(otherPath)

    if (candidates.length === 0) throw new Error('File not found')

    const docs = candidates.map(p => readAndParse(p))
    // merge docs: header from first, defines merged, sections concatenated
    const merged = docs[0]
    for (let i = 1; i < docs.length; i++) {
      const d = docs[i]
      Object.assign(merged.defines, d.defines)
      merged.sections.push(...d.sections)
    }
    const parsed = parseKnownSections(merged)
    return { ok: true, doc: merged, parsed }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

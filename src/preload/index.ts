import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { RequestOptions } from '../renderer/src/interfaces/api.types'
import path from 'path'
import fs from 'fs'

export function loadAwosConfig(): Record<string, string | number | boolean> {
  try {
    const configPath = path.join('awos_config.json')
    const rawData = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(rawData) as Record<string, string | number | boolean>
  } catch (error) {
    console.error('Failed to load awos_config.json:', error)
    return {}
  }
}

const config = loadAwosConfig()

const api = {
  request: async (options: RequestOptions): Promise<object> => {
    const result = await ipcRenderer.invoke('api-request', options)
    return result
  }
}

const sector = {
  load: async (filePath: string) => {
    const res = await ipcRenderer.invoke('sector-load-pair', filePath)
    return res
  },
  save: async (filePath: string, doc: object) => {
    const res = await ipcRenderer.invoke('sector-save', { filePath, doc })
    return res
  }
}

// Dialog helpers
sector.openDialog = async (): Promise<string | null> => {
  const p = await ipcRenderer.invoke('sector-open-dialog')
  return p ?? null
}
sector.showSaveDialog = async (defaultPath?: string): Promise<string | null> => {
  const p = await ipcRenderer.invoke('sector-show-save-dialog', defaultPath)
  return p ?? null
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('config', config)
    contextBridge.exposeInMainWorld('sector', sector)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.config = config
  // @ts-ignore (define in dts)
  window.sector = sector
}

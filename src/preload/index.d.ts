import { ElectronAPI } from '@electron-toolkit/preload'

import type { ApiResponse, RequestOptions } from './request'

interface PreloadApi {
  request: <T>(options: RequestOptions & { token: string | null }) => Promise<ApiResponse<T>>
}

type AwosConfig = Record<string, string | number | boolean>

declare global {
  interface Window {
    electron: ElectronAPI
    api: PreloadApi
    config: AwosConfig
  }
}

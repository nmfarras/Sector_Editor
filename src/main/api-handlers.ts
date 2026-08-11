import { ipcMain } from 'electron'
import { API_BASE_URL } from '../../awos_config.json'

export function setupApiHandlers(): void {
  ipcMain.handle('api-request', async (_event, options) => {
    try {
      const { method, url, params, token, headers } = options

      if (method !== 'GET') {
        throw new Error(`Method ${method} not allowed. Only GET requests are supported.`)
      }

      const fullUrl = new URL(url, API_BASE_URL)

      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          fullUrl.searchParams.append(key, String(value))
        })
      }

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers
      }

      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`
      }

      const fetchOptions: RequestInit = {
        method: 'GET',
        headers: requestHeaders
      }

      const response = await fetch(fullUrl.toString(), fetchOptions)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`)
      }

      const responseData = await response.json()

      return {
        success: true,
        data: responseData
      }
    } catch (error) {
      console.error('[API Request Failed]:', error)
      return {
        success: false,
        message: {
          meta: {
            message: error instanceof Error ? error.message : 'Request failed'
          }
        }
      }
    }
  })
}

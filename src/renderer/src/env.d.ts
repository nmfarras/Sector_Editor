/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      getApiBaseUrl: () => Promise<string>
      request: (options: any) => Promise<any>
    }
  }
}

export interface RequestOptions {
  method: 'GET'
  url: string
  params?: Record<string, string | number | boolean>
}

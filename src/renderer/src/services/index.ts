import { RequestOptions } from '@interfaces/api.types'

interface ApiSuccessResponse<T> {
  success: true
  data: T | undefined
}

interface ApiErrorResponse {
  success: false
  message?: {
    meta?: {
      message?: string
    }
  }
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export async function request<T>(options: RequestOptions): Promise<ApiSuccessResponse<T>> {
  const token = sessionStorage.getItem('jwt')

  const response = await window.api.request<T>({
    ...options,
    token
  })

  return handleResponse(response)
}

function handleResponse<T>(response: ApiResponse<T>): ApiSuccessResponse<T> {
  if (!response.success) {
    const errorMessage = response.message?.meta?.message ?? 'Something went wrong'
    throw new Error(errorMessage)
  }

  return response
}

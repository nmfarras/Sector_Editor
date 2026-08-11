import { request } from '@services/index'
import type { MetarApiData } from '@interfaces/metar.types'

export interface MetarResult {
  metarCode: string | null
  message: string | null
}

export const getMETARCode = async (icaoCode: string): Promise<MetarResult | null> => {
  try {
    const res = await request<MetarApiData>({
      method: 'GET',
      url: '/metar',
      params: {
        id: icaoCode
      }
    })

    const metar = res.data?.metar

    if (!metar) {
      return {
        metarCode: null,
        message: `No METAR data returned for ${icaoCode}`
      }
    }

    return { metarCode: metar, message: null }
  } catch (error) {
    console.log(`Failed to fetch METAR code for ${icaoCode}, using fallback:`, error)
    return null
  }
}

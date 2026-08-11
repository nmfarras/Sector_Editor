import { request } from '@services/index'
import type { Airport, AirportsListData } from '@interfaces/airport.types'
import { toRunwayOptions, RunwayOption } from '@utils/runway.utils'

export interface AirportRunwaysResult {
  airport: Airport
  runwayOptions: RunwayOption[]
}

export const getAirportData = async (icaoCode: string): Promise<AirportRunwaysResult | null> => {
  try {
    const res = await request<AirportsListData>({
      method: 'GET',
      url: '/airports',
      params: {
        page: 1,
        page_size: 1,
        icao_code: icaoCode
      }
    })

    const items = res.data?.items ?? []

    if (items.length === 0) {
      throw new Error(`No airport data returned for ${icaoCode}`)
    }

    const airportData = items[0]
    const runways = airportData.runways ?? []

    if (runways.length === 0) {
      throw new Error(`No runway data returned for ${icaoCode}`)
    }

    const runwayOptions = toRunwayOptions(runways)

    return { airport: airportData, runwayOptions }
  } catch (error) {
    console.error(`Failed to fetch airport/runway data for ${icaoCode}, using fallback:`, error)
    return null
  }
}

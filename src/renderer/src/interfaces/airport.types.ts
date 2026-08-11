import { RunwayData } from '@interfaces/runway.types'

export interface AirportsListData {
  items: Airport[]
}

export interface AirportResponse {
  airports: Airport
}

export interface Airport {
  id: number
  ident: string
  name: string
  type: string
  iso_country: string
  latitude_deg: number
  longitude_deg: number
  elevation_ft: number
  continent: string
  iso_region: string
  municipality: string
  scheduled_service: string
  icao_code: string
  iata_code: string
  gps_code: string
  runways: RunwayData[]
}

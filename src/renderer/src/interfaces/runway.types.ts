export interface RunwayData {
  id: number
  ident: string
  length_ft: number
  width_ft: number
  surface: string
  lighted: boolean
  closed: boolean
  ends: RunwayEnd[]
}

export interface RunwayEnd {
  ident: string
  latitude_deg: number
  longitude_deg: number
  elevation_ft: number
  heading_degT?: number
}

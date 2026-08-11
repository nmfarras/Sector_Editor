export interface CloudLayer {
  coverage: 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'VV'
  altitudeFt: number
}

export interface MetarData {
  raw: string
  icao: string | null
  day: number | null
  hour: number | null
  minute: number | null
  windDirection: number | null
  windVariable: boolean
  windSpeedKt: number | null
  windGustKt: number | null
  windVariableFromDeg: number | null
  windVariableToDeg: number | null
  visibilityM: number | null
  clouds: CloudLayer[]
  temperatureC: number | null
  dewPointC: number | null
  humidityPct: number | null
  qnhHpa: number | null
  qfeHpa: number | null
  weather: string | null
  remarks: string | null
  oneHourPerception: number | null
}

export interface MetarApiData {
  station: string
  metar?: string
  message?: string
}

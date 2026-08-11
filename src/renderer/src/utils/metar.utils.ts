import type { CloudLayer, MetarData } from '@interfaces/metar.types'

const FT_TO_METERS = 0.3048
const ICAO_L = 0.0065
const ICAO_T0_KELVIN = 288.15
const ICAO_EXPONENT = 5.256

const EMPTY_METAR: Omit<MetarData, 'raw'> = {
  icao: null,
  day: null,
  hour: null,
  minute: null,
  windDirection: null,
  windVariable: false,
  windSpeedKt: null,
  windGustKt: null,
  windVariableFromDeg: null,
  windVariableToDeg: null,
  visibilityM: null,
  clouds: [],
  temperatureC: null,
  dewPointC: null,
  humidityPct: null,
  qnhHpa: null,
  qfeHpa: null,
  weather: null,
  remarks: null,
  oneHourPerception: null
}

function computeHumidity(tempC: number, dewC: number): number {
  const a = 17.625
  const b = 243.04
  const numerator = Math.exp((a * dewC) / (b + dewC))
  const denominator = Math.exp((a * tempC) / (b + tempC))
  const rh = 100 * (numerator / denominator)
  return Math.round(Math.min(100, Math.max(0, rh)))
}

function computeQFE(qnhHpa: number, airportAltitudeFt: number): number {
  const altMeters = airportAltitudeFt * FT_TO_METERS
  const ratio = 1 - (ICAO_L * altMeters) / ICAO_T0_KELVIN
  return Math.round(qnhHpa * Math.pow(ratio, ICAO_EXPONENT))
}

function parseTempValue(token: string): number {
  return token.startsWith('M') ? -parseInt(token.slice(1), 10) : parseInt(token, 10)
}

function parseWeatherToken(token: string): {
  weather: string
  matched: boolean
} {
  let remaining = token
  let weather = ''

  const weatherGroups = {
    descriptors: ['MI', 'PR', 'BC', 'DR', 'BL', 'SH', 'TS', 'FZ'],
    precipitations: ['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'],
    obscurations: ['BR', 'FG', 'FU', 'VA', 'DU', 'SA', 'HZ', 'PY'],
    others: ['PO', 'SQ', 'FC', 'SS', 'DS']
  }

  let intensity = ''
  if (remaining.startsWith('+') || remaining.startsWith('-')) {
    intensity = remaining.substring(0, 1)
    remaining = remaining.substring(1)
  } else if (remaining.startsWith('VC')) {
    intensity = 'VC'
    remaining = remaining.substring(2)
  }

  let descriptor = ''
  let precipitation = ''
  let obscuration = ''
  let other = ''

  for (const code of weatherGroups.descriptors) {
    if (remaining.includes(code)) {
      descriptor = code
      remaining = remaining.replace(code, '')
      break
    }
  }

  for (const code of weatherGroups.precipitations) {
    if (remaining.includes(code)) {
      precipitation = code
      remaining = remaining.replace(code, '')
      break
    }
  }

  for (const code of weatherGroups.obscurations) {
    if (remaining.includes(code)) {
      obscuration = code
      remaining = remaining.replace(code, '')
      break
    }
  }

  for (const code of weatherGroups.others) {
    if (remaining.includes(code)) {
      other = code
      remaining = remaining.replace(code, '')
      break
    }
  }

  weather = intensity + descriptor + precipitation + obscuration + other

  if (!weather) {
    return { weather: token, matched: false }
  }
  return { weather, matched: true }
}

function parseWeatherTokens(tokens: string[]): {
  weatherTokens: string[]
  remainingTokens: string[]
} {
  const weatherTokens: string[] = []
  const remainingTokens: string[] = []
  const weatherCodes = new Set([
    'MI',
    'PR',
    'BC',
    'DR',
    'BL',
    'SH',
    'TS',
    'FZ',
    'DZ',
    'RA',
    'SN',
    'SG',
    'IC',
    'PL',
    'GR',
    'GS',
    'UP',
    'BR',
    'FG',
    'FU',
    'VA',
    'DU',
    'SA',
    'HZ',
    'PY',
    'PO',
    'SQ',
    'FC',
    'SS',
    'DS'
  ])

  for (const token of tokens) {
    const hasWeather =
      token.startsWith('+') ||
      token.startsWith('-') ||
      token.startsWith('VC') ||
      weatherCodes.has(token.substring(0, 2)) ||
      weatherCodes.has(token.substring(0, 3))

    if (hasWeather) {
      const { weather, matched } = parseWeatherToken(token)
      if (matched) {
        weatherTokens.push(weather)
        continue
      }
    }
    remainingTokens.push(token)
  }

  return { weatherTokens, remainingTokens }
}

export function parseMetar(raw: string, airportAltitudeFt?: number): MetarData {
  const result: MetarData = { raw, ...EMPTY_METAR, clouds: [] }

  let tokens = raw
    .trim()
    .replace(/^METAR\s+/i, '')
    .replace(/^SPECI\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)

  const { weatherTokens, remainingTokens } = parseWeatherTokens(tokens)
  tokens = remainingTokens

  if (weatherTokens.length > 0) {
    result.weather = weatherTokens.join(' ')
  }

  const remarkTokens: string[] = []

  for (const token of tokens) {
    if (!result.icao && /^[A-Z]{4}$/.test(token)) {
      result.icao = token
      continue
    }

    const timeMatch = token.match(/^(\d{2})(\d{2})(\d{2})Z$/)
    if (timeMatch) {
      result.day = parseInt(timeMatch[1], 10)
      result.hour = parseInt(timeMatch[2], 10)
      result.minute = parseInt(timeMatch[3], 10)
      continue
    }

    const windMatch = token.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/)
    if (windMatch) {
      result.windVariable = windMatch[1] === 'VRB'
      result.windDirection = result.windVariable ? null : parseInt(windMatch[1], 10)
      result.windSpeedKt = parseInt(windMatch[2], 10)
      result.windGustKt = windMatch[3] ? parseInt(windMatch[3], 10) : null
      continue
    }

    const windVariableRangeMatch = token.match(/^(\d{3})V(\d{3})$/)
    if (windVariableRangeMatch) {
      result.windVariableFromDeg = parseInt(windVariableRangeMatch[1], 10)
      result.windVariableToDeg = parseInt(windVariableRangeMatch[2], 10)
      continue
    }

    if (/^\d{4}$/.test(token) && result.visibilityM === null && result.day !== null) {
      result.visibilityM = token === '9999' ? 9999 : parseInt(token, 10)
      continue
    }

    if (token === 'CAVOK') {
      result.visibilityM = 10000
      continue
    }

    const oneHourPerceptionMatch = token.match(/^P(\d{4})$/)
    if (oneHourPerceptionMatch) {
      result.oneHourPerception = Math.round((parseInt(oneHourPerceptionMatch[1], 10) / 100) * 25.4)
      continue
    }

    const cloudMatch = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})$/)
    if (cloudMatch) {
      result.clouds.push({
        coverage: cloudMatch[1] as CloudLayer['coverage'],
        altitudeFt: parseInt(cloudMatch[2], 10) * 100
      })
      continue
    }

    const tempMatch = token.match(/^(M?\d{2})\/(M?\d{2})$/)
    if (tempMatch) {
      result.temperatureC = parseTempValue(tempMatch[1])
      result.dewPointC = parseTempValue(tempMatch[2])
      result.humidityPct = computeHumidity(result.temperatureC, result.dewPointC)
      continue
    }

    const qnhMatch = token.match(/^(Q|A)(\d{4})$/)
    if (qnhMatch) {
      const letter = qnhMatch[1]
      const number = parseInt(qnhMatch[2], 10)

      if (letter === 'A') {
        result.qnhHpa = Math.round((number / 100) * 33.8639)
        continue
      }

      if (letter === 'Q') {
        result.qnhHpa = number
        continue
      }
    }

    remarkTokens.push(token)
  }

  if (result.qnhHpa !== null && airportAltitudeFt !== undefined) {
    result.qfeHpa = computeQFE(result.qnhHpa, airportAltitudeFt)
  }

  if (weatherTokens.length > 0 && !result.weather) {
    result.weather = weatherTokens.join(' ')
  }

  result.remarks = remarkTokens.length > 0 ? remarkTokens.join(' ') : null

  return result
}

/**
 * Validates a raw METAR string against ICAO formatting/consistency rules.
 * Returns a list of human-readable errors, empty array if valid.
 */
export function validateMetar(raw: string, airportAltitudeFt?: number): string[] {
  const errors: string[] = []
  const data = parseMetar(raw, airportAltitudeFt)

  const tokens = raw
    .trim()
    .replace(/^METAR\s+/i, '')
    .replace(/^SPECI\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)

  // --- Time ---
  if (data.day !== null && data.hour !== null && data.minute !== null) {
    const minuteStr = data.minute.toString().padStart(2, '0')
    if (!['00', '30'].includes(minuteStr)) {
      errors.push(`Waktu salah: menit harus 00 atau 30, bukan ${minuteStr}`)
    }
    if (!(data.hour >= 0 && data.hour <= 23)) {
      errors.push(`Waktu salah: jam harus antara 00-23, bukan ${data.hour}`)
    }
    if (!(data.day >= 1 && data.day <= 31)) {
      errors.push(`Waktu salah: tanggal harus antara 01-31, bukan ${data.day}`)
    }
  } else {
    errors.push('Format waktu salah (harus 6 digit diakhiri Z)')
  }

  // --- Wind ---
  if (data.windSpeedKt !== null) {
    if (!data.windVariable && data.windDirection !== null && data.windDirection % 10 !== 0) {
      errors.push(`Arah angin ${data.windDirection.toString().padStart(3, '0')} harus kelipatan 10`)
    }

    if (data.windVariable && data.windSpeedKt >= 3) {
      errors.push('VRB hanya boleh digunakan untuk kecepatan angin < 3KT')
    }

    if (data.windGustKt !== null) {
      if (data.windGustKt - data.windSpeedKt < 10) {
        errors.push(
          `Gusty ${data.windGustKt} harus minimal 10 knot lebih besar dari kecepatan angin ${data.windSpeedKt}`
        )
      }
      if (data.windGustKt > 100) {
        errors.push(`Gusty ${data.windGustKt}KT melebihi batas maksimal yang masuk akal`)
      }
    }
  } else {
    errors.push('Angin salah')
  }

  // --- Visibility & CAVOK ---
  const isCavok = tokens.includes('CAVOK')
  const weatherList = data.weather ? data.weather.split(' ') : []

  if (isCavok) {
    const hasVisibilityToken = tokens.some((t) => /^\d{4}$/.test(t))
    if (hasVisibilityToken) {
      errors.push('Tidak boleh melaporkan visibility ketika menggunakan CAVOK')
    }
    if (weatherList.length > 0) {
      errors.push('Tidak boleh melaporkan fenomena cuaca ketika menggunakan CAVOK')
    }
  } else if (data.visibilityM !== null) {
    const visibility = data.visibilityM

    if (weatherList.includes('FG') && visibility >= 1000) {
      errors.push(`FG tidak boleh dilaporkan jika visibility ${visibility}m (harus < 1000m)`)
    }
    if (weatherList.includes('HZ') && visibility >= 5000) {
      errors.push(`HZ tidak boleh dilaporkan jika visibility ${visibility}m (harus < 5000m)`)
    }
    if (weatherList.includes('BR') && !(visibility >= 1000 && visibility < 5000)) {
      errors.push(`BR hanya valid untuk visibility antara 1000m dan 5000m, bukan ${visibility}m`)
    }
    if (visibility > 9999) {
      errors.push(`Visibility ${visibility}m melebihi batas maksimal (9999m)`)
    }
  } else {
    errors.push('Cek Visibility')
  }

  // --- Weather group order & conflicts ---
  if (weatherList.length > 0) {
    const firstWeatherToken = weatherList[0]
    const weatherPos = tokens.findIndex((t) => t.includes(firstWeatherToken))
    const visibilityToken =
      data.visibilityM !== null && !isCavok ? data.visibilityM.toString().padStart(4, '0') : null
    const visibilityPos = visibilityToken ? tokens.indexOf(visibilityToken) : -1

    if (visibilityPos > -1 && weatherPos > -1 && weatherPos < visibilityPos) {
      errors.push('Cuaca (BR, FG, dll) harus ditulis setelah visibility')
    }

    if (weatherList.includes('BR') && weatherList.includes('FG')) {
      errors.push('BR dan FG tidak boleh dilaporkan bersamaan')
    }
  }

  // --- Clouds ---
  if (data.clouds.length >= 2) {
    const second = data.clouds[1]
    if (!['SCT', 'BKN', 'OVC'].includes(second.coverage)) {
      errors.push(`Lapisan kedua harus SCT, BKN, atau OVC, bukan ${second.coverage}`)
    }
  }

  if (data.clouds.length >= 3) {
    const third = data.clouds[2]
    if (!['BKN', 'OVC'].includes(third.coverage)) {
      errors.push(`Lapisan ketiga harus BKN atau OVC, bukan ${third.coverage}`)
    }
  }

  const heights = data.clouds.map((c) => c.altitudeFt)
  const sortedHeights = [...heights].sort((a, b) => a - b)

  if (JSON.stringify(heights) !== JSON.stringify(sortedHeights)) {
    errors.push('Urutan kelompok awan salah (harus diurutkan dari tinggi terendah ke tertinggi)')
  } else {
    const priority = ['FEW', 'SCT', 'BKN', 'OVC', 'VV']
    for (let i = 0; i < data.clouds.length - 1; i++) {
      const current = data.clouds[i]
      const next = data.clouds[i + 1]
      const currentPriority = priority.indexOf(current.coverage)
      const nextPriority = priority.indexOf(next.coverage)

      if (current.altitudeFt === next.altitudeFt && currentPriority >= nextPriority) {
        errors.push(
          `Pada ketinggian yang sama (${current.altitudeFt}ft), ${current.coverage} tidak boleh diikuti oleh ${next.coverage}`
        )
      }
    }
  }

  data.clouds.forEach((cloud) => {
    if (cloud.altitudeFt > 99900) {
      errors.push(`Ketinggian awan ${cloud.altitudeFt}ft melebihi batas maksimal (99900ft)`)
    }
  })

  // --- Temperature ---
  if (data.temperatureC !== null && data.dewPointC !== null) {
    if (data.dewPointC > data.temperatureC) {
      errors.push(
        `Titik embun (${data.dewPointC}) tidak boleh lebih tinggi dari suhu (${data.temperatureC})`
      )
    }
  } else {
    errors.push('Format suhu TT/TdTd salah')
  }

  // --- Pressure ---
  if (data.qnhHpa !== null) {
    if (data.qnhHpa < 850 || data.qnhHpa > 1100) {
      errors.push(`Tekanan ${data.qnhHpa} diluar rentang yang masuk akal (850-1100)`)
    }
  } else {
    errors.push('Tekanan salah')
  }

  return errors
}

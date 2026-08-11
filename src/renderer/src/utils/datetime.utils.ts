import type { MetarData } from '@interfaces/metar.types'

export function getCurrentDate(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, '0')
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = date.getUTCFullYear()
  return `${day} ${month} ${year}`
}

function getRoundedHalfHour(date: Date): string {
  const roundIntervalMs = 30 * 60 * 1000
  const rounded = new Date(Math.floor(date.getTime() / roundIntervalMs) * roundIntervalMs)
  const hh = rounded.getUTCHours().toString().padStart(2, '0')
  const mm = rounded.getUTCMinutes().toString().padStart(2, '0')
  return `${hh}.${mm}`
}

export function getCurrentTime(date: Date): string {
  const hh = date.getUTCHours().toString().padStart(2, '0')
  const mm = date.getUTCMinutes().toString().padStart(2, '0')
  const ss = date.getUTCSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss} UTC (${getRoundedHalfHour(date)})`
}

export function getMetarDateDisplay(metarData: MetarData | null, referenceDate: Date): string {
  if (metarData?.day == null) return 'Date'
  const day = metarData.day.toString().padStart(2, '0')
  const month = referenceDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = referenceDate.getUTCFullYear()
  return `${day} ${month} ${year}`
}

export function getMetarTimeDisplay(metarData: MetarData | null): string {
  if (metarData?.hour == null || metarData?.minute == null) return 'Time'
  const hh = metarData.hour.toString().padStart(2, '0')
  const mm = metarData.minute.toString().padStart(2, '0')
  return `${hh}:${mm} UTC`
}

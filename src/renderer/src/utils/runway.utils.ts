import type { RunwayData } from '@interfaces/runway.types'

export interface RunwayOption {
  id: string
  label: string
  runwayDir: string
  letter?: string
  elevationFt?: number
}

export function toRunwayOptions(runways: RunwayData[]): RunwayOption[] {
  const options: RunwayOption[] = []

  runways
    .filter((runway) => !runway.closed)
    .forEach((runway) => {
      runway.ends.forEach((end) => {
        let heading = end?.heading_degT ?? 0

        if (heading === 0) {
          const numberMatch = end?.ident?.match(/\d+/) || runway.ident.match(/\d+/)
          const runwayNumber = numberMatch ? parseInt(numberMatch[0], 10) : 0
          heading = runwayNumber * 10
        }

        const endIdent = end?.ident || ''
        const letterMatch = endIdent.match(/[LRCH]/)
        const letter = letterMatch ? letterMatch[0] : ''

        const numberMatch = endIdent.match(/\d+/) || runway.ident.match(/\d+/)
        const runwayNumber = numberMatch ? parseInt(numberMatch[0], 10) : 0

        const formattedIdent = `${String(runwayNumber).padStart(2, '0')}${letter}`

        options.push({
          id: `${runway.id}-${end.ident || 'end'}`,
          label: `RUNWAY ${formattedIdent}`,
          runwayDir: heading.toString(),
          letter: letter,
          elevationFt: end?.elevation_ft ?? 0
        })
      })
    })

  options.sort((a, b) => {
    return (parseFloat(a.runwayDir) || 0) - (parseFloat(b.runwayDir) || 0)
  })

  return options
}

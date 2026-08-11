export type Coord = {
  lat: number
  lon: number
}

export type DefineMap = Record<string, string>

export type Section = {
  name: string
  lines: string[]
}

export type SectorFile = {
  headerLines: string[]
  defines: DefineMap
  sections: Section[]
}

export type VORRecord = { id: string; freq?: number; coord: Coord }
export type NDBRecord = { id: string; freq?: number; coord: Coord }
export type FixRecord = { id: string; coord: Coord }

export type ParsedSections = {
  VOR?: VORRecord[]
  NDB?: NDBRecord[]
  FIXES?: FixRecord[]
  [key: string]: any
}

function parseDefineLine(line: string): [string, string] | null {
  const m = line.match(/^#define\s+([A-Za-z0-9_\-]+)\s+(\S+)/)
  if (!m) return null
  return [m[1], m[2]]
}

function parseDms(token: string): number | null {
  const m = token.match(/^([NS])?(\d{1,3})\.(\d{1,2})\.(\d{1,2}\.\d+)$|^([EW])?(\d{1,3})\.(\d{1,2})\.(\d{1,2}\.\d+)$/)
  if (!m) return null
  let hemi: string | undefined
  let degStr: string
  let minStr: string
  let secStr: string
  if (m[1] !== undefined) {
    hemi = m[1]
    degStr = m[2]
    minStr = m[3]
    secStr = m[4]
  } else {
    hemi = m[5]
    degStr = m[6]
    minStr = m[7]
    secStr = m[8]
  }
  const deg = Number(degStr)
  const min = Number(minStr)
  const sec = Number(secStr)
  const dec = deg + min / 60 + sec / 3600
  if (!hemi) return dec
  if (hemi === 'S' || hemi === 'W') return -dec
  return dec
}

export function parseCoordinatePair(latTok: string, lonTok: string): Coord {
  const lat = parseDms(latTok)
  const lon = parseDms(lonTok)
  return { lat: lat ?? 0, lon: lon ?? 0 }
}

export function parseSct(content: string): SectorFile {
  const lines = content.split(/\r?\n/)
  const headerLines: string[] = []
  const defines: DefineMap = {}
  const sections: Section[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.startsWith('#define')) {
      const kv = parseDefineLine(line)
      if (kv) defines[kv[0]] = kv[1]
      i++
      continue
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.substring(1, line.length - 1)
      const sectionLines: string[] = []
      i++
      while (i < lines.length && !(lines[i].trim().startsWith('[') && lines[i].trim().endsWith(']'))) {
        if (lines[i].trim().length > 0) sectionLines.push(lines[i])
        i++
      }
      sections.push({ name, lines: sectionLines })
      continue
    }
    headerLines.push(lines[i])
    i++
  }
  return { headerLines, defines, sections }
}

function splitTokens(line: string): string[] {
  return line.trim().split(/\s+/)
}

function tryParseFreq(tok: string): number | undefined {
  const v = Number(tok)
  return Number.isFinite(v) ? v : undefined
}

export function parseKnownSections(doc: SectorFile): ParsedSections {
  const out: ParsedSections = {}
  for (const s of doc.sections) {
    if (s.name === 'VOR') {
      out.VOR = s.lines.map(l => {
        const t = splitTokens(l)
        const id = t[0]
        const freq = tryParseFreq(t[1])
        const coord = parseCoordinatePair(t[t.length - 2], t[t.length - 1])
        return { id, freq, coord }
      })
    } else if (s.name === 'NDB') {
      out.NDB = s.lines.map(l => {
        const t = splitTokens(l)
        const id = t[0]
        const freq = tryParseFreq(t[1])
        const coord = parseCoordinatePair(t[t.length - 2], t[t.length - 1])
        return { id, freq, coord }
      })
    } else if (s.name === 'FIXES') {
      out.FIXES = s.lines.map(l => {
        const t = splitTokens(l)
        const id = t[0]
        const coord = parseCoordinatePair(t[1], t[2])
        return { id, coord }
      })
    } else {
      out[s.name] = s.lines
    }
  }
  return out
}



export function serializeSct(doc: SectorFile): string {
  const out: string[] = []
  out.push(...doc.headerLines)
  out.push('')
  Object.keys(doc.defines).forEach(k => out.push(`#define ${k} ${doc.defines[k]}`))
  out.push('')
  doc.sections.forEach(s => {
    out.push(`[${s.name}]`)
    s.lines.forEach(l => out.push(l))
    out.push('')
  })
  return out.join('\n')
}

export default { parseSct, serializeSct, parseCoordinatePair }

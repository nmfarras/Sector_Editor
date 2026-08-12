import { JSX, useState } from 'react'
import SectorCanvas from '@/components/SectorCanvas'
import { useRef } from 'react'

type GeoPoint = { id: string; coord: { lat: number; lon: number }; type?: 'FIX' | 'VOR' | 'NDB'; freq?: string }
type Coord = { lat: number; lon: number }
type ShapePath = { coords: Coord[]; label?: string; color?: string }
type SectionShape = { name: string; kind: 'point' | 'polyline' | 'polygon' | 'label'; paths: ShapePath[] }

const SectorEditor = (): JSX.Element => {
  const [geoPoints, setGeoPoints] = useState<GeoPoint[]>([])
  const [shapes, setShapes] = useState<SectionShape[]>([])
  const [doc, setDoc] = useState<any | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<any>(null)

  async function handleOpen() {
    // @ts-ignore
    const p: string | null = await window.sector.openDialog()
    if (!p) return
    // @ts-ignore
    const res = await window.sector.load(p)
    if (!res?.ok) {
      alert('Failed to load: ' + String(res?.error))
      return
    }
    setFilePath(p)
    setDoc(res.doc)
    const parsed = res.parsed || {}
    const fixes = parsed.FIXES || []
    const vors = parsed.VOR || []
    const ndbs = parsed.NDB || []
    const fixPoints = fixes.map((f: any) => ({ id: f.id, coord: { lat: f.coord.lat, lon: f.coord.lon }, type: 'FIX' as const }))
    const vorPoints = vors.map((v: any) => ({ id: v.id, coord: { lat: v.coord.lat, lon: v.coord.lon }, type: 'VOR' as const, freq: v.freq?.toString() }))
    const ndbPoints = ndbs.map((n: any) => ({ id: n.id, coord: { lat: n.coord.lat, lon: n.coord.lon }, type: 'NDB' as const, freq: n.freq?.toString() }))
    setGeoPoints([...fixPoints, ...vorPoints, ...ndbPoints])
    // build defines map: prefer res.doc.defines but fall back to headerLines if empty
    let definesMap: Record<string, string> = res.doc.defines || {}
    if (!definesMap || Object.keys(definesMap).length === 0) {
      definesMap = {}
      const header = res.doc.headerLines || []
      for (const ln of header) {
        const m = String(ln).match(/^#define\s+([A-Za-z0-9_\-]+)\s+(\S+)/)
        if (m) definesMap[m[1]] = m[2]
      }
      // also scan sections in case defines ended up inside a section
      for (const s of res.doc.sections || []) {
        for (const ln of s.lines || []) {
          const m = String(ln).match(/^#define\s+([A-Za-z0-9_\-]+)\s+(\S+)/)
          if (m) definesMap[m[1]] = m[2]
        }
      }
    }
    const parsedShapes = parseSectionShapes(res.doc.sections || [], definesMap)
    setShapes(parsedShapes)
    // // try to auto-fit the canvas to the new shapes
    // setTimeout(() => {
    //   try {
    //     canvasRef.current?.fitToExtent()
    //   } catch (e) {
    //     // ignore
    //   }
    // }, 120)
    setSelectedId(null)
  }

  async function handleSaveAs() {
    if (!doc) {
      alert('No document loaded')
      return
    }
    // ask for save path
    // @ts-ignore
    const p: string | null = await window.sector.showSaveDialog(filePath ?? undefined)
    if (!p) return

    // create a copy and update FIXES section from geoPoints
    const newDoc = JSON.parse(JSON.stringify(doc))
    const fixesOnly = geoPoints.filter(p => p.type === 'FIX')
    const fixesLines = fixesOnly.map(pt => `${pt.id} ${formatLatDms(pt.coord.lat)} ${formatLonDms(pt.coord.lon)}`)
    let found = false
    for (const s of newDoc.sections) {
      if (s.name === 'FIXES') {
        s.lines = fixesLines
        found = true
        break
      }
    }
    if (!found) {
      newDoc.sections.push({ name: 'FIXES', lines: fixesLines })
    }

    // @ts-ignore
    const res = await window.sector.save(p, newDoc)
    if (!res?.ok) alert('Save failed: ' + String(res?.error))
    else setFilePath(p)
  }

  async function handleSave() {
    if (!doc) {
      alert('No document loaded')
      return
    }
    if (!filePath) {
      // no original path -> Save As
      await handleSaveAs()
      return
    }
    if (!window.confirm('Overwrite original file?')) return

    const newDoc = JSON.parse(JSON.stringify(doc))
    // update FIXES, VOR, NDB from geoPoints
    const fixesOnly = geoPoints.filter(p => p.type === 'FIX')
    const vorOnly = geoPoints.filter(p => p.type === 'VOR')
    const ndbOnly = geoPoints.filter(p => p.type === 'NDB')

    const fixesLines = fixesOnly.map(pt => `${pt.id} ${formatLatDms(pt.coord.lat)} ${formatLonDms(pt.coord.lon)}`)
    const vorLines = vorOnly.map(pt => `${pt.id}${pt.freq ? ' ' + pt.freq : ''} ${formatLatDms(pt.coord.lat)} ${formatLonDms(pt.coord.lon)}`)
    const ndbLines = ndbOnly.map(pt => `${pt.id}${pt.freq ? ' ' + pt.freq : ''} ${formatLatDms(pt.coord.lat)} ${formatLonDms(pt.coord.lon)}`)

    // replace or add sections
    function replaceSection(name: string, lines: string[]) {
      let found = false
      for (const s of newDoc.sections) {
        if (s.name === name) {
          s.lines = lines
          found = true
          break
        }
      }
      if (!found) newDoc.sections.push({ name, lines })
    }

    replaceSection('FIXES', fixesLines)
    replaceSection('VOR', vorLines)
    replaceSection('NDB', ndbLines)

    // @ts-ignore
    const res = await window.sector.save(filePath, newDoc)
    if (!res?.ok) alert('Save failed: ' + String(res?.error))
    else setDoc(newDoc)
  }

  function formatLatDms(lat: number): string {
    const hemi = lat < 0 ? 'S' : 'N'
    const a = Math.abs(lat)
    const deg = Math.floor(a)
    const minf = (a - deg) * 60
    const min = Math.floor(minf)
    const sec = (minf - min) * 60
    // pad deg to 3 digits like 007
    const degStr = String(deg).padStart(3, '0')
    const minStr = String(min).padStart(2, '0')
    const secStr = sec.toFixed(3)
    return `${hemi}${degStr}.${minStr}.${secStr}`
  }

  function parseDms(token: string): number | null {
    const match = token.match(/^([NSWE])(\d{1,3})\.(\d{1,2})\.(\d{1,2}\.\d+)$/)
    if (!match) return null
    const hemi = match[1]
    const deg = Number(match[2])
    const min = Number(match[3])
    const sec = Number(match[4])
    const value = deg + min / 60 + sec / 3600
    return hemi === 'S' || hemi === 'W' ? -value : value
  }

  function parseCoordsFromLine(line: string): Coord[] {
    const tokens = line.match(/[NSWE]\d{1,3}\.\d{1,2}\.\d{1,2}\.\d+/g) || []
    const coords: Coord[] = []
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const lat = parseDms(tokens[i])
      const lon = parseDms(tokens[i + 1])
      if (lat === null || lon === null) continue
      coords.push({ lat, lon })
    }
    return coords
  }

  function extractLabel(line: string): string | undefined {
    const quoted = line.match(/"([^"]+)"/)
    if (quoted) return quoted[1]
    const firstCoord = line.match(/\s+[NSWE]\d{1,3}\.\d{1,2}\.\d{1,2}\.\d+/)
    if (firstCoord) {
      const label = line.slice(0, firstCoord.index).trim()
      return label || undefined
    }
    return undefined
  }

  function extractColorToken(line: string, defines: Record<string, string>): string | undefined {
    const toks = line.trim().split(/\s+/)
    for (let i = toks.length - 1; i >= 0; i--) {
      const t = toks[i]
      if (defines.hasOwnProperty(t)) return defines[t]
      const clean = t.replace(/[,;]$/, '')
      if (defines.hasOwnProperty(clean)) return defines[clean]
    }
    return undefined
  }

  function sectionKind(
    name: string,
    paths: ShapePath[]
  ): 'point' | 'polyline' | 'polygon' | 'label' {
    const upper = name.toUpperCase()
  
    if (upper === 'FREETEXT') return 'label'
    if (upper === 'POSITIONS' || upper === 'AIRPORT' || upper === 'LABELS') return 'point'
    if (/^(RUNWAY|GROUND|HIGH AIRWAY|LOW AIRWAY|SID|STAR|SIDSSTARS)$/i.test(upper)) {
      return 'polyline'
    }
  
    if (upper === 'GEO') {
      return 'polyline'
    }
  
    if (/^(AIRSPACE|ARTCC HIGH|ARTCC LOW|ARTCC|REGIONS)$/i.test(upper)) {
      return 'polygon'
    }
  
    if (paths.some(path => path.coords.length > 1)) return 'polyline'
  
    return 'point'
  }

  // function simplifyPath(coords: Coord[], maxPoints: number): Coord[] {
  //   if (coords.length <= maxPoints) return coords
  //   const step = Math.ceil(coords.length / maxPoints)
  //   const reduced = coords.filter((_, index) => index % step === 0)
  //   if (reduced[reduced.length - 1] !== coords[coords.length - 1]) {
  //     reduced.push(coords[coords.length - 1])
  //   }
  //   return reduced
  // }

  function isContinuationLine(line: string): boolean {
    return /^\s{2,}/.test(line)
  }

  function toHexColor(colorVal: string): string | undefined {
    const str = String(colorVal).trim()
    if (/^#?[0-9a-fA-F]{6}$/.test(str)) {
      return str.replace(/^#/, '').toUpperCase()
    }
    if (/^0x[0-9a-fA-F]{1,6}$/i.test(str)) {
      return str.replace(/^0x/i, '').padStart(6, '0').toUpperCase()
    }
    if (/^\d+$/.test(str)) {
      const num = Number(str)
      if (Number.isFinite(num)) {
        const b0 = num & 0xff
        const b1 = (num >> 8) & 0xff
        const b2 = (num >> 16) & 0xff
        const rgb = ((b0 << 16) | (b1 << 8) | b2) >>> 0
        return rgb.toString(16).padStart(6, '0').toUpperCase()
      }
    }
    return undefined
  }

  function parseSectionShapes(
    sections: any[],
    defines: Record<string, string>
  ): SectionShape[] {
    return sections
      .map(section => {
        if (['VOR', 'NDB', 'FIXES', 'INFO'].includes(section.name)) {
          return null
        }
      
        const paths: ShapePath[] = []
        const upperName = section.name.toUpperCase()
      
        const segmentBased =
          upperName === 'GEO' ||
          upperName === 'GROUND'
      
        if (segmentBased) {
          for (const line of section.lines) {
            const coords = parseCoordsFromLine(line)
          
            if (coords.length < 2) {
              continue
            }
          
            const colorVal = extractColorToken(line, defines)
            const colorHex = colorVal
              ? toHexColor(colorVal)
              : undefined
          
            paths.push({
              coords,
              label: extractLabel(line),
              color: colorHex
                ? `#${colorHex}`
                : undefined,
            })
          }
        } else {
          // existing parser for other sections
          let currentPath: ShapePath | null = null
        
          for (const line of section.lines) {
            const coords = parseCoordsFromLine(line)
          
            if (coords.length === 0) {
              continue
            }
          
            const colorVal = extractColorToken(line, defines)
            const colorHex = colorVal
              ? toHexColor(colorVal)
              : undefined
          
            const label = extractLabel(line)
          
            if (!currentPath || !isContinuationLine(line)) {
              currentPath = {
                coords,
                label,
                color: colorHex
                  ? `#${colorHex}`
                  : undefined,
              }
            
              paths.push(currentPath)
            } else {
              currentPath.coords.push(...coords)
            
              if (!currentPath.color && colorHex) {
                currentPath.color = `#${colorHex}`
              }
            
              if (!currentPath.label && label) {
                currentPath.label = label
              }
            }
          }
        }
      
        if (paths.length === 0) {
          return null
        }
      
        return {
          name: section.name,
          kind: sectionKind(section.name, paths),
          paths,
        }
      })
      .filter(
        (shape): shape is SectionShape =>
          shape !== null
      )
  }

  function formatLonDms(lon: number): string {
    const hemi = lon < 0 ? 'W' : 'E'
    const a = Math.abs(lon)
    const deg = Math.floor(a)
    const minf = (a - deg) * 60
    const min = Math.floor(minf)
    const sec = (minf - min) * 60
    const degStr = String(deg).padStart(3, '0')
    const minStr = String(min).padStart(2, '0')
    const secStr = sec.toFixed(3)
    return `${hemi}${degStr}.${minStr}.${secStr}`
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 8, borderBottom: '1px solid #0f2230', background: '#132237', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleOpen} style={{ marginRight: 8, background: '#1e6fff', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>Open</button>
          <button onClick={handleSaveAs} style={{ background: '#1e6fff', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>Save As</button>
          <button onClick={() => canvasRef.current?.fitToExtent()} style={{ marginLeft: 8, background: '#0a84ff', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>Fit</button>
          <button onClick={() => canvasRef.current?.resetView()} style={{ marginLeft: 4, background: '#0a84ff', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>Reset</button>
          <span style={{ marginLeft: 12, color: '#cfe8ff' }}>{filePath ?? 'No file'}</span>
        </div>
        <div style={{ flex: 1 }}>
          <SectorCanvas ref={canvasRef} geoPoints={geoPoints} shapes={shapes} onGeoChange={setGeoPoints} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
      <aside style={{ width: 320, padding: 12, borderLeft: '1px solid #ddd' }}>
        <h3>Properties</h3>
        {selectedId ? (
          (() => {
            const pt = geoPoints.find(g => g.id === selectedId)
            if (!pt) return <p>Point not found</p>
            return (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#333' }}>ID</label>
                  <input value={pt.id} onChange={e => setGeoPoints(gs => gs.map(g => (g.id === pt.id ? { ...g, id: e.target.value } : g)))} />
                </div>
                {(pt.type === 'VOR' || pt.type === 'NDB') && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#333' }}>Freq</label>
                    <input
                      value={(pt as any).freq ?? ''}
                      onChange={e => setGeoPoints(gs => gs.map(g => (g.id === pt.id ? { ...g, freq: e.target.value } : g)))}
                    />
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <strong>Lat</strong>: {pt.coord.lat.toFixed(6)}
                  <br />
                  <strong>Lon</strong>: {pt.coord.lon.toFixed(6)}
                </div>
              </div>
            )
          })()
        ) : (
          <p>Select a point to edit its properties.</p>
        )}
        <div style={{ marginTop: 12 }}>
          <button onClick={handleSave} style={{ marginRight: 8, background: '#0b6', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>Save</button>
          <button onClick={handleSaveAs} style={{ background: '#1e6fff', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4 }}>Save As</button>
        </div>
      </aside>
    </div>
  )
}

export default SectorEditor

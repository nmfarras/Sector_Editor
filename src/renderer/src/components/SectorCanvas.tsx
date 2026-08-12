import React, { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'

type GeoPoint = { id: string; coord: { lat: number; lon: number }; type?: 'FIX' | 'VOR' | 'NDB'; freq?: string }
type Coord = { lat: number; lon: number }
type ShapePath = { coords: Coord[]; label?: string; color?: string }
type SectionShape = { name: string; kind: 'point' | 'polyline' | 'polygon' | 'label'; paths: ShapePath[] }

type Props = {
  geoPoints?: GeoPoint[]
  shapes?: SectionShape[]
  onGeoChange?: (pts: GeoPoint[]) => void
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}

// type ScreenCoord = {
//   x: number
//   y: number
// }

// type ProjectedShapePath = ShapePath & {
//   screenCoords: ScreenCoord[]
// }

export type CanvasHandle = { fitToExtent: () => void; resetView: () => void }

const Margin = 20

function sameCoord(a: Coord, b: Coord, tolerance = 1e-10) {
  return (
    Math.abs(a.lat - b.lat) < tolerance &&
    Math.abs(a.lon - b.lon) < tolerance
  )
}

function mergePolygonPaths(paths: ShapePath[]): ShapePath[] {
  if (paths.length === 0) return []

  const result: ShapePath[] = []

  // Start with the first path
  let coords: Coord[] = [...paths[0].coords]

  for (let i = 1; i < paths.length; i++) {
    const next = paths[i].coords

    if (next.length === 0) continue

    const last = coords[coords.length - 1]
    const first = next[0]

    // The next segment starts where the previous one ended
    if (sameCoord(last, first)) {
      coords.push(...next.slice(1))
    } else {
      // Disconnected segment
      result.push({
        ...paths[i - 1],
        coords,
      })

      coords = [...next]
    }
  }

  result.push({
    ...paths[paths.length - 1],
    coords,
  })

  // Close the polygon
  for (const path of result) {
    if (
      path.coords.length >= 3 &&
      !sameCoord(path.coords[0], path.coords[path.coords.length - 1])
    ) {
      path.coords.push(path.coords[0])
    }
  }

  return result
}

function SectorCanvasInner(
  { geoPoints = [], shapes = [], onGeoChange, selectedId = null, onSelect }: Props,
  ref: React.Ref<CanvasHandle>
): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  
  useEffect(() => {
    function onUp() {
      setDragging(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])
  
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(100, r.width), h: Math.max(100, r.height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  
  // simple pan state (translate)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(scale)
  const panRef = useRef(pan)
  const zoomFrameRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<{
    scale: number
    pan: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    panRef.current = pan
  }, [pan])
  
  function onBackgroundMouseDown(e: React.MouseEvent) {
    // start panning with middle button or ctrl+left
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      setIsPanning(true)
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    } else {
      // clear selection when clicking empty space
      onSelect?.(null)
    }
  }

  function onBackgroundMouseUp() {
    setIsPanning(false)
    panStartRef.current = null
  }

  function onBackgroundMouseMove(e: React.MouseEvent) {
    if (!isPanning || !panStartRef.current) return
    const nx = e.clientX - panStartRef.current.x
    const ny = e.clientY - panStartRef.current.y
    setPan({ x: nx, y: ny })
  }

  // animate zoom with easing
  function animateZoom(fromScale: number, toScale: number, fromPan: { x: number; y: number }, toPan: { x: number; y: number }) {
    const duration = 180
    const start = performance.now()
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration)
      const ease = 1 - Math.pow(1 - t, 3)
      const s = fromScale + (toScale - fromScale) * ease
      const nx = fromPan.x + (toPan.x - fromPan.x) * ease
      const ny = fromPan.y + (toPan.y - fromPan.y) * ease
      setScale(s)
      setPan({ x: nx, y: ny })
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // compute bounding box of coordinates from points and shapes
  const allCoords: Coord[] = []

  for (const p of geoPoints) {
    allCoords.push(p.coord)
  }

  for (const shape of shapes) {
    for (const path of shape.paths) {
      for (const coord of path.coords) {
        allCoords.push(coord)
      }
    }
  }

  const {
    latMin,
    latMax,
    lonMin,
    lonMax,
  } = getBounds(allCoords)

  const projectedShapes = useMemo(() => {
    return shapes.map(shape => {
      const paths =
        shape.kind === 'polygon'
          ? mergePolygonPaths(shape.paths)
          : shape.paths

      return {
        ...shape,
        paths: paths.map(path => ({
          ...path,
          screenCoords: path.coords.map(c =>
            project(c.lat, c.lon)
          ),
        })),
      }
    })
  }, [
    shapes,
    size,
    latMin,
    latMax,
    lonMin,
    lonMax,
    ])

  function project(lat: number, lon: number) {
    const w = size.w - Margin * 2
    const h = size.h - Margin * 2

    const latCenter = (latMin + latMax) / 2

    const lonScale = Math.cos(latCenter * Math.PI / 180)

    const xGeo =
      (lon - lonMin) * lonScale

    const yGeo =
      latMax - lat

    const geoWidth =
      (lonMax - lonMin) * lonScale

    const geoHeight =
      latMax - latMin

    const scaleX = w / (geoWidth || 1)
    const scaleY = h / (geoHeight || 1)

    const s = Math.min(scaleX, scaleY)

    const usedWidth = geoWidth * s
    const usedHeight = geoHeight * s

    const offsetX = Margin + (w - usedWidth) / 2
    const offsetY = Margin + (h - usedHeight) / 2

    return {
      x: offsetX + xGeo * s,
      y: offsetY + yGeo * s,
    }
  }

  function unproject(x: number, y: number) {
    const w = size.w - Margin * 2
    const h = size.h - Margin * 2
    const lon = lonMin + ((x - Margin) / (w || 1)) * (lonMax - lonMin)
    const lat = latMin + (1 - (y - Margin) / (h || 1)) * (latMax - latMin)
    return { lat, lon }
  }

  // function startDrag(id: string) {
  //   setDragging(id)
  //   onSelect?.(id)
  // }

  function onMouseMove(e: React.MouseEvent) {
    if (isPanning) {
      onBackgroundMouseMove(e)
      return
    }
    if (!dragging) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    // convert client coords to local (pre-transform) coords
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const localX = (clientX - pan.x) / scale
    const localY = (clientY - pan.y) / scale
    const { lat, lon } = unproject(localX, localY)
    const next = geoPoints.map(p => (p.id === dragging ? { ...p, coord: { lat, lon } } : p))
    onGeoChange?.(next)
  }
  
  useImperativeHandle(ref, () => ({
    fitToExtent: () => {
      if (!svgRef.current) return
        
      // const el = svgRef.current
      // const r = el.getBoundingClientRect()
        
      // const viewW = Math.max(100, r.width)
      // const viewH = Math.max(100, r.height)
        
      const points = [
        ...geoPoints.map(p => p.coord),
        ...shapes.flatMap(shape =>
          shape.paths.flatMap(path => path.coords)
        ),
      ]
    
      if (points.length === 0) {
        animateZoom(
          scale,
          1,
          pan,
          { x: 0, y: 0 }
        )
        return
      }
    
      // project() already fits the geographic extent into the canvas.
      // Therefore the correct base scale is simply 1.
      //
      // Add a little margin if desired.
      const targetScale = 1
    
      // Since project() already puts the data inside the canvas,
      // no additional centering calculation is necessary.
      const targetPan = {
        x: 0,
        y: 0,
      }
    
      animateZoom(
        scale,
        targetScale,
        pan,
        targetPan
      )
    }
    ,
    resetView: () => {
      // animate back to neutral
      animateZoom(scale, 1, pan, { x: 0, y: 0 })
    }
  }))

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
    
      const rect = el.getBoundingClientRect()
    
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
    
      const delta = -e.deltaY
      const step = e.ctrlKey ? 0.0015 : 0.0035
    
      const oldScale = scaleRef.current
      const currentPan = panRef.current
    
      const factor = Math.exp(delta * step)
    
      const target = Math.max(
        0.2,
        Math.min(4000, oldScale * factor)
      )
    
      const pX = (cx - currentPan.x) / oldScale
      const pY = (cy - currentPan.y) / oldScale
    
      const newPanX = cx - pX * target
      const newPanY = cy - pY * target
    
      scaleRef.current = target
      panRef.current = {
        x: newPanX,
        y: newPanY,
      }
    
      pendingZoomRef.current = {
        scale: target,
        pan: {
          x: newPanX,
          y: newPanY,
        },
      }
    
      if (zoomFrameRef.current !== null) return
    
      zoomFrameRef.current = requestAnimationFrame(() => {
        zoomFrameRef.current = null
      
        const pending = pendingZoomRef.current
        if (!pending) return
      
        setScale(pending.scale)
        setPan(pending.pan)
      })
    }
  
    el.addEventListener('wheel', handleWheel, {
      passive: false,
    })
  
    return () => {
      el.removeEventListener('wheel', handleWheel)
    
      if (zoomFrameRef.current !== null) {
        cancelAnimationFrame(zoomFrameRef.current)
        zoomFrameRef.current = null
      }
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      // onWheel={onWheel}
      onMouseMove={onMouseMove}
      onMouseDown={onBackgroundMouseDown}
      onMouseUp={() => {
        onBackgroundMouseUp()
        setDragging(null)
      }}
      style={{ width: '100%', height: '100%', background: '#000000', touchAction: 'none' }}
    >
      {/* simple grid #000000 */}
      <rect x={0} y={0} width={size.w} height={size.h} fill="transparent" />
      {/* grid overlay: compute lat/lon lines */}
      {/* {renderGrid(latMin, latMax, lonMin, lonMax, size)} */}
      <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
        {projectedShapes.map((shape, shapeIndex) => (
          <g key={`shape-${shape.name}-${shapeIndex}`}>
            {shape.paths.map((path, index) => {
              const points = path.screenCoords.map(
                p => `${p.x},${p.y}`
              )
            
              const label = path.label || shape.name
            
              if (
                shape.kind === 'polygon' &&
                path.screenCoords.length > 2
              ) {
                return (
                  <g key={`shape-${shape.name}-${index}`}>
                    <polygon
                      points={points.join(' ')}
                      fill={
                        path.color
                          ? hexToRgba(path.color, 0.08)
                          : 'rgba(48, 113, 255, 0.08)'
                      }
                      stroke={path.color ?? '#3173ff'}
                      strokeWidth={1.6}
                      vectorEffect="non-scaling-stroke"
                    />

                    <text
                      x={path.screenCoords[0].x + 4}
                      y={path.screenCoords[0].y - 4}
                      fontSize={12}
                      fill="#1b3774"
                    >
                      {label}
                    </text>
                  </g>
                )
              }
            
              if (
                shape.kind === 'polyline' &&
                path.screenCoords.length > 1
              ) {
                return (
                  <g key={`shape-${shape.name}-${index}`}>
                    <polyline
                      points={points.join(' ')}
                      fill="none"
                      stroke={path.color ?? '#4c8bff'}
                      strokeWidth={1.6}
                      vectorEffect="non-scaling-stroke"
                      // strokeDasharray="6 4"
                    />

                    {shape.name !== 'GEO' && label && (
                      <text
                        x={path.screenCoords[0].x + 4}
                        y={path.screenCoords[0].y - 4}
                        fontSize={12}
                        fill="#1b3774"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                )
              }
            
              if (
                shape.kind === 'point' &&
                path.screenCoords.length === 1
              ) {
                const { x, y } = path.screenCoords[0]
              
                return (
                  <g key={`shape-${shape.name}-${index}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={6}
                      fill={path.color ?? '#4c8bff'}
                      stroke="#fff"
                      strokeWidth={2 / scale}
                    />

                    <text
                      x={x + 8}
                      y={y + 4}
                      fontSize={12}
                      fill="#1b3774"
                    >
                      {label}
                    </text>
                  </g>
                )
              }
            
              if (
                shape.kind === 'label' &&
                path.screenCoords.length > 0
              ) {
                return (
                  <text
                    key={`shape-${shape.name}-${index}`}
                    x={path.screenCoords[0].x}
                    y={path.screenCoords[0].y}
                    fontSize={14}
                    fill="#3d3d5b"
                  >
                    {label}
                  </text>
                )
              }
            
              return null
            })}
          </g>
        ))}
      </g>
      {/* labels: render outside scaled group so font remains constant */}
      {geoPoints.map(p => {
        const { x, y } = project(p.coord.lat, p.coord.lon)
        const screenX = pan.x + x * scale
        const screenY = pan.y + y * scale
        return (
          <text key={`label-${p.id}`} x={screenX + 12} y={screenY + 4} fontSize={12} fill="#222" pointerEvents="none">
            {p.id}
          </text>
        )
      })}
    </svg>
  )
}

const SectorCanvas = forwardRef<CanvasHandle, Props>(SectorCanvasInner)

export default SectorCanvas;

// function renderGrid(latMin: number, latMax: number, lonMin: number, lonMax: number, size: { w: number; h: number }) {
//   // choose grid step in degrees
//   const latRange = Math.abs(latMax - latMin) || 1
//   const lonRange = Math.abs(lonMax - lonMin) || 1
//   const approxSteps = 6
//   const latStep = niceStep(latRange / approxSteps)
//   const lonStep = niceStep(lonRange / approxSteps)

//   const lines: React.JSX.Element[] = []
//   for (let lat = Math.floor(latMin / latStep) * latStep; lat <= latMax; lat += latStep) {
//     const y = ((latMax - lat) / (latMax - latMin || 1)) * (size.h - Margin * 2) + Margin
//     lines.push(<line key={`lat-${lat}`} x1={0} y1={y} x2={size.w} y2={y} stroke="#e6eef8" strokeWidth={0.5} />)
//     lines.push(
//       <text key={`lat-t-${lat}`} x={4} y={y - 2} fontSize={10} fill="#7a8ca3">
//         {lat.toFixed(3)}
//       </text>
//     )
//   }
//   for (let lon = Math.floor(lonMin / lonStep) * lonStep; lon <= lonMax; lon += lonStep) {
//     const x = ((lon - lonMin) / (lonMax - lonMin || 1)) * (size.w - Margin * 2) + Margin
//     lines.push(<line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={size.h} stroke="#e6eef8" strokeWidth={0.5} />)
//     lines.push(
//       <text key={`lon-t-${lon}`} x={x + 2} y={12} fontSize={10} fill="#7a8ca3">
//         {lon.toFixed(3)}
//       </text>
//     )
//   }
//   return <g>{lines}</g>
// }

// function niceStep(raw: number) {
//   // round to 1,2,5 * 10^n
//   const exp = Math.floor(Math.log10(raw || 1))
//   const base = raw / Math.pow(10, exp)
//   let step = 1
//   if (base <= 1) step = 1
//   else if (base <= 2) step = 2
//   else if (base <= 5) step = 5
//   else step = 10
//   return step * Math.pow(10, exp)
// }

function hexToRgba(hex: string, a = 1) {
  try {
    const h = hex.replace(/^#/, '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  } catch (e) {
    return hex
  }
}

function getBounds(coords: Coord[]) {
  if (coords.length === 0) {
    return {
      latMin: 0,
      latMax: 1,
      lonMin: 0,
      lonMax: 1,
    }
  }

  let latMin = Infinity
  let latMax = -Infinity
  let lonMin = Infinity
  let lonMax = -Infinity

  for (const c of coords) {
    if (c.lat < latMin) latMin = c.lat
    if (c.lat > latMax) latMax = c.lat
    if (c.lon < lonMin) lonMin = c.lon
    if (c.lon > lonMax) lonMax = c.lon
  }

  return { latMin, latMax, lonMin, lonMax }
}

import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'

type GeoPoint = { id: string; coord: { lat: number; lon: number }; type?: 'FIX' | 'VOR' | 'NDB'; freq?: string }

type Props = {
  geoPoints?: GeoPoint[]
  onGeoChange?: (pts: GeoPoint[]) => void
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}

export type CanvasHandle = { fitToExtent: () => void; resetView: () => void }

const Margin = 20

function SectorCanvasInner(
  { geoPoints = [], onGeoChange, selectedId = null, onSelect }: Props,
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

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const delta = -e.deltaY
    const step = e.ctrlKey ? 0.0015 : 0.0035
    const oldScale = scale
    const factor = Math.exp(delta * step)
    const target = Math.max(0.2, Math.min(8, oldScale * factor))
    const pX = (cx - pan.x) / oldScale
    const pY = (cy - pan.y) / oldScale
    const newPanX = cx - pX * target
    const newPanY = cy - pY * target
    setScale(target)
    setPan({ x: newPanX, y: newPanY })
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

  // compute bounding box of coordinates
  const lats = geoPoints.map(p => p.coord.lat)
  const lons = geoPoints.map(p => p.coord.lon)
  const latMin = Math.min(...(lats.length ? lats : [0]))
  const latMax = Math.max(...(lats.length ? lats : [1]))
  const lonMin = Math.min(...(lons.length ? lons : [0]))
  const lonMax = Math.max(...(lons.length ? lons : [1]))

  function project(lat: number, lon: number) {
    const w = size.w - Margin * 2
    const h = size.h - Margin * 2
    const xBase = Margin + ((lon - lonMin) / (lonMax - lonMin || 1)) * w
    // y: invert lat so larger lat is top
    const yBase = Margin + (1 - (lat - latMin) / (latMax - latMin || 1)) * h
    return { x: xBase, y: yBase }
  }

  function unproject(x: number, y: number) {
    const w = size.w - Margin * 2
    const h = size.h - Margin * 2
    const lon = lonMin + ((x - Margin) / (w || 1)) * (lonMax - lonMin)
    const lat = latMin + (1 - (y - Margin) / (h || 1)) * (latMax - latMin)
    return { lat, lon }
  }

  function startDrag(id: string) {
    setDragging(id)
    onSelect?.(id)
  }

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
      // compute bbox in base coords and set scale/pan to fit
      if (!svgRef.current) return
      const el = svgRef.current
      const r = el.getBoundingClientRect()
      const viewW = Math.max(100, r.width)
      const viewH = Math.max(100, r.height)
      if (geoPoints.length === 0) {
        setScale(1)
        setPan({ x: 0, y: 0 })
        return
      }
      const lats = geoPoints.map(p => p.coord.lat)
      const lons = geoPoints.map(p => p.coord.lon)
      const latMin = Math.min(...lats)
      const latMax = Math.max(...lats)
      const lonMin = Math.min(...lons)
      const lonMax = Math.max(...lons)
      const wBase = viewW - Margin * 2
      const hBase = viewH - Margin * 2
      const scaleX = wBase / (Math.max(1e-6, lonMax - lonMin))
      const scaleY = hBase / (Math.max(1e-6, latMax - latMin))
      const targetScale = Math.max(0.2, Math.min(8, Math.min(scaleX, scaleY)))
      // compute center in base coords
      const centerLon = (lonMin + lonMax) / 2
      const centerLat = (latMin + latMax) / 2
      const centerBase = project(centerLat, centerLon)
      const cx = viewW / 2
      const cy = viewH / 2
      const newPanX = cx - centerBase.x * targetScale
      const newPanY = cy - centerBase.y * targetScale
      // animate
      animateZoom(scale, targetScale, pan, { x: newPanX, y: newPanY })
    }
    ,
    resetView: () => {
      // animate back to neutral
      animateZoom(scale, 1, pan, { x: 0, y: 0 })
    }
  }))

  return (
    <svg
      ref={svgRef}
      onWheel={onWheel}
      onMouseMove={onMouseMove}
      onMouseDown={onBackgroundMouseDown}
      onMouseUp={() => {
        onBackgroundMouseUp()
        setDragging(null)
      }}
      style={{ width: '100%', height: '100%', background: '#f6f6f8', touchAction: 'none' }}
    >
      {/* simple grid */}
      <rect x={0} y={0} width={size.w} height={size.h} fill="transparent" />
      {/* grid overlay: compute lat/lon lines */}
      {renderGrid(latMin, latMax, lonMin, lonMax, size)}
      <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
      {geoPoints.map(p => {
        const { x, y } = project(p.coord.lat, p.coord.lon)
        const fill = p.type === 'VOR' ? '#ff8a00' : p.type === 'NDB' ? '#3fbf6f' : '#1976d2'
        const isSelected = p.id === selectedId
        return (
          <g key={p.id}>
            <circle
              cx={x}
              cy={y}
              r={isSelected ? 10 : 8}
              fill={fill}
              stroke={isSelected ? '#ffd54f' : '#fff'}
              strokeWidth={isSelected ? 3 : 2}
              onMouseDown={() => startDrag(p.id)}
              onClick={() => onSelect?.(p.id)}
              style={{ cursor: 'move' }}
            />
          </g>
        )
      })}
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

function renderGrid(latMin: number, latMax: number, lonMin: number, lonMax: number, size: { w: number; h: number }) {
  // choose grid step in degrees
  const latRange = Math.abs(latMax - latMin) || 1
  const lonRange = Math.abs(lonMax - lonMin) || 1
  const approxSteps = 6
  const latStep = niceStep(latRange / approxSteps)
  const lonStep = niceStep(lonRange / approxSteps)

  const lines: React.JSX.Element[] = []
  for (let lat = Math.floor(latMin / latStep) * latStep; lat <= latMax; lat += latStep) {
    const y = ((latMax - lat) / (latMax - latMin || 1)) * (size.h - Margin * 2) + Margin
    lines.push(<line key={`lat-${lat}`} x1={0} y1={y} x2={size.w} y2={y} stroke="#e6eef8" strokeWidth={0.5} />)
    lines.push(
      <text key={`lat-t-${lat}`} x={4} y={y - 2} fontSize={10} fill="#7a8ca3">
        {lat.toFixed(3)}
      </text>
    )
  }
  for (let lon = Math.floor(lonMin / lonStep) * lonStep; lon <= lonMax; lon += lonStep) {
    const x = ((lon - lonMin) / (lonMax - lonMin || 1)) * (size.w - Margin * 2) + Margin
    lines.push(<line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={size.h} stroke="#e6eef8" strokeWidth={0.5} />)
    lines.push(
      <text key={`lon-t-${lon}`} x={x + 2} y={12} fontSize={10} fill="#7a8ca3">
        {lon.toFixed(3)}
      </text>
    )
  }
  return <g>{lines}</g>
}

function niceStep(raw: number) {
  // round to 1,2,5 * 10^n
  const exp = Math.floor(Math.log10(raw || 1))
  const base = raw / Math.pow(10, exp)
  let step = 1
  if (base <= 1) step = 1
  else if (base <= 2) step = 2
  else if (base <= 5) step = 5
  else step = 10
  return step * Math.pow(10, exp)
}

/* eslint-disable react-hooks/refs */
/* eslint-disable react-hooks/set-state-in-effect */
import { TextField } from '@mui/material'
import { useEffect, useRef, useState, JSX } from 'react'
import { useNavigate } from 'react-router'
import { getMETARCode } from '@services/metar.service'

type CheckStatus = 'idle' | 'checking' | 'exists' | 'not-found'

interface StoredIcaoState {
  icaoCode: string
  status: CheckStatus
  metarCode: string | null
}

const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    height: '56px',
    '& fieldset': {
      borderColor: 'white'
    },
    '&:hover fieldset': {
      borderColor: 'white'
    },
    '&.Mui-focused fieldset': {
      borderColor: 'white'
    },
    '& input': {
      color: 'white',
      textAlign: 'center',
      fontSize: '2.5rem',
      fontWeight: '500',
      padding: '14px 14px',
      '&:focus::placeholder': { opacity: 0 }
    },
    '& input.Mui-disabled': {
      color: 'white',
      WebkitTextFillColor: 'white'
    },
    '& .MuiInputBase-input': {
      fontFamily: 'Roboto Mono, monospace',
      fontSize: '32px'
    }
  }
}

const ICAO_STORAGE_KEY = 'awos.icaoState'
const DEBOUNCE_MS = 300

const EMPTY_STATE: StoredIcaoState = { icaoCode: '', status: 'idle', metarCode: null }

const loadStoredState = (): StoredIcaoState => {
  try {
    const raw = sessionStorage.getItem(ICAO_STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    return JSON.parse(raw) as StoredIcaoState
  } catch {
    return EMPTY_STATE
  }
}

const STATUS_MESSAGES: Record<Exclude<CheckStatus, 'exists'>, string> = {
  idle: 'Input the correct ICAO code (4 letters)',
  checking: 'checking...',
  'not-found': 'no data'
}

const Index = (): JSX.Element => {
  const navigate = useNavigate()
  const initialState = useRef(loadStoredState()).current

  const [icaoCode, setIcaoCode] = useState<string>(initialState.icaoCode)
  const [metarCode, setMetarCode] = useState<string | null>(initialState.metarCode)
  const [status, setStatus] = useState<CheckStatus>(initialState.status)

  const lastVerifiedIcaoRef = useRef<string>(
    initialState.status === 'exists' || initialState.status === 'not-found'
      ? initialState.icaoCode
      : ''
  )

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyState = (next: StoredIcaoState): void => {
    setIcaoCode(next.icaoCode)
    setStatus(next.status)
    setMetarCode(next.metarCode)
    sessionStorage.setItem(ICAO_STORAGE_KEY, JSON.stringify(next))
  }

  const handleIcaoChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const filtered = e.target.value
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4)

    applyState({ icaoCode: filtered, status: 'idle', metarCode: null })
  }

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    if (icaoCode.length !== 4) {
      setStatus('idle')
      setMetarCode(null)
      return
    }

    if (lastVerifiedIcaoRef.current === icaoCode) {
      return
    }

    setStatus('checking')

    debounceTimeoutRef.current = setTimeout(() => {
      void (async () => {
        const result = await getMETARCode(icaoCode)
        lastVerifiedIcaoRef.current = icaoCode

        const next: StoredIcaoState = result?.metarCode
          ? { icaoCode, status: 'exists', metarCode: result.metarCode }
          : { icaoCode, status: 'not-found', metarCode: null }

        setStatus(next.status)
        setMetarCode(next.metarCode)
        sessionStorage.setItem(ICAO_STORAGE_KEY, JSON.stringify(next))
      })()
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [icaoCode])

  const handleStart = (): void => {
    if (status === 'exists' && metarCode) {
      navigate('/editor', { state: { metarCode } })
    } else {
      navigate('/editor')
    }
  }

  const statusMessage = status === 'exists' ? metarCode : STATUS_MESSAGES[status]

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center gap-6 bg-[#303030] text-white">
      <h1 className="text-[48px] font-bold">AWOS Dashboard</h1>
      <button
        type="button"
        className="px-8 py-3 text-[20px] rounded bg-[#132237] hover:bg-[#1a2f4a] transition-colors"
        onClick={handleStart}
        disabled={status === 'checking'}
      >
        Start
      </button>
      <div className="w-[30%] flex flex-col gap-1">
        <div className="flex justify-between gap-2 items-center">
          <p className="text-2xl w-[40%]">ICAO code:</p>
          <TextField
            className="w-full"
            value={icaoCode}
            onChange={handleIcaoChange}
            sx={textFieldSx}
            slotProps={{
              htmlInput: {
                maxLength: 4,
                style: { textTransform: 'uppercase' }
              }
            }}
          />
        </div>
        <p className="pt-0 text-center">{statusMessage}</p>
      </div>
    </div>
  )
}

export default Index

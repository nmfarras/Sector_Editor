import '@styles/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'

import { ToastContainer } from 'react-toastify'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastContainer theme="colored" />
    <App />
  </StrictMode>
)

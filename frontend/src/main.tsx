import { BrowserRouter } from 'react-router-dom'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const origFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || ''
  if (url.includes('onrender.com') || url.includes(':8000')) {
    try {
      const auth = JSON.parse(localStorage.getItem('mm_admin_auth') || 'null')
      if (auth?.token) {
        const headers = new Headers(init.headers || {})
        headers.set('X-Admin-Token', auth.token)
        init = { ...init, headers }
      }
    } catch {}
  }
  const res = await origFetch(input, init)
  if (res.status === 401 && !url.includes('/auth/admin-login')) {
    localStorage.removeItem('mm_admin_auth')
    window.dispatchEvent(new Event('mm-admin-logout'))
  }
  return res
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
)

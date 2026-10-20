import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getFriendlyErrorMessage } from './lib/errorMessages'
import { applyThemePreference, readStoredThemePreference } from './lib/theme'

window.alert = (message) => {
  const friendlyMessage = getFriendlyErrorMessage(message)
  window.dispatchEvent(new CustomEvent('shopms:alert', {
    detail: { message: friendlyMessage }
  }))
}

applyThemePreference(readStoredThemePreference())
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

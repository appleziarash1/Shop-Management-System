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

// Register Service Worker for Offline PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

console.log('CODE_SYNC_DEBUG: ' + new Date().toISOString())
applyThemePreference(readStoredThemePreference())
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

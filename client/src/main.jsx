// client/src/main.jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './pdf-worker-setup.js'
import './i18n'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)

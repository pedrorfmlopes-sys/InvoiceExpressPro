// client/src/main.jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './pdf-worker-setup.js'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)

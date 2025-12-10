// client/src/components/Toast.jsx
import React, { useEffect } from 'react'
import { IconClose } from '../shared/ui'

export default function Toast({ open, text, onUndo, onClose }){
  useEffect(()=>{ if(!open) return; const t=setTimeout(()=>onClose?.(), 5000); return ()=>clearTimeout(t) },[open])
  if(!open) return null
  return (
    <div className="toast">
      <span>{text}</span>
      {onUndo && <button className="btn btn--tiny" onClick={onUndo}>Desfazer</button>}
      <button className="btn btn--tiny" onClick={onClose}><IconClose/></button>
    </div>
  )
}

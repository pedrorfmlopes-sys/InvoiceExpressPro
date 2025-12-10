// client/src/components/PdfViewerOverlay.jsx
import React from 'react'
import { IconClose, IconDownload, IconExternal, IconZoomIn, IconZoomOut } from '../shared/ui'

export default function PdfViewerOverlay({ open, url, onClose }){
  const [zoom,setZoom]=React.useState(1)
  React.useEffect(()=>{ if(!open) setZoom(1) },[open])
  React.useEffect(()=>{
    function onKey(e){ if(e.key==='Escape') onClose?.() }
    if(open){ window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey)}
  },[open,onClose])
  if(!open) return null
  return (
    <div className="viewer__backdrop" onClick={onClose}>
      <div className="viewer__card" onClick={e=>e.stopPropagation()}>
        <div className="viewer__toolbar">
          <div className="viewer__left">
            <button className="btn btn--icon" title="Fechar" onClick={onClose}><IconClose/></button>
          </div>
          <div className="viewer__center">
            <button className="btn btn--icon" title="Zoom -" onClick={()=>setZoom(z=>Math.max(0.5, +(z-0.1).toFixed(2)))}><IconZoomOut/></button>
            <span className="viewer__zoom">{Math.round(zoom*100)}%</span>
            <button className="btn btn--icon" title="Zoom +" onClick={()=>setZoom(z=>Math.min(3, +(z+0.1).toFixed(2)))}><IconZoomIn/></button>
          </div>
          <div className="viewer__right">
            <a className="btn btn--icon" href={url} download title="Descarregar"><IconDownload/></a>
            <a className="btn btn--icon" href={url} target="_blank" rel="noreferrer" title="Abrir em nova aba"><IconExternal/></a>
          </div>
        </div>
        <div className="viewer__body">
          <div className="viewer__scaler" style={{transform:`scale(${zoom})`}}>
            <iframe className="viewer__frame" src={url} title="Documento" />
          </div>
        </div>
      </div>
    </div>
  )
}

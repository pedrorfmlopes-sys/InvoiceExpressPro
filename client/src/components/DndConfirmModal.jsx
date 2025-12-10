// client/src/components/DndConfirmModal.jsx
import React, { useEffect, useState } from 'react'

export default function DndConfirmModal({ open, context, onChoose, onCancel }){
  const [remember,setRemember] = useState(false)
  useEffect(()=>{ if(!open) setRemember(false) },[open])
  if(!open) return null
  return (
    <div className="modal__backdrop" onClick={onCancel}>
      <div className="modal__card" onClick={e=>e.stopPropagation()}>
        <div className="modal__header">O que quer fazer?</div>
        <div className="modal__sub">
          Origem: <b>{context?.from?.uiField}</b> “{String(context?.from?.value??'')}” → Destino: <b>{context?.to?.uiField}</b>
        </div>
        <div className="modal__actions">
          <button className="btn primary" onClick={()=>onChoose('trocar', remember)}>Trocar</button>
          <button className="btn" onClick={()=>onChoose('substituir', remember)}>Substituir</button>
          <button className="btn" onClick={onCancel}>Cancelar</button>
        </div>
        <label className="remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Lembrar por 10 min</label>
      </div>
    </div>
  )
}

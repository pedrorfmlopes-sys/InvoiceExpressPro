// client/src/tabs/TeacherTab.jsx
import React from 'react'
import { axios, TEACHER_FIELDS, qp } from '../shared/ui'

export default function TeacherTab({ project }){
  const [name,setName]=React.useState('')
  const [regions,setRegions]=React.useState([])
  const [items,setItems]=React.useState([])
  const [imgSrc,setImgSrc]=React.useState(null)
  const [currentField,setCurrentField]=React.useState('Fornecedor')
  const [selectedId,setSelectedId]=React.useState(null)
  const canvasRef=React.useRef(null); const imgRef=React.useRef(null)
  const [drag,setDrag]=React.useState(null)
  const [dragMove,setDragMove]=React.useState(null)
  const imgBoxRef=React.useRef({x:0,y:0,w:0,h:0,scale:1})
  const undoRef=React.useRef([]); const redoRef=React.useRef([])

  const pushUndo = (next)=>{ undoRef.current.push(JSON.stringify(regions)); redoRef.current.length=0; setRegions(next) }
  const undo = ()=>{ if(!undoRef.current.length) return; const prevJson = undoRef.current.pop(); redoRef.current.push(JSON.stringify(regions)); setRegions(JSON.parse(prevJson)) }
  const redo = ()=>{ if(!redoRef.current.length) return; const nextJson = redoRef.current.pop(); undoRef.current.push(JSON.stringify(regions)); setRegions(JSON.parse(nextJson)) }

  async function load(){ 
    const j=await fetch(qp('/api/templates', project)).then(r=>r.json()).catch(()=>[])
    const arr = Array.isArray(j)? j : (j.items||[])
    setItems(arr.map(it=>({ name: it.name, path: it.path || '' })))
  }
  React.useEffect(()=>{ load() },[project])

  React.useEffect(()=>{ 
    const cvs=canvasRef.current; if(!cvs) return; 
    const ctx=cvs.getContext('2d'); let raf=0;
    function draw(){ 
      ctx.clearRect(0,0,cvs.width,cvs.height); ctx.fillStyle='#f3f3f3'; ctx.fillRect(0,0,cvs.width,cvs.height);
      const img=imgRef.current; 
      if(img && img.complete){ 
        const scale=Math.min(cvs.width/img.naturalWidth, cvs.height/img.naturalHeight);
        const w=img.naturalWidth*scale, h=img.naturalHeight*scale; 
        const x=(cvs.width-w)/2, y=(cvs.height-h)/2;
        imgBoxRef.current={x,y,w,h,scale};
        ctx.drawImage(img,x,y,w,h); 
        ctx.save(); ctx.translate(x,y);
        regions.forEach((r,idx)=>{ 
          ctx.strokeStyle= idx===selectedId ? '#ff7a00' : '#0aa'; 
          ctx.lineWidth = idx===selectedId ? 2 : 1;
          ctx.strokeRect(r.x,r.y,r.w,r.h); 
          ctx.fillStyle= idx===selectedId ? 'rgba(255,122,0,.12)' : 'rgba(0,170,170,.12)'; 
          ctx.fillRect(r.x,r.y,r.w,r.h); 
          ctx.fillStyle='#055'; ctx.font='12px sans-serif'; 
          ctx.fillText(r.field,r.x+4,r.y+14) 
        });
        ctx.restore();
        if(drag){ 
          ctx.setLineDash([5,4]); ctx.strokeStyle='#333'; 
          const w2=drag.endX-drag.startX, h2=drag.endY-drag.startY; 
          ctx.strokeRect(drag.startX, drag.startY, w2, h2); 
          ctx.setLineDash([]) 
        }
      } else { ctx.strokeStyle='#999'; ctx.strokeRect(0,0,cvs.width,cvs.height); }
      raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw); 
    return ()=>cancelAnimationFrame(raf);
  },[regions,drag,imgSrc,selectedId])

  function hitTestCanvasToRegion(cx,cy){
    const {x,y}=imgBoxRef.current
    const rx=cx-x, ry=cy-y
    for(let i=regions.length-1;i>=0;i--){
      const r=regions[i]
      if(rx>=r.x && ry>=r.y && rx<=r.x+r.w && ry<=r.y+r.h) return i
    }
    return -1
  }

  function onMouseDown(e){ 
    const b=e.currentTarget.getBoundingClientRect(); 
    const cx=e.clientX-b.left, cy=e.clientY-b.top
    const hit = hitTestCanvasToRegion(cx,cy)
    if(hit>=0){
      setSelectedId(hit)
      const r=regions[hit]
      setDragMove({id:hit,offX:cx-(imgBoxRef.current.x+r.x),offY:cy-(imgBoxRef.current.y+r.y)})
      return
    }
    setSelectedId(null)
    setDrag({startX:cx,startY:cy,endX:cx,endY:cy}) 
  }
  function onMouseMove(e){ 
    const b=e.currentTarget.getBoundingClientRect(); 
    const cx=e.clientX-b.left, cy=e.clientY-b.top
    if(drag){ setDrag(d=>({...d,endX:cx,endY:cy})); return }
    if(dragMove){
      const {id,offX,offY}=dragMove
      const {x,y,w,h}=imgBoxRef.current
      const nx=cx - offX - x
      const ny=cy - offY - y
      setRegions(rs=>{
        const arr=[...rs]; arr[id]={...arr[id],x:Math.max(0,Math.min(nx,w-arr[id].w)),y:Math.max(0,Math.min(ny,h-arr[id].h))}
        return arr
      })
    }
  }
  function onMouseUp(){
    if(dragMove){ setDragMove(null); return }
    if(!drag) return; 
    const {x,y,w,h}=imgBoxRef.current;
    const sel = {
      x: Math.min(drag.startX,drag.endX),
      y: Math.min(drag.startY,drag.endY),
      w: Math.abs(drag.endX - drag.startX),
      h: Math.abs(drag.endY - drag.startY)
    };
    const inter = !(sel.x > x+w || sel.x+sel.w < x || sel.y > y+h || sel.y+sel.h < y);
    if(!inter){ setDrag(null); return; }
    const rx = Math.max(0, sel.x - x);
    const ry = Math.max(0, sel.y - y);
    const rw = Math.min(sel.w, (x+w) - sel.x);
    const rh = Math.min(sel.h, (y+h) - sel.y);
    if(rw<6 || rh<6){ setDrag(null); return; }
    setRegions(prev=>[...prev,{x:Math.round(rx), y:Math.round(ry), w:Math.round(rw), h:Math.round(rh), field:currentField}])
    setDrag(null)
  }

  async function onUpload(e){
    const f = e.target.files?.[0];
    if (!f) return;

    if (/^image\//.test(f.type)) {
      const r = new FileReader();
      r.onload = () => setImgSrc(r.result);
      r.readAsDataURL(f);
      return;
    }

    if (f.type === 'application/pdf') {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
      const data = await f.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data }).promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      setImgSrc(canvas.toDataURL('image/png'));
      return;
    }

    alert('Formato não suportado. Usa PDF ou imagem.');
  }

  async function save(){
    if(!name.trim()) return alert('Dá um nome ao template');
    await axios.post(qp('/api/templates', project),{name,regions});
    alert('Template guardado'); setRegions([]); setName(''); setSelectedId(null);
  }

  return (
    <div className="card">
      <div className="card__title">Teacher (upload PDF/imagem)</div>
      <div className="row" style={{gap:8}}>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="nome do template (ex: NICOLAZZI_v1)"/>
        <select className="input" value={currentField} onChange={e=>setCurrentField(e.target.value)} title="Campo atual">
          {TEACHER_FIELDS.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <input className="input" type="file" accept="application/pdf,image/*" onChange={onUpload} />
        <button className="btn primary" onClick={save}>Guardar</button>
      </div>
      <div className="muted mt-8">Escolhe o <b>Campo</b>, desenha a caixa. Projeto: <b>{project}</b></div>

      <div className="mt-12" style={{position:'relative',overflow:'auto'}}>
        {imgSrc && <img ref={imgRef} src={imgSrc} alt="doc" style={{maxWidth:'100%',border:'1px solid var(--border)',borderRadius:8}}/>}
        {!imgSrc && <div className="muted">Carrega um PDF/Imagem para começar.</div>}
        <canvas
          ref={canvasRef}
          width={1000}
          height={1400}
          style={{position:'absolute', inset:0, margin:'auto', maxWidth:'100%', pointerEvents:'none', opacity:0}}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        />
      </div>
    </div>
  )
}

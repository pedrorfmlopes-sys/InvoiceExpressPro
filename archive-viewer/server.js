const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {Pool} = require('pg');
const REF = 'pexehvnwdawygmxdaeol';
if (!process.env.PGUSER?.endsWith('.'+REF)) throw Error('Archive database required');
if (!process.env.ARCHIVE_PASSWORD_HASH || !process.env.SESSION_SECRET) throw Error('Authentication required');
const pool = new Pool({max:3,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(__dirname+'/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000,options:'-c default_transaction_read_only=on -c statement_timeout=15000'});
const html = fs.readFileSync(__dirname+'/index.html');
const secret = process.env.SESSION_SECRET;
const blocked = new Set(['users','config_secrets','knex_migrations','knex_migrations_lock','memberships','user_preferences']);
let tables=[];
const attempts = new Map();
const sign = value => crypto.createHmac('sha256',secret).update(value).digest('hex');
const same = (a,b) => {a=Buffer.from(a);b=Buffer.from(b);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
function authorized(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('archive='))?.slice(8)||'';const [expires,mac]=token.split('.');return Number(expires)>Date.now()&&same(mac||'',sign(expires||''));}
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',...headers});res.end(Buffer.isBuffer(data)?data:JSON.stringify(data));}
async function query(text,values=[]){return (await pool.query(text,values)).rows;}
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/health'&&req.method==='GET'){await query('SELECT 1');return send(res,200,{status:'ok',mode:'read-only'});}
 if(u.pathname==='/login'&&req.method==='POST'){
  const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim();const now=Date.now();
  for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
  const a=attempts.get(ip)||{n:0,until:now+900000};if(a.n>=10||attempts.size>10000)return send(res,429,{error:'Aguarda 15 minutos antes de tentar novamente.'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return send(res,413,{error:'Pedido demasiado grande'});}
  let password;try{password=JSON.parse(body).password}catch{return send(res,400,{error:'Pedido inválido'})}
  if(typeof password!=='string')return send(res,400,{error:'Pedido inválido'});
  const [salt,expected]=process.env.ARCHIVE_PASSWORD_HASH.split(':');const hash=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,key)=>e?reject(e):resolve(key.toString('hex'))));
  if(!same(hash,expected)){a.n++;attempts.set(ip,a);return send(res,401,{error:'Senha incorreta'});}
  attempts.delete(ip);const exp=String(now+8*3600000);return send(res,200,{ok:true},{'Set-Cookie':`archive=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`});
 }
 if(u.pathname==='/logout'&&req.method==='POST')return send(res,200,{ok:true},{'Set-Cookie':'archive=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
 if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Arquivo apenas de leitura'});
 if(u.pathname==='/')return send(res,200,html,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
 if(!authorized(req))return send(res,401,{error:'Inicia sessão para consultar o arquivo'});
 if(u.pathname==='/api/overview')return send(res,200,{tables,projects:await query('SELECT project, count(*)::int AS documents FROM public.documents GROUP BY project ORDER BY project'),files:await query('SELECT count(*)::int AS count FROM invoice_archive_files.files')});
 if(u.pathname==='/api/records'){
  const table=u.searchParams.get('table')||'documents';if(!tables.includes(table))return send(res,404,{error:'Tabela indisponível'});
  const page=Math.max(0,Math.min(100000,parseInt(u.searchParams.get('page'))||0));const search=(u.searchParams.get('q')||'').slice(0,200);const project=(u.searchParams.get('project')||'').slice(0,200);
  const name='"'+table.replaceAll('"','""')+'"';const where=" WHERE ($1='' OR strpos(lower(row_to_json(t)::text),lower($1))>0) AND ($2='' OR COALESCE(to_jsonb(t)->>'project',to_jsonb(t)->>'project_ref','')=$2)";
  const rows=await query('SELECT to_jsonb(t) AS record FROM public.'+name+' t'+where+' ORDER BY to_jsonb(t)::text LIMIT 50 OFFSET $3',[search,project,page*50]);
  const count=await query('SELECT count(*)::int AS count FROM public.'+name+' t'+where,[search,project]);return send(res,200,{rows:rows.map(x=>x.record),total:count[0].count,page});
 }
 if(u.pathname==='/api/files')return send(res,200,await query("SELECT path,octet_length(content) AS bytes FROM invoice_archive_files.files WHERE strpos(lower(path),lower($1))>0 ORDER BY path",[(u.searchParams.get('q')||'').slice(0,200)]));
 if(u.pathname==='/file'){
  const rows=await query('SELECT content,path FROM invoice_archive_files.files WHERE path=$1',[u.searchParams.get('path')||'']);if(!rows.length)return send(res,404,{error:'Ficheiro não encontrado'});
  const row=rows[0],pdf=row.path.toLowerCase().endsWith('.pdf');return send(res,200,row.content,{'Content-Type':pdf?'application/pdf':'application/octet-stream','Content-Disposition':`${pdf?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(row.path.split('/').at(-1))}`,'Content-Security-Policy':"sandbox"});
 }
 return send(res,404,{error:'Não encontrado'});
 }catch(e){console.error('Request failed',e.code||'internal');return send(res,503,{error:'Arquivo temporariamente indisponível. Tenta novamente.'});}});
async function start(){tables=(await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).map(x=>x.tablename).filter(x=>!blocked.has(x));server.listen(process.env.PORT||10000,'0.0.0.0',()=>console.log('Read-only archive ready'));}
start().catch(e=>{console.error('Startup failed',e.code||'internal');process.exit(1)});
process.on('SIGTERM',()=>server.close(()=>pool.end().then(()=>process.exit(0))));

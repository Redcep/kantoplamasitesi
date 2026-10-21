require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { Client, GatewayIntentBits, AttachmentBuilder, ChannelType } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const API_KEY = process.env.API_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || API_KEY;
const PORT = process.env.PORT || 3000;
const SITE_SESSION_SECRET = process.env.SITE_SESSION_SECRET || 'secret';

for (const [name, val] of Object.entries({ DISCORD_TOKEN, CHANNEL_ID, API_KEY })) {
  if (!val) { console.error(`Eksik: ${name}`); process.exit(1); }
}
const MAX_INLINE = 1900;
const AES_KEY = crypto.scryptSync(ENCRYPTION_KEY, 'discord-db-api-v1', 32);
function encrypt(text){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv('aes-256-gcm',AES_KEY,iv); const d=Buffer.concat([c.update(text,'utf8'),c.final()]); const t=c.getAuthTag(); return Buffer.concat([iv,t,d]).toString('base64'); }
function decrypt(b64){ const buf=Buffer.from(b64.trim(),'base64'); const iv=buf.subarray(0,12); const t=buf.subarray(12,28); const d=buf.subarray(28); const dc=crypto.createDecipheriv('aes-256-gcm',AES_KEY,iv); dc.setAuthTag(t); return Buffer.concat([dc.update(d),dc.final()]).toString('utf8'); }
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages],allowedMentions:{parse:[]}});
let channel=null, ready=false;
const index=new Map(); let chain=Promise.resolve();
function withLock(fn){ const p=chain.then(()=>fn()); chain=p.catch(()=>{}); return p; }
function messageOptions(r,fe){ const enc=encrypt(JSON.stringify(r)); if(enc.length<=MAX_INLINE) return fe?{content:enc,files:[],attachments:[]}:{content:enc}; const f=new AttachmentBuilder(Buffer.from(enc,'utf8'),{name:'data.enc'}); return fe?{content:'DB-FILE',files:[f],attachments:[]}:{content:'DB-FILE',files:[f]}; }
async function loadAll(){ let before; let loaded=0,skipped=0; while(true){ const b=await channel.messages.fetch({limit:100,before}); if(b.size===0) break; for(const m of b.values()){ if(m.author.id!==client.user.id) continue; try{ let enc=m.content; if(m.attachments.size>0){ const res=await fetch(m.attachments.first().url); enc=await res.text(); } const rec=JSON.parse(decrypt(enc)); const ex=index.get(rec.k); if(!ex||rec.u>ex.record.u){ index.set(rec.k,{messageId:m.id,record:rec}); } loaded++; }catch{ skipped++; } } before=b.last().id; if(b.size<100) break; } console.log('loaded'); }
const db={read(k){const i=index.get(k);return i?i.record:null},list(p=''){return [...index.values()].map(i=>i.record).filter(r=>r.k.startsWith(p))},create(k,v){return withLock(async()=>{ if(index.has(k))return null; const now=Date.now(); const rec={k,v,c:now,u:now}; const m=await channel.send(messageOptions(rec,false)); index.set(k,{messageId:m.id,record:rec}); return rec;})},update(k,v,upsert=false){return withLock(async()=>{ const it=index.get(k); if(!it){ if(!upsert)return null; const now=Date.now(); const rec={k,v,c:now,u:now}; const m=await channel.send(messageOptions(rec,false)); index.set(k,{messageId:m.id,record:rec}); return {record:rec,created:true}; } const rec={...it.record,v,u:Date.now()}; await channel.messages.edit(it.messageId,messageOptions(rec,true)); it.record=rec; return {record:rec,created:false};})},remove(k){return withLock(async()=>{ const it=index.get(k); if(!it)return false; await channel.messages.delete(it.messageId); index.delete(k); return true;})}};
const app=express();
// Render gibi proxy arkasında çalışırken X-Forwarded-For doğru okunsun (rate-limit ve IP kaydı için)
app.set('trust proxy',process.env.TRUST_PROXY?Number(process.env.TRUST_PROXY)||process.env.TRUST_PROXY:(process.env.RENDER?1:false));
app.disable('x-powered-by'); app.use(express.json()); app.use(cookieParser()); app.use(session({secret:SITE_SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',maxAge:86400000}}));
const PUBLIC_FILES=new Set(['login.html','index.html','app.js','style.css','jquery.min.js','sal.jpeg']);
app.get('/:file',(req,res,next)=>{ if(!PUBLIC_FILES.has(req.params.file)) return next(); res.set('Cache-Control','no-cache'); res.sendFile(path.join(__dirname,req.params.file)); });
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'login.html')));
const ROLES=['kayit','kontrol','yonetim'];
const ROLE_PW={
  kayit:process.env.KAYIT_PASSWORD||process.env.SITE_PASSWORD||'demo123',
  kontrol:process.env.KONTROL_PASSWORD||process.env.SITE_PASSWORD||'demo123',
  yonetim:process.env.YONETIM_PASSWORD||process.env.SITE_PASSWORD||'demo123'
};
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:40,standardHeaders:true,legacyHeaders:false,message:{ok:false,error:'Çok fazla deneme, biraz bekleyin'}});
app.post('/site/login',loginLimiter,(req,res)=>{
  const b=req.body||{}; const role=ROLES.includes(b.role)?b.role:null;
  if(!role) return res.status(400).json({ok:false,error:'Geçersiz giriş yeri'});
  if(String(b.password||'')!==ROLE_PW[role]) return res.status(401).json({ok:false,error:'Geçersiz şifre'});
  req.session.regenerate(err=>{ if(err) return res.status(500).json({ok:false}); req.session.authenticated=true; req.session.role=role; req.session.table=null; res.json({ok:true,role}); });
});
app.get('/site/auth/check',(req,res)=>{ if(req.session&&req.session.authenticated) return res.json({ok:true,authenticated:true,role:req.session.role,table:req.session.table||null}); return res.json({ok:true,authenticated:false}); });
app.post('/site/logout',(req,res)=>{ const t=req.session&&req.session.table; if(t) tableSeen.delete(lc(t)); req.session.destroy(()=>res.json({ok:true})); });
// ---- Yetki kontrolü: giriş şart, bazı uçlar sadece belirli rollere açık ----
const RULES=[
  ['POST','/visitor',['kayit','yonetim']],
  ['POST','/visitor/delete',['kayit','yonetim']],
  ['POST','/control/assign',['kontrol','yonetim']],
  ['POST','/control/table',['kontrol','yonetim']],
  ['POST','/tables',['kontrol','yonetim']],
  ['POST','/tables/delete',['yonetim']],
  ['POST','/lists/school',['kayit','yonetim']],
  ['POST','/referrers',['kayit','yonetim']],
  ['POST','/lists/class',['kayit','yonetim']],
  ['GET','/export/csv',['yonetim']],
  ['GET','/stats/overview',['yonetim']]
];
app.use('/site',(req,res,next)=>{
  if(!(req.session&&req.session.authenticated)) return res.status(401).json({ok:false,error:'Giriş gerekli'});
  let allowed=null;
  if(req.path.startsWith('/rankings/')) allowed=['yonetim'];
  else { const r=RULES.find(x=>x[0]===req.method&&x[1]===req.path); if(r) allowed=r[2]; }
  if(allowed&&!allowed.includes(req.session.role)) return res.status(403).json({ok:false,error:'Yetkiniz yok'});
  if(req.session.role==='kontrol'&&req.session.table) tableSeen.set(lc(req.session.table),Date.now());
  next();
});
const wrap=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function sk(id){return 'site:visitor:'+id;} function toInt(v){const n=Number(v);return isFinite(n)?n:NaN;} function ss(v,m=500){if(typeof v!=='string')return'';return v.trim().slice(0,m);} function ns(s){const t=ss(s,20).toLowerCase(); if(t==='success'||t==='failure'||t==='waiting')return t; return 'waiting';}
app.get('/site/visitors',wrap(async(req,res)=>{ const l=db.list('site:visitor:'); const items=l.map(r=>{const v=r.v||{}; return {id:v.id,name:v.name||'',school:v.school||'',referrer:v.referrer||'',class:v.class||'',status:v.status||'waiting',note:v.note||'',ip:v.ip||null,tableNo:v.tableNo||null,approvedBy:v.approvedBy||null,assignedAt:v.assignedAt||null,approvedAt:v.approvedAt||null,createdAt:r.c||null,assignedTable:v.assignedTable||null};}); items.sort((a,b)=>(b.id||0)-(a.id||0)); res.json(items); }));
app.get('/site/schools/unique',wrap(async(req,res)=>{ const l=db.list('site:visitor:'); const s=new Set(); for(const r of l){ const sc=r.v&&r.v.school?String(r.v.school):''; if(sc)s.add(sc);} res.json([...s]); }));
app.get('/site/stats/dashboard',wrap(async(req,res)=>{ const l=db.list('site:visitor:'); const n=new Set(),sc=new Set(); let suc=0,wait=0; for(const r of l){ const v=r.v||{}; if(v.name)n.add(String(v.name).toLowerCase()); if(v.school)sc.add(String(v.school).toLowerCase()); if(v.status==='success')suc++; else if(v.status==='waiting')wait++; } res.json({visitor_count:n.size,success_count:suc,waiting_count:wait,school_count:sc.size}); }));
app.get('/site/rankings/students',wrap(async(req,res)=>{ const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; const ref=String(v.referrer||'').toLowerCase(); if(!ref)continue; if(!m.has(ref))m.set(ref,{referrer:v.referrer,names:new Set(),success:0}); const x=m.get(ref); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({referrer:x.referrer,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.get('/site/rankings/schools',wrap(async(req,res)=>{ const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; const sch=String(v.school||'').toLowerCase(); if(!sch)continue; if(!m.has(sch))m.set(sch,{school:v.school,names:new Set(),success:0}); const x=m.get(sch); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({school:x.school,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.get('/site/rankings/in-school',wrap(async(req,res)=>{ const school=ss(req.query.school||'',200).toLowerCase(); if(!school)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()!==school)continue; const ref=String(v.referrer||'').toLowerCase(); if(!ref)continue; if(!m.has(ref))m.set(ref,{referrer:v.referrer,names:new Set(),success:0}); const x=m.get(ref); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({referrer:x.referrer,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.post('/site/rankings/in-school',wrap(async(req,res)=>{ const school=ss((req.body&&req.body.school)||req.query.school||'',200).toLowerCase(); if(!school)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()!==school)continue; const ref=String(v.referrer||'').toLowerCase(); if(!ref)continue; if(!m.has(ref))m.set(ref,{referrer:v.referrer,names:new Set(),success:0}); const x=m.get(ref); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({referrer:x.referrer,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.get('/site/classes',wrap(async(req,res)=>{ const school=ss(req.query.school||'',200).toLowerCase(); if(!school)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const s=new Set(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()===school&&v.class){ const c=String(v.class).trim(); if(c)s.add(c);} } res.json([...s]); }));
app.post('/site/classes',wrap(async(req,res)=>{ const school=ss((req.body&&req.body.school)||req.query.school||'',200).toLowerCase(); if(!school)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const s=new Set(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()===school&&v.class){ const c=String(v.class).trim(); if(c)s.add(c);} } res.json([...s]); }));
app.get('/site/rankings/in-class',wrap(async(req,res)=>{ const school=ss(req.query.school||'',200).toLowerCase(), cls=ss(req.query.class||'',50); if(!school||!cls)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()!==school)continue; if(String(v.class||'').trim()!==cls)continue; const ref=String(v.referrer||'').toLowerCase(); if(!ref)continue; if(!m.has(ref))m.set(ref,{referrer:v.referrer,names:new Set(),success:0}); const x=m.get(ref); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({referrer:x.referrer,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.post('/site/rankings/in-class',wrap(async(req,res)=>{ const school=ss((req.body&&req.body.school)||req.query.school||'',200).toLowerCase(), cls=ss((req.body&&req.body.class)||req.query.class||'',50); if(!school||!cls)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()!==school)continue; if(String(v.class||'').trim()!==cls)continue; const ref=String(v.referrer||'').toLowerCase(); if(!ref)continue; if(!m.has(ref))m.set(ref,{referrer:v.referrer,names:new Set(),success:0}); const x=m.get(ref); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({referrer:x.referrer,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.get('/site/rankings/between-classes',wrap(async(req,res)=>{ const school=ss(req.query.school||'',200).toLowerCase(); if(!school)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()!==school)continue; const cls=String(v.class||'').trim(); if(!cls)continue; if(!m.has(cls))m.set(cls,{class:cls,names:new Set(),success:0}); const x=m.get(cls); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({class:x.class,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.post('/site/rankings/between-classes',wrap(async(req,res)=>{ const school=ss((req.body&&req.body.school)||req.query.school||'',200).toLowerCase(); if(!school)return res.status(400).json({ok:false}); const l=db.list('site:visitor:'); const m=new Map(); for(const r of l){ const v=r.v||{}; if(String(v.school||'').toLowerCase()!==school)continue; const cls=String(v.class||'').trim(); if(!cls)continue; if(!m.has(cls))m.set(cls,{class:cls,names:new Set(),success:0}); const x=m.get(cls); if(v.name)x.names.add(String(v.name).toLowerCase()); if(v.status==='success')x.success++; } const out=[]; for(const x of m.values()) out.push({class:x.class,count:x.names.size,success_count:x.success}); out.sort((a,b)=>b.success_count-a.success_count||b.count-a.count); res.json(out); }));
app.post('/site/visitor',wrap(async(req,res)=>{
  const b=req.body||{}; const name=ss(b.name,100),school=ss(b.school,120),ref=ss(b.referrer,100),cls=ss(b.class,30),note=ss(b.note,300);
  if(!name||!school||!ref) return res.status(400).json({ok:false,error:'Ad, okul ve aracı öğrenci gerekli'});
  const out=await regLock(async()=>{
    let maxId=0; for(const r of db.list('site:visitor:')){ const idn=toInt(r.v&&r.v.id); if(idn>maxId) maxId=idn; }
    const id=maxId+1; let table=null; const want=cleanTable(b.table);
    if(want&&isOpen(want)){ const t=db.read(tkey(want)); if(t) table=t.v.name; }   // kayıt ekibi elle masa seçtiyse
    if(!table) table=pickTable();                                                    // yoksa açık masalara eşit dağıt
    const v={id,name,school,referrer:ref,class:cls,status:'waiting',note,ip:req.ip||null,tableNo:null,approvedBy:null,assignedAt:null,approvedAt:null,assignedTable:table,routedAt:table?Date.now():null};
    const rec=await db.create(sk(id),v); if(!rec) throw new Error('Kayıt oluşturulamadı');
    return {id,table};
  });
  res.status(201).json({ok:true,id:out.id,table:out.table});
}));
app.post('/site/visitor/status',wrap(async(req,res)=>{ const b=req.body||{}; const id=toInt(b.id); const st=ns(b.status); if(isNaN(id))return res.status(400).json({ok:false}); const k=sk(id); const it=db.read(k); if(!it)return res.status(404).json({ok:false}); const old=it.v||{}; const v={...old,id,status:st};
  if(st==='success'||st==='failure'){ if(old.status!==st){ v.approvedAt=Date.now(); v.approvedBy=req.session.role; if(req.session.table) v.tableNo=req.session.table; } }
  else if(st==='waiting'){ v.approvedAt=null; v.approvedBy=null; v.tableNo=null; v.assignedAt=null; }
  const r=await db.update(k,v,false); if(!r)return res.status(500).json({ok:false}); res.json({ok:true}); }));
app.post('/site/control/assign',wrap(async(req,res)=>{ const b=req.body||{}; const id=toInt(b.id); if(isNaN(id))return res.status(400).json({ok:false}); const tn=req.session.table||(req.session.role==='yonetim'?cleanTable(b.tableNo):''); if(!tn)return res.status(400).json({ok:false,error:'Önce masa seçin'}); const k=sk(id); const it=db.read(k); if(!it)return res.status(404).json({ok:false}); const now=Date.now(); const v={...(it.v||{}),id,status:'success',tableNo:tn,approvedBy:req.session.role,assignedAt:(it.v&&it.v.assignedAt)?it.v.assignedAt:now,approvedAt:now}; const r=await db.update(k,v,false); if(!r)return res.status(500).json({ok:false}); res.json({ok:true}); }));
app.post('/site/visitor/delete',wrap(async(req,res)=>{ const b=req.body||{}; const id=toInt(b.id); if(isNaN(id))return res.status(400).json({ok:false}); const rm=await db.remove(sk(id)); if(!rm)return res.status(404).json({ok:false}); res.json({ok:true}); }));
app.get('/site/export/csv',wrap(async(req,res)=>{ const l=db.list('site:visitor:'); const items=l.map(r=>r.v||{}).sort((a,b)=>(a.id||0)-(b.id||0)); let csv='id,name,school,referrer,class,status,note,ip,tableNo,approvedBy,assignedAt,approvedAt\n'; for(const v of items){ const row=[v.id||'',v.name||'',v.school||'',v.referrer||'',v.class||'',v.status||'',v.note||'',v.ip||'',v.tableNo||'',v.approvedBy||'',v.assignedAt||'',v.approvedAt||''].map(x=>{const s=String(x).replace(/"/g,'""'); if(s.includes(',')||s.includes('"')||s.includes('\n')) return '"'+s+'"'; return s;}); csv+=row.join(',')+'\n'; } res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="ziyaretciler.csv"'); res.send(csv); }));
// ---- Açık masa takibi + eşit dağıtımlı otomatik yönlendirme ----
const OPEN_MS=60000;                 // kontrol ekibinden 60 sn haber gelmezse masa "kapalı" sayılır
const tableSeen=new Map();           // lc(masa) -> son görülme zamanı
const isOpen=n=>{ const t=tableSeen.get(lc(n)); return !!t&&Date.now()-t<OPEN_MS; };
const openTables=()=>db.list('site:table:').map(r=>r.v.name).filter(isOpen);
let regChain=Promise.resolve(); function regLock(fn){ const p=regChain.then(fn); regChain=p.catch(()=>{}); return p; }
// En az bekleyeni olan açık masa; eşitlikte toplam yönlendirilen az olan; hâlâ eşitse rastgele.
function pickTable(){
  const open=openTables(); if(!open.length) return null;
  const waiting=new Map(open.map(n=>[lc(n),0])), total=new Map(open.map(n=>[lc(n),0]));
  for(const r of db.list('site:visitor:')){ const v=r.v||{}; const a=v.assignedTable?lc(v.assignedTable):null; if(!a||!total.has(a)) continue; total.set(a,total.get(a)+1); if(v.status==='waiting') waiting.set(a,waiting.get(a)+1); }
  let best=open; const mw=Math.min(...best.map(n=>waiting.get(lc(n)))); best=best.filter(n=>waiting.get(lc(n))===mw);
  const mt=Math.min(...best.map(n=>total.get(lc(n)))); best=best.filter(n=>total.get(lc(n))===mt);
  return best[Math.floor(Math.random()*best.length)];
}
// Masası olmayan ya da masası kapanan bekleyenleri açık masalara dağıt
let rebalancing=false;
async function rebalance(){
  if(rebalancing||!ready) return; rebalancing=true;
  try{ await regLock(async()=>{
    const open=openTables(); if(!open.length) return; const openSet=new Set(open.map(lc));
    const waiting=db.list('site:visitor:').filter(r=>r.v&&r.v.status==='waiting').sort((a,b)=>(a.v.id||0)-(b.v.id||0));
    for(const r of waiting){ if(r.v.assignedTable&&openSet.has(lc(r.v.assignedTable))) continue; const t=pickTable(); if(!t) break; await db.update(r.k,{...r.v,assignedTable:t,routedAt:Date.now()},false); }
  }); }catch(e){ console.error('rebalance:',e.message); } finally{ rebalancing=false; }
}
setInterval(rebalance,4000);

// ---- Masalar ----
const lc=s=>String(s||'').toLocaleLowerCase('tr-TR');
function cleanTable(v){return ss(v,30).replace(/\s+/g,' ');}
function tkey(n){return 'site:table:'+lc(n);}
app.get('/site/tables',(req,res)=>{
  const done=new Map(),waiting=new Map(),assigned=new Map(); const inc=(m,k)=>m.set(k,(m.get(k)||0)+1);
  for(const r of db.list('site:visitor:')){ const v=r.v||{};
    if(v.status==='success'&&v.tableNo) inc(done,lc(v.tableNo));
    if(v.assignedTable){ inc(assigned,lc(v.assignedTable)); if(v.status==='waiting') inc(waiting,lc(v.assignedTable)); } }
  const items=db.list('site:table:').map(r=>{ const k=lc(r.v.name); return {name:r.v.name,done:done.get(k)||0,waiting:waiting.get(k)||0,assigned:assigned.get(k)||0,open:isOpen(r.v.name)}; });
  items.sort((a,b)=>a.name.localeCompare(b.name,'tr',{numeric:true}));
  res.json(items);
});
app.post('/site/tables',wrap(async(req,res)=>{
  const name=cleanTable((req.body||{}).name); if(!name) return res.status(400).json({ok:false,error:'Masa adı gerekli'});
  const k=tkey(name); const ex=db.read(k); if(ex) return res.json({ok:true,name:ex.v.name,existed:true});
  const rec=await db.create(k,{name,createdBy:req.session.role,createdAt:Date.now()});
  if(!rec){ const e2=db.read(k); return res.json({ok:true,name:e2?e2.v.name:name,existed:true}); }
  res.status(201).json({ok:true,name});
}));
app.post('/site/tables/delete',wrap(async(req,res)=>{
  const name=cleanTable((req.body||{}).name); if(!name) return res.status(400).json({ok:false});
  const rm=await db.remove(tkey(name)); if(!rm) return res.status(404).json({ok:false}); res.json({ok:true});
}));
app.post('/site/control/table',(req,res)=>{
  const name=cleanTable((req.body||{}).name);
  if(!name){ if(req.session.table) tableSeen.delete(lc(req.session.table)); req.session.table=null; return res.json({ok:true,table:null}); }
  const t=db.read(tkey(name)); if(!t) return res.status(404).json({ok:false,error:'Masa bulunamadı'});
  if(req.session.table&&lc(req.session.table)!==lc(t.v.name)) tableSeen.delete(lc(req.session.table));
  req.session.table=t.v.name; tableSeen.set(lc(t.v.name),Date.now()); res.json({ok:true,table:t.v.name});
});

// ---- Yönetim istatistikleri ----
const hourFmt=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',hourCycle:'h23'});
app.get('/site/stats/overview',(req,res)=>{
  const recs=db.list('site:visitor:'); const now=Date.now();
  let success=0,waiting=0,failure=0,waitSum=0,waitN=0,longest=0;
  const tables=new Map(); for(const t of db.list('site:table:')) tables.set(lc(t.v.name),{table:t.v.name,success:0,failure:0,lastAt:0,assigned:0});
  const hours=new Map(); const hour=(ts,f)=>{ if(!ts)return; const h=hourFmt.format(new Date(ts)); if(!hours.has(h)) hours.set(h,{hour:h+':00',registered:0,approved:0}); hours.get(h)[f]++; };
  const schools=new Map(),refs=new Map();
  const tally=(m,name,status)=>{ if(!name)return; const k=lc(name); if(!m.has(k)) m.set(k,{name,count:0,success_count:0}); const x=m.get(k); x.count++; if(status==='success') x.success_count++; };
  for(const r of recs){
    const v=r.v||{}; hour(r.c,'registered');
    if(v.status==='success'){ success++; hour(v.approvedAt,'approved'); if(v.approvedAt&&r.c){ waitSum+=Math.max(0,v.approvedAt-r.c); waitN++; } }
    else if(v.status==='failure') failure++;
    else { waiting++; if(r.c) longest=Math.max(longest,now-r.c); }
    if((v.status==='success'||v.status==='failure')&&v.tableNo){
      const key=lc(v.tableNo); if(!tables.has(key)) tables.set(key,{table:v.tableNo,success:0,failure:0,lastAt:0,assigned:0});
      const t=tables.get(key); t[v.status]++; t.lastAt=Math.max(t.lastAt,v.approvedAt||0);
    }
    if(v.assignedTable){ const k2=lc(v.assignedTable); if(!tables.has(k2)) tables.set(k2,{table:v.assignedTable,success:0,failure:0,lastAt:0,assigned:0}); tables.get(k2).assigned++; }
    tally(schools,v.school,v.status); tally(refs,v.referrer,v.status);
  }
  const top=m=>[...m.values()].sort((a,b)=>b.success_count-a.success_count||b.count-a.count).slice(0,5);
  const total=recs.length;
  res.json({
    total,success,waiting,failure,
    approvalRate:total?Math.round(success/total*100):0,
    avgMinutes:waitN?Math.round(waitSum/waitN/6000)/10:null,
    longestWaitMin:Math.round(longest/60000),
    tables:[...tables.values()].map(t=>({...t,open:isOpen(t.table)})).sort((a,b)=>a.table.localeCompare(b.table,'tr',{numeric:true})),
    hourly:[...hours.values()].sort((a,b)=>a.hour.localeCompare(b.hour)),
    topSchools:top(schools),topReferrers:top(refs),
    generatedAt:now
  });
});
// ---- Okul / sınıf listeleri: her okul = ayrı Discord kanalı, kritik olmayan bilgiler DÜZ METİN ----
// Kanal adı okulun sadeleştirilmiş hâli, kanal konusu (topic) okulun tam adı, her sınıf "sınıf: 11-A" mesajı.
// (Öğrenci/ziyaretçi bilgileri bunlara YAZILMAZ; onlar şifreli veritabanında kalır.)
const CAT_PREFIX='okullar';
const schoolIdx=new Map(); // lc(okul) -> {name, channel, classes:Set}
const TRMAP={'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u'};
function slug(n){ return lc(n).replace(/[çğıöşü]/g,c=>TRMAP[c]).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'okul'; }
const oneLine=(v,m)=>ss(v,m).replace(/\s+/g,' ');
async function schoolCategories(all){ return [...all.values()].filter(c=>c&&c.type===ChannelType.GuildCategory&&lc(c.name).startsWith(CAT_PREFIX)); }
async function loadSchools(){
  const all=await channel.guild.channels.fetch();
  const ids=new Set((await schoolCategories(all)).map(c=>c.id));
  for(const ch of all.values()){
    if(!ch||ch.type!==ChannelType.GuildText||!ids.has(ch.parentId)) continue;
    const name=(ch.topic||'').trim(); if(!name) continue;
    const classes=new Set(); let before;
    while(true){ const b=await ch.messages.fetch({limit:100,before}); if(b.size===0) break; for(const m of b.values()){ const mm=/^sınıf:\s*(.+)$/.exec((m.content||'').trim()); if(mm) classes.add(mm[1].trim()); } before=b.last().id; if(b.size<100) break; }
    schoolIdx.set(lc(name),{name,channel:ch,classes});
  }
}
async function pickCategory(){
  const guild=channel.guild; const all=await guild.channels.fetch(); const cats=await schoolCategories(all);
  cats.sort((a,b)=>a.name.localeCompare(b.name,'tr',{numeric:true}));
  for(const c of cats){ const n=[...all.values()].filter(x=>x&&x.parentId===c.id).length; if(n<50) return c; } // Discord: kategori başına en fazla 50 kanal
  return guild.channels.create({name:cats.length?CAT_PREFIX+' '+(cats.length+1):CAT_PREFIX,type:ChannelType.GuildCategory});
}
function addSchool(name){ return withLock(async()=>{
  const k=lc(name); if(schoolIdx.has(k)) return schoolIdx.get(k);
  const cat=await pickCategory(); const base=slug(name); let n=base,i=2; const used=new Set([...schoolIdx.values()].map(s=>s.channel.name));
  while(used.has(n)) n=base+'-'+(i++);
  const ch=await channel.guild.channels.create({name:n,type:ChannelType.GuildText,parent:cat.id,topic:name});
  const s={name,channel:ch,classes:new Set()}; schoolIdx.set(k,s); return s;
}); }
function addClass(school,cls){ return withLock(async()=>{
  const s=schoolIdx.get(lc(school)); if(!s) return null;
  if(![...s.classes].some(c=>lc(c)===lc(cls))){ await s.channel.send({content:'sınıf: '+cls}); s.classes.add(cls); }
  return s;
}); }
app.get('/site/lists',(req,res)=>{
  const list=[...schoolIdx.values()].map(s=>({name:s.name,classes:[...s.classes].sort((a,b)=>a.localeCompare(b,'tr',{numeric:true}))}));
  list.sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  const referrers=db.list('site:referrer:').map(r=>r.v.name).sort((a,b)=>a.localeCompare(b,'tr'));
  res.json({ok:true,schools:list,referrers});
});
app.post('/site/lists/school',wrap(async(req,res)=>{
  const name=oneLine((req.body||{}).name,100); if(!name) return res.status(400).json({ok:false,error:'Okul adı gerekli'});
  const s=await addSchool(name); res.status(201).json({ok:true,name:s.name});
}));
app.post('/site/lists/class',wrap(async(req,res)=>{
  const b=req.body||{}; const school=oneLine(b.school,100), cls=oneLine(b.class,30);
  if(!school||!cls) return res.status(400).json({ok:false,error:'Okul ve sınıf gerekli'});
  const s=await addClass(school,cls); if(!s) return res.status(404).json({ok:false,error:'Okul bulunamadı'});
  res.status(201).json({ok:true});
}));
// ---- Aracı öğrenciler: kişisel veri olduğu için düz metin DEĞİL, şifreli veritabanı kanalına (CHANNEL_ID) yazılır ----
const rkey=n=>'site:referrer:'+lc(n);
app.post('/site/referrers',wrap(async(req,res)=>{
  const name=oneLine((req.body||{}).name,100); if(!name) return res.status(400).json({ok:false,error:'Ad Soyad gerekli'});
  const k=rkey(name); const ex=db.read(k); if(ex) return res.json({ok:true,name:ex.v.name,existed:true});
  const rec=await db.create(k,{name,createdBy:req.session.role,createdAt:Date.now()});
  if(!rec){ const e2=db.read(k); return res.json({ok:true,name:e2?e2.v.name:name,existed:true}); }
  res.status(201).json({ok:true,name});
}));
app.use((err,req,res,next)=>{
  console.error(err.message);
  const msg=err.code===50013?'Botun "Kanalları Yönet" izni yok (Discord sunucu ayarlarından verin)':'Sunucu hatası: '+err.message;
  res.status(500).json({ok:false,error:msg});
});
app.listen(PORT,()=>console.log('http://localhost:'+PORT+'/login.html'));
client.once('clientReady',async()=>{ try{ channel=await client.channels.fetch(CHANNEL_ID); if(!channel||!channel.isTextBased()) throw new Error('kanal'); await loadAll(); try{ await loadSchools(); if(!schoolIdx.size) await addSchool('Sincan Anadolu Lisesi'); console.log('okul kanalları:',schoolIdx.size); }catch(e){ console.error('okul kanalları yüklenemedi:',e.message); } ready=true; console.log('ready'); }catch(e){ console.error(e.message); process.exit(1);} });
client.login(DISCORD_TOKEN);


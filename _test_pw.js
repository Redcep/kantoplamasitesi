const express=require('express'),session=require('express-session'),cookieParser=require('cookie-parser');
const VISITOR_DELETE_PASSWORD='mühimdeğilamadursun';
const ROLE_PW={kayit:'acılsusamkaydet@3',kontrol:'Kontrol_24',yonetim:'ogretmen+pardus!'};
const app=express(); app.use(express.json()); app.use(cookieParser());
app.use(session({secret:'x',resave:false,saveUninitialized:false}));
app.post('/site/login',(req,res)=>{const b=req.body||{}; if(String(b.password||'')!==ROLE_PW[b.role])return res.status(401).json({ok:false,error:'Geçersiz şifre'}); req.session.authenticated=true; req.session.role=b.role; res.json({ok:true,role:b.role});});
app.post('/site/verify-password',(req,res)=>{ if(!(req.session&&req.session.authenticated))return res.status(401).json({ok:false}); if(String((req.body||{}).password||'')!==VISITOR_DELETE_PASSWORD)return res.status(401).json({ok:false,error:'Geçersiz şifre'}); res.json({ok:true});});
app.post('/site/visitor/delete',(req,res)=>{ const b=req.body||{}; if(req.session.role!=='yonetim'){ const pw=String(b.password||''); if(!pw)return res.status(403).json({ok:false,error:'Silme için şifre gerekli',needPassword:true}); if(pw!==VISITOR_DELETE_PASSWORD)return res.status(401).json({ok:false,error:'Geçersiz şifre',needPassword:true}); } res.json({ok:true,deleted:b.id,by:req.session.role});});
app.listen(3100,()=>console.log('test ready'));

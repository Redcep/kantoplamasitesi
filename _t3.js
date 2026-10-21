require('dotenv').config();
const express=require('express'),session=require('express-session'),cookieParser=require('cookie-parser');
const VDP=process.env.VISITOR_DELETE_PASSWORD;
const app=express(); app.use(express.json()); app.use(cookieParser());
app.use(session({secret:'x',resave:false,saveUninitialized:false}));
app.get('/site/login-as-yonetim',(req,res)=>{ req.session.authenticated=true; req.session.role='yonetim'; res.json({ok:true}); });
app.post('/site/visitor/delete',(req,res)=>{ const b=req.body||{}; if(req.session.role!=='yonetim'){ if(String(b.password||'')!==VDP)return res.status(401).json({ok:false}); } res.json({ok:true,deleted:b.id,by:req.session.role});});
app.listen(3102,()=>console.log('hazir'));

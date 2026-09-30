const express=require('express');
const path=require('path');const fs=require('fs');const crypto=require('crypto');
const helmet=require('helmet');const rateLimit=require('express-rate-limit');const mysql=require('mysql2/promise');
const multer=require('multer');
const app=express();
app.set('trust proxy', 1);
const PORT=Number(process.env.PORT||3000);const ROOT=__dirname;const UPLOAD=path.join(ROOT,'public','uploads');fs.mkdirSync(UPLOAD,{recursive:true});
const DB={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'1234567',password:process.env.DB_PASSWORD||'1234567',database:process.env.DB_NAME||'sanzhong_wall'};
let pool;
const categories=new Set(['校园日常','学习交流','失物招领','表白墙','吐槽建议','公告']);
const IMG=new Map([['image/jpeg','jpg'],['image/png','png'],['image/gif','gif'],['image/webp','webp']]);
const MAX=50*1024*1024;const UPLOAD_WINDOW=5*60*1000;const CHAT_TTL=20*60*1000;
function clean(v,max){return String(v??'').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,max)}
function json(res,code,data){res.status(code).json(data)}
function randomToken(n=32){return crypto.randomBytes(Math.ceil(n/2)).toString('hex').slice(0,n)}
function randomCode(n=18){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let s='';const b=crypto.randomBytes(n);for(let i=0;i<n;i++)s+=chars[b[i]%chars.length];return s}
function hashPassword(p){const salt=crypto.randomBytes(16);const hash=crypto.scryptSync(String(p),salt,64);return salt.toString('hex')+':'+hash.toString('hex')}
function verifyPassword(p,stored){try{const [a,b]=stored.split(':');const h=crypto.scryptSync(String(p),Buffer.from(a,'hex'),64);return crypto.timingSafeEqual(h,Buffer.from(b,'hex'))}catch{return false}}
function addDuration(date,amount,unit){const d=new Date(date);amount=Number(amount)||0;if(unit==='minute')d.setMinutes(d.getMinutes()+amount);else if(unit==='hour')d.setHours(d.getHours()+amount);else if(unit==='day')d.setDate(d.getDate()+amount);else if(unit==='week')d.setDate(d.getDate()+amount*7);else if(unit==='month')d.setMonth(d.getMonth()+amount);else if(unit==='year')d.setFullYear(d.getFullYear()+amount);else return null;return d}
function cookie(req,name){const h=req.headers.cookie||'';const m=h.match(new RegExp('(?:^|; )'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}
function setCookie(res,name,value,maxAge){res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`)}

/* ===== multer 上传配置 ===== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD),
  filename: (req, file, cb) => {
    const ext = IMG.get(file.mimetype.toLowerCase()) || 'jpg';
    cb(null, Date.now() + '-' + randomToken(12) + '.' + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX },
  fileFilter: (req, file, cb) => {
    const ext = IMG.get(file.mimetype.toLowerCase());
    if (!ext) return cb(new Error('仅支持 JPG / JPEG / PNG / GIF / WEBP'));
    cb(null, true);
  }
});
/* ========================== */

async function dbInit(){
 const adminConn=await mysql.createConnection({host:DB.host,port:DB.port,user:DB.user,password:DB.password});
 await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB.database.replace(/`/g,'')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await adminConn.end();
 pool=mysql.createPool({...DB,waitForConnections:true,connectionLimit:10,charset:'utf8mb4'});
 const sql=[
 `CREATE TABLE IF NOT EXISTS posts(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,content TEXT NOT NULL,is_anonymous TINYINT(1) NOT NULL DEFAULT 1,nickname VARCHAR(50),category VARCHAR(30) NOT NULL DEFAULT '校园日常',image_url VARCHAR(255),likes INT UNSIGNED NOT NULL DEFAULT 0,status ENUM('published','hidden') NOT NULL DEFAULT 'published',device_id VARCHAR(128) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY idx_status_id(status,id),KEY idx_device_id(device_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS replies(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,post_id BIGINT UNSIGNED NOT NULL,content TEXT NOT NULL,is_anonymous TINYINT(1) NOT NULL DEFAULT 1,nickname VARCHAR(50),image_url VARCHAR(255),device_id VARCHAR(128) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY idx_post(post_id),KEY idx_device_id(device_id),CONSTRAINT fk_reply_post FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS upload_logs(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,device_id VARCHAR(128),ip VARCHAR(64),created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY idx_device_time(device_id,created_at),KEY idx_ip_time(ip,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS chat_messages(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,content TEXT,image_url VARCHAR(255),nickname VARCHAR(50),is_anonymous TINYINT(1) NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS chat_state(id TINYINT UNSIGNED NOT NULL PRIMARY KEY,started_at DATETIME NULL,last_message_at DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS card_keys(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,code VARCHAR(64) NOT NULL UNIQUE,duration_amount INT NULL,duration_unit VARCHAR(20) NULL,starts_at DATETIME NULL,expires_at DATETIME NULL,status ENUM('unused','active','expired','revoked') NOT NULL DEFAULT 'unused',bound_device_id VARCHAR(128) NULL UNIQUE,bound_at DATETIME NULL,created_by BIGINT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY idx_status(status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS device_cards(device_id VARCHAR(128) NOT NULL PRIMARY KEY,card_id BIGINT UNSIGNED NOT NULL UNIQUE,bound_at DATETIME NOT NULL,FOREIGN KEY(card_id) REFERENCES card_keys(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS admins(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,username VARCHAR(64) NOT NULL UNIQUE,password_hash VARCHAR(200) NOT NULL,role ENUM('admin','super') NOT NULL DEFAULT 'admin',can_generate_cards TINYINT(1) NOT NULL DEFAULT 0,expires_at DATETIME NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS admin_sessions(token VARCHAR(128) NOT NULL PRIMARY KEY,admin_id BIGINT UNSIGNED NOT NULL,expires_at DATETIME NOT NULL,FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS admin_actions(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,admin_id BIGINT,action VARCHAR(80),target_id BIGINT NULL,detail TEXT,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS notifications(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,device_id VARCHAR(128) NOT NULL,post_id INT NOT NULL,reply_id BIGINT UNSIGNED NOT NULL,reply_preview VARCHAR(200) NOT NULL,is_read TINYINT(1) NOT NULL DEFAULT 0,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY idx_device_read(device_id,is_read,created_at),CONSTRAINT fk_notification_post FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,CONSTRAINT fk_notification_reply FOREIGN KEY(reply_id) REFERENCES replies(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS site_settings(k VARCHAR(80) PRIMARY KEY,v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 ];for(const q of sql)await pool.query(q);
 const [cols]=await pool.query(`SHOW COLUMNS FROM posts LIKE 'image_url'`);if(!cols.length)await pool.query(`ALTER TABLE posts ADD image_url VARCHAR(255) NULL`);
 const [pdevice]=await pool.query(`SHOW COLUMNS FROM posts LIKE 'device_id'`);if(!pdevice.length)await pool.query(`ALTER TABLE posts ADD device_id VARCHAR(128) NULL, ADD KEY idx_device_id(device_id)`);
 const [rcols]=await pool.query(`SHOW COLUMNS FROM replies LIKE 'image_url'`);if(!rcols.length)await pool.query(`ALTER TABLE replies ADD image_url VARCHAR(255) NULL`);
 const [rdevice]=await pool.query(`SHOW COLUMNS FROM replies LIKE 'device_id'`);if(!rdevice.length)await pool.query(`ALTER TABLE replies ADD device_id VARCHAR(128) NULL, ADD KEY idx_device_id(device_id)`);
 const [admins]=await pool.query(`SELECT id FROM admins WHERE username='chaoji1' LIMIT 1`);if(!admins.length)await pool.query(`INSERT INTO admins(username,password_hash,role,can_generate_cards) VALUES(?,?, 'super',1)`,['chaoji1',hashPassword('chaoji1')]);else await pool.query(`UPDATE admins SET password_hash=?, role='super', can_generate_cards=1, expires_at=NULL WHERE username='chaoji1'`,[hashPassword('chaoji1')]);
}
async function auth(req,res,next){const t=cookie(req,'admin_session');if(!t)return json(res,401,{ok:false,message:'请登录后台'});const [r]=await pool.execute(`SELECT a.* FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token=? AND s.expires_at>NOW() LIMIT 1`,[t]);if(!r.length)return json(res,401,{ok:false,message:'后台登录已过期'});if(r[0].expires_at && new Date(r[0].expires_at)<new Date())return json(res,403,{ok:false,message:'管理员账号已过期'});req.admin=r[0];next()}
function superOnly(req,res,next){if(req.admin.role!=='super')return json(res,403,{ok:false,message:'仅超级管理员可执行此操作'});next()}
async function cardGate(req,res,next){if(req.path.startsWith('/admin')||req.path==='/api/admin'||req.path.startsWith('/api/admin/')||req.path==='/super.html'||req.path==='/admin.html')return next();if(req.path==='/api/health'||req.path==='/api/card/status'||req.path==='/api/card/bind'||req.path.startsWith('/assets/')||req.path.startsWith('/uploads/')||req.path==='/card.html')return next();const device=cookie(req,'device_id');if(!device)return req.path.startsWith('/api/')?json(res,401,{ok:false,needCard:true,message:'需要卡密'}):res.redirect('/card.html');const [r]=await pool.execute(`SELECT c.* FROM device_cards d JOIN card_keys c ON c.id=d.card_id WHERE d.device_id=? LIMIT 1`,[device]);if(!r.length||r[0].status==='revoked'||(r[0].expires_at&&new Date(r[0].expires_at)<new Date()))return req.path.startsWith('/api/')?json(res,401,{ok:false,needCard:true,message:'卡密已失效'}):res.redirect('/card.html');next()}
async function uploadLogAllowed(req){const device=cookie(req,'device_id')||req.ip;const [r]=await pool.execute(`SELECT id FROM upload_logs WHERE (device_id=? OR ip=?) AND created_at>DATE_SUB(NOW(),INTERVAL 5 MINUTE) LIMIT 1`,[device,req.ip]);if(r.length)return false;await pool.execute(`INSERT INTO upload_logs(device_id,ip) VALUES(?,?)`,[device,req.ip]);return true}
async function deleteFile(url){if(!url)return;const p=path.join(ROOT,'public',url.replace(/^\//,''));if(p.startsWith(UPLOAD) && fs.existsSync(p))try{fs.unlinkSync(p)}catch{}}

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:false,limit:'2mb'}));
app.use(express.static(path.join(ROOT,'public')));
app.use(async(req,res,next)=>{try{if(pool)await cardGate(req,res,next);else next()}catch(e){console.error(e);json(res,500,{ok:false,message:'访问检查失败'})}});

const limiter=rateLimit({windowMs:60000,max:30,standardHeaders:true,legacyHeaders:false});
app.get('/api/card/status',async(req,res)=>{try{const d=cookie(req,'device_id');if(!d)return json(res,200,{ok:true,bound:false});const [r]=await pool.execute(`SELECT c.code,c.expires_at,c.status FROM device_cards dc JOIN card_keys c ON c.id=dc.card_id WHERE dc.device_id=?`,[d]);if(!r.length)return json(res,200,{ok:true,bound:false});const expired=r[0].status==='revoked'||(r[0].expires_at&&new Date(r[0].expires_at)<new Date());if(expired){await pool.execute(`UPDATE card_keys SET status='expired' WHERE code=? AND status<>'revoked'`,[r[0].code]);return json(res,200,{ok:true,bound:false,expired:true})}json(res,200,{ok:true,bound:true,code:r[0].code,expiresAt:r[0].expires_at})}catch(e){json(res,500,{ok:false,message:'数据库错误'})}});
app.post('/api/card/bind',limiter,async(req,res)=>{try{let d=cookie(req,'device_id');if(!d){d='dev_'+randomToken(40);setCookie(res,'device_id',d,60*60*24*365*3)}const code=clean(req.body.code,64).toUpperCase();if(!code)return json(res,422,{ok:false,message:'请输入卡密'});const [mine]=await pool.execute(`SELECT c.* FROM device_cards dc JOIN card_keys c ON c.id=dc.card_id WHERE dc.device_id=?`,[d]);if(mine.length)return json(res,409,{ok:false,message:'此浏览器已经绑定卡密'});const [r]=await pool.execute(`SELECT * FROM card_keys WHERE code=? LIMIT 1`,[code]);if(!r.length)return json(res,404,{ok:false,message:'卡密不存在'});const c=r[0];if(c.status==='revoked')return json(res,403,{ok:false,message:'卡密已被删除或撤销'});if(c.bound_device_id)return json(res,409,{ok:false,message:'该卡密已绑定其他浏览器'});let exp=c.expires_at;if(c.duration_amount&&c.duration_unit&&!exp)exp=addDuration(new Date(),c.duration_amount,c.duration_unit);await pool.execute(`UPDATE card_keys SET status='active',bound_device_id=?,bound_at=NOW(),starts_at=NOW(),expires_at=? WHERE id=? AND bound_device_id IS NULL`,[d,exp,c.id]);await pool.execute(`INSERT INTO device_cards(device_id,card_id,bound_at) VALUES(?,?,NOW())`,[d,c.id]);json(res,200,{ok:true,expiresAt:exp})}catch(e){console.error(e);json(res,500,{ok:false,message:'绑定失败'})}});
app.get('/api/posts',async(req,res)=>{try{const category=clean(req.query.category,30);let q=`SELECT id,content,is_anonymous,nickname,category,image_url,likes,created_at,(SELECT COUNT(*) FROM replies r WHERE r.post_id=posts.id) reply_count FROM posts WHERE status='published'`;const p=[];if(category&&category!=='全部'&&categories.has(category)){q+=' AND category=?';p.push(category)}q+=' ORDER BY id DESC LIMIT 50';const [r]=await pool.execute(q,p);json(res,200,{ok:true,posts:r})}catch(e){console.error(e);json(res,500,{ok:false,message:'数据库错误'})}});
app.get('/api/posts/search',async(req,res)=>{try{const keyword=clean(req.query.keyword,200),range=clean(req.query.range,10)||'all',category=clean(req.query.category,30);let q=`SELECT id,content,is_anonymous,nickname,category,image_url,likes,created_at,(SELECT COUNT(*) FROM replies r WHERE r.post_id=posts.id) reply_count FROM posts WHERE status='published'`;const p=[];if(keyword){q+=' AND content LIKE ?';p.push('%'+keyword+'%')}if(range==='today')q+=' AND created_at>=CURDATE()';else if(range==='3d')q+=' AND created_at>=DATE_SUB(NOW(),INTERVAL 3 DAY)';else if(range==='7d')q+=' AND created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)';if(category&&category!=='全部'&&categories.has(category)){q+=' AND category=?';p.push(category)}q+=' ORDER BY id DESC LIMIT 50';const [r]=await pool.execute(q,p);json(res,200,{ok:true,posts:r})}catch(e){console.error(e);json(res,500,{ok:false,message:'数据库错误'})}});
app.get('/api/posts/:id',async(req,res)=>{try{const id=Number(req.params.id);const [p]=await pool.execute(`SELECT * FROM posts WHERE id=? AND status='published'`,[id]);if(!p.length)return json(res,404,{ok:false,message:'帖子不存在'});const [r]=await pool.execute(`SELECT * FROM replies WHERE post_id=? ORDER BY id ASC`,[id]);json(res,200,{ok:true,post:p[0],replies:r})}catch(e){json(res,500,{ok:false,message:'数据库错误'})}});

app.post('/api/posts',limiter,upload.single('file'),async(req,res)=>{
  try{
    const content=clean(req.body.content,2000),anonymous=req.body.anonymous==='true'||req.body.anonymous==='1';
    const nickname=anonymous?null:clean(req.body.nickname,50);
    const cat=categories.has(req.body.category)?req.body.category:'校园日常';
    if(content.length<2)return json(res,422,{ok:false,message:'投稿内容至少需要2个字'});
    if(!anonymous&&!nickname)return json(res,422,{ok:false,message:'不匿名投稿需要填写昵称'});
    if(req.file){
      if(!(await uploadLogAllowed(req))){
        try{fs.unlinkSync(req.file.path)}catch{}
        return json(res,422,{ok:false,message:'5分钟内只能成功上传1张图片'});
      }
    }
    let deviceId=cookie(req,'device_id');
    if(!deviceId){deviceId='dev_'+randomToken(40);setCookie(res,'device_id',deviceId,60*60*24*365*3)}
    const img=req.file?'/uploads/'+req.file.filename:null;
    const [r]=await pool.execute(`INSERT INTO posts(content,is_anonymous,nickname,category,image_url,status,device_id) VALUES(?,?,?,?,?,'published',?)`,[content,anonymous?1:0,nickname,cat,img,deviceId]);
    json(res,200,{ok:true,id:r.insertId});
  }catch(e){console.error('【投稿失败】',e);json(res,422,{ok:false,message:e.message||'投稿失败'})}
});

app.post('/api/posts/:id/replies',limiter,upload.single('file'),async(req,res)=>{
  try{
    const content=clean(req.body.content,2000),anonymous=req.body.anonymous==='true'||req.body.anonymous==='1';
    const nickname=anonymous?null:clean(req.body.nickname,50);
    const id=Number(req.params.id);
    let deviceId=cookie(req,'device_id');
    if(!deviceId){deviceId='dev_'+randomToken(40);setCookie(res,'device_id',deviceId,60*60*24*365*3)}
    const [exists]=await pool.execute(`SELECT id,device_id FROM posts WHERE id=? AND status='published'`,[id]);
    if(!exists.length)return json(res,404,{ok:false,message:'帖子不存在'});
    if(content.length<1)return json(res,422,{ok:false,message:'回复不能为空'});
    if(!anonymous&&!nickname)return json(res,422,{ok:false,message:'不匿名回复需要填写昵称'});
    if(req.file && !(await uploadLogAllowed(req))){
      try{fs.unlinkSync(req.file.path)}catch{}
      return json(res,422,{ok:false,message:'5分钟内只能成功上传1张图片'});
    }
    const img=req.file?'/uploads/'+req.file.filename:null;
    const [r]=await pool.execute(`INSERT INTO replies(post_id,content,is_anonymous,nickname,image_url,device_id) VALUES(?,?,?,?,?,?)`,[id,content,anonymous?1:0,nickname,img,deviceId]);
    try{
      const ownerDevice=exists[0].device_id;
      if(ownerDevice&&ownerDevice!==deviceId){
        await pool.execute(`INSERT INTO notifications(device_id,post_id,reply_id,reply_preview) VALUES(?,?,?,?)`,[ownerDevice,id,r.insertId,content.slice(0,50)]);
      }
    }catch(notificationError){console.error('notification insert failed:',notificationError.message)}
    json(res,200,{ok:true,id:r.insertId});
  }catch(e){console.error('【回复失败】',e);json(res,422,{ok:false,message:e.message||'回复失败'})}
});

app.get('/api/notifications',async(req,res)=>{try{const deviceId=cookie(req,'device_id');if(!deviceId)return json(res,200,{ok:true,notifications:[]});const [r]=await pool.execute(`SELECT id,post_id,reply_preview,is_read,created_at FROM notifications WHERE device_id=? ORDER BY created_at DESC LIMIT 100`,[deviceId]);json(res,200,{ok:true,notifications:r})}catch(e){console.error(e);json(res,500,{ok:false,message:'通知加载失败'})}});
app.get('/api/notifications/unread-count',async(req,res)=>{try{const deviceId=cookie(req,'device_id');if(!deviceId)return json(res,200,{ok:true,count:0});const [[r]]=await pool.execute(`SELECT COUNT(*) count FROM notifications WHERE device_id=? AND is_read=0`,[deviceId]);json(res,200,{ok:true,count:Number(r.count||0)})}catch(e){json(res,500,{ok:false,message:'通知数量加载失败'})}});
app.patch('/api/notifications/:id/read',async(req,res)=>{try{const deviceId=cookie(req,'device_id');if(!deviceId)return json(res,401,{ok:false,message:'设备身份不存在'});const id=Number(req.params.id);const [r]=await pool.execute(`UPDATE notifications SET is_read=1 WHERE id=? AND device_id=?`,[id,deviceId]);json(res,200,{ok:true,updated:r.affectedRows===1})}catch(e){json(res,500,{ok:false,message:'通知更新失败'})}});
app.patch('/api/notifications/read-all',async(req,res)=>{try{const deviceId=cookie(req,'device_id');if(!deviceId)return json(res,200,{ok:true});await pool.execute(`UPDATE notifications SET is_read=1 WHERE device_id=? AND is_read=0`,[deviceId]);json(res,200,{ok:true})}catch(e){json(res,500,{ok:false,message:'通知更新失败'})}});

app.post('/api/posts/:id/like',limiter,async(req,res)=>{try{const id=Number(req.params.id);const [r]=await pool.execute(`UPDATE posts SET likes=likes+1 WHERE id=? AND status='published'`,[id]);json(res,200,{ok:r.affectedRows===1})}catch(e){json(res,500,{ok:false})}});
app.get('/api/posts/stream',async(req,res)=>{res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');res.flushHeaders?.();let last=0;const tick=async()=>{try{const [r]=await pool.query('SELECT MAX(id) max_id FROM posts WHERE status=\'published\'');const mx=Number(r[0]?.max_id||0);if(mx>last){last=mx;res.write('data: '+JSON.stringify({type:'posts',last})+'\n\n')}}catch{}};const timer=setInterval(tick,1500);tick();req.on('close',()=>clearInterval(timer))});
app.get('/api/chat',async(req,res)=>{try{const [state]=await pool.query(`SELECT * FROM chat_state WHERE id=1`);const [rows]=await pool.query(`SELECT * FROM chat_messages ORDER BY id ASC`);let started=state[0]?.started_at?new Date(state[0].started_at):null;if(started&&Date.now()-started.getTime()>=CHAT_TTL){await pool.query('DELETE FROM chat_messages');await pool.query('DELETE FROM chat_state WHERE id=1');started=null}json(res,200,{ok:true,messages:started?rows:[],startedAt:started})}catch(e){json(res,500,{ok:false,message:'聊天室数据库错误'})}});
app.post('/api/chat',limiter,upload.single('file'),async(req,res)=>{
  try{
    const content=clean(req.body.content,1000),nickname=clean(req.body.nickname,50)||'匿名同学';
    if(!content&&!req.file)return json(res,422,{ok:false,message:'消息不能为空'});
    const [st]=await pool.query(`SELECT * FROM chat_state WHERE id=1`);
    if(st[0]?.started_at&&Date.now()-new Date(st[0].started_at).getTime()>=CHAT_TTL){await pool.query('DELETE FROM chat_messages');await pool.query('DELETE FROM chat_state WHERE id=1')}
    const [again]=await pool.query(`SELECT * FROM chat_state WHERE id=1`);
    if(!again.length)await pool.query(`INSERT INTO chat_state(id,started_at,last_message_at) VALUES(1,NOW(),NOW())`);
    else await pool.query(`UPDATE chat_state SET last_message_at=NOW() WHERE id=1`);
    if(req.file && !(await uploadLogAllowed(req))){
      try{fs.unlinkSync(req.file.path)}catch{}
      return json(res,422,{ok:false,message:'5分钟内只能成功上传1张图片'});
    }
    const img=req.file?'/uploads/'+req.file.filename:null;
    await pool.execute(`INSERT INTO chat_messages(content,image_url,nickname,is_anonymous) VALUES(?,?,?,1)`,[content,img,nickname]);
    json(res,200,{ok:true});
  }catch(e){console.error('【聊天失败】',e);json(res,422,{ok:false,message:e.message||'发送失败'})}
});
app.get('/api/chat/stream',async(req,res)=>{res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');res.flushHeaders?.();let last=Number(req.headers['last-event-id']||0);const tick=async()=>{try{const [rows]=await pool.execute(`SELECT * FROM chat_messages WHERE id>? ORDER BY id ASC`,[last]);if(rows.length){last=rows[rows.length-1].id;res.write(`id: ${last}\ndata: ${JSON.stringify({type:'messages',messages:rows})}\n\n`)}const [s]=await pool.query(`SELECT started_at FROM chat_state WHERE id=1`);if(s[0]){const end=new Date(s[0].started_at).getTime()+CHAT_TTL;res.write(`data: ${JSON.stringify({type:'timer',startedAt:s[0].started_at,remaining:Math.max(0,end-Date.now())})}\n\n`)}else res.write(`data: ${JSON.stringify({type:'timer',remaining:0})}\n\n`)}catch{} };const timer=setInterval(tick,1000);tick();req.on('close',()=>clearInterval(timer))});
async function cleanupChatExpired(){try{const [s]=await pool.query('SELECT started_at FROM chat_state WHERE id=1');if(!s.length||!s[0].started_at)return;if(Date.now()-new Date(s[0].started_at).getTime() < CHAT_TTL)return;const [rows]=await pool.query('SELECT image_url FROM chat_messages');await pool.query('DELETE FROM chat_messages');await pool.query('DELETE FROM chat_state WHERE id=1');for(const x of rows)await deleteFile(x.image_url)}catch(e){console.error('chat cleanup:',e.message)}}

// Admin API
app.post('/api/admin/login',limiter,async(req,res)=>{try{const u=clean(req.body.username,64),p=String(req.body.password||'');const [r]=await pool.execute(`SELECT * FROM admins WHERE username=? LIMIT 1`,[u]);if(!r.length||!verifyPassword(p,r[0].password_hash))return json(res,401,{ok:false,message:'账号或密码错误'});if(r[0].expires_at&&new Date(r[0].expires_at)<new Date())return json(res,403,{ok:false,message:'管理员账号已过期'});const t='adm_'+randomToken(48);await pool.execute(`INSERT INTO admin_sessions(token,admin_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 12 HOUR))`,[t,r[0].id]);setCookie(res,'admin_session',t,60*60*12);json(res,200,{ok:true,role:r[0].role})}catch(e){console.error(e);json(res,500,{ok:false,message:'登录失败'})}});
app.post('/api/admin/logout',auth,async(req,res)=>{await pool.execute('DELETE FROM admin_sessions WHERE token=?',[cookie(req,'admin_session')]);setCookie(res,'admin_session','',0);json(res,200,{ok:true})});
app.get('/api/admin/me',auth,async(req,res)=>json(res,200,{ok:true,admin:{id:req.admin.id,username:req.admin.username,role:req.admin.role,canGenerateCards:!!req.admin.can_generate_cards,expiresAt:req.admin.expires_at}}));
app.get('/api/admin/overview',auth,async(req,res)=>{const [[p]]=await pool.query(`SELECT COUNT(*) n FROM posts`);const [[r]]=await pool.query(`SELECT COUNT(*) n FROM replies`);const [[c]]=await pool.query(`SELECT COUNT(*) n FROM chat_messages`);const [[k]]=await pool.query(`SELECT COUNT(*) n FROM card_keys WHERE status<>'revoked'`);json(res,200,{ok:true,stats:{posts:p.n,replies:r.n,chat:c.n,cards:k.n}})});
app.get('/api/admin/posts',auth,async(req,res)=>{const [r]=await pool.query(`SELECT p.*, (SELECT COUNT(*) FROM replies x WHERE x.post_id=p.id) reply_count FROM posts p ORDER BY p.id DESC LIMIT 200`);json(res,200,{ok:true,posts:r})});
app.delete('/api/admin/posts/:id',auth,async(req,res)=>{const id=Number(req.params.id);const [p]=await pool.execute('SELECT image_url FROM posts WHERE id=?',[id]);const [r]=await pool.execute('SELECT image_url FROM replies WHERE post_id=?',[id]);await pool.execute('DELETE FROM posts WHERE id=?',[id]);if(p[0])await deleteFile(p[0].image_url);for(const x of r)await deleteFile(x.image_url);json(res,200,{ok:true})});
app.get('/api/admin/posts/:id/replies',auth,async(req,res)=>{const id=Number(req.params.id);const [r]=await pool.execute('SELECT * FROM replies WHERE post_id=? ORDER BY id ASC',[id]);json(res,200,{ok:true,replies:r})});
app.delete('/api/admin/replies/:id',auth,async(req,res)=>{const id=Number(req.params.id);const [r]=await pool.execute('SELECT image_url FROM replies WHERE id=?',[id]);await pool.execute('DELETE FROM replies WHERE id=?',[id]);if(r[0])await deleteFile(r[0].image_url);json(res,200,{ok:true})});
app.get('/api/admin/chat',auth,async(req,res)=>{const [r]=await pool.query('SELECT * FROM chat_messages ORDER BY id DESC LIMIT 300');json(res,200,{ok:true,messages:r})});
app.delete('/api/admin/chat/:id',auth,async(req,res)=>{const id=Number(req.params.id);const [r]=await pool.execute('SELECT image_url FROM chat_messages WHERE id=?',[id]);await pool.execute('DELETE FROM chat_messages WHERE id=?',[id]);if(r[0])await deleteFile(r[0].image_url);json(res,200,{ok:true})});
app.delete('/api/admin/chat',auth,async(req,res)=>{const [r]=await pool.query('SELECT image_url FROM chat_messages');await pool.query('DELETE FROM chat_messages');await pool.query('DELETE FROM chat_state');for(const x of r)await deleteFile(x.image_url);json(res,200,{ok:true})});
app.get('/api/admin/admins',auth,superOnly,async(req,res)=>{const [r]=await pool.query(`SELECT id,username,role,can_generate_cards,expires_at,created_at FROM admins ORDER BY id DESC`);json(res,200,{ok:true,admins:r})});
app.post('/api/admin/admins',auth,superOnly,async(req,res)=>{const username=clean(req.body.username,64)||randomCode(10),password=clean(req.body.password,64)||randomCode(14),amount=Math.max(0,Number(req.body.amount)||0),unit=clean(req.body.unit,20)||'day';let exp=null;if(amount)exp=addDuration(new Date(),amount,unit);const [r]=await pool.execute(`INSERT INTO admins(username,password_hash,role,can_generate_cards,expires_at) VALUES(?,?, 'admin',0,?)`,[username,hashPassword(password),exp]);json(res,200,{ok:true,id:r.insertId,username,password,expiresAt:exp})});
app.patch('/api/admin/admins/:id/permission',auth,superOnly,async(req,res)=>{const id=Number(req.params.id);await pool.execute(`UPDATE admins SET can_generate_cards=? WHERE id=? AND role='admin'`,[req.body.enabled?1:0,id]);json(res,200,{ok:true})});
app.delete('/api/admin/admins/:id',auth,superOnly,async(req,res)=>{const id=Number(req.params.id);await pool.execute(`DELETE FROM admins WHERE id=? AND role='admin'`,[id]);json(res,200,{ok:true})});
app.get('/api/admin/cards',auth,async(req,res)=>{if(req.admin.role!=='super'&&!req.admin.can_generate_cards)return json(res,403,{ok:false,message:'你没有卡密管理权限'});const [r]=await pool.query(`SELECT id,code,duration_amount,duration_unit,starts_at,expires_at,status,bound_device_id,bound_at,created_at FROM card_keys ORDER BY id DESC LIMIT 500`);json(res,200,{ok:true,cards:r})});
app.post('/api/admin/cards',auth,async(req,res)=>{if(req.admin.role!=='super'&&!req.admin.can_generate_cards)return json(res,403,{ok:false,message:'超级管理员尚未给你开启卡密生成权限'});const count=Math.min(100,Math.max(1,Number(req.body.count)||1));const amount=Math.max(0,Number(req.body.amount)||0),unit=clean(req.body.unit,20)||'day';const result=[];for(let i=0;i<count;i++){let code=randomCode(20);while((await pool.execute('SELECT id FROM card_keys WHERE code=?',[code]))[0].length)code=randomCode(20);const [r]=await pool.execute(`INSERT INTO card_keys(code,duration_amount,duration_unit,created_by) VALUES(?,?,?,?)`,[code,amount||null,amount?unit:null,req.admin.id]);result.push(code)}json(res,200,{ok:true,codes:result})});

/* ===== 卡密真删（先删绑定关系，再删卡密）===== */
app.delete('/api/admin/cards/:id',auth,async(req,res)=>{
  if(req.admin.role!=='super'&&!req.admin.can_generate_cards)return json(res,403,{ok:false,message:'你没有卡密管理权限'});
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return json(res,422,{ok:false,message:'卡密 ID 无效'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query('DELETE FROM device_cards WHERE card_id=?',[id]);
    await conn.query('DELETE FROM card_keys WHERE id=?',[id]);
    await conn.commit();
    json(res,200,{ok:true});
  }catch(e){
    await conn.rollback();
    console.error('删除卡密失败:',e);
    json(res,500,{ok:false,message:'删除失败：'+e.message});
  }finally{conn.release()}
});
/* ============================================ */

app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,database:'connected'})}catch(e){res.status(500).json({ok:false,database:'disconnected'})}});

// public pages
app.get('/notifications.html',(req,res)=>res.sendFile(path.join(ROOT,'public','notifications.html')));
app.get('/super.html',(req,res)=>res.sendFile(path.join(ROOT,'public','super.html')));
app.get('/admin.html',(req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('*',(req,res)=>{const p=path.join(ROOT,'public',req.path);if(fs.existsSync(p)&&fs.statSync(p).isFile())return res.sendFile(p);res.sendFile(path.join(ROOT,'public','index.html'))});
(async()=>{try{await dbInit();setInterval(cleanupChatExpired,10000);await cleanupChatExpired();app.listen(PORT,()=>console.log(`三中投稿墙运行中 http://localhost:${PORT}`));}catch(e){console.error('数据库初始化失败：',e);process.exit(1)}})();
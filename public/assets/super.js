function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function timeText(t){const d=new Date(t);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2600)}
function initStars(){const box=document.getElementById('stars');if(!box)return;for(let i=0;i<95;i++){const s=document.createElement('i');s.className='star';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.animationDelay=(Math.random()*4)+'s';box.appendChild(s)}}
function modalBase(title,body,buttons){return new Promise(resolve=>{const w=document.createElement('div');w.className='modal-backdrop show';w.innerHTML=`<div class="modal"><button class="close" data-x>×</button><div class="modal-title">${esc(title)}</div><div class="modal-desc">${body}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">${buttons}</div></div>`;document.body.appendChild(w);const done=v=>{w.remove();resolve(v)};w.querySelector('[data-x]').onclick=()=>done(null);w.addEventListener('click',e=>{if(e.target===w)done(null)});w.querySelectorAll('[data-value]').forEach(b=>b.onclick=()=>done(b.dataset.value));})}
function uiConfirm(text){return modalBase('确认操作',`<div style="color:#cbd7e9;line-height:1.8">${esc(text)}</div>`,`<button class="ghost" data-value="no">取消</button><button class="primary" data-value="yes">确认</button>`).then(v=>v==='yes')}
function uiAlert(text){return modalBase('操作结果',`<div style="color:#cbd7e9;line-height:1.8;white-space:pre-wrap">${esc(text)}</div>`,`<button class="primary" data-value="ok">知道了</button>`)}
function uiForm(title,fields){return new Promise(resolve=>{const w=document.createElement('div');w.className='modal-backdrop show';w.innerHTML=`<div class="modal"><button class="close" data-x>×</button><div class="modal-title">${esc(title)}</div><div class="modal-desc">填写信息</div><div>${fields.map(f=>`<div class="field"><label>${esc(f.label)}</label>${f.type==='select'?`<select id="uf_${f.key}">${f.options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`:`<input id="uf_${f.key}" type="${f.type||'text'}" value="${esc(f.value||'')}" placeholder="${esc(f.placeholder||'')}">`}</div>`).join('')}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px"><button class="ghost" data-no>取消</button><button class="primary" data-ok>生成</button></div></div>`;document.body.appendChild(w);const done=v=>{w.remove();resolve(v)};w.querySelector('[data-x]').onclick=()=>done(null);w.querySelector('[data-no]').onclick=()=>done(null);w.querySelector('[data-ok]').onclick=()=>{const o={};fields.forEach(f=>o[f.key]=w.querySelector('#uf_'+f.key).value);done(o)};w.addEventListener('click',e=>{if(e.target===w)done(null)})})}
async function api(url,opt){const r=await fetch(url,opt);const d=await r.json();if(r.status===401){location.href='/admin/login.html';throw Error('未登录')}if(!d.ok)throw Error(d.message||'操作失败');return d}
let tab='overview';const panel=document.getElementById('panel');
document.querySelectorAll('.admin-tab').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');load()});
logout.onclick=async()=>{await fetch('/api/admin/logout',{method:'POST'});location.href='/admin/login.html'};
async function load(){try{if(tab==='overview')return overview();if(tab==='posts')return posts();if(tab==='chat')return chat();if(tab==='admins')return admins();if(tab==='cards')return cards()}catch(e){toast(e.message)}}
async function overview(){const d=await api('/api/admin/overview');panel.innerHTML=`<div class="eyebrow"><i></i> OVERVIEW</div><h1 class="page-title" style="font-size:34px">超级管理员后台</h1><div class="stat-grid"><div class="stat"><b>${d.stats.posts}</b><small>帖子</small></div><div class="stat"><b>${d.stats.replies}</b><small>回复</small></div><div class="stat"><b>${d.stats.chat}</b><small>聊天室消息</small></div><div class="stat"><b>${d.stats.cards}</b><small>卡密</small></div></div>`}
async function posts(){const d=await api('/api/admin/posts');panel.innerHTML=`<h2>帖子 / 回复管理</h2><div class="table-wrap"><table class="data-table"><tr><th>ID</th><th>内容</th><th>图片</th><th>回复</th><th>时间</th><th>操作</th></tr>${d.posts.map(p=>`<tr><td>${p.id}</td><td>${esc(p.content.slice(0,55))}</td><td>${p.image_url?`<img src="${esc(p.image_url)}" style="width:52px;height:38px;object-fit:cover;border-radius:7px">`:''}</td><td>${p.reply_count}</td><td>${esc(timeText(p.created_at))}</td><td><a class="blue" href="/post.html?id=${p.id}" target="_blank">详情</a> <button class="blue" onclick="manageReplies(${p.id})">回复</button> <button class="danger" onclick="delPost(${p.id})">删除</button></td></tr>`).join('')}</table></div>`}
async function delPost(id){if(!await uiConfirm('删除此帖子及其全部回复，并清理关联图片？'))return;await api('/api/admin/posts/'+id,{method:'DELETE'});load()}
async function manageReplies(postId){const d=await api('/api/admin/posts/'+postId+'/replies');const body=d.replies.length?`<div style="max-height:430px;overflow:auto">${d.replies.map(r=>`<div class="reply" style="margin-bottom:9px"><small>${esc(r.is_anonymous?'匿名同学':r.nickname||'同学')} · ${esc(timeText(r.created_at))}</small><p>${esc(r.content)}</p>${r.image_url?`<img src="${esc(r.image_url)}" class="detail-image">`:''}<button class="danger" data-reply="${r.id}">删除回复</button></div>`).join('')}</div>`:'<div class="empty" style="padding:30px">没有回复</div>';const w=document.createElement('div');w.className='modal-backdrop show';w.innerHTML=`<div class="modal"><button class="close" data-x>×</button><div class="modal-title">帖子 #${postId} 的回复</div><div class="modal-desc">${body}</div></div>`;document.body.appendChild(w);w.querySelector('[data-x]').onclick=()=>w.remove();w.addEventListener('click',e=>{if(e.target===w)w.remove()});w.querySelectorAll('[data-reply]').forEach(b=>b.onclick=async()=>{if(!await uiConfirm('删除这条回复？'))return;await api('/api/admin/replies/'+b.dataset.reply,{method:'DELETE'});w.remove();manageReplies(postId)})}
async function chat(){const d=await api('/api/admin/chat');panel.innerHTML=`<div style="display:flex;justify-content:space-between"><h2>聊天室</h2><button class="danger" onclick="clearChat()">全部删除</button></div><div class="table-wrap"><table class="data-table"><tr><th>ID</th><th>消息</th><th>图片</th><th>时间</th><th>操作</th></tr>${d.messages.map(m=>`<tr><td>${m.id}</td><td>${esc((m.content||'').slice(0,70))}</td><td>${m.image_url?`<img src="${esc(m.image_url)}" style="width:52px;height:38px;object-fit:cover;border-radius:7px">`:''}</td><td>${esc(timeText(m.created_at))}</td><td><button class="danger" onclick="delChat(${m.id})">删除</button></td></tr>`).join('')}</table></div>`}
async function delChat(id){if(!await uiConfirm('删除这条聊天室消息？'))return;await api('/api/admin/chat/'+id,{method:'DELETE'});load()}async function clearChat(){if(await uiConfirm('确定清空聊天室全部消息和图片？')){await api('/api/admin/chat',{method:'DELETE'});load()}}
async function admins(){const d=await api('/api/admin/admins');panel.innerHTML=`<h2>管理员与卡密权限</h2><div class="form-card" style="max-width:none;margin:20px 0"><div class="perm-note">超级管理员可以决定哪些管理员拥有“生成卡密”权限。关闭后，该管理员的卡密管理入口立即失效。</div><button class="publish" style="max-width:260px" onclick="genAdmin()">生成临时管理员</button></div><div class="table-wrap"><table class="data-table"><tr><th>账号</th><th>角色</th><th>卡密生成权限</th><th>有效期</th><th>操作</th></tr>${d.admins.map(a=>`<tr><td>${esc(a.username)}</td><td>${a.role}</td><td>${a.role==='super'?'—':`<input class="switch" type="checkbox" ${a.can_generate_cards?'checked':''} onchange="perm(${a.id},this.checked)">`}</td><td>${a.expires_at?esc(timeText(a.expires_at)):'永久'}</td><td>${a.role==='admin'?`<button class="danger" onclick="delAdmin(${a.id})">删除</button>`:''}</td></tr>`).join('')}</table></div>`}
async function genAdmin(){const f=await uiForm('生成临时管理员',[{key:'username',label:'账号（留空随机）',placeholder:'随机数字+大小写字母'},{key:'password',label:'密码（留空随机）',placeholder:'随机数字+大小写字母'},{key:'amount',label:'有效时长（0=永久）',type:'number',value:'7'},{key:'unit',label:'单位',type:'select',options:[{value:'minute',label:'分钟'},{value:'hour',label:'小时'},{value:'day',label:'天'},{value:'week',label:'周'},{value:'month',label:'月'},{value:'year',label:'年'}]}]);if(!f)return;const d=await api('/api/admin/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});await uiAlert(`账号：${d.username}\n密码：${d.password}\n有效期：${d.expiresAt||'永久'}`);load()}
async function perm(id,enabled){await api('/api/admin/admins/'+id+'/permission',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})})}
async function delAdmin(id){if(await uiConfirm('删除该临时管理员？')){await api('/api/admin/admins/'+id,{method:'DELETE'});load()}}

/* ===== 卡密管理：新增生成时间 / 绑定时间 ===== */
async function cards(){
  const me=await api('/api/admin/me');
  if(!me.admin.canGenerateCards&&me.admin.role!=='super'){panel.innerHTML='<div class="empty">超级管理员尚未开启你的卡密生成权限。</div>';return}
  const d=await api('/api/admin/cards');
  panel.innerHTML=`<h2>卡密管理</h2>
    <div class="form-card" style="max-width:none;margin:20px 0">
      <div class="field"><label>生成数量</label><input id="ccount" type="number" min="1" max="100" value="1"></div>
      <div class="field"><label>有效时长（0=永久）</label><input id="camount" type="number" min="0" value="1"></div>
      <div class="field"><label>单位</label><select id="cunit"><option value="minute">分钟</option><option value="hour">小时</option><option value="day" selected>天</option><option value="week">周</option><option value="month">月</option><option value="year">年</option></select></div>
      <button class="publish" style="max-width:260px" onclick="genCards()">生成卡密</button>
    </div>
    <div class="table-wrap"><table class="data-table">
      <tr><th>卡密</th><th>时长</th><th>绑定</th><th>生成时间</th><th>绑定时间</th><th>剩余时间</th><th>状态</th><th>操作</th></tr>
      ${d.cards.map(c=>`<tr>
        <td>${esc(c.code)}</td>
        <td>${c.duration_amount?c.duration_amount+' '+c.duration_unit:'永久'}</td>
        <td>${c.bound_device_id?'已绑定':'未绑定'}</td>
        <td>${c.created_at ? esc(timeText(c.created_at)) : '—'}</td>
        <td>${c.bound_at ? esc(timeText(c.bound_at)) : '—'}</td>
        <td class="remaining" data-exp="${c.expires_at||''}">${remain(c.expires_at)}</td>
        <td><span class="pill">${c.status}</span></td>
        <td>
          ${c.bound_device_id?`<button class="blue" onclick="unbindCard(${c.id})">解绑</button> `:''}
          <button class="danger" onclick="delCard(${c.id})">删除</button>
        </td>
      </tr>`).join('')}
    </table></div>`;
  tickRemain();
}
function remain(x){if(!x)return'永久';const ms=new Date(x)-Date.now();if(ms<=0)return'已过期';let s=Math.floor(ms/1000);const d=Math.floor(s/86400);s%=86400;const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60);return `${d}天 ${h}小时 ${m}分钟`}
function tickRemain(){document.querySelectorAll('.remaining').forEach(e=>e.textContent=remain(e.dataset.exp));setTimeout(tickRemain,1000)}
async function genCards(){const d=await api('/api/admin/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({count:ccount.value,amount:camount.value,unit:cunit.value})});await uiAlert('生成的卡密：\n\n'+d.codes.join('\n'));load()}
async function delCard(id){
  if(!await uiConfirm('删除此卡密？删除后无法恢复。')) return;
  try{
    await api('/api/admin/cards/'+id,{method:'DELETE'});
    toast('卡密已删除');
    load();
  }catch(e){toast(e.message)}
}
async function unbindCard(id){
  if(!await uiConfirm('解绑此卡密？解绑后该设备需要重新输入卡密才能访问。')) return;
  try{
    await api('/api/admin/cards/'+id+'/unbind',{method:'POST'});
    toast('已解绑');
    load();
  }catch(e){toast(e.message)}
}
/* ============================================ */

initStars();load();setInterval(()=>{if(tab==='overview'||tab==='cards')load()},5000);
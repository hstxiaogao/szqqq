function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function timeText(t){const d=new Date(t);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2600)}
function initStars(){const box=document.getElementById('stars');if(!box)return;for(let i=0;i<95;i++){const s=document.createElement('i');s.className='star';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.animationDelay=(Math.random()*4)+'s';box.appendChild(s)}}

const id=new URLSearchParams(location.search).get('id');
let anonymous=true;

function render(d){
  const p=d.post,n=p.is_anonymous?'匿名同学':(p.nickname||'同学');
  detail.innerHTML=`<div class="eyebrow"><i></i> POST DETAIL</div><div class="detail-header"><div><h1 class="page-title" style="font-size:32px">帖子 #${p.id}</h1><small style="color:#687a99">${esc(n)} · ${esc(timeText(p.created_at))} · ${esc(p.category)}</small></div><a class="ghost" href="/">返回投稿墙</a></div><div class="detail-content">${esc(p.content)}</div>${p.image_url?`<img class="detail-image" src="${esc(p.image_url)}">`:''}<div style="color:#647795;font-size:11px">♡ ${p.likes||0} · ${d.replies.length} 条回复</div><hr style="border-color:rgba(255,255,255,.06);margin:25px 0"><h2>回复</h2><div class="reply-list">${d.replies.length?d.replies.map(x=>`<div class="reply"><small>${esc(x.is_anonymous?'匿名同学':x.nickname||'同学')} · ${esc(timeText(x.created_at))}</small><p>${esc(x.content)}</p>${x.image_url?`<img class="detail-image" src="${esc(x.image_url)}">`:''}</div>`).join(''):'<div class="empty" style="padding:30px">还没有回复</div>'}</div><div class="reply-form"><div class="mode-tabs"><button id="ra" class="active">匿名回复</button><button id="ro">不匿名回复</button></div><div id="rnbox" class="field" hidden><label>昵称</label><input id="rn"></div><div class="field"><label>回复内容</label><textarea id="rc" placeholder="写下你的回复……"></textarea></div><div class="field file-box"><label>图片（可选）</label><input id="ri" type="file" accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"><div class="file-hint">仅支持固定图片格式 JPG / JPEG / PNG / GIF / WEBP，最大50MB；5分钟内只能成功上传1张。</div></div><button class="publish" id="rb">发布回复 <span>→</span></button></div>`;
  ra.onclick=()=>{anonymous=true;ra.classList.add('active');ro.classList.remove('active');rnbox.hidden=true};
  ro.onclick=()=>{anonymous=false;ro.classList.add('active');ra.classList.remove('active');rnbox.hidden=false};
  rb.onclick=send;
}

async function send(){
  const fd=new FormData();
  fd.append('content',rc.value);
  fd.append('anonymous',anonymous?'1':'0');
  fd.append('nickname',rn.value);
  if(ri.files[0])fd.append('file',ri.files[0]);   /* 关键：image 改成 file */
  const r=await fetch('/api/posts/'+id+'/replies',{method:'POST',body:fd});
  const d=await r.json();
  if(!d.ok)return toast(d.message);
  toast('回复成功');
  load();
}

async function load(){
  /* 用户正在输入时跳过刷新，防止清空输入框 */
  const ae = document.activeElement;
  if(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)){
    return;
  }
  const r=await fetch('/api/posts/'+id);
  const d=await r.json();
  if(!d.ok){detail.innerHTML='<div class="empty">帖子不存在</div>';return}
  render(d);
}

initStars();load();setInterval(load,5000);
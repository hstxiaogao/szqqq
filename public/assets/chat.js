function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function timeText(t){const d=new Date(t);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2600)}
function initStars(){const box=document.getElementById('stars');if(!box)return;for(let i=0;i<95;i++){const s=document.createElement('i');s.className='star';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.animationDelay=(Math.random()*4)+'s';box.appendChild(s)}}

let last=0;

function renderMsg(m){
  return `<div class="msg"><div class="msg-bubble"><div class="msg-meta">${esc(m.nickname||'匿名同学')} · ${esc(timeText(m.created_at))}</div>${esc(m.content||'')}${m.image_url?`<img class="detail-image" src="${esc(m.image_url)}">`:''}</div></div>`;
}

function draw(list,replace=false){
  if(replace)chatWindow.innerHTML='';
  for(const m of list){
    if(document.querySelector('[data-mid="'+m.id+'"]'))continue;
    const x=document.createElement('div');
    x.dataset.mid=m.id;
    x.innerHTML=renderMsg(m);
    chatWindow.appendChild(x);
    last=Math.max(last,Number(m.id));
  }
  chatWindow.scrollTop=chatWindow.scrollHeight;
}

async function initial(){
  const r=await fetch('/api/chat');
  const d=await r.json();
  if(d.ok){
    draw(d.messages,true);
    if(d.startedAt)startTimer(new Date(d.startedAt).getTime());
  }
}

function startTimer(t){
  function tick(){
    const left=Math.max(0,t+20*60*1000-Date.now());
    timer.textContent=Math.floor(left/60000)+':'+String(Math.floor(left/1000)%60).padStart(2,'0');
    status.textContent=left?'聊天室进行中':'聊天室已结束';
    if(left)setTimeout(tick,1000);
  }
  tick();
}

const es=new EventSource('/api/chat/stream');
es.onmessage=e=>{
  const d=JSON.parse(e.data);
  if(d.type==='messages')draw(d.messages);
  if(d.type==='timer'){
    if(d.startedAt)startTimer(new Date(d.startedAt).getTime());
    else{timer.textContent='20:00';status.textContent='等待第一条消息…';chatWindow.innerHTML=''}
  }
};

async function send(){
  const fd=new FormData();
  fd.append('content',msg.value);
  fd.append('nickname','匿名同学');
  if(chatImage.files[0])fd.append('file',chatImage.files[0]);   /* 关键：image 改成 file */
  const r=await fetch('/api/chat',{method:'POST',body:fd});
  const d=await r.json();
  if(!d.ok)toast(d.message);
  else{msg.value='';chatImage.value=''}
}

/* 事件绑定统一放在这里，保证元素一定存在 */
const imgBtnEl=document.getElementById('imgBtn');
const sendBtnEl=document.getElementById('send');
const chatImageEl=document.getElementById('chatImage');
const msgEl=document.getElementById('msg');

if(imgBtnEl && chatImageEl){
  imgBtnEl.onclick=()=>chatImageEl.click();
}
if(sendBtnEl){
  sendBtnEl.onclick=send;
}
if(msgEl){
  msgEl.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();send()}
  };
}

initStars();
initial();
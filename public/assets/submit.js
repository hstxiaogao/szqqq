function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function timeText(t){const d=new Date(t);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2600)}
function initStars(){const box=document.getElementById('stars');if(!box)return;for(let i=0;i<95;i++){const s=document.createElement('i');s.className='star';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.animationDelay=(Math.random()*4)+'s';box.appendChild(s)}}

let anonymous=true;
document.getElementById('anonBtn').onclick=()=>setMode(true);
document.getElementById('openBtn').onclick=()=>setMode(false);
function setMode(v){anonymous=v;anonBtn.classList.toggle('active',v);openBtn.classList.toggle('active',!v);nicknameBox.hidden=v}
content.oninput=()=>counter.textContent=content.value.length;

publish.onclick=async()=>{
  publish.disabled=true;
  publish.textContent='发布中…';
  try{
    const fd=new FormData();
    fd.append('content',content.value);
    fd.append('anonymous',anonymous?'1':'0');
    fd.append('nickname',nickname.value);
    fd.append('category',category.value);
    if(image.files[0])fd.append('file',image.files[0]);   /* 关键：字段名必须是 file */
    const r=await fetch('/api/posts',{method:'POST',body:fd});
    const d=await r.json();
    if(!d.ok)throw Error(d.message||'投稿失败');
    toast('投稿成功');
    content.value='';
    nickname.value='';
    image.value='';
    counter.textContent='0';
    setTimeout(()=>location.href='/',500);
  }catch(e){
    toast(e.message);
  }finally{
    publish.disabled=false;
    publish.innerHTML='发布投稿 <span>→</span>';
  }
};

initStars();
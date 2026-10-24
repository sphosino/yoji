// みんなで遊ぶ（?room=〇〇 で開いたとき）。札を配る・はまったかを決めるのはサーバー（core.js と同じ決まり）。
//   この画面は、サーバーから届く様子を V にして描き（index.html の render）、つかむ・動かす・はなすをサーバーに送るだけ
//   部屋の流れはだるまと同じ：作ったらすぐ CPU の仲間と遊び始める。試合中に来た人は観戦から（CPU の仲間と交代して飛び入りできる）
//   1問ごとに中断。ほかの人が全員「準備OK」を押してから、部屋を作った人が次を始める
(function(){
'use strict';
const ROOM=new URLSearchParams(location.search).get('room');
const DR=window.YojiRoom;
const myName=()=>{try{return localStorage.getItem('mataasobo-name')||''}catch(e){return ''}};
const saveName=v=>{try{localStorage.setItem('mataasobo-name',v)}catch(e){}};

// ---------- 部屋の一覧と、部屋を作る（ふつうに開いたとき） ----------
if(!ROOM){
  const b=$('roomBtn');if(!b)return;
  const box=document.createElement('div');box.className='rlist';box.hidden=true;b.after(box);
  let rooms=null;
  const make=async(btn)=>{
    let name=myName();if(!name){name=(prompt('みんなに見せる名前（8文字まで）','')||'').trim().slice(0,8)||'ゲスト';saveName(name)}
    btn.disabled=true;btn.textContent='部屋を作っています…';
    // 作ったら、そのまま CPU の仲間と遊び始める（はじめの画面で選んでいた CPU の人数で）
    try{const id=await DR.create(name);try{sessionStorage.setItem('yj-go',JSON.stringify({id,cpu:store.get('yj-cpu',2)}))}catch(e){}location.href=location.pathname+'?room='+id}
    catch(e){alert('部屋を作れませんでした。少し待ってから、もう一度どうぞ');btn.disabled=false;btn.textContent='新しく部屋を作る'}
  };
  const draw=()=>{
    const list=rooms==null?'<p class="rnone">部屋を探しています…</p>':rooms.length?rooms.map(r=>{
      const people=r.seats.filter(x=>x&&x.online),host=(people[0]||{}).name||'';
      const st=r.phase==='lobby'?'人を待っています':r.phase==='over'?'ひと休み中':'試合中（観戦・飛び入りできます）';
      return `<a class="rrow" href="?room=${encodeURIComponent(r.id)}"><b>${esc(host)}の部屋</b><span>${people.length}人 ・ ${st}</span></a>`}).join('')
      :'<p class="rnone">いま開いている部屋はありません。作って待ってみよう</p>';
    box.innerHTML=`<p class="rlistH">入れる部屋</p>${list}<button class="pill rmake" type="button">新しく部屋を作る</button>`;
    box.querySelector('.rmake').onclick=e=>make(e.currentTarget);
  };
  const fill=async()=>{if(box.hidden||!$('start')||$('start').hidden)return;try{const r=await fetch(DR.API+'/rooms?kind=yoji');rooms=(await r.json()).rooms||[]}catch(e){rooms=rooms||[]}if(!box.hidden)draw()};
  b.onclick=()=>{box.hidden=!box.hidden;b.classList.toggle('on',!box.hidden);if(!box.hidden){draw();fill()}};
  setInterval(fill,10000);
  return;
}

// ---------- 部屋の中 ----------
let RV=null,lastMv=0,pendingMv=null;
const ERR_EN={};   // 四字熟語あつめは日本語だけ
$('roomBtn').hidden=true;$('start').hidden=true;$('quitBtn').textContent='あきらめる';
document.title='四字熟語あつめ（みんなで）｜また遊ぼ';
const badge=document.createElement('span');badge.className='rbadge';document.querySelector('header').prepend(badge);
const exitBtn=document.createElement('button');exitBtn.type='button';exitBtn.className='pill';exitBtn.textContent='出る';document.querySelector('header').append(exitBtn);
exitBtn.onclick=()=>{if(confirm('部屋を出ますか？（遊んでいる途中なら、あなたの手札は CPU がまかされます）')){DR.send({t:'leave'});setTimeout(()=>{location.href=location.pathname},200)}};
// 部屋の画面（集まり中・終わったあと）
const card=document.createElement('div');card.className='over';card.id='roomCard';card.hidden=true;document.body.append(card);
// 観戦の人の「飛び入り」（CPU の仲間と交代）
const jump=document.createElement('div');jump.className='jump';jump.hidden=true;$('hand').after(jump);

// 定型文（だるまと同じ10こ）。💬 で選んで送る。届いた言葉は上に吹き出しで数秒
const SAY={hi:'よろしく！',ready:'準備OK押して！',wait:'ちょっと待って',go:'はじめよう！',nice:'ナイス！',close:'おしい！',again:'もう一回！',lol:'ｗｗｗ',thx:'ありがとう！',bye:'またね'};
const sayBtn=document.createElement('button');sayBtn.type='button';sayBtn.className='pill';sayBtn.textContent='💬';sayBtn.setAttribute('aria-label','ひとこと送る');$('hintBtn').before(sayBtn);
const sayBox=document.createElement('div');sayBox.className='sayBox';sayBox.hidden=true;
sayBox.innerHTML=Object.entries(SAY).map(([k,t])=>`<button class="pill" type="button" data-say="${k}">${t}</button>`).join('');document.body.append(sayBox);
const feed=document.createElement('div');feed.className='sayFeed';feed.setAttribute('aria-live','polite');document.body.append(feed);
sayBtn.onclick=e=>{e.stopPropagation();sayBox.hidden=!sayBox.hidden};
sayBox.onclick=e=>{const b=e.target.closest('[data-say]');if(!b)return;DR.send({t:'say',k:b.dataset.say});sayBox.hidden=true};
document.addEventListener('pointerdown',e=>{if(!sayBox.hidden&&!sayBox.contains(e.target)&&e.target!==sayBtn)sayBox.hidden=true});
function showSay(m){const t=SAY[m.k];if(!t)return;const d=document.createElement('div');d.className='say';
  d.innerHTML=`<b>${esc(m.n)}</b>${esc(t)}`;feed.append(d);while(feed.children.length>3)feed.firstChild.remove();
  setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),400)},4000)}

// サーバーとのやりとり：つかむ・動かす（0.08秒に1回まで）・はなす
ENG={
  grab(id){DR.send({t:'grab',id});return true},
  moving(id,x,y){pendingMv={id,x,y};const n=performance.now();if(n-lastMv>80){lastMv=n;DR.send({t:'mv',...pendingMv});pendingMv=null}},
  drop(id,to){if(pendingMv){DR.send({t:'mv',...pendingMv});pendingMv=null}
    const t=V&&V.tiles.find(x=>x.id===id);if(t){if(to.i!=null)t.where='pending';else if(to.hand){t.where='hand';t.holder=V.me;t.held=null}else Object.assign(t,{where:'desk',held:null,dx:null,dy:null},to)}   // 返事が来るまでのあいだ、それらしく見せる
    DR.send({t:'drop',id,to});render()},
  hint(){DR.send({t:'hint'})},
  quit(){if(RV&&RV.host&&confirm('この問題をあきらめますか？'))DR.send({t:'quit'})},
};

DR.connect(ROOM,m=>{
  if(m.t==='open'){DR.send({t:'join',name:myName()||'ゲスト'});return}
  if(m.t==='close'){toast('つなぎ直しています…');return}
  if(m.t==='mv'){const t=V&&V.tiles.find(x=>x.id===m.id);if(t&&t.where==='air'){t.dx=m.x;t.dy=m.y;render()}return}
  if(m.t==='err'){toast(m.msg);if(m.room)apply(m.room,[]);else render();return}
  if(m.t==='room'){apply(m.room,m.ev||[]);autoGo(m.room)}
});
// 部屋を作ったばかりなら、CPU の人数を決めて、すぐ始める（ひとりのときだけ・一度だけ）
function autoGo(v){
  let g=null;try{g=JSON.parse(sessionStorage.getItem('yj-go')||'null')}catch(e){}
  if(!g||g.id!==v.id)return;try{sessionStorage.removeItem('yj-go')}catch(e){}
  if(!v.host||v.phase!=='lobby'||present(v).length>1)return;
  DR.send({t:'cpuN',n:g.cpu});DR.send({t:'start'});
}
const present=v=>v.seats.filter(s=>!s.empty&&s.online).map(s=>s.name).concat(v.watchers||[]);
function apply(v,ev){
  const was=RV;RV=v;const playing=v.phase==='playing';
  renderBadge(v,was);
  if(v.players){
    const q=D.list[v.qIndex];
    V={q,game:v.game,me:v.me,hinted:v.hinted||[],over:!playing,gaveUp:v.gaveUp,
      players:v.players.map((p,i)=>({n:p.n+(p.cpu?'':''),c:COLS[i],cpu:p.cpu,think:p.think,handN:p.hand})),
      chars:v.chars.map((c,i)=>({ch:[...q.w][i],slots:c.slots,at:c.at,pts:c.pts})),
      tiles:v.tiles.map(t=>({...t})),
      t0:v.elapsed!=null?performance.now()-v.elapsed:(V&&V.t0)||performance.now()};
    // ほかの人の手札の数（中身は届かないので、数だけの札を作る）
    V.players.forEach((p,i)=>{if(i!==V.me)for(let k=0;k<p.handN;k++)V.tiles.push({id:'x'+i+'-'+k,where:'hand',holder:i,src:[0,0],hidden:true})});
  }
  for(const e of ev)onEvent(e);
  $('hintBtn').hidden=!(playing&&v.me>=0);$('quitBtn').hidden=!(playing&&v.host);
  if(playing){card.hidden=true;$('result').hidden=true}
  else renderCard(v);
  renderJump(v,playing);
  render();
}
function onEvent(e){
  if(e.say){showSay(e.say);return}
  if(e.joined){showToastBig(e.joined.p===RV.me?'飛び入り！ 手札を引き継ぎました':`${e.joined.n}が飛び入り！`);return}
  if(e.miss!=null&&e.miss===RV.me){toast('ここではないみたい…');return}
  if(e.hint){toast(`${RV.players[e.hint.by].n}がヒントを使った（その字は −20点）`);return}
}
function showToastBig(m){toast(m)}
// 左上の札：部屋にいる人数と観戦の人数。来た人は知らせる
function renderBadge(v,was){
  const n=present(v).length,w=(v.watchers||[]).length;
  badge.innerHTML=`<i></i>部屋 ${n}人${w?`・観戦${w}人`:n<=1?'・待っています':''}`;
  if(!was)return;
  const before=present(was);
  for(const x of present(v)){const k=before.indexOf(x);if(k>=0){before.splice(k,1);continue}
    if(x===(myName()||'ゲスト'))continue;   // 自分が来たことは知らせない
    toast(v.phase==='playing'?`${x}が観戦に来た！`:`${x}が来た！`)}
}
// 観戦の人：CPU の仲間と交代して飛び入り
function renderJump(v,playing){
  jump.hidden=!(playing&&v.watching&&v.players);if(jump.hidden)return;
  const cpus=v.players.map((p,i)=>p.cpu?i:-1).filter(i=>i>=0);
  jump.innerHTML=`<p>${cpus.length?'観戦中。CPU の仲間と交代して、手札を引き継いで飛び入りできます':'観戦中'}</p>`+(cpus.length?`<div>${cpus.map(i=>`<button class="pill" type="button" data-p="${i}" style="border-color:${COLS[i]}">${esc(v.players[i].n)}と交代</button>`).join('')}</div>`:'');
  jump.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>DR.send({t:'takeover',p:+b.dataset.p}));
}
// 集まり中・終わったあとの画面：結果（終わったあと）、席、CPU の人数、招待、名前、準備OK／はじめる
function renderCard(v){
  const url=location.origin+location.pathname+'?room='+v.id,mine=v.you>=0?v.seats[v.you]:null;
  const waitN=v.seats.filter(s=>!s.empty&&s.online&&!s.ready).length,humans=v.seats.filter(s=>!s.empty).length,cpuMax=Math.max(0,v.maxPlayers-humans);
  let res='';
  if(v.phase==='over'&&V){showResult(V.gaveUp,null);res=$('result').innerHTML;$('result').hidden=true}
  const seats=v.seats.map((s,i)=>`<div class="rseat${i===v.you?' mine':''}"><span>${s.empty?'<span style="color:var(--muted)">あき</span>':esc(s.name)+(s.online?'':'（るす）')}</span>${!s.empty&&s.online?`<em class="rready${s.ready?' on':''}">${s.host?'作った人':s.ready?'準備OK':'準備中…'}</em>`:''}${s.empty&&(v.you>=0||v.watching)?`<button class="pill" data-seat="${i}" type="button">ここに座る</button>`:''}</div>`).join('');
  const cpuRow=`<div><b>CPU の仲間</b>${v.host?'':'（部屋を作った人が決めます）'}<div class="choices" style="margin-top:6px">${Array.from({length:Math.min(5,cpuMax)+1},(_,n)=>`<button class="pill${Math.min(v.cpuN,cpuMax)===n?' on':''}" data-cpu="${n}" type="button"${v.host?'':' disabled'}>${n?n+'人':'なし'}</button>`).join('')}</div></div>`;
  let act;
  if(v.host)act=`<button class="go" id="rStart" type="button"${waitN?' disabled':''}>${v.phase==='over'?'つぎの四字熟語':'はじめる'}</button>${waitN?`<p class="rnote">みんなの「準備OK」を待っています（あと${waitN}人）</p>`:''}`;
  else if(mine)act=mine.ready?`<button class="pill" id="rReady" type="button">準備OK ✓（取り消す）</button><p class="rnote">部屋を作った人が始めるのを待っています</p>`:`<button class="go" id="rReady" type="button">準備OK！</button>`;
  else act=`<p class="rnote">${v.seats.some(s=>s.empty)?'観戦中。空いている席の「ここに座る」で、次の問題から加われます':'観戦中（席がいっぱいです）'}</p>`;
  card.innerHTML=`${res||`<h2>みんなで遊ぶ</h2><p>リンクを送って、友だちを呼ぼう。<br>${present(v).length<=1?'ほかの人を待っています… 待たずに始めても、あとから来た人は観戦や飛び入りで加われます':`いま、この部屋に${present(v).length}人`}</p>`}
    <div class="rseats">${seats}</div>${(v.watchers||[]).length?`<p class="rnote">観戦：${v.watchers.map(esc).join('・')}</p>`:''}
    ${v.you>=0&&!v.host?'<button class="pill" id="rWatch" type="button">観戦にまわる</button>':''}
    ${cpuRow}
    <div class="rinv"><input id="rUrl" readonly value="${esc(url)}"><button class="pill" id="rCopy" type="button">コピー</button><a class="pill" href="https://line.me/R/share?text=${encodeURIComponent('四字熟語あつめで遊ぼ！ '+url)}" target="_blank" rel="noopener">LINE</a></div>
    <label class="rname">あなたの名前 <input id="rName" maxlength="8" value="${esc(myName())}"></label>
    ${act}`;
  card.hidden=false;
  const on=(id,f)=>{const b=card.querySelector('#'+id);if(b)b.onclick=f};
  card.querySelectorAll('[data-seat]').forEach(b=>b.onclick=()=>DR.send({t:'seat',i:+b.dataset.seat}));
  card.querySelectorAll('[data-cpu]').forEach(b=>b.onclick=()=>DR.send({t:'cpuN',n:+b.dataset.cpu}));
  on('rWatch',()=>DR.send({t:'watch'}));
  on('rStart',()=>DR.send({t:v.phase==='over'?'again':'start'}));
  on('rReady',()=>DR.send({t:'ready',on:!mine.ready}));
  on('rCopy',()=>{navigator.clipboard&&navigator.clipboard.writeText(url).then(()=>toast('コピーしました'))});
  const nm=card.querySelector('#rName');nm.onchange=()=>{const n=nm.value.trim().slice(0,8)||'ゲスト';saveName(n);DR.send({t:'join',name:n})};
}
})();

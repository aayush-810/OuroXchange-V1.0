/* OuroXchange - app.js | All data in Firebase Firestore. No dummy data. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const INT  = ['Sports','Music','Programming','Books','Electronics','Art & Craft','Fitness','Cooking','Languages','Photography','Other'];
const CATS = ['Books','Electronics','Daily-use items','Sports equipment','Other permitted items'];
const CE_EMOJI = {'Books':'\u{1F4DA}','Electronics':'\u{1F3A7}','Daily-use items':'\u{1FA91}','Sports equipment':'\u{1F3CF}','Other permitted items':'\u{1F381}'};
const INFO = {
    'About':'OuroXchange helps people share what they know, what they have and what they need. We only connect people; exchanges happen directly between users.',
    'Contact':'Write to us at hello@ouroxchange.in.',
    'Terms & Conditions':'Use the site honestly, list only permitted items, and never share passwords or make advance payments to strangers.',
    'Permitted Items Policy':'Allowed: books, electronics, daily-use items, sports equipment. Not allowed: weapons, drugs, adult items, stolen goods, live animals.'
};
const BAD = /weapon|\bgun|pistol|rifle|knife|drug|narcotic|cannabis|adult|stolen|explosive|live animal/i;

let people=[], items=[], me=null, view='home', arg=null, after=null;
let chats={}, cur=null, chatUnsub=null, chatsUnsub=null, flt={}, blocked=[], cq='';
let tmpPhoto=null, tmpPhotos=null, fbReady=false;

const getDb = () => window.FB?.db;
const getFS = () => window.FB?.FS;
function chatDocId(a,b){return [String(a),String(b)].sort().join('_');}

async function fsLoadUsers(q){
    const db=getDb(),FS=getFS();if(!db||!FS)return[];
    try{const ref=FS.collection(db,'users');let qu;
    if(q&&q.trim()){const s=q.trim().toLowerCase();qu=FS.query(ref,FS.orderBy('nameLower'),FS.startAt(s),FS.endAt(s+'\uf8ff'),FS.limit(30));}
    else{qu=FS.query(ref,FS.limit(50));}
    const snap=await FS.getDocs(qu);return snap.docs.map(d=>({uid:d.id,...d.data()}));}
    catch(e){console.error('loadUsers:',e);return[];}
}
async function fsLoadItems(){
    const db=getDb(),FS=getFS();if(!db||!FS)return[];
    try{const qu=FS.query(FS.collection(db,'items'),FS.orderBy('createdAt','desc'),FS.limit(200));
    const snap=await FS.getDocs(qu);return snap.docs.map(d=>({id:d.id,...d.data()}));}
    catch(e){console.error('loadItems:',e);return[];}
}
async function fsSaveProfile(data){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid)return;
    const{uid,...rest}=data;
    try{await FS.setDoc(FS.doc(db,'users',me.uid),{...rest,nameLower:(rest.name||'').toLowerCase()},{merge:true});}
    catch(e){console.error('saveProfile:',e);}
}
async function fsSaveItem(data,itemId){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid)return null;
    try{if(itemId){await FS.setDoc(FS.doc(db,'items',itemId),data,{merge:true});return itemId;}
    else{const ref=await FS.addDoc(FS.collection(db,'items'),{...data,o:me.uid,oName:me.name,st:'Available',createdAt:FS.serverTimestamp()});return ref.id;}}
    catch(e){console.error('saveItem:',e);return null;}
}
async function fsDeleteItem(id){const db=getDb(),FS=getFS();if(!db||!FS)return;try{await FS.deleteDoc(FS.doc(db,'items',id));}catch(e){console.error(e);}}
async function fsUpdateItemStatus(id,s){const db=getDb(),FS=getFS();if(!db||!FS)return;try{await FS.updateDoc(FS.doc(db,'items',id),{st:s});}catch(e){console.error(e);}}

function fsSubscribeChat(partnerUid,cb){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid)return()=>{};
    const cid=chatDocId(me.uid,partnerUid);
    const qu=FS.query(FS.collection(db,'chats',cid,'messages'),FS.orderBy('time','asc'));
    return FS.onSnapshot(qu,snap=>cb(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>console.error('chat:',err));
}
async function fsSendMessage(toUid,text,img){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid)return;
    const cid=chatDocId(me.uid,toUid),now=FS.serverTimestamp();
    try{await FS.setDoc(FS.doc(db,'chats',cid),{participants:[me.uid,toUid],lastMsg:text||'Photo',lastTime:now},{merge:true});
    await FS.addDoc(FS.collection(db,'chats',cid,'messages'),{from:me.uid,t:text||'',img:img||'',time:now,seen:false});}
    catch(e){console.error('sendMsg:',e);}
}

async function fsMarkSeen(partnerUid){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid||!partnerUid)return;
    const cid=chatDocId(me.uid,partnerUid);
    try{
        const qu=FS.query(FS.collection(db,'chats',cid,'messages'),FS.where('seen','==',false));
        const snap=await FS.getDocs(qu);
        snap.docs.forEach(d=>{
            if(d.data().from===partnerUid){
                FS.updateDoc(d.ref,{seen:true}).catch(()=>{});
            }
        });
    }catch(e){console.error('fsMarkSeen:',e);}
}

// Load all existing conversations for the logged-in user from Firestore
async function fsLoadConversations(){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid)return;
    try{
        // NOTE: No orderBy here — combining array-contains + orderBy requires
        // a composite Firestore index. We sort client-side instead.
        const qu=FS.query(
            FS.collection(db,'chats'),
            FS.where('participants','array-contains',me.uid),
            FS.limit(50)
        );
        const snap=await FS.getDocs(qu);

        // Load all conversations in parallel
        await Promise.all(snap.docs.map(async (docSnap)=>{
            const data=docSnap.data();
            const partnerUid=(data.participants||[]).find(uid=>uid!==me.uid);
            if(!partnerUid)return;

            // Fetch partner profile if not already cached
            if(!P(partnerUid)){
                try{
                    const uDoc=await FS.getDoc(FS.doc(db,'users',partnerUid));
                    if(uDoc.exists())mergeUser({uid:uDoc.id,...uDoc.data()});
                    else mergeUser({uid:partnerUid,name:'User '+partnerUid.slice(0,5),city:''});
                }catch(_){
                    mergeUser({uid:partnerUid,name:'User '+partnerUid.slice(0,5),city:''});
                }
            }

            // Load messages sub-collection ordered by time
            const msgQu=FS.query(
                FS.collection(db,'chats',docSnap.id,'messages'),
                FS.orderBy('time','asc')
            );
            const msgSnap=await FS.getDocs(msgQu);
            const msgs=msgSnap.docs.map(m=>{
                const md=m.data();
                return {
                    t:md.t||'',
                    img:md.img||'',
                    me:md.from===me.uid,
                    time:md.time?.toDate?md.time.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'',
                    seen:md.seen||false,
                    _ts:md.time?.toDate?md.time.toDate().getTime():0
                };
            });

            if(!chats[partnerUid])chats[partnerUid]={m:[],unread:0};
            chats[partnerUid].m=msgs;
            chats[partnerUid]._lastTs=msgs.length?(msgs[msgs.length-1]._ts||0):(data.lastTime?.toDate?data.lastTime.toDate().getTime():0);
            chats[partnerUid].unread=msgs.filter(m=>!m.me&&!m.seen).length;
        }));
    }catch(e){console.error('fsLoadConversations:',e);}
}

// Real-time listener for incoming chats / conversations list
function fsListenChats(){
    const db=getDb(),FS=getFS();if(!db||!FS||!me?.uid)return;
    if(chatsUnsub){chatsUnsub();chatsUnsub=null;}
    const qu=FS.query(FS.collection(db,'chats'),FS.where('participants','array-contains',me.uid));
    chatsUnsub=FS.onSnapshot(qu,async(snap)=>{
        let changed=false;
        for(const docSnap of snap.docs){
            const data=docSnap.data();
            const partnerUid=(data.participants||[]).find(uid=>uid!==me.uid);
            if(!partnerUid)continue;
            if(!P(partnerUid)){
                try{
                    const uDoc=await FS.getDoc(FS.doc(db,'users',partnerUid));
                    if(uDoc.exists())mergeUser({uid:uDoc.id,...uDoc.data()});
                    else mergeUser({uid:partnerUid,name:'User '+partnerUid.slice(0,5),city:''});
                }catch(_){
                    mergeUser({uid:partnerUid,name:'User '+partnerUid.slice(0,5),city:''});
                }
            }
            if(!chats[partnerUid]){
                chats[partnerUid]={m:[],unread:0,_lastTs:data.lastTime?.toDate?data.lastTime.toDate().getTime():0};
                try{
                    const msgQu=FS.query(FS.collection(db,'chats',docSnap.id,'messages'),FS.orderBy('time','asc'));
                    const msgSnap=await FS.getDocs(msgQu);
                    const msgs=msgSnap.docs.map(m=>{
                        const md=m.data();
                        return {
                            t:md.t||'',
                            img:md.img||'',
                            me:md.from===me.uid,
                            time:md.time?.toDate?md.time.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'',
                            seen:md.seen||false,
                            _ts:md.time?.toDate?md.time.toDate().getTime():0
                        };
                    });
                    chats[partnerUid].m=msgs;
                    chats[partnerUid]._lastTs=msgs.length?(msgs[msgs.length-1]._ts||0):(data.lastTime?.toDate?data.lastTime.toDate().getTime():0);
                    chats[partnerUid].unread=msgs.filter(m=>!m.me&&!m.seen).length;
                    changed=true;
                }catch(e){console.error(e);}
            }else if(data.lastTime?.toDate){
                const ts=data.lastTime.toDate().getTime();
                if(ts>(chats[partnerUid]._lastTs||0)){
                    chats[partnerUid]._lastTs=ts;
                    if(cur!==partnerUid){
                        chats[partnerUid].unread=(chats[partnerUid].unread||0)+1;
                    }
                    changed=true;
                }
            }
        }
        nav();
        if(view==='chat'&&changed){
            updateSidebarPreview(cur);
        }
    },err=>console.error('listenChats:',err));
}

const P=uid=>people.find(p=>p.uid===uid);
function mergeUser(u){const i=people.findIndex(p=>p.uid===u.uid);i>=0?Object.assign(people[i],u):people.push(u);}

const ini=n=>(n||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const av=(p,c='')=>p.photo?`<img class="av ${c}" src="${p.photo}" alt="${esc(p.name)}">`:`<div class="av ${c}">${ini(p.name)}</div>`;
const loc=(p,own)=>p.area&&(own||p.hide===false)?p.area+', '+p.city:(p.city||'');
const mine=uid=>items.filter(i=>i.o===uid);

function toast(m,t=2600){const e=document.createElement('div');e.className='toast';e.textContent=m;document.body.append(e);setTimeout(()=>e.remove(),t);}
function successToast(m){const e=document.createElement('div');e.className='toast success';e.textContent=m;document.body.append(e);setTimeout(()=>e.remove(),3800);}

function go(v,a){
    if(['login','signup','forgot'].includes(v)&&!after&&!['login','signup','forgot'].includes(view)){const pv=view,pa=arg;after=()=>go(pv,pa);}
    if(v!=='chat'&&chatUnsub){chatUnsub();chatUnsub=null;}
    view=v;arg=a;render();scrollTo(0,0);
}
function nv(v){flt={};cq='';go(v);}
function need(fn){if(me)return true;after=fn;toast('Please log in or sign up first');view='login';render();return false;}
async function msg(uid,itemId){
    if(!need(()=>msg(uid,itemId)))return;
    if(!P(uid)){
        try{
            const db=getDb(),FS=getFS();
            if(db&&FS){
                const snap=await FS.getDoc(FS.doc(db,'users',uid));
                if(snap.exists())mergeUser({uid:snap.id,...snap.data()});
                else mergeUser({uid,name:'User '+uid.slice(0,5),city:''});
            }
        }catch(_){mergeUser({uid,name:'User '+uid.slice(0,5),city:''});}
    }
    if(!chats[uid])chats[uid]={m:[],unread:0,_lastTs:Date.now()};
    if(itemId)chats[uid].item=itemId;
    cur=uid;go('chat');
}
function unread(){return Object.values(chats).reduce((a,c)=>a+(c.unread||0),0);}
function nav(){
    const t=(v,l)=>`<button class="nb ${view===v?'on':''}" onclick="nv('${v}')">${l}</button>`;
    const ur=unread();
    $('#nav').innerHTML=`<button class="logo" onclick="nv('home')"><i></i>OuroXchange</button>`+t('home','Home')+t('items','Exchange/Donate')+
    `<input class="hs" id="navSearch" placeholder="Search people by name" aria-label="Search people" onkeydown="event.key==='Enter'&&hs(this.value)">`+
    (me?`<button class="nb ${view==='chat'?'on':''}" onclick="go('chat')">Chat ${ur?`<span class=badge>${ur}</span>`:''}</button>
    <button class="nb" onclick="go('me')" aria-label="My profile">${av(me).replace('class="av ','class="av sm ').replace('<div','<div style="width:30px;height:30px;font-size:.8rem"').replace('<img','<img style="width:30px;height:30px"')}</button>`
    :`<button class="btn alt sm" onclick="go('login')">Log in</button><button class="btn sm" onclick="go('signup')">Sign up</button>`);
    const locEl = $('#gf-loc-text');
    if (locEl) {
        locEl.innerHTML = (me?.city ? esc(me.city) + ', India' : 'India') + ' &bull; From your community &bull; Peer-to-Peer';
    }
    const flLeft = $('#fl-left');
    if (flLeft) {
        flLeft.innerHTML = [
            `<a href="#" onclick="go('info','About');return false">About</a>`,
            `<a href="#" onclick="nv('items');return false">Browse Items</a>`,
            `<a href="#" onclick="nv('search');return false">Find People</a>`,
            `<a href="#" onclick="go('contact');return false">Contact Us</a>`
        ].join('');
    }
    const flRight = $('#fl-right');
    if (flRight) {
        flRight.innerHTML = [
            `<a href="#" onclick="go('privacy');return false">Privacy</a>`,
            `<a href="#" onclick="go('info','Terms &amp; Conditions');return false">Terms</a>`,
            `<a href="#" onclick="go('info','Permitted Items Policy');return false">Permitted Items</a>`,
            `<a href="#" onclick="go('contact');return false">Help &amp; Safety</a>`
        ].join('');
    }
    const oldFl = $('#fl');
    if (oldFl) {
        oldFl.innerHTML = [
            `<a href="#" onclick="go('info','About');return false">About</a>`,
            `<a href="#" onclick="go('contact');return false">Contact Us</a>`,
            `<a href="#" onclick="go('privacy');return false">Privacy Policy</a>`
        ].join(' &middot; ');
    }
}

function pic(i){const em=CE_EMOJI[i.cat]||'';return `<div class="emo">${i.ph&&i.ph[0]?`<img src="${i.ph[0]}" alt="">`:em}</div>`;}
function pcard(p){const sk=(p.know||[]).slice(0,3).map(k=>`<span class="tag">${esc(k[0])}</span>`).join('');
return `<div class="card click" onclick="go('person','${p.uid}')"><div class="row">${av(p)}<div><h3>${esc(p.name)}</h3><div class="mut">${esc(p.city||'')}</div></div></div><p>${esc(p.bio||'')}</p><div>${sk}</div><button class="btn sm" style="margin-top:8px">View profile</button></div>`;}
function icard(i){return `<div class="card click" onclick="go('item','${i.id}')">${pic(i)}<span class="tag ${i.type==='Donate'?'don':''}">${i.type}</span>${i.st!=='Available'?`<span class="tag">${i.st}</span>`:''}<h3>${esc(i.t)}</h3><div class="mut">${esc(i.cat)} &middot; ${esc(i.city)}</div></div>`;}
function ago(ts){if(!ts)return 'recently';const d=ts.toDate?Math.floor((Date.now()-ts.toDate())/86400000):0;return d<1?'today':d===1?'1 day ago':`${d} days ago`;}
function pick(inp,max,cb){Promise.all([...inp.files].slice(0,max).map(f=>new Promise(r=>{const x=new FileReader();x.onload=()=>r(x.result);x.readAsDataURL(f)}))).then(cb);}
function renderMessages(uid){const c=chats[uid];
return `<div class="msgs" id="ms">${c?.m?.length?c.m.map(m=>`<div class="m ${m.me?'me':''}">${m.img?`<img src="${m.img}" alt="">`:esc(m.t)}<small>${m.time}${m.me?' &middot; '+(m.seen?'Seen':'Sent'):''}</small></div>`).join(''):'<p class="mut" style="text-align:center">Say hello to start the conversation!</p>'}</div>`;}
// Surgically update a single sidebar conversation preview without re-rendering
// the whole chat view (avoids losing scroll position / input focus).
function updateSidebarPreview(uid){
    const c=chats[uid];if(!c)return;
    const last=c.m?c.m.slice(-1)[0]:null;
    const preview=last?(last.img?'Photo':last.t):'No messages yet';
    const time=last?last.time:'';
    const cl=document.querySelector('.cl');
    if(!cl)return;
    cl.querySelectorAll('button').forEach(btn=>{
        if(btn.getAttribute('onclick')&&btn.getAttribute('onclick').includes("'" + uid + "'")){
            const mut=btn.querySelector('.mut');
            if(mut)mut.textContent=preview+(time?' '+time:'');
            const existingBadge=btn.querySelector('.badge');
            if(c.unread>0){
                if(existingBadge){existingBadge.textContent=c.unread;}
                else{
                    const b=document.createElement('span');
                    b.className='badge';b.textContent=c.unread;
                    const nameEl=btn.querySelector('b');
                    if(nameEl)nameEl.insertAdjacentElement('afterend',b);
                }
            }else if(existingBadge){existingBadge.remove();}
        }
    });
}

const V={
home(){const latest=items.filter(i=>i.st==='Available').slice(0,4);
return `<div class="hero"><h1>Know something. Have something. Need something.</h1><p>Find people to learn from, and swap or donate things you no longer need.</p>
<div class="sbar"><input id="q" placeholder="Search by name, skill or interest..." aria-label="Search" onkeydown="event.key==='Enter'&&hs($('#q').value)"><button class="btn" onclick="hs($('#q').value)">Search</button></div>
<div class="row"><button class="btn" onclick="nv('search')">Find People</button><button class="btn alt" onclick="nv('items')">Browse Items</button></div></div>
<section><h2>How it works</h2><div class="steps"><div><h3>1. Create your profile</h3><span class="mut">List what you know, have and need.</span></div><div><h3>2. Find people or items</h3><span class="mut">Search by name, skill, or item.</span></div><div><h3>3. Connect and exchange</h3><span class="mut">Chat 1-to-1 and agree directly.</span></div></div></section>
<section><h2>Featured categories</h2><div class="chips">${['Sports','Programming','Music'].map(c=>`<span class="chip" tabindex="0" onclick="hs('${c}')">${c}</span>`).join('')}${Object.keys(CE_EMOJI).slice(0,4).map(c=>`<span class="chip" tabindex="0" onclick="flt={cat:'${c}'};go('items')">${CE_EMOJI[c]} ${c}</span>`).join('')}</div></section>
<section><h2>Latest listed items</h2>${latest.length?`<div class="grid">${latest.map(icard).join('')}</div>`:`<p class="mut">No items listed yet. ${me?`<a href="#" onclick="go('post');return false">Post the first one!</a>`:'Sign up to post the first!'}</p>`}</section>
${me?'':`<div class="cta"><h2>Ready to connect?</h2><p>Create a free account to message people and list your own items.</p><button class="btn" onclick="go('signup')">Sign up free</button></div>`}`;},

search(){const f=flt,k=(f.q||'').toLowerCase();let r=people.filter(p=>p.uid!==me?.uid);
if(k)r=r.filter(p=>{const h=[p.name,p.bio,...(p.know||[]).flat(),...(p.need||[]),...(p.int||[])].join(' ').toLowerCase();return h.includes(k);});
if(f.lv)r=r.filter(p=>(p.know||[]).some(z=>z[1]===f.lv));if(f.av)r=r.filter(p=>p.av===f.av);if(f.int)r=r.filter(p=>(p.int||[]).includes(f.int));
const o=(a,v,l)=>`<option value="${v}" ${a===v?'selected':''}>${l}</option>`;
return `<h2>Find people</h2><div class="row" style="margin:12px 0">
<input style="width:220px" id="sq" placeholder="Name, skill or interest" value="${esc(f.q||'')}" onkeydown="event.key==='Enter'&&sf()">
<select id="slv"><option value="">Any level</option>${['Beginner','Intermediate','Expert'].map(x=>o(f.lv,x,x)).join('')}</select>
<select id="sav"><option value="">Any availability</option>${['Weekdays','Weekends','Evenings'].map(x=>o(f.av,x,x)).join('')}</select>
<select id="sin"><option value="">Any interest</option>${INT.map(x=>o(f.int,x,x)).join('')}</select>
<button class="btn" onclick="sf()">Search</button></div>
${r.length?`<div class="grid">${r.map(pcard).join('')}</div>`:`<div class="card"><h3>No people found</h3><p class="mut">Try a different name or keyword, or remove a filter.</p></div>`}`;},

person(){const p=P(arg);return p?prof(p,p.uid===me?.uid):'<p>Profile not found.</p>';},
me(){return prof(me,true);},
info(){if(arg==='Contact'||arg==='Contact Us')return V.contact();return `<h2>${esc(arg)}</h2><p style="max-width:60ch">${esc(INFO[arg])}</p>`;},
        contact(){
        const userName = me ? me.name : '';
        const userEmail = (window.FB && window.FB.auth && window.FB.auth.currentUser) ? window.FB.auth.currentUser.email : '';
        return `<div class="contact-page">
<div class="contact-hero">
  <span class="contact-badge">&#128236; We're here to help</span>
  <h1>Contact Us</h1>
  <p class="contact-lead">Have questions about exchanging items, account safety, or feedback? Drop us a message or reach out via our direct community channels.</p>
</div>

<div class="contact-grid">
  <!-- Contact Form Card -->
  <div class="contact-card contact-form-card">
    <h2>Send us a message</h2>
    <p class="mut" style="margin-top:-4px;margin-bottom:20px;font-size:.9rem">Fill out the form below and our team will get back to you at your email address.</p>
    
    <form onsubmit="submitContact(event)" id="contactForm">
      <label>Your Name
        <input name="name" required placeholder="Your full name" value="${esc(userName)}">
      </label>
      
      <label>Email Address
        <input name="email" type="email" required placeholder="you@example.com" value="${esc(userEmail)}">
      </label>
      
      <label>Topic / Category
        <select name="topic" required>
          <option value="General Inquiry">General Inquiry</option>
          <option value="Item Exchange / Swap Support">Item Exchange / Swap Support</option>
          <option value="Safety & Trust Concern">Safety &amp; Trust Concern</option>
          <option value="Report Listing or User">Report a Listing or User</option>
          <option value="Account & Login Issue">Account &amp; Login Issue</option>
          <option value="Feedback & Suggestions">Feedback &amp; Suggestions</option>
        </select>
      </label>
      
      <label>Message
        <textarea name="message" rows="5" required placeholder="How can we help you? Describe your question or issue in detail..." style="resize:vertical"></textarea>
      </label>
      
      <div id="contactStatus"></div>
      
      <button class="btn" id="contactSubmitBtn" style="margin-top:14px;width:100%">Send Message</button>
    </form>
  </div>

  <!-- Sidebar / Direct Channels -->
  <div class="contact-sidebar">
    <div class="contact-card">
      <h3>Direct Channels</h3>
      <ul class="contact-info-list">
        <li>
          <div class="contact-icon">&#128231;</div>
          <div>
            <strong>General Inquiries</strong>
            <div><a href="mailto:hello@ouroxchange.in" class="contact-link">hello@ouroxchange.in</a></div>
            <span class="mut" style="font-size:.82rem">Replies typically within 24 hours</span>
          </div>
        </li>
        <li>
          <div class="contact-icon">&#128737;</div>
          <div>
            <strong>Trust &amp; Safety</strong>
            <div><a href="mailto:safety@ouroxchange.in" class="contact-link">safety@ouroxchange.in</a></div>
            <span class="mut" style="font-size:.82rem">Report violations or urgent concerns</span>
          </div>
        </li>
        <li>
          <div class="contact-icon">&#128161;</div>
          <div>
            <strong>Feedback &amp; Suggestions</strong>
            <div><a href="mailto:feedback@ouroxchange.in" class="contact-link">feedback@ouroxchange.in</a></div>
            <span class="mut" style="font-size:.82rem">Share feature ideas and stories</span>
          </div>
        </li>
      </ul>
    </div>

    <div class="contact-card" style="margin-top:20px">
      <h3>Operating Hours &amp; Location</h3>
      <p class="mut" style="font-size:.9rem;line-height:1.6;margin:8px 0">
        <strong>Hours:</strong> Monday &ndash; Saturday, 9:00 AM &ndash; 7:00 PM IST<br>
        <strong>Headquarters:</strong> Indore, Madhya Pradesh, India
      </p>
    </div>

    <div class="contact-card safety-callout" style="margin-top:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:1.4rem">&#129309;</span>
        <b style="color:var(--pri)">Community Safety Reminder</b>
      </div>
      <p style="font-size:.86rem;color:var(--fg);margin:0;line-height:1.5">
        OuroXchange connects community members directly. For exchanges, always meet in safe, well-lit public places. Never make advance payments or share sensitive account credentials.
      </p>
    </div>
  </div>
</div>

<!-- Frequently Asked Questions -->
<div class="contact-faq-section">
  <h2>Frequently Asked Questions</h2>
  <div class="contact-faq-grid">
    <div class="faq-item">
      <h4>How do item exchanges work?</h4>
      <p class="mut">Browse listings under <strong>Exchange/Donate</strong>, tap any item, and click <strong>Message</strong> to chat with the owner directly and agree on terms.</p>
    </div>
    <div class="faq-item">
      <h4>Is OuroXchange free to use?</h4>
      <p class="mut">Yes, OuroXchange is 100% free. We charge no listing fees, transaction costs, or commissions.</p>
    </div>
    <div class="faq-item">
      <h4>How do I report a suspicious user or listing?</h4>
      <p class="mut">Inside any chat thread, tap <strong>Report</strong>, or write directly to our team at <strong>safety@ouroxchange.in</strong> with details.</p>
    </div>
    <div class="faq-item">
      <h4>How can I manage or delete my account?</h4>
      <p class="mut">Open your Profile, click <strong>Edit Profile</strong>, and choose <strong>Delete Account</strong> to permanently remove all your listings and data.</p>
    </div>
  </div>
</div>
</div>`;
    },
privacy(){
    const lastUpdated = 'October 28, 2026';
    return `<div class="policy-page">
<div class="policy-hero">
  <div class="policy-badge">&#128274; Privacy First</div>
  <h1>Privacy Policy</h1>
  <p class="policy-lead">We built OuroXchange on a foundation of trust. This policy explains what data we collect, why we collect it, and how we protect it.</p>
  <p class="policy-meta">Last updated: <strong>${lastUpdated}</strong> &middot; Applies to <strong>OuroXchange.in</strong></p>
</div>
<div class="policy-toc">
  <h3>Quick navigation</h3>
  <ol>
    <li><a href="#pp-who">Who we are</a></li>
    <li><a href="#pp-collect">What we collect</a></li>
    <li><a href="#pp-use">How we use your data</a></li>
    <li><a href="#pp-share">Who we share it with</a></li>
    <li><a href="#pp-store">How we store &amp; protect it</a></li>
    <li><a href="#pp-rights">Your rights &amp; choices</a></li>
    <li><a href="#pp-cookies">Cookies &amp; tracking</a></li>
    <li><a href="#pp-children">Children&#39;s privacy</a></li>
    <li><a href="#pp-changes">Changes to this policy</a></li>
    <li><a href="#pp-contact">Contact us</a></li>
  </ol>
</div>
<div class="policy-body">
<section class="policy-section" id="pp-who">
  <div class="policy-icon">&#127968;</div>
  <h2>1. Who we are</h2>
  <p>OuroXchange is an online community platform at <strong>OuroXchange.in</strong> that helps people share knowledge, swap or donate items, and connect with others. We act as a connector only &mdash; all exchanges happen directly between users.</p>
  <p>For data protection purposes, OuroXchange is the data controller for personal data collected through this platform.</p>
</section>
<section class="policy-section" id="pp-collect">
  <div class="policy-icon">&#128203;</div>
  <h2>2. What we collect</h2>
  <p>We collect only the information needed to run the platform:</p>
  <div class="policy-table-wrap">
    <table class="policy-table">
      <thead><tr><th>Data type</th><th>Examples</th><th>How collected</th></tr></thead>
      <tbody>
        <tr><td><strong>Account information</strong></td><td>Name, email address, password (hashed)</td><td>When you sign up</td></tr>
        <tr><td><strong>Profile information</strong></td><td>City, bio, skills, interests, profile photo</td><td>When you fill your profile</td></tr>
        <tr><td><strong>Listing data</strong></td><td>Item title, description, category, photos, city</td><td>When you post an item</td></tr>
        <tr><td><strong>Chat messages</strong></td><td>Text and images exchanged with other users</td><td>When you use the chat feature</td></tr>
        <tr><td><strong>Usage data</strong></td><td>Pages visited, actions taken, browser type</td><td>Automatically via Firebase</td></tr>
      </tbody>
    </table>
  </div>
  <div class="policy-callout">
    <span>&#128272;</span>
    <span><strong>Your email is never shown publicly.</strong> Only your name, city, bio, skills, interests and profile photo are visible to other users.</span>
  </div>
</section>
<section class="policy-section" id="pp-use">
  <div class="policy-icon">&#9881;&#65039;</div>
  <h2>3. How we use your data</h2>
  <ul class="policy-list">
    <li><strong>Providing the service</strong> &mdash; Creating and managing your account, showing your profile, enabling listings and chat.</li>
    <li><strong>Authentication &amp; security</strong> &mdash; Verifying your email, detecting abuse, keeping accounts secure.</li>
    <li><strong>Platform improvements</strong> &mdash; Understanding how the platform is used so we can improve it.</li>
    <li><strong>Communication</strong> &mdash; Email verification and password reset links only. No marketing emails without consent.</li>
    <li><strong>Safety</strong> &mdash; Reviewing reported content to enforce community guidelines.</li>
  </ul>
  <p>We do <strong>not</strong> sell your data, use it for profiling, or share it with advertisers.</p>
</section>
<section class="policy-section" id="pp-share">
  <div class="policy-icon">&#129309;</div>
  <h2>4. Who we share your data with</h2>
  <ul class="policy-list">
    <li><strong>Google Firebase</strong> &mdash; Our backend (auth, database, storage) is powered by Firebase per <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener">Google&#39;s privacy policies</a>.</li>
    <li><strong>Other users (by design)</strong> &mdash; Public profile details visible to registered users. Your email is never shared.</li>
    <li><strong>Legal requirements</strong> &mdash; We may disclose data if required by law or to protect user safety.</li>
  </ul>
  <p>We do <strong>not</strong> share data with marketing companies, data brokers, or other commercial third parties.</p>
</section>
<section class="policy-section" id="pp-store">
  <div class="policy-icon">&#128737;&#65039;</div>
  <h2>5. How we store &amp; protect your data</h2>
  <p>Your data is stored on Google Firebase with encryption at rest and in transit (TLS/SSL). Passwords are hashed by Firebase Authentication and never stored in plain text.</p>
  <p>If you delete your account, your profile, listings, and account data are permanently deleted.</p>
  <div class="policy-callout warn">
    <span>&#9888;&#65039;</span>
    <span>Please use a strong, unique password and never share your credentials with anyone.</span>
  </div>
</section>
<section class="policy-section" id="pp-rights">
  <div class="policy-icon">&#9989;</div>
  <h2>6. Your rights &amp; choices</h2>
  <div class="policy-rights-grid">
    <div class="policy-right-card"><div class="right-icon">&#128065;&#65039;</div><h4>Access</h4><p>View all your information on your profile at any time.</p></div>
    <div class="policy-right-card"><div class="right-icon">&#9999;&#65039;</div><h4>Correct</h4><p>Update your data via the Edit Profile page.</p></div>
    <div class="policy-right-card"><div class="right-icon">&#128465;&#65039;</div><h4>Delete</h4><p>Delete your account and all data from the Edit Profile page.</p></div>
    <div class="policy-right-card"><div class="right-icon">&#128683;</div><h4>Object</h4><p>Block any user to stop receiving messages from them.</p></div>
    <div class="policy-right-card"><div class="right-icon">&#128228;</div><h4>Portability</h4><p>Request a copy of your data by emailing hello@ouroxchange.in.</p></div>
    <div class="policy-right-card"><div class="right-icon">&#128274;</div><h4>Visibility</h4><p>Choose to show only your city publicly, hiding your area.</p></div>
  </div>
  <p>Contact us at <strong>hello@ouroxchange.in</strong> to exercise any right.</p>
</section>
<section class="policy-section" id="pp-cookies">
  <div class="policy-icon">&#127850;</div>
  <h2>7. Cookies &amp; tracking</h2>
  <ul class="policy-list">
    <li><strong>Firebase Authentication</strong> uses browser local storage to keep you logged in.</li>
    <li><strong>No third-party advertising cookies</strong> are set on this site.</li>
    <li>Firebase may collect anonymous analytics data to help us improve the platform.</li>
  </ul>
  <p>Clear your browser&#39;s local storage at any time to log out of all sessions.</p>
</section>
<section class="policy-section" id="pp-children">
  <div class="policy-icon">&#128118;</div>
  <h2>8. Children&#39;s privacy</h2>
  <p>OuroXchange is intended for users aged <strong>13 and older</strong>. We do not knowingly collect data from children under 13. Contact us at <strong>hello@ouroxchange.in</strong> if you believe a child under 13 has an account.</p>
</section>
<section class="policy-section" id="pp-changes">
  <div class="policy-icon">&#128260;</div>
  <h2>9. Changes to this policy</h2>
  <p>We may update this Privacy Policy from time to time. Material changes will be reflected by updating the &ldquo;Last updated&rdquo; date above. Continued use of OuroXchange after changes constitutes acceptance of the updated policy.</p>
</section>
<section class="policy-section" id="pp-contact">
  <div class="policy-icon">&#128108;</div>
  <h2>10. Contact us</h2>
  <div class="policy-contact-card">
    <p><strong>OuroXchange</strong></p>
    <p>&#128231; <a href="mailto:hello@ouroxchange.in">hello@ouroxchange.in</a></p>
    <p>&#127760; <a href="https://ouroxchange.in" target="_blank" rel="noopener">ouroxchange.in</a></p>
  </div>
  <p style="margin-top:20px">We aim to respond to all privacy-related enquiries within <strong>72 hours</strong>.</p>
</section>
</div>
<div class="policy-footer">
  <p>By using OuroXchange you agree to this Privacy Policy and our <a href="#" onclick="go('info','Terms &amp; Conditions');return false">Terms &amp; Conditions</a>.</p>
  <button class="btn alt" onclick="history.back()">&larr; Go back</button>
</div>
</div>`;
},

edit(){return `<h2>Edit profile</h2><form onsubmit="saveP(event)">
<label>Full name<input name="n" value="${esc(me.name)}" required></label>
<label>City<input name="city" value="${esc(me.city||'')}" required></label>
<label>Area (optional)<input name="area" value="${esc(me.area||'')}"></label>
<label class="row" style="font-weight:400"><input type="checkbox" name="hide" style="width:auto" ${me.hide===false?'':'checked'}> Show only my city publicly</label>
<label>Short bio<textarea name="bio" rows="3">${esc(me.bio||'')}</textarea></label>
<label>Profile photo<input type="file" accept="image/*" onchange="pick(this,1,a=>tmpPhoto=a[0])"></label>
<p class="mut">Your email is never shown publicly.</p>
<button class="btn" id="saveProfileBtn">Save changes</button>
<button type="button" class="btn warn" onclick="delAcct()">Delete account</button>
</form>`;},

items(){const f=flt,k=(f.iq||'').toLowerCase();
const r=items.filter(i=>i.st!=='Completed'&&(!f.cat||i.cat===f.cat)&&(!f.ty||i.type===f.ty)&&(!f.cd||i.cond===f.cd)&&(!k||i.t.toLowerCase().includes(k))&&(!f.il||(i.city||'').toLowerCase().includes(f.il.toLowerCase())));
const o=(a,v)=>`<option ${a===v?'selected':''}>${v}</option>`;
return `<div class="row" style="justify-content:space-between"><h2>Exchange or donate</h2><button class="btn" onclick="need(()=>go('post'))&&go('post')">Post an item</button></div>
<div class="row" style="margin:12px 0">
<input style="width:170px" placeholder="Search items" value="${esc(f.iq||'')}" oninput="flt.iq=this.value" onkeydown="event.key==='Enter'&&render()">
<input style="width:130px" placeholder="Location" value="${esc(f.il||'')}" oninput="flt.il=this.value" onkeydown="event.key==='Enter'&&render()">
<select onchange="flt.cat=this.value;render()"><option value="">All categories</option>${CATS.map(c=>o(f.cat,c)).join('')}</select>
<select onchange="flt.ty=this.value;render()"><option value="">Exchange &amp; Donate</option>${['Exchange','Donate'].map(c=>o(f.ty,c)).join('')}</select>
<select onchange="flt.cd=this.value;render()"><option value="">Any condition</option>${['New','Like new','Good','Used'].map(c=>o(f.cd,c)).join('')}</select>
<button class="btn" onclick="render()">Filter</button></div>
${r.length?`<div class="grid">${r.map(icard).join('')}</div>`:`<div class="card"><h3>No items match</h3><p class="mut">Clear a filter or post the first one yourself.</p></div>`}`;},

item(){const i=items.find(x=>x.id===arg);if(!i)return '<p>Listing not found.</p>';
const o=P(i.o),own=o?.uid===me?.uid,em=CE_EMOJI[i.cat]||'';
return `<button class="btn alt sm" onclick="go('items')">&larr; Back to items</button>
<div class="cols" style="margin-top:14px">
<div class="gal">${i.ph&&i.ph.length?i.ph.map(s=>`<img src="${s}" alt="">`).join(''):`<div class="emo" style="height:260px;font-size:6rem">${em}</div>`}</div>
<div><span class="tag ${i.type==='Donate'?'don':''}">${i.type}</span><span class="tag">${i.st}</span>
<h2>${esc(i.t)}</h2><p>${esc(i.desc)}</p>
<p class="mut">${i.cat} &middot; ${i.cond} &middot; ${esc(i.city)} &middot; posted ${ago(i.createdAt)}</p>
${i.type==='Exchange'&&i.want?`<p><b>Looking for in exchange:</b> ${esc(i.want)}</p>`:''}
${o?`<div class="card click" onclick="go('person','${o.uid}')"><div class="row">${av(o)}<b>${esc(o.name)}</b></div></div>`:''}
<div class="row" style="margin-top:12px">
${own?`<button class="btn" onclick="go('post','${i.id}')">Edit listing</button>`:(o?`<button class="btn" onclick="msg('${o.uid}','${i.id}')">Message owner</button>`:'')}
<button class="btn warn sm" onclick="toast('Reported. Our team will review this listing.')">Report</button>
</div></div></div>`;},

post(){const i=items.find(x=>x.id===arg);const v=i||{t:'',cat:CATS[0],desc:'',cond:'Good',type:'Exchange',want:'',city:me?.city||''};
const opt=(a,x)=>`<option ${a===x?'selected':''}>${x}</option>`;tmpPhoto=null;tmpPhotos=null;
return `<h2>${i?'Edit item':'Post an item'}</h2>
<p class="mut" style="max-width:60ch">Only permitted items. Weapons, illegal goods, drugs, adult items, stolen goods and live animals are not allowed.</p>
<form onsubmit="pub(event)">
<label>Item title<input name="t" value="${esc(v.t)}" required></label>
<label>Category<select name="cat">${CATS.map(c=>opt(v.cat,c)).join('')}</select></label>
<label>Description<textarea name="desc" rows="3" required>${esc(v.desc)}</textarea></label>
<label>Condition<select name="cond">${['New','Like new','Good','Used'].map(c=>opt(v.cond,c)).join('')}</select></label>
<label>Photos (up to 5)<input type="file" accept="image/*" multiple onchange="pick(this,5,a=>{tmpPhotos=a;toast(a.length+' photo(s) ready')})"></label>
<label>Listing type<select name="type" onchange="this.form.want.parentNode.style.display=this.value==='Exchange'?'grid':'none'">${['Exchange','Donate'].map(c=>opt(v.type,c)).join('')}</select></label>
<label style="display:${v.type==='Exchange'?'grid':'none'}">What I want in exchange<input name="want" value="${esc(v.want)}"></label>
<label>City or area<input name="city" value="${esc(v.city)}" required></label>
<p class="err" id="er"></p>
<button class="btn" id="pubBtn">${i?'Save changes':'Publish'}</button>
</form>`;},

login(){return `<h2>Log in</h2><form onsubmit="login(event)">
<label>Email address<input name="id" type="email" required autocomplete="email" placeholder="you@example.com"></label>
<label>Password
  <div class="pw-wrap">
    <input type="password" name="pw" id="lpw" required autocomplete="current-password" placeholder="Your password">
    <button type="button" class="eye-btn" onclick="var f=document.getElementById('lpw');f.type=f.type==='password'?'text':'password';this.textContent=f.type==='password'?'👁':'🙈'" title="Show/hide password">👁</button>
  </div>
</label>
<p class="err" id="er"></p>
<button class="btn" id="loginBtn">Log in</button>
<span class="mut"><a href="#" onclick="go('forgot');return false">Forgot password?</a><br>New here? <a href="#" onclick="go('signup');return false">Sign up free</a></span>
</form>`;},

forgot(){return `<h2>Reset password</h2><form onsubmit="doForgot(event)">
<label>Email address<input name="id" type="email" required placeholder="you@example.com"></label>
<p class="err" id="er"></p><p class="suc" id="su"></p>
<button class="btn" id="forgotBtn">Send reset link</button>
<span class="mut"><a href="#" onclick="go('login');return false">&larr; Back to log in</a></span>
</form>`;},

signup(){return `<h2>Join OuroXchange</h2><form id="sfForm" onsubmit="signup(event)">
<label>Full name<input name="n" required autocomplete="name" placeholder="Your full name"></label>
<label>Email address<input name="id" type="email" required autocomplete="email" placeholder="you@example.com"></label>
<label>Password
  <div class="pw-wrap">
    <input type="password" name="pw" id="spw" minlength="6" required autocomplete="new-password" placeholder="Min. 6 characters">
    <button type="button" class="eye-btn" onclick="var f=document.getElementById('spw');f.type=f.type==='password'?'text':'password';this.textContent=f.type==='password'?'👁':'🙈'" title="Show/hide password">👁</button>
  </div>
</label>
<label>City / location<input name="city" required placeholder="e.g. Indore"></label>
<div><b>Interests</b> <span class="mut">(pick at least one)</span>
<div class="chips" style="margin-top:6px">${INT.map(x=>`<span class="chip" tabindex="0" role="button" onclick="this.classList.toggle('on')" onkeydown="event.key==='Enter'&&this.click()">${esc(x)}</span>`).join('')}</div></div>
<label class="row" style="font-weight:400"><input type="checkbox" required style="width:auto"> I accept the <a href="#" onclick="go('info','Terms &amp; Conditions');return false">Terms &amp; Conditions</a> and <a href="#" onclick="go('privacy');return false">Privacy Policy</a></label>
<p class="err" id="er"></p><p class="suc" id="su"></p>
<button class="btn" id="signupBtn">Create account</button>
<span class="mut">Already have an account? <a href="#" onclick="go('login');return false">Log in</a></span>
</form>`;},

chat(){
    const ids=Object.keys(chats).filter(uid=>P(uid)||(uid&&uid!==me?.uid));
    ids.sort((a,b)=>(chats[b]?._lastTs||0)-(chats[a]?._lastTs||0));
    if(cur==null&&ids.length)cur=ids[0];
    const c=cur?chats[cur]:null;
    const o=cur?(P(cur)||{uid:cur,name:'User '+cur.slice(0,5),city:'',photo:''}):null;
    if(c){
        c.unread=0;
        if(window.FB&&cur)fsMarkSeen(cur);
    }
    const bl=o&&blocked.includes(o.uid),it=c?.item?items.find(i=>i.id===c.item):null;
    if(cur&&window.FB&&!chatUnsub){
        chatUnsub=fsSubscribeChat(cur,msgs=>{
            if(!chats[cur])chats[cur]={m:[],unread:0};
            chats[cur].m=msgs.map(m=>({
                t:m.t,
                img:m.img,
                me:m.from===me.uid,
                time:m.time?.toDate?m.time.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'',
                seen:m.seen,
                _ts:m.time?.toDate?m.time.toDate().getTime():0
            }));
            if(chats[cur].m.length){
                chats[cur]._lastTs=chats[cur].m[chats[cur].m.length-1]._ts||Date.now();
            }
            if(view==='chat'&&cur){
                chats[cur].unread=0;
                fsMarkSeen(cur);
                nav();
                const ms=$('#ms');
                if(ms){ms.outerHTML=renderMessages(cur);const n=$('#ms');if(n)n.scrollTop=n.scrollHeight;}
                updateSidebarPreview(cur);
            }
        });
    }
    const fi=ids.filter(uid=>{
        const p=P(uid)||{uid,name:'User '+uid.slice(0,5)};
        return p&&p.name.toLowerCase().includes(cq.toLowerCase());
    });
    return `<h2>Chat</h2><div class="chat">
    <div class="cl"><div style="padding:8px"><input id="cs" placeholder="Search conversations" value="${esc(cq)}" oninput="cq=this.value;render();setTimeout(()=>$('#cs')&&$('#cs').focus(),0)"></div>
    ${fi.length?fi.map(uid=>{
        const p=P(uid)||{uid,name:'User '+uid.slice(0,5),city:'',photo:''};
        const last=chats[uid].m?chats[uid].m.slice(-1)[0]:null;
        return `<button class="${uid===cur?'on':''}" onclick="if(chatUnsub){chatUnsub();chatUnsub=null;}cur='${uid}';render()">
        ${av(p)}<div style="flex:1;min-width:0"><b>${esc(p.name)}</b>${chats[uid].unread>0?` <span class=badge>${chats[uid].unread}</span>`:''}
        <div class="mut" style="font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(last?(last.img?'Photo':last.t):'No messages yet')} ${last?last.time:''}</div></div></button>`;
    }).join(''):`<p class="mut" style="padding:14px;text-align:center">No conversations yet.<br>Open a profile or item and tap <b>Message</b>.</p>`}
    </div>
    <div class="cr">${o?`
    <div class="row" style="padding:10px;border-bottom:1px solid var(--ln)">${av(o).replace('<div','<div style="width:36px;height:36px;font-size:.9rem"').replace('<img','<img style="width:36px;height:36px"')}
    <b style="cursor:pointer" onclick="go('person','${o.uid}')">${esc(o.name)}</b>
    <span style="margin-left:auto" class="row">
    <button class="btn alt sm" onclick="blk('${o.uid}')">${bl?'Unblock':'Block'}</button>
    <button class="btn alt sm" onclick="toast('Conversation reported for review')">Report</button>
    <button class="btn alt sm" onclick="delete chats['${o.uid}'];cur=null;if(chatUnsub){chatUnsub();chatUnsub=null;}render()">Delete</button>
    </span></div>
    ${it?`<div class="warnb" style="cursor:pointer" onclick="go('item','${it.id}')">${it.ph&&it.ph[0]?`<img src="${it.ph[0]}" alt="" style="width:24px;height:24px;border-radius:4px;vertical-align:middle">`:(CE_EMOJI[it.cat]||'')} ${esc(it.t)}</div>`:''}
    <div class="warnb">Reminder: Always exchange in safe, public places. Never make advance payments.</div>
    ${renderMessages(cur)}
    <form class="send" style="max-width:none;display:flex" onsubmit="send(event)">
    <label class="btn alt" style="display:block;cursor:pointer">Photo<input type="file" accept="image/*" hidden onchange="pick(this,1,a=>send(null,a[0]))"></label>
    <input id="mi" autocomplete="off" placeholder="${bl?'You have blocked this user':'Type a message...'}" ${bl?'disabled':''}>
    <button class="btn" ${bl?'disabled':''}>Send</button></form>
    `:`<p class="mut" style="padding:30px;text-align:center">Select a conversation from the left.</p>`}</div></div>`;
}};

function prof(p,own){
    const its=mine(p.uid),act=its.filter(i=>i.st!=='Completed');
    const inc=own&&!(p.know?.length||p.need?.length||its.length);
    return `${inc?`<div class="card" style="margin-bottom:14px"><b>Complete your profile.</b> Add at least one skill, need or item listing.</div>`:''}
<div class="row" style="gap:18px">${av(p,'big')}<div><h2>${esc(p.name)}</h2><div class="mut">${esc(loc(p,own))} &middot; member since ${esc(p.joined||'')}</div><p>${esc(p.bio||'No bio yet.')}</p></div>
<span class="row" style="margin-left:auto">${own?`<button class="btn" onclick="tmpPhoto=null;go('edit')">Edit profile</button><button class="btn alt" onclick="logout()">Log out</button>`:`<button class="btn" onclick="msg('${p.uid}')">Message</button>`}</span></div>
<div class="cols" style="margin-top:20px">
<div class="card"><h3>What I know</h3>${(p.know||[]).length?(p.know||[]).map((k,x)=>`<p><b>${esc(k[0])}</b> &ndash; ${esc(k[1])}${own?` <button class="btn alt sm" onclick="me.know.splice(${x},1);saveAndRender()" aria-label="Remove">Remove</button>`:''}<br><span class="mut">${esc(k[2]||'')}</span></p>`).join(''):'<p class="mut">Nothing added yet.</p>'}
${own?`<form style="display:grid;gap:6px;max-width:none" onsubmit="addk(event)"><input name="s" placeholder="Skill, e.g. Cricket" required><input name="d" placeholder="Short description (optional)"><select name="l"><option>Beginner</option><option>Intermediate</option><option>Expert</option></select><button class="btn sm">Add skill</button></form>`:''}</div>
<div class="card"><h3>What I need</h3>${(p.need||[]).map((x,j)=>`<span class="tag">${esc(x)}${own?` <a href="#" onclick="me.need.splice(${j},1);saveAndRender();return false" aria-label="Remove">&times;</a>`:''}</span>`).join('')||'<p class="mut">Nothing added yet.</p>'}
${own?`<form style="display:flex;gap:6px;max-width:none;margin-top:8px" onsubmit="addn(event)"><input name="s" placeholder="Skill, item or person" required><button class="btn sm">Add</button></form>`:''}</div>
<div class="card"><h3>What I have</h3>${act.map(i=>`<a class="tag" href="#" onclick="go('item','${i.id}');return false">${esc(i.t)}</a>`).join('')||'<p class="mut">Post an item to show it here.</p>'}</div>
<div class="card"><h3>Interests</h3><div class="chips">${INT.map(x=>own?`<span class="chip ${(p.int||[]).includes(x)?'on':''}" tabindex="0" onclick="tgl(${INT.indexOf(x)})">${esc(x)}</span>`:(p.int||[]).includes(x)?`<span class="tag">${esc(x)}</span>`:'').join('')}</div>${own?'<p class="mut">Contact details stay private. Others reach you only through chat.</p>':''}</div></div>
<section style="margin-top:28px"><div class="row" style="justify-content:space-between"><h2>${own?'My listings':'Listings'}</h2>${own?`<button class="btn" onclick="go('post')">Post an item</button>`:''}</div>
${(own?its:act).length?`<div class="grid">${(own?its:act).map(i=>`<div>${icard(i)}${own?`<div class="row" style="margin-top:6px">
<button class="btn alt sm" onclick="go('post','${i.id}')">Edit</button>
${i.st==='Available'?`<button class="btn alt sm" onclick="st('${i.id}','Reserved')">Reserve</button>`:`<button class="btn alt sm" onclick="st('${i.id}','Available')">Available</button>`}
<button class="btn alt sm" onclick="st('${i.id}','Completed')">Complete</button>
<button class="btn warn sm" onclick="delItem('${i.id}')">Delete</button></div>`:''}</div>`).join('')}</div>`:'<p class="mut">No listings yet.</p>'}
</section>`;}

let searchTimer=null;
function hs(q){flt={q:q||''};go('search');if(window.FB&&q&&q.trim()){clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{const r=await fsLoadUsers(q);r.forEach(mergeUser);render();},350);}}
function sf(){flt={q:($('#sq')||{}).value||'',lv:($('#slv')||{}).value||'',av:($('#sav')||{}).value||'',int:($('#sin')||{}).value||''};if(window.FB&&flt.q.trim()){fsLoadUsers(flt.q).then(r=>{r.forEach(mergeUser);render();});}render();}

async function st(id,s){const i=items.find(x=>x.id===id);if(!i)return;i.st=s;toast(s==='Available'?'Marked Available':'Marked '+s);if(window.FB)await fsUpdateItemStatus(id,s);render();}
async function delItem(id){if(!confirm('Delete this listing? This cannot be undone.'))return;items=items.filter(i=>i.id!==id);if(window.FB)await fsDeleteItem(id);toast('Listing deleted');render();}

function tgl(x){const a=me.int=me.int||[],n=INT[x];if(a.includes(n)){if(a.length>1)a.splice(a.indexOf(n),1);}else a.push(n);saveAndRender();}
function addk(e){e.preventDefault();const f=e.target;me.know=me.know||[];me.know.push([f.s.value,f.l.value,f.d.value||'No description yet']);f.reset();saveAndRender();}
function addn(e){e.preventDefault();me.need=me.need||[];me.need.push(e.target.s.value);e.target.reset();saveAndRender();}

async function saveP(e){e.preventDefault();const f=e.target,btn=$('#saveProfileBtn');if(btn){btn.disabled=true;btn.textContent='Saving...';}
Object.assign(me,{name:f.n.value,city:f.city.value,area:f.area.value,hide:f.hide.checked,bio:f.bio.value});
if(tmpPhoto)me.photo=tmpPhoto;if(window.FB)await fsSaveProfile(me);mergeUser(me);successToast('Profile saved!');go('me');}

async function saveAndRender(){if(window.FB)await fsSaveProfile(me);mergeUser(me);render();}

async function pub(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),er=$('#er'),btn=$('#pubBtn');
if(BAD.test(f.t+' '+f.desc)){er.textContent='This looks like a prohibited item. See the Permitted Items Policy.';return;}
if(btn){btn.disabled=true;btn.textContent='Saving...';}
const d={t:f.t,cat:f.cat,type:f.type,cond:f.cond,want:f.type==='Exchange'?f.want:'',city:f.city,desc:f.desc};
let existing=items.find(x=>x.id===arg);
if(existing){Object.assign(existing,d);if(tmpPhotos)existing.ph=tmpPhotos;if(window.FB)await fsSaveItem({...d,ph:existing.ph||[]},existing.id);successToast('Changes saved!');}
else{const ph=tmpPhotos||[];if(window.FB){const newId=await fsSaveItem({...d,ph});if(newId)items.unshift({...d,id:newId,o:me.uid,oName:me.name,st:'Available',ph,createdAt:null});}successToast('Item published!');}
go('me');}

function blk(uid){const i=blocked.indexOf(uid);i<0?blocked.push(uid):blocked.splice(i,1);render();}
async function send(e,img){
    if(e)e.preventDefault();
    const input=$('#mi'),t=input?input.value.trim():'';
    if(!img&&!t)return;
    if(blocked.includes(cur))return;
    const tm=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(!chats[cur])chats[cur]={m:[],unread:0};
    chats[cur].m.push({t,img,me:true,time:tm,seen:false,_ts:Date.now()});
    chats[cur]._lastTs=Date.now();
    if(input){input.value='';input.focus();}
    const ms=$('#ms');
    if(ms){ms.outerHTML=renderMessages(cur);$('#ms').scrollTop=$('#ms').scrollHeight;}
    updateSidebarPreview(cur);
    if(window.FB)await fsSendMessage(cur,t,img||'');
}

async function submitContact(e){
    e.preventDefault();
    const f=e.target;
    const btn=document.getElementById('contactSubmitBtn');
    const st=document.getElementById('contactStatus');
    const name=(f.name.value||'').trim();
    const email=(f.email.value||'').trim();
    const topic=f.topic.value;
    const message=(f.message.value||'').trim();

    if(!name||!email||!message){
        if(st)st.innerHTML='<p class="err" style="margin:10px 0 0">Please fill in all required fields.</p>';
        return;
    }

    if(btn){btn.disabled=true;btn.textContent='Sending...';}
    if(st)st.innerHTML='';

    try{
        const {db,FS}=window.FB||{};
        if(db&&FS){
            await FS.addDoc(FS.collection(db,'contact_messages'),{
                name,
                email,
                topic,
                message,
                uid:me?.uid||null,
                createdAt:FS.serverTimestamp()
            });
        }
        if(st){
            st.innerHTML=`<div style="background:linear-gradient(135deg,#e8f5e9,#c8e6c9);border:1px solid #4caf50;border-radius:10px;padding:16px 18px;margin:14px 0;text-align:center">
              <div style="font-size:2rem;margin-bottom:6px">&#9989;</div>
              <b style="color:#2e7d32;font-size:1rem">Message Sent Successfully!</b>
              <p style="margin:8px 0 0;color:#388e3c;font-size:.9rem">Thank you for reaching out, <b>${esc(name)}</b>.<br>We have received your message regarding <b>${esc(topic)}</b> and will reply to <b>${esc(email)}</b> within 24-48 hours.</p>
            </div>`;
        }
        f.message.value='';
        if(btn){btn.disabled=false;btn.textContent='Message Sent';setTimeout(()=>{if(btn)btn.textContent='Send Another Message';},3500);}
    }catch(err){
        console.error('Contact submit error:',err);
        if(st)st.innerHTML=`<p class="err" style="margin:10px 0 0">Could not submit: ${esc(err.message||'Please email us directly at hello@ouroxchange.in')}</p>`;
        if(btn){btn.disabled=false;btn.textContent='Send Message';}
    }
}

function render(){if(['me','post','chat','edit'].includes(view)&&!me){after=()=>go(view,arg);toast('Please log in first');view='login';}nav();$('#app').innerHTML=V[view]();const ms=$('#ms');if(ms)ms.scrollTop=ms.scrollHeight;}

const FBM=code=>({'auth/invalid-credential':'Email or password is incorrect.','auth/email-already-in-use':'An account with this email already exists.','auth/weak-password':'Password must be at least 6 characters.','auth/invalid-email':'Please enter a valid email address.','auth/too-many-requests':'Too many attempts. Please try again later.','auth/requires-recent-login':'Please log in again to complete this action.','auth/user-not-found':'No account found with this email.','auth/wrong-password':'Incorrect password. Please try again.','auth/network-request-failed':'Network error. Check your internet connection.','auth/popup-closed-by-user':'Sign-in popup was closed. Please try again.'}[code]||'Something went wrong. Please try again.');

async function setUser(u){const{db,FS}=FB;const snap=await FS.getDoc(FS.doc(db,'users',u.uid));let profile;
if(snap.exists()){profile={uid:u.uid,...snap.data()};}
else{profile={uid:u.uid,name:u.displayName||u.email.split('@')[0],city:'',state:'',bio:'New to OuroXchange.',know:[],need:[],int:[],av:'',joined:new Date().toLocaleDateString('en',{month:'short',year:'numeric'})};await FS.setDoc(FS.doc(db,'users',u.uid),{...profile,nameLower:profile.name.toLowerCase()});}
mergeUser(profile);me=profile;return profile;}

window.onUser=async(u)=>{
    if(u&&u.emailVerified){
        await setUser(u);
        const[users,its]=await Promise.all([fsLoadUsers(),fsLoadItems()]);
        users.forEach(mergeUser);
        items=its;
        // Restore conversations saved in Firestore so chats survive page refresh
        await fsLoadConversations();
        // Start real-time listener for user's conversations list
        fsListenChats();
    }else if(!u&&me?.uid){
        // User signed out — reset all state to prevent stale reads
        me=null;people=[];items=[];chats={};cur=null;
        if(chatUnsub){chatUnsub();chatUnsub=null;}
        if(chatsUnsub){chatsUnsub();chatsUnsub=null;}
    }
    render();
};

function enter(){successToast('Welcome back, '+me.name.split(' ')[0]+'!');const a=after;after=null;a?a():go('home');}

async function login(e){e.preventDefault();const f=e.target,er=$('#er'),btn=$('#loginBtn')||f.querySelector('.btn');
er.textContent='';btn.disabled=true;btn.textContent='Logging in...';
const{U,auth}=FB;
try{const c=await U.signInWithEmailAndPassword(auth,f.id.value.trim(),f.pw.value);
if(!c.user.emailVerified){await U.sendEmailVerification(c.user);await U.signOut(auth);er.textContent='Please verify your email first. We just resent the verification link.';btn.disabled=false;btn.textContent='Log in';return;}
await setUser(c.user);enter();}
catch(x){er.textContent=FBM(x.code);btn.disabled=false;btn.textContent='Log in';}}

async function signup(e){e.preventDefault();const f=e.target,er=$('#er'),su=$('#su');
const iv=[...f.querySelectorAll('.chip.on')].map(c=>c.textContent);
const btn=$('#signupBtn')||f.querySelector('.btn');const{U,auth,db,FS}=FB;
er.textContent='';su.textContent='';
if(!iv.length){er.textContent='Please pick at least one interest.';return;}
btn.disabled=true;btn.textContent='Creating account...';
try{const c=await U.createUserWithEmailAndPassword(auth,f.id.value.trim(),f.pw.value);
await U.updateProfile(c.user,{displayName:f.n.value.trim()});
const profile={name:f.n.value.trim(),nameLower:f.n.value.trim().toLowerCase(),city:f.city.value.trim(),state:'',bio:'New to OuroXchange.',know:[],need:[],int:iv,av:'',joined:new Date().toLocaleDateString('en',{month:'short',year:'numeric'})};
await FS.setDoc(FS.doc(db,'users',c.user.uid),profile);
await U.sendEmailVerification(c.user);await U.signOut(auth);
// Bug #4 fix: show a prominent email verification banner
const suEl=document.getElementById('su');
if(suEl){
    suEl.innerHTML=`<div style="background:linear-gradient(135deg,#e8f5e9,#c8e6c9);border:1px solid #4caf50;border-radius:10px;padding:16px 18px;margin:12px 0;text-align:center">
      <div style="font-size:2rem;margin-bottom:6px">📧</div>
      <b style="color:#2e7d32;font-size:1rem">Account created!</b>
      <p style="margin:8px 0 0;color:#388e3c;font-size:.9rem">A verification link has been sent to <b>${esc(f.id.value.trim())}</b>.<br>Please check your inbox (and spam folder), then <a href="#" onclick="go('login');return false" style="color:#2e7d32;font-weight:700">log in here</a>.</p>
    </div>`;
}
btn.disabled=false;btn.textContent='Create account';setTimeout(()=>go('login'),6000);}
catch(x){er.textContent=FBM(x.code);btn.disabled=false;btn.textContent='Create account';}}

async function doForgot(e){e.preventDefault();const f=e.target,er=$('#er'),su=$('#su'),btn=$('#forgotBtn')||f.querySelector('.btn');
er.textContent='';su.textContent='';btn.disabled=true;btn.textContent='Sending...';
try{await FB.U.sendPasswordResetEmail(FB.auth,f.id.value.trim());su.textContent='Reset link sent! Check your email inbox (and spam folder).';btn.disabled=false;btn.textContent='Send reset link';}
catch(x){er.textContent=FBM(x.code);btn.disabled=false;btn.textContent='Send reset link';}}

function forgot(e){doForgot(e);}

function logout(){if(window.FB)FB.U.signOut(FB.auth);me=null;cur=null;after=null;people=[];items=[];chats={};if(chatUnsub){chatUnsub();chatUnsub=null;}if(chatsUnsub){chatsUnsub();chatsUnsub=null;}toast('Logged out. See you soon!');go('home');}

async function delAcct(){if(!confirm('Delete your account permanently? Your listings will also be removed.'))return;
try{const{db,FS}=FB;const myItems=mine(me.uid);for(const i of myItems){try{await FS.deleteDoc(FS.doc(db,'items',i.id));}catch(_){}}
await FS.deleteDoc(FS.doc(db,'users',me.uid));await FB.U.deleteUser(FB.auth.currentUser);
me=null;people=[];items=[];cur=null;chats={};if(chatUnsub){chatUnsub();chatUnsub=null;}if(chatsUnsub){chatsUnsub();chatsUnsub=null;}toast('Account deleted. Take care!');go('home');}
catch(x){toast(FBM(x.code),4500);}}

window.onFirebaseReady=function(){console.log('Firebase ready');fbReady=true;render();};
render();

import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Heart, Sparkles, Search, Download, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { heroCatalog } from './rovCatalog.js';

const heroes = heroCatalog;
const modes = [
  { id:'collection', title:'Skin Collection', desc:'รวมสกินเป็นคอลเลกชัน' },
  { id:'showcase', title:'Skin Showcase', desc:'จัดสกินเป็นโปสเตอร์' },
  { id:'preview', title:'Hero Preview', desc:'พรีวิวฮีโร่และสกิน' },
];
const colors=['#f5d9ea','#dce6ff','#e4d9ff','#fbe5d9','#d8f0e9','#e9e1f6'];
function App(){
  const [step,setStep]=useState(1), [hero,setHero]=useState(heroes[0]), [selected,setSelected]=useState([heroCatalog[0].skins[0].name]);
  const [query,setQuery]=useState(''), [mode,setMode]=useState('collection'), [bg,setBg]=useState('#f5e8f2'), [favorite,setFavorite]=useState(false);
  const previewRef=useRef(null);
  const skinList=useMemo(()=>hero.skins.filter(s=>s.name.toLowerCase().includes(query.toLowerCase())),[hero,query]);
  const toggleSkin=(skin)=>setSelected(prev=>prev.includes(skin)?prev.filter(x=>x!==skin):[...prev,skin]);
  const move=(idx,dir)=>setSelected(prev=>{const a=[...prev],to=idx+dir;if(to<0||to>=a.length)return a;[a[idx],a[to]]=[a[to],a[idx]];return a;});
  const download=async()=>{if(!previewRef.current)return;try{const data=await toPng(previewRef.current,{pixelRatio:2,cacheBust:true});const a=document.createElement('a');a.download='rov-skin-collection.png';a.href=data;a.click();}catch(e){alert('ดาวน์โหลดไม่สำเร็จ ลองอีกครั้งนะคะ');}};
  return <main className="app">
    <header className="topbar"><div className="brand"><span className="brandmark">✧</span><div><b>RoV</b><small>SKIN GENERATOR</small></div></div>
      <nav><button onClick={()=>setStep(1)}>Home</button><button className="active" onClick={()=>setStep(1)}>Skin Generator</button><button onClick={()=>setStep(5)}>My Collection</button></nav>
      <button className={favorite?'heart on':'heart'} onClick={()=>setFavorite(!favorite)} aria-label="Favorite"><Heart size={20} fill={favorite?'currentColor':'none'}/></button>
    </header>
    <section className="heroBanner"><div className="bannerCopy"><span className="eyebrow">COLLECT · ARRANGE · CREATE</span><h1>RoV Skin<br/><i>Generator</i></h1><p>เลือกสกินที่ชอบ จัดเรียงได้ตามใจ<br/>สร้างภาพคอลเลกชันในสไตล์ของคุณ ♡</p><button className="primary" onClick={()=>setStep(1)}>เริ่มสร้างภาพกันเลย <ArrowRight size={17}/></button></div>
      <div className="bannerArt"><div className="halo">✧</div><div className="artCard">♡<span>ANGEL<br/>COLLECTION</span></div><div className="spark s1">✦</div><div className="spark s2">✧</div></div></section>
    <section className="workspace">
      <div className="sectionHead"><div><span className="eyebrow">CREATE YOUR STYLE</span><h2>Skin Generator <Sparkles size={20}/></h2></div><div className="steps">{[1,2,3,4,5].map(n=><button key={n} className={step===n?'current':''} onClick={()=>setStep(n)}>{n}</button>)}</div></div>
      {step===1&&<div className="panel"><h3>Step 1 · Select Hero <Sparkles size={15}/></h3><div className="search"><Search size={17}/><input placeholder="ค้นหาฮีโร่..." value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="heroGrid">{heroes.filter(h=>h.name.toLowerCase().includes(query.toLowerCase())).map((h,i)=><button className={'heroTile '+(hero.name===h.name?'chosen':'')} key={h.name} onClick={()=>{setHero(h);setSelected([h.skins[0].name]);setQuery('')}}><div className="tileArt" style={{background:colors[i%colors.length]}}><span>{h.name.slice(0,1)}</span><Sparkles size={16}/></div><b>{h.name}</b></button>)}</div><div className="bottomActions"><span className="muted">เลือกฮีโร่เพื่อไปยังขั้นตอนถัดไป</span><button className="primary" onClick={()=>{setQuery('');setStep(2)}}>ถัดไป <ArrowRight size={16}/></button></div></div>}
      {step===2&&<div className="panel"><h3>Step 2 · Select Skin <Sparkles size={15}/></h3><p className="muted">Hero: {hero.name} · เลือกได้หลายสกิน</p><div className="skinGrid">{skinList.map((s,i)=><button key={s} className={'skinTile '+(selected.includes(s)?'chosen':'')} onClick={()=>toggleSkin(s)}><div className="skinArt" style={{background:colors[(i+1)%colors.length]}}><span>{s.split(' ').map(w=>w[0]).join('').slice(0,3)}</span>{selected.includes(s)&&<b className="check">✓</b>}</div><b>{s}</b></button>)}</div><div className="bottomActions"><button className="secondary" onClick={()=>setStep(1)}><ArrowLeft size={16}/> กลับ</button><span className="muted">{selected.length} สกินที่เลือก</span><button className="primary" disabled={!selected.length} onClick={()=>setStep(3)}>ถัดไป <ArrowRight size={16}/></button></div></div>}
      {step===3&&<div className="panel"><h3>Step 3 · Arrange Skins <Sparkles size={15}/></h3><p className="muted">ใช้ปุ่มลูกศรจัดลำดับสกินที่ต้องการ</p><div className="arrangeList">{selected.map((s,i)=><div className="arrangeRow" key={s}><span className="num">{i+1}</span><div className="miniArt" style={{background:colors[i%colors.length]}}>{s.slice(0,1)}</div><b>{s}</b><div className="moveBtns"><button onClick={()=>move(i,-1)} disabled={i===0}>↑</button><button onClick={()=>move(i,1)} disabled={i===selected.length-1}>↓</button><button onClick={()=>toggleSkin(s)}>×</button></div></div>)}</div><div className="backgrounds"><b>เลือกพื้นหลัง</b>{colors.map(c=><button key={c} style={{background:c}} className={bg===c?'bgChosen':''} onClick={()=>setBg(c)} aria-label={c}/>)}</div><div className="bottomActions"><button className="secondary" onClick={()=>setStep(2)}><ArrowLeft size={16}/> กลับ</button><button className="primary" disabled={!selected.length} onClick={()=>setStep(4)}>ถัดไป <ArrowRight size={16}/></button></div></div>}
      {step===4&&<div className="panel"><h3>Step 4 · เลือกรูปแบบภาพ <Sparkles size={15}/></h3><div className="modeGrid">{modes.map((m,i)=><button key={m.id} className={'modeCard '+(mode===m.id?'chosen':'')} onClick={()=>setMode(m.id)}><div className="modeArt" style={{background:colors[i]}}>{i===0?'♡':i===1?'✧':'♔'}<span>{selected.length} SKINS</span></div><b>{m.title}</b><small>{m.desc}</small></button>)}</div><div className="bottomActions"><button className="secondary" onClick={()=>setStep(3)}><ArrowLeft size={16}/> กลับ</button><button className="primary" onClick={()=>setStep(5)}>ถัดไป <ArrowRight size={16}/></button></div></div>}
      {step===5&&<div className="panel"><h3>Step 5 · Preview & Download <Sparkles size={15}/></h3><div className="previewWrap"><div className="preview" ref={previewRef} style={{background:`linear-gradient(135deg,${bg},#fff 60%,#e5dcf5)`}}><div className="previewTop">✧ RoV SKIN COLLECTION ✧<small>{hero.name} · {mode==='collection'?'Skin Collection':mode==='showcase'?'Skin Showcase':'Hero Preview'}</small></div><div className="previewCards">{selected.map((s,i)=><div className="previewCard" key={s} style={{background:colors[i%colors.length]}}><span className="previewInitial">{s.slice(0,1)}</span><b>{s}</b><small>{hero.name}</small></div>)}</div><div className="previewFooter">COLLECT · ARRANGE · CREATE ♡</div></div></div><div className="bottomActions"><button className="secondary" onClick={()=>setStep(4)}><ArrowLeft size={16}/> กลับ</button><button className="secondary" onClick={()=>{setStep(1);setSelected([hero.skins[0].name])}}><RotateCcw size={16}/> เริ่มใหม่</button><button className="primary" onClick={download}><Download size={16}/> ดาวน์โหลด PNG</button></div></div>}
    </section>
    <footer>♡ RoV Skin Generator <span>Personal project · White Angel theme</span></footer>
  </main>;
}
export default App;

(() => {
  'use strict';

  const STORAGE_KEY = 'platz161_state_v4';
  let activeView = 'dashboard';
  const activeTab = { organize:'shopping', costs:'overview', care:'lawn', more:'site' };

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const id = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today = () => new Date().toISOString().slice(0,10);
  const yearNow = () => new Date().getFullYear();
  const num = (v,d=0) => Number(v||0).toLocaleString('de-DE',{maximumFractionDigits:d});
  const money = v => Number(v||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const fmtDate = v => v ? new Date(`${v}T12:00:00`).toLocaleDateString('de-DE') : '–';
  const daysBetween = (a,b) => {
    if(!a || !b) return 0;
    const x = new Date(`${a}T12:00:00`);
    const y = new Date(`${b}T12:00:00`);
    return Math.max(0, Math.round((y-x)/86400000));
  };

  function defaultChecklist(kind){
    const start = ['Wasser anschließen / prüfen','Stromversorgung prüfen','Kühlschrank einschalten','Petroleum-Bestand prüfen','Zelt / Vorzelt kontrollieren','Möbel und Geräte aufstellen','Rasenfläche kontrollieren'];
    const winter = ['Wasser abstellen und Leitungen entleeren','Stromgeräte abschalten','Kühlschrank leeren und offen lassen','Petroleum sicher lagern','Polster trocken einlagern','Zelt / Vorzelt kontrollieren','Lose Gegenstände sichern'];
    return (kind==='start'?start:winter).map(text=>({id:id(),text,done:false}));
  }

  function defaultState(){
    return {
      version:4,
      site:{campName:'Campingplatz',pitch:'161',area:'',notes:''},
      family:[
        {id:id(),name:'Marcel',role:'Eltern'},
        {id:id(),name:'Denise',role:'Eltern'},
        {id:id(),name:'Leon',role:'Kind'},
        {id:id(),name:'Luca',role:'Kind'}
      ],
      nextArrival:'',
      shopping:[],
      tasks:[],
      inventory:[],
      costs:[],
      petroleum:[],
      electricity:[],
      stays:[],
      lawn:[],
      hedge:[],
      contracts:[],
      gasChecks:[],
      seasonStart:defaultChecklist('start'),
      winter:defaultChecklist('winter')
    };
  }

  function normalize(s){
    const d = defaultState();
    if(!s || typeof s !== 'object') return d;
    const x = {...d,...s};
    ['family','shopping','tasks','inventory','costs','petroleum','electricity','stays','lawn','hedge','contracts','gasChecks','seasonStart','winter'].forEach(k=>{
      if(!Array.isArray(x[k])) x[k]=d[k];
    });
    x.site = {...d.site,...(x.site||{})};
    return x;
  }

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('platz161_state_v2');
      return normalize(raw ? JSON.parse(raw) : null);
    }catch(e){
      console.warn('Lokale Daten konnten nicht geladen werden',e);
      return defaultState();
    }
  }

  let state = load();

  function save(){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    renderAll();
  }

  function toast(msg){
    const el=$('#toast');
    if(!el) return;
    el.textContent=msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t=setTimeout(()=>el.classList.remove('show'),1800);
  }

  function empty(text){return `<div class="empty">${esc(text)}</div>`}
  function nextArrivalLabel(){
    if(!state.nextArrival) return 'Noch nicht geplant';
    const a=new Date(`${state.nextArrival}T12:00:00`);
    const t=new Date(`${today()}T12:00:00`);
    const d=Math.round((a-t)/86400000);
    if(d===0) return 'Heute';
    if(d===1) return 'Morgen';
    if(d>1) return `in ${d} Tagen`;
    return fmtDate(state.nextArrival);
  }
  function totalNights(year=null){
    return state.stays.reduce((sum,x)=>{
      if(!x.arrival||!x.departure) return sum;
      if(year && Number(x.arrival.slice(0,4))!==Number(year)) return sum;
      return sum+daysBetween(x.arrival,x.departure);
    },0);
  }
  function petroleumStock(){
    return state.petroleum.reduce((sum,x)=>sum+(x.kind==='purchase'?Number(x.liters||0):-Number(x.liters||0)),0);
  }
  function currentYearCostData(year=yearNow()){
    const d={annual:0,electricity:0,petroleum:0,repairs:0,purchases:0,other:0};
    state.costs.filter(x=>Number(x.year)===Number(year)).forEach(x=>d[x.category]=(d[x.category]||0)+Number(x.amount||0));
    state.petroleum.filter(x=>x.kind==='purchase' && (x.date||'').startsWith(String(year))).forEach(x=>d.petroleum+=Number(x.price||0));
    state.electricity.filter(x=>Number(x.year)===Number(year)).forEach(x=>d.electricity+=Number(x.cost||0)+Number(x.meterRent||0));
    return d;
  }

  function renderTop(){
    const name=$('#campNameTop');
    if(name) name.textContent=`${state.site.campName||'Campingplatz'} · Platz ${state.site.pitch||'161'}`;
    const badge=$('#syncBadge');
    if(badge){badge.textContent='Lokal';badge.className='status local'}
  }

  function renderDashboard(){
    const y=yearNow();
    const costs=Object.values(currentYearCostData(y)).reduce((a,b)=>a+b,0);
    $('#view-dashboard').innerHTML=`
      <div class="hero">
        <div class="hero-copy">
          <div class="badge">Familien-CampManager</div>
          <h1>Die Hentschel's</h1>
          <p>${esc(state.site.campName||'Campingplatz')} · Platz ${esc(state.site.pitch||'161')}</p>
        </div>
        <img class="hero-logo" src="logo.jpg" alt="Die Hentschel's – Platz 161">
      </div>
      <div class="grid">
        <button class="card card-action" data-open="arrival"><h3>Nächste Anreise</h3><div class="metric">${state.nextArrival?fmtDate(state.nextArrival):'–'}</div><p>${esc(nextArrivalLabel())}</p></button>
        <button class="card card-action" data-go="organize" data-tab="shopping"><h3>Offene Einkäufe</h3><div class="metric">${state.shopping.filter(x=>!x.done).length}</div><p>noch zu besorgen</p></button>
        <button class="card card-action" data-go="organize" data-tab="tasks"><h3>Offene Aufgaben</h3><div class="metric">${state.tasks.filter(x=>!x.done).length}</div><p>noch zu erledigen</p></button>
        <button class="card card-action" data-go="more" data-tab="stays"><h3>Übernachtungen ${y}</h3><div class="metric">${totalNights(y)}</div><p>Gesamt: ${totalNights()} Nächte</p></button>
        <button class="card card-action" data-go="costs" data-tab="petroleum"><h3>Petroleum</h3><div class="metric">${num(petroleumStock(),1)} <small>Liter</small></div><p>aktueller Bestand</p></button>
        <button class="card card-action" data-go="costs" data-tab="overview"><h3>Kosten ${y}</h3><div class="metric">${money(costs)}</div><p>Jahresübersicht</p></button>
        <div class="card full">
          <h2>Schnellzugriff</h2>
          <div class="quick-grid">
            <button class="quick" data-add="shopping"><b>＋</b><small>Einkauf</small></button>
            <button class="quick" data-add="task"><b>✓</b><small>Aufgabe</small></button>
            <button class="quick" data-add="stay"><b>☾</b><small>Übernachtung</small></button>
            <button class="quick" data-add="petroleum"><b>⛽</b><small>Petroleum</small></button>
          </div>
        </div>
        ${upcomingCards()}
      </div>`;
  }

  function upcomingCards(){
    const now=today();
    const items=[];
    state.gasChecks.forEach(x=>x.nextDue&&x.nextDue>=now&&items.push({date:x.nextDue,title:'Gasprüfung',detail:x.company||'Nächste Prüfung'}));
    state.contracts.forEach(x=>{
      const d=x.noticeDate||x.endDate;
      if(d&&d>=now) items.push({date:d,title:`Vertrag: ${x.name}`,detail:x.noticeDate?'Kündigungs-/Prüffrist':'Vertragsende'});
    });
    items.sort((a,b)=>a.date.localeCompare(b.date));
    const rows=items.slice(0,4);
    return `<div class="card full"><h2>Nächste Termine</h2>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(x.title)}</div><div class="row-sub">${esc(x.detail)}</div></div><strong>${fmtDate(x.date)}</strong></div>`).join('')}</div>`:empty('Keine Vertrags- oder Prüftermine eingetragen.')}</div>`;
  }

  function tabs(section,items){
    return `<div class="section-tabs">${items.map(([k,l])=>`<button class="chip ${activeTab[section]===k?'active':''}" data-section="${section}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
  }

  function renderOrganize(){
    const t=activeTab.organize;
    $('#view-organize').innerHTML=`<div class="view-head"><div><h1>Listen & Inventar</h1><p>Gemeinsam organisieren und abhaken.</p></div></div>
    ${tabs('organize',[['shopping','Einkäufe'],['tasks','Aufgaben'],['inventory','Inventar']])}
    ${t==='shopping'?renderShopping():t==='tasks'?renderTasks():renderInventory()}`;
  }
  function renderShopping(){
    const rows=[...state.shopping].sort((a,b)=>Number(a.done)-Number(b.done));
    return `<div class="toolbar"><button class="btn" data-add="shopping">＋ Einkauf hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row ${x.done?'done':''}"><input type="checkbox" data-toggle="shopping" data-id="${x.id}" ${x.done?'checked':''}><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc(x.quantity||'')}${x.category?` · ${esc(x.category)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="shopping" data-id="${x.id}">✎</button><button class="mini danger" data-del="shopping" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Einkäufe eingetragen.')}`;
  }
  function renderTasks(){
    const rows=[...state.tasks].sort((a,b)=>Number(a.done)-Number(b.done));
    return `<div class="toolbar"><button class="btn" data-add="task">＋ Aufgabe hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row ${x.done?'done':''}"><input type="checkbox" data-toggle="tasks" data-id="${x.id}" ${x.done?'checked':''}><div class="row-main"><div class="row-title">${esc(x.title)}</div><div class="row-sub">${esc(x.member||'Nicht zugewiesen')}${x.due?` · ${fmtDate(x.due)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="task" data-id="${x.id}">✎</button><button class="mini danger" data-del="task" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Aufgaben eingetragen.')}`;
  }
  function renderInventory(){
    const rows=[...state.inventory].sort((a,b)=>String(a.name).localeCompare(String(b.name),'de'));
    return `<div class="toolbar"><button class="btn" data-add="inventory">＋ Gegenstand hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.location?`Ort: ${esc(x.location)}`:''}${x.quantity?` · Menge: ${esc(x.quantity)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="inventory" data-id="${x.id}">✎</button><button class="mini danger" data-del="inventory" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch kein Inventar erfasst.')}`;
  }

  function renderCosts(){
    const t=activeTab.costs;
    $('#view-costs').innerHTML=`<div class="view-head"><div><h1>Kosten & Verbrauch</h1><p>Campingkosten ohne Lebensmittel und Ausflüge.</p></div></div>
    ${tabs('costs',[['overview','Übersicht'],['costs','Kosten'],['petroleum','Petroleum'],['electricity','Strom']])}
    ${t==='overview'?renderCostOverview():t==='costs'?renderCostRows():t==='petroleum'?renderPetroleum():renderElectricity()}`;
  }
  function renderCostOverview(){
    const y=yearNow(), d=currentYearCostData(y), total=Object.values(d).reduce((a,b)=>a+b,0);
    const labels={annual:'Jahresgebühr',electricity:'Strom',petroleum:'Petroleum',repairs:'Reparaturen',purchases:'Neuanschaffungen',other:'Sonstiges'};
    return `<div class="grid"><div class="card half"><h2>Gesamtkosten ${y}</h2><div class="metric">${money(total)}</div></div><div class="card half"><h2>Strom ${y}</h2><div class="metric">${money(d.electricity)}</div></div><div class="card full"><h2>Aufteilung</h2><div class="cost-bars">${Object.entries(d).map(([k,v])=>`<div class="cost-line"><span>${labels[k]}</span><div class="bar"><i style="width:${total?Math.min(100,v/total*100):0}%"></i></div><strong class="right">${money(v)}</strong></div>`).join('')}</div></div></div>`;
  }
  function renderCostRows(){
    const labels={annual:'Jahresgebühr',repairs:'Reparatur',purchases:'Neuanschaffung',other:'Sonstiges'};
    const rows=[...state.costs].sort((a,b)=>Number(b.year)-Number(a.year));
    return `<div class="toolbar"><button class="btn" data-add="cost">＋ Kosten hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(labels[x.category]||x.category)} · ${esc(x.year)}</div><div class="row-sub">${esc(x.note||'')}</div></div><strong>${money(x.amount)}</strong><div class="row-actions"><button class="mini" data-edit="cost" data-id="${x.id}">✎</button><button class="mini danger" data-del="cost" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Kosten eingetragen.')}`;
  }
  function renderPetroleum(){
    const rows=[...state.petroleum].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `<div class="grid"><div class="card half"><h2>Bestand</h2><div class="metric">${num(petroleumStock(),1)} <small>Liter</small></div></div></div><div class="toolbar"><button class="btn" data-add="petroleum">＋ Petroleum buchen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${x.kind==='purchase'?'Einkauf':'Verbrauch'} · ${num(x.liters,1)} L</div><div class="row-sub">${fmtDate(x.date)}${x.note?` · ${esc(x.note)}`:''}</div></div>${x.kind==='purchase'?`<strong>${money(x.price)}</strong>`:''}<div class="row-actions"><button class="mini" data-edit="petroleum" data-id="${x.id}">✎</button><button class="mini danger" data-del="petroleum" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Petroleum-Einträge.')}`;
  }
  function renderElectricity(){
    const rows=[...state.electricity].sort((a,b)=>Number(b.year)-Number(a.year));
    return `<div class="toolbar"><button class="btn" data-add="electricity">＋ Jahreswert hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(x.year)} · ${num(x.consumption,1)} kWh</div><div class="row-sub">Strom ${money(x.cost)} · Zählermiete ${money(x.meterRent)}</div></div><strong>${money(Number(x.cost||0)+Number(x.meterRent||0))}</strong><div class="row-actions"><button class="mini" data-edit="electricity" data-id="${x.id}">✎</button><button class="mini danger" data-del="electricity" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Jahreswerte eingetragen.')}`;
  }

  function renderCare(){
    const t=activeTab.care;
    $('#view-care').innerHTML=`<div class="view-head"><div><h1>Rasen & Hecke</h1><p>Pflege einfach dokumentieren.</p></div></div>${tabs('care',[['lawn','Rasen'],['hedge','Hecke']])}${t==='lawn'?renderLawn():renderHedge()}`;
  }
  function renderLawn(){
    const rows=[...state.lawn].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `<div class="toolbar"><button class="btn" data-add="lawn">＋ Rasenschnitt eintragen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">Rasen gemäht</div><div class="row-sub">${fmtDate(x.date)}${x.note?` · ${esc(x.note)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="lawn" data-id="${x.id}">✎</button><button class="mini danger" data-del="lawn" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch kein Rasenschnitt eingetragen.')}`;
  }
  function renderHedge(){
    const y=yearNow(), yr=state.hedge.filter(x=>(x.date||'').startsWith(String(y))), rows=[...state.hedge].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `<div class="grid"><div class="card half"><h2>Heckenschnitt ${y}</h2><div class="metric">${yr.length}<small> / 2</small></div></div></div><div class="toolbar"><button class="btn" data-add="hedge">＋ Heckenschnitt eintragen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">Hecke geschnitten</div><div class="row-sub">${fmtDate(x.date)}${x.note?` · ${esc(x.note)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="hedge" data-id="${x.id}">✎</button><button class="mini danger" data-del="hedge" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch kein Heckenschnitt eingetragen.')}`;
  }

  function renderMore(){
    const t=activeTab.more;
    $('#view-more').innerHTML=`<div class="view-head"><div><h1>Verwaltung</h1><p>Stellplatz, Übernachtungen, Verträge und Prüfungen.</p></div></div>${tabs('more',[['site','Stellplatz'],['stays','Übernachtungen'],['contracts','Verträge'],['gas','Gasprüfung'],['season','Saison']])}${t==='site'?renderSite():t==='stays'?renderStays():t==='contracts'?renderContracts():t==='gas'?renderGas():renderSeason()}`;
  }
  function renderSite(){
    return `<div class="grid"><div class="card half"><h2>Stellplatz</h2><div class="metric">${esc(state.site.pitch||'161')}</div><p>${esc(state.site.campName||'Campingplatz')}</p>${state.site.area?`<p>${esc(state.site.area)} m²</p>`:''}<div class="toolbar"><button class="btn secondary" data-open="site">Bearbeiten</button></div></div><div class="card half"><h2>Nächste Anreise</h2><div class="metric" style="font-size:22px">${state.nextArrival?fmtDate(state.nextArrival):'–'}</div><div class="toolbar"><button class="btn secondary" data-open="arrival">Planen</button></div></div><div class="card full"><h2>Familie</h2><div class="list">${state.family.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc(x.role||'')}</div></div><div class="row-actions"><button class="mini" data-edit="family" data-id="${x.id}">✎</button><button class="mini danger" data-del="family" data-id="${x.id}">×</button></div></div>`).join('')}</div><div class="toolbar"><button class="btn secondary" data-add="family">＋ Person</button></div></div></div>`;
  }
  function renderStays(){
    const rows=[...state.stays].sort((a,b)=>String(b.arrival).localeCompare(String(a.arrival)));
    return `<div class="grid"><div class="card half"><h2>Dieses Jahr</h2><div class="metric">${totalNights(yearNow())}</div><p>Übernachtungen ${yearNow()}</p></div><div class="card half"><h2>Gesamt</h2><div class="metric">${totalNights()}</div><p>Übernachtungen</p></div></div><div class="toolbar"><button class="btn" data-add="stay">＋ Aufenthalt hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${fmtDate(x.arrival)} – ${fmtDate(x.departure)}</div><div class="row-sub">${daysBetween(x.arrival,x.departure)} Übernachtungen${x.people?` · ${esc(x.people)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="stay" data-id="${x.id}">✎</button><button class="mini danger" data-del="stay" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Aufenthalte eingetragen.')}`;
  }
  function renderContracts(){
    const rows=[...state.contracts].sort((a,b)=>String(a.noticeDate||a.endDate||'9999').localeCompare(String(b.noticeDate||b.endDate||'9999')));
    return `<div class="toolbar"><button class="btn" data-add="contract">＋ Vertrag hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.startDate?`Beginn ${fmtDate(x.startDate)}`:''}${x.noticeDate?` · Frist ${fmtDate(x.noticeDate)}`:''}${x.endDate?` · Ende ${fmtDate(x.endDate)}`:''}${x.annualCost?` · ${money(x.annualCost)}/Jahr`:''}</div></div><div class="row-actions"><button class="mini" data-edit="contract" data-id="${x.id}">✎</button><button class="mini danger" data-del="contract" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Verträge eingetragen.')}`;
  }
  function renderGas(){
    const rows=[...state.gasChecks].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `<div class="toolbar"><button class="btn" data-add="gas">＋ Gasprüfung hinzufügen</button></div>${rows.length?`<div class="list">${rows.map(x=>`<div class="row"><div class="row-main"><div class="row-title">Prüfung ${fmtDate(x.date)} · ${esc(x.result||'')}</div><div class="row-sub">Nächste Prüfung: ${fmtDate(x.nextDue)}${x.company?` · ${esc(x.company)}`:''}${x.cost?` · ${money(x.cost)}`:''}</div></div><div class="row-actions"><button class="mini" data-edit="gas" data-id="${x.id}">✎</button><button class="mini danger" data-del="gas" data-id="${x.id}">×</button></div></div>`).join('')}</div>`:empty('Noch keine Gasprüfung eingetragen.')}`;
  }
  function renderSeason(){
    const block=(title,key)=>`<div class="card half"><h2>${title}</h2><div class="list">${state[key].map(x=>`<div class="row ${x.done?'done':''}"><input type="checkbox" data-check="${key}" data-id="${x.id}" ${x.done?'checked':''}><div class="row-main"><div class="row-title">${esc(x.text)}</div></div><button class="mini danger" data-delcheck="${key}" data-id="${x.id}">×</button></div>`).join('')}</div><div class="toolbar"><button class="btn secondary" data-addcheck="${key}">＋ Punkt</button><button class="btn secondary" data-resetcheck="${key}">Zurücksetzen</button></div></div>`;
    return `<div class="grid">${block('Saisonstart','seasonStart')}${block('Winterfest','winter')}</div>`;
  }

  function showView(v){
    activeView=v;
    $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${v}`));
    $$('.nav-btn').forEach(el=>el.classList.toggle('active',el.dataset.view===v));
    window.scrollTo(0,0);
  }
  function renderAll(){
    renderTop();renderDashboard();renderOrganize();renderCosts();renderCare();renderMore();showView(activeView);
  }

  function modal(title,body,actions=''){
    $('#modalTitle').textContent=title;
    $('#modalBody').innerHTML=body;
    $('#modalActions').innerHTML=actions;
    $('#modal').showModal();
  }
  const field=(label,name,value='',type='text',extra='')=>`<div class="field"><label>${esc(label)}</label><input name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></div>`;
  const area=(label,name,value='')=>`<div class="field full"><label>${esc(label)}</label><textarea name="${name}">${esc(value??'')}</textarea></div>`;
  const select=(label,name,value,opts)=>`<div class="field"><label>${esc(label)}</label><select name="${name}">${opts.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`;
  const actions=()=>`<button value="cancel" class="btn secondary">Abbrechen</button><button type="button" class="btn" data-modal-save>Speichern</button>`;

  function openEditor(type,existing=null){
    const x=existing||{}; let title='Eintrag', body='';
    if(type==='shopping'){title=existing?'Einkauf bearbeiten':'Einkauf hinzufügen';body=`<div class="form-grid">${field('Artikel','name',x.name,'text','required')}${field('Menge','quantity',x.quantity)}${field('Kategorie','category',x.category)}</div>`}
    if(type==='task'){title=existing?'Aufgabe bearbeiten':'Aufgabe hinzufügen';body=`<div class="form-grid">${field('Aufgabe','title',x.title,'text','required')}${select('Zuweisen an','member',x.member||'',[['','Nicht zugewiesen'],...state.family.map(p=>[p.name,p.name])])}${field('Fällig am','due',x.due,'date')}${area('Notiz','note',x.note)}</div>`}
    if(type==='inventory'){title=existing?'Inventar bearbeiten':'Gegenstand hinzufügen';body=`<div class="form-grid">${field('Gegenstand','name',x.name,'text','required')}${field('Menge','quantity',x.quantity)}${field('Lagerort / Kiste','location',x.location)}${area('Notiz','note',x.note)}</div>`}
    if(type==='cost'){title=existing?'Kosten bearbeiten':'Kosten hinzufügen';body=`<div class="form-grid">${select('Kategorie','category',x.category||'annual',[['annual','Jahresgebühr'],['repairs','Reparatur'],['purchases','Neuanschaffung'],['other','Sonstiges']])}${field('Jahr','year',x.year||yearNow(),'number','min="2000" max="2200" required')}${field('Betrag €','amount',x.amount,'number','step="0.01" min="0" required')}${area('Notiz','note',x.note)}</div>`}
    if(type==='petroleum'){title=existing?'Petroleum bearbeiten':'Petroleum buchen';body=`<div class="form-grid">${select('Art','kind',x.kind||'purchase',[['purchase','Einkauf'],['usage','Verbrauch']])}${field('Datum','date',x.date||today(),'date','required')}${field('Liter','liters',x.liters,'number','step="0.1" min="0" required')}${field('Preis gesamt €','price',x.price,'number','step="0.01" min="0"')}${area('Notiz','note',x.note)}</div>`}
    if(type==='electricity'){title=existing?'Stromwert bearbeiten':'Strom-Jahreswert';body=`<div class="form-grid">${field('Jahr','year',x.year||yearNow(),'number','required min="2000" max="2200"')}${field('Verbrauch kWh','consumption',x.consumption,'number','step="0.1" min="0"')}${field('Stromkosten €','cost',x.cost,'number','step="0.01" min="0"')}${field('Zählermiete €','meterRent',x.meterRent,'number','step="0.01" min="0"')}</div>`}
    if(type==='lawn'||type==='hedge'){title=type==='lawn'?'Rasenschnitt':'Heckenschnitt';body=`<div class="form-grid">${field('Datum','date',x.date||today(),'date','required')}${area('Notiz','note',x.note)}</div>`}
    if(type==='stay'){title=existing?'Aufenthalt bearbeiten':'Aufenthalt hinzufügen';body=`<div class="form-grid">${field('Anreise','arrival',x.arrival||today(),'date','required')}${field('Abreise','departure',x.departure,'date','required')}${field('Personen / Notiz','people',x.people)}${area('Notiz','note',x.note)}</div>`}
    if(type==='family'){title=existing?'Person bearbeiten':'Person hinzufügen';body=`<div class="form-grid">${field('Name','name',x.name,'text','required')}${field('Rolle','role',x.role)}</div>`}
    if(type==='contract'){title=existing?'Vertrag bearbeiten':'Vertrag hinzufügen';body=`<div class="form-grid">${field('Vertrag / Anbieter','name',x.name,'text','required')}${field('Vertragsbeginn','startDate',x.startDate,'date')}${field('Vertragsende','endDate',x.endDate,'date')}${field('Kündigungs-/Prüffrist','noticeDate',x.noticeDate,'date')}${field('Kosten pro Jahr €','annualCost',x.annualCost,'number','step="0.01" min="0"')}${field('Ansprechpartner','contact',x.contact)}${area('Notiz','note',x.note)}</div>`}
    if(type==='gas'){title=existing?'Gasprüfung bearbeiten':'Gasprüfung hinzufügen';body=`<div class="form-grid">${field('Prüfdatum','date',x.date||today(),'date','required')}${field('Nächste Prüfung','nextDue',x.nextDue,'date')}${select('Ergebnis','result',x.result||'bestanden',[['bestanden','Bestanden'],['maengel','Mängel'],['offen','Offen']])}${field('Prüfer / Firma','company',x.company)}${field('Kosten €','cost',x.cost,'number','step="0.01" min="0"')}${area('Mängel / Notiz','defects',x.defects)}</div>`}
    modal(title,`<form id="editForm">${body}</form>`,actions());
    $('[data-modal-save]').onclick=()=>saveEditor(type,existing?.id||null);
  }

  function mapType(type){return {shopping:'shopping',task:'tasks',inventory:'inventory',cost:'costs',petroleum:'petroleum',electricity:'electricity',lawn:'lawn',hedge:'hedge',stay:'stays',family:'family',contract:'contracts',gas:'gasChecks'}[type]}
  function saveEditor(type,existingId){
    const f=$('#editForm');if(!f.reportValidity())return;
    const obj=Object.fromEntries(new FormData(f).entries());
    const arr=state[mapType(type)];
    const old=existingId?arr.find(x=>x.id===existingId):null;
    const item={...(old||{}),...obj,id:existingId||id()};
    if(type==='shopping'||type==='task') item.done=old?.done||false;
    if(type==='hedge'&&!existingId){
      const y=(item.date||'').slice(0,4);
      if(y&&state.hedge.filter(x=>(x.date||'').startsWith(y)).length>=2){toast(`Für ${y} sind bereits 2 Heckenschnitte eingetragen`);return}
    }
    if(old) Object.assign(old,item); else arr.push(item);
    $('#modal').close();save();toast('Gespeichert');
  }

  function openSite(){
    const x=state.site;
    modal('Stellplatz bearbeiten',`<form id="editForm"><div class="form-grid">${field('Campingplatz','campName',x.campName)}${field('Stellplatznummer','pitch',x.pitch)}${field('Fläche m²','area',x.area,'number','step="0.1" min="0"')}${area('Notizen','notes',x.notes)}</div></form>`,actions());
    $('[data-modal-save]').onclick=()=>{state.site={...state.site,...Object.fromEntries(new FormData($('#editForm')).entries())};$('#modal').close();save()}
  }
  function openArrival(){
    modal('Nächste Anreise',`<form id="editForm"><div class="form-grid">${field('Datum','date',state.nextArrival,'date')}</div></form>`,actions());
    $('[data-modal-save]').onclick=()=>{state.nextArrival=new FormData($('#editForm')).get('date')||'';$('#modal').close();save()}
  }

  function removeItem(type,itemId){
    const arr=state[mapType(type)];
    if(!arr) return;
    if(!confirm('Eintrag wirklich löschen?')) return;
    state[mapType(type)]=arr.filter(x=>x.id!==itemId);
    save();
  }
  function editItem(type,itemId){
    const arr=state[mapType(type)];
    const item=arr?.find(x=>x.id===itemId);
    if(item) openEditor(type,item);
  }
  function addChecklist(key){
    modal('Checklistenpunkt',`<form id="editForm"><div class="form-grid">${field('Text','text','','text','required')}</div></form>`,actions());
    $('[data-modal-save]').onclick=()=>{const f=$('#editForm');if(!f.reportValidity())return;state[key].push({id:id(),text:new FormData(f).get('text'),done:false});$('#modal').close();save()}
  }

  function openAccount(){
    modal('Konto & Daten',`<div class="notice"><strong>Lokaler Modus</strong><br>Die Daten liegen derzeit nur auf diesem Gerät.</div><div class="toolbar"><button type="button" class="btn secondary" id="exportBtn">Daten exportieren</button><label class="btn secondary">Daten importieren<input id="importFile" type="file" accept="application/json" hidden></label></div><p class="small-note">Cloud-Synchronisierung richten wir separat ein, sobald die lokale App stabil läuft.</p>`,`<button value="cancel" class="btn secondary">Schließen</button>`);
    $('#exportBtn').onclick=()=>{
      const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`platz161-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
    };
    $('#importFile').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{state=normalize(JSON.parse(await file.text()));save();$('#modal').close();toast('Backup importiert')}catch{toast('Ungültige Backup-Datei')}
    };
  }

  function bindEvents(){
    document.addEventListener('click',e=>{
      const go=e.target.closest('[data-go]');if(go){const v=go.dataset.go;if(go.dataset.tab)activeTab[v]=go.dataset.tab;renderAll();showView(v);return}
      const nav=e.target.closest('[data-view]');if(nav){showView(nav.dataset.view);return}
      const tab=e.target.closest('[data-section][data-tab]');if(tab){activeTab[tab.dataset.section]=tab.dataset.tab;renderAll();showView(tab.dataset.section);return}
      const add=e.target.closest('[data-add]');if(add){openEditor(add.dataset.add);return}
      const edit=e.target.closest('[data-edit]');if(edit){editItem(edit.dataset.edit,edit.dataset.id);return}
      const del=e.target.closest('[data-del]');if(del){removeItem(del.dataset.del,del.dataset.id);return}
      const open=e.target.closest('[data-open]');if(open){if(open.dataset.open==='site')openSite();if(open.dataset.open==='arrival')openArrival();return}
      const addc=e.target.closest('[data-addcheck]');if(addc){addChecklist(addc.dataset.addcheck);return}
      const delc=e.target.closest('[data-delcheck]');if(delc){state[delc.dataset.delcheck]=state[delc.dataset.delcheck].filter(x=>x.id!==delc.dataset.id);save();return}
      const reset=e.target.closest('[data-resetcheck]');if(reset){state[reset.dataset.resetcheck].forEach(x=>x.done=false);save();return}
    });
    document.addEventListener('change',e=>{
      if(e.target.matches('[data-toggle]')){const arr=state[e.target.dataset.toggle];const x=arr.find(r=>r.id===e.target.dataset.id);if(x){x.done=e.target.checked;save()}}
      if(e.target.matches('[data-check]')){const x=state[e.target.dataset.check].find(r=>r.id===e.target.dataset.id);if(x){x.done=e.target.checked;save()}}
    });
    $('#accountBtn').onclick=openAccount;
    $('.brand').onclick=()=>showView('dashboard');
  }

  function boot(){
    try{
      $('#setupGate').classList.add('hidden');
      bindEvents();
      renderAll();
      if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=4').catch(console.warn);
    }catch(e){
      console.error(e);
      const app=$('#app');
      if(app) app.innerHTML=`<div class="card full"><h2>CampManager konnte nicht starten</h2><p>${esc(e.message||String(e))}</p></div>`;
    }
  }

  boot();
})();

(() => {
'use strict';

const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
const rad = d => d*Math.PI/180;
const deg = r => r*180/Math.PI;
const nf0 = new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
const nf1 = new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});

const KEYS = {
  favorites:'mafoto-scout-favorites-v2',
  settings:'mafoto-scout-settings-v2'
};

const state = {
  screen:'home',
  place:null,
  map:null,
  marker:null,
  sunLine:null,
  moonLine:null,
  mwLine:null,
  lpLayer:null,
  lpEnabled:true,
  lpData:null,
  weather:null,
  deferredPrompt:null,
  currentTool:null,
  originalImage:null,
  editorCanvas:null,
  editorCtx:null,
  healMode:false,
  settings:{
    theme:'dark',
    crop:1,
    mapStyle:'osm'
  }
};

function toast(msg,error=false){
  const el=$('toast');
  el.textContent=msg;
  el.classList.toggle('error',error);
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer=setTimeout(()=>el.classList.remove('show'),2500);
}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function timeString(d=new Date()){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function formatTime(d){return d instanceof Date && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(d) : '–'}
function formatRange(a,b){return a&&b&&!Number.isNaN(a.getTime())&&!Number.isNaN(b.getTime())?`${formatTime(a)}–${formatTime(b)}`:'–'}
function compass(d){const a=['N','NO','O','SO','S','SW','W','NW'];return a[Math.round((((d%360)+360)%360)/45)%8]}
function dateTime(){
  const d=$('plannerDate')?.value||localDate();
  const t=$('plannerTime')?.value||'12:00';
  const x=new Date(`${d}T${t}:00`);
  return Number.isNaN(x.getTime())?new Date():x;
}

function loadSettings(){
  try{Object.assign(state.settings,JSON.parse(localStorage.getItem(KEYS.settings)||'{}'))}catch{}
  applySettings();
}
function saveSettings(){localStorage.setItem(KEYS.settings,JSON.stringify(state.settings));applySettings()}
function applySettings(){
  document.body.classList.toggle('light',state.settings.theme==='light');
  const meta=document.querySelector('meta[name=theme-color]');
  if(meta) meta.content=state.settings.theme==='light'?'#edf2f7':'#08111e';
}

function navigate(screen){
  const valid=['home','planner','map','astro','weather','more'];
  if(!valid.includes(screen))return;
  state.screen=screen;
  $$('.screen').forEach(s=>s.classList.toggle('active',s.id===`screen-${screen}`));
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.nav===screen));
  const el=$(`screen-${screen}`);
  $('screenTitle').textContent=el?.dataset.title||'MAFoto-Scout';
  $('screenSubtitle').textContent=el?.dataset.subtitle||'';
  $('backBtn').classList.toggle('hidden',valid.slice(0,1).includes(screen)||['map','astro','weather','more'].includes(screen));
  if(screen==='map' && state.map) setTimeout(()=>state.map.invalidateSize(),80);
  if(screen==='home') renderHome();
  window.scrollTo({top:0,behavior:'instant'});
}

function bindNavigation(){
  $$('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  $('homePlanBtn').addEventListener('click',()=>navigate('planner'));
  $('backBtn').addEventListener('click',()=>navigate('home'));
  $$('[data-open-tool]').forEach(b=>b.addEventListener('click',()=>openTool(b.dataset.openTool)));
}

async function geocode(q,limit=7){
  q=q.trim(); if(!q)return[];
  const coord=q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(coord){
    const lat=Number(coord[1]),lon=Number(coord[2]);
    if(Math.abs(lat)<=90&&Math.abs(lon)<=180)return[{name:`${lat.toFixed(5)}, ${lon.toFixed(5)}`,detail:'Koordinaten',lat,lon}];
  }
  const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&accept-language=de&q=${encodeURIComponent(q)}`;
  const r=await fetch(url,{headers:{Accept:'application/json'}}); if(!r.ok)throw new Error('Ortssuche nicht verfügbar.');
  return (await r.json()).map(x=>({name:(x.name||x.display_name||q).split(',')[0],detail:x.display_name||'',lat:+x.lat,lon:+x.lon,type:x.type||''}));
}
async function reverseGeocode(lat,lon){
  const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=de&lat=${lat}&lon=${lon}`,{headers:{Accept:'application/json'}});
  if(!r.ok)return null; const x=await r.json(); return x.display_name||null;
}
function getPosition(){
  return new Promise((res,rej)=>{
    if(!navigator.geolocation)return rej(new Error('Standort wird nicht unterstützt.'));
    navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  });
}
async function useLocation(){
  try{
    toast('Standort wird ermittelt…');
    const p=await getPosition(); const lat=p.coords.latitude,lon=p.coords.longitude;
    const name=await reverseGeocode(lat,lon).catch(()=>null);
    selectPlace({name:name?name.split(',')[0]:'Aktueller Standort',detail:name||'',lat,lon},true);
  }catch{toast('Standort konnte nicht verwendet werden. Browser-Berechtigung prüfen.',true)}
}

function renderSearchResults(items){
  const box=$('plannerResults');box.innerHTML='';
  if(!items.length){box.innerHTML='<div class="empty-state compact">Kein passender Ort gefunden.</div>';return}
  items.forEach(x=>{
    const b=document.createElement('button');b.type='button';b.className='search-result';
    b.innerHTML=`<strong>${esc(x.name)}</strong><small>${esc(x.detail||`${x.lat.toFixed(5)}, ${x.lon.toFixed(5)}`)}</small>`;
    b.addEventListener('click',()=>{selectPlace(x,true);box.innerHTML='';$('plannerSearch').value=x.name});
    box.appendChild(b);
  });
}
async function searchPlanner(){
  const q=$('plannerSearch').value.trim();if(!q)return toast('Bitte Ort eingeben.',true);
  $('plannerSearchBtn').disabled=true;$('plannerResults').innerHTML='<div class="empty-state compact">Suche…</div>';
  try{renderSearchResults(await geocode(q))}catch(e){$('plannerResults').innerHTML=`<div class="empty-state compact">${esc(e.message)}</div>`}
  $('plannerSearchBtn').disabled=false;
}

function selectPlace(p,recenter=true){
  state.place={name:p.name||'Foto-Standpunkt',detail:p.detail||'',lat:+p.lat,lon:+p.lon};
  $('selectedPlace').innerHTML=`<span class="selected-pin">●</span><div><strong>${esc(state.place.name)}</strong><small>${state.place.lat.toFixed(5)}, ${state.place.lon.toFixed(5)}</small></div>`;
  $('mapPlaceName').textContent=state.place.name;
  setMarker();
  if(recenter&&state.map)state.map.setView([state.place.lat,state.place.lon],13);
  updateAstronomy();
  loadWeather();
  loadLightPollution();
  renderHome();
}

function initMap(){
  if(!window.L){return}
  state.map=L.map('map',{zoomControl:false,attributionControl:true}).setView([51.1657,10.4515],6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
  state.lpLayer=L.tileLayer('https://djlorenz.github.io/astronomy/image_tiles/tiles2025/tile_{z}_{x}_{y}.png',{
    minZoom:2,maxNativeZoom:8,maxZoom:19,tileSize:1024,zoomOffset:-2,opacity:.52,
    errorTileUrl:'https://djlorenz.github.io/astronomy/image_tiles/tiles2025/black.png',
    attribution:'Light Pollution Atlas 2025'
  }).addTo(state.map);
  state.map.on('click',async e=>{
    const {lat,lng}=e.latlng;const name=await reverseGeocode(lat,lng).catch(()=>null);
    selectPlace({name:name?name.split(',')[0]:'Foto-Standpunkt',detail:name||'',lat,lon:lng},false);
  });
}
function setMarker(){
  if(!state.map||!state.place)return;
  const ll=[state.place.lat,state.place.lon];
  if(!state.marker){
    state.marker=L.circleMarker(ll,{radius:8,weight:3,color:'#ffffff',fillColor:'#69a9ff',fillOpacity:1}).addTo(state.map);
  }else state.marker.setLatLng(ll);
  updateDirectionLines();
}
function destination(lat,lon,bearing,km=3){
  const R=6371,δ=km/R,θ=rad(bearing),φ1=rad(lat),λ1=rad(lon);
  const φ2=Math.asin(Math.sin(φ1)*Math.cos(δ)+Math.cos(φ1)*Math.sin(δ)*Math.cos(θ));
  const λ2=λ1+Math.atan2(Math.sin(θ)*Math.sin(δ)*Math.cos(φ1),Math.cos(δ)-Math.sin(φ1)*Math.sin(φ2));
  return [deg(φ2),deg(λ2)];
}
function updateDirectionLines(){
  if(!state.map||!state.place||!window.SunCalc)return;
  [state.sunLine,state.moonLine,state.mwLine].forEach(l=>{if(l&&state.map.hasLayer(l))state.map.removeLayer(l)});
  const dt=dateTime(),lat=state.place.lat,lon=state.place.lon;
  const sp=SunCalc.getPosition(dt,lat,lon),mp=SunCalc.getMoonPosition(dt,lat,lon);
  const saz=(deg(sp.azimuth)+180+360)%360,maz=(deg(mp.azimuth)+180+360)%360;
  const mw=galacticCenterHorizontal(dt,lat,lon);
  state.sunLine=L.polyline([[lat,lon],destination(lat,lon,saz)],{color:'#ffbf63',weight:3,opacity:.9,dashArray:'7 7'}).addTo(state.map);
  state.moonLine=L.polyline([[lat,lon],destination(lat,lon,maz)],{color:'#bfb1ff',weight:3,opacity:.9,dashArray:'5 8'}).addTo(state.map);
  state.mwLine=L.polyline([[lat,lon],destination(lat,lon,mw.az)],{color:'#9f7cff',weight:3,opacity:.9,dashArray:'2 8'}).addTo(state.map);
  $('mapSunAz').textContent=`${compass(saz)} ${nf0.format(saz)}°`;
  $('mapMoonAz').textContent=`${compass(maz)} ${nf0.format(maz)}°`;
  $('mapMwAz').textContent=`${compass(mw.az)} ${nf0.format(mw.az)}°`;
}

function galacticCenterHorizontal(date,lat,lon){
  const ra=266.41683,dec=-29.00781;
  const jd=date.getTime()/86400000+2440587.5;
  const T=(jd-2451545.0)/36525;
  let gmst=280.46061837+360.98564736629*(jd-2451545)+0.000387933*T*T-T*T*T/38710000;
  gmst=((gmst%360)+360)%360;
  const lst=(gmst+lon+360)%360;
  let H=(lst-ra+540)%360-180;
  const h=rad(H),phi=rad(lat),delta=rad(dec);
  const sinAlt=Math.sin(phi)*Math.sin(delta)+Math.cos(phi)*Math.cos(delta)*Math.cos(h);
  const alt=Math.asin(clamp(sinAlt,-1,1));
  const y=Math.sin(h);
  const x=Math.cos(h)*Math.sin(phi)-Math.tan(delta)*Math.cos(phi);
  let az=(deg(Math.atan2(y,x))+180+360)%360;
  return{alt:deg(alt),az};
}
function bestMilkyWay(date,lat,lon){
  const base=new Date(date);base.setHours(12,0,0,0);
  let best=null,visibleMinutes=0;
  for(let m=0;m<=24*60;m+=10){
    const t=new Date(base.getTime()+m*60000);
    const sunAlt=deg(SunCalc.getPosition(t,lat,lon).altitude);
    const g=galacticCenterHorizontal(t,lat,lon);
    if(sunAlt<=-18&&g.alt>0){
      visibleMinutes+=10;
      if(!best||g.alt>best.alt)best={...g,date:t};
    }
  }
  return{best,visibleMinutes};
}
function moonPhaseName(p){
  if(p<.03||p>.97)return'Neumond'; if(p<.22)return'Zunehmende Sichel'; if(p<.28)return'Erstes Viertel';
  if(p<.47)return'Zunehmender Mond'; if(p<.53)return'Vollmond'; if(p<.72)return'Abnehmender Mond'; if(p<.78)return'Letztes Viertel'; return'Abnehmende Sichel';
}

function updateAstronomy(){
  if(!state.place||!window.SunCalc)return;
  const dt=dateTime(),lat=state.place.lat,lon=state.place.lon;
  const noon=new Date(dt);noon.setHours(12,0,0,0);
  const times=SunCalc.getTimes(noon,lat,lon);
  const pos=SunCalc.getPosition(dt,lat,lon);
  const saz=(deg(pos.azimuth)+180+360)%360,salt=deg(pos.altitude);
  $('sunriseValue').textContent=formatTime(times.sunrise);
  $('sunsetValue').textContent=formatTime(times.sunset);
  $('goldenValue').textContent=formatRange(times.goldenHour,times.sunset);
  $('blueValue').textContent=formatRange(times.dusk,times.nauticalDusk);
  $('sunDirectionBadge').textContent=`${compass(saz)} · ${nf0.format(saz)}°`;
  $('sunDetail').innerHTML=`Sonnenhöhe <strong>${nf0.format(salt)}°</strong> · Richtung <strong>${compass(saz)} ${nf0.format(saz)}°</strong>.`;
  const mins=dt.getHours()*60+dt.getMinutes();$('lightTrackMarker').style.left=`${clamp(mins/1439*100,0,100)}%`;

  const mt=SunCalc.getMoonTimes(noon,lat,lon,true),illum=SunCalc.getMoonIllumination(noon),mp=SunCalc.getMoonPosition(dt,lat,lon);
  const phase=moonPhaseName(illum.phase);
  $('moonriseValue').textContent=formatTime(mt.rise);
  $('moonsetValue').textContent=formatTime(mt.set);
  $('moonIllumValue').textContent=`${nf0.format(illum.fraction*100)}%`;
  $('astroNightValue').textContent=formatRange(times.night,times.nightEnd);
  $('astroMoonTitle').textContent=phase;
  $('astroMoonSubtitle').textContent=`${nf0.format(illum.fraction*100)}% beleuchtet · ${compass((deg(mp.azimuth)+180+360)%360)}`;
  updateMoonDisc(illum.phase,illum.fraction);

  const mw=bestMilkyWay(noon,lat,lon);
  if(mw.best){
    $('mwBestTime').textContent=formatTime(mw.best.date);
    $('mwMaxAlt').textContent=`${nf0.format(mw.best.alt)}°`;
    $('mwDirection').textContent=`${compass(mw.best.az)}`;
    $('mwPoint').style.left=`${clamp((mw.best.az/360)*100,8,90)}%`;
    $('mwPoint').style.top=`${clamp(75-mw.best.alt*.7,13,76)}%`;
    const baseScore=clamp(Math.round((mw.best.alt/60)*55+(1-illum.fraction)*30+(mw.visibleMinutes/360)*15),0,100);
    $('mwScoreBadge').textContent=`${baseScore}/100`;
    $('mwAdvice').textContent=mwAdvice(baseScore,mw.best.alt,illum.fraction,mw.visibleMinutes);
  }else{
    $('mwBestTime').textContent='–';$('mwMaxAlt').textContent='–';$('mwDirection').textContent='–';$('mwScoreBadge').textContent='0/100';
    $('mwAdvice').textContent='Das galaktische Zentrum steht in der astronomischen Nacht an diesem Datum nicht über dem Horizont.';
  }
  updateDirectionLines();
  renderHome();
}
function mwAdvice(score,alt,moon,minutes){
  const a=[];
  if(alt>=25)a.push('Das galaktische Zentrum erreicht eine brauchbare Höhe.');else a.push('Das galaktische Zentrum bleibt relativ niedrig am Horizont.');
  if(moon<.25)a.push('Der Mond stört wenig.');else if(moon>.7)a.push('Der helle Mond kann den Himmel deutlich aufhellen.');
  if(minutes>=120)a.push(`Etwa ${Math.round(minutes/60)} Stunden fallen in astronomische Nacht mit sichtbarem Zentrum.`);
  if(state.lpData&&state.lpData.mpsas<20.5)a.push('Die Lichtverschmutzung am Standort ist für Milchstraßenfotos ungünstig; ein dunklerer Standort hilft deutlich.');
  return a.join(' ');
}
function updateMoonDisc(phase,fraction){
  const disc=$('moonDisc'); if(!disc)return;
  const shift=Math.cos(phase*2*Math.PI)*50;
  disc.style.background=`linear-gradient(90deg,#eef1ff 0 50%,#11192b 50% 100%)`;
  disc.style.setProperty('--moon-shift',`${shift}%`);
  let style=document.getElementById('moonDynamic');
  if(!style){style=document.createElement('style');style.id='moonDynamic';document.head.appendChild(style)}
  style.textContent=`.moon-disc:after{transform:translateX(${shift}%);opacity:${clamp(.35+fraction*.55,.35,.9)}}`;
}

function weatherCodeText(c){
  return({0:'Klar',1:'Überwiegend klar',2:'Teilweise bewölkt',3:'Bewölkt',45:'Nebel',48:'Reifnebel',51:'Nieselregen',53:'Nieselregen',55:'Starker Nieselregen',61:'Leichter Regen',63:'Regen',65:'Starker Regen',71:'Leichter Schnee',73:'Schnee',75:'Starker Schnee',80:'Schauer',81:'Schauer',82:'Starke Schauer',95:'Gewitter',96:'Gewitter',99:'Starkes Gewitter'})[c]||'Unbekannt';
}
function weatherSymbol(c){
  if(c===0)return'☀︎';if([1,2].includes(c))return'◒';if(c===3)return'☁︎';if([45,48].includes(c))return'≋';if([51,53,55,61,63,65,80,81,82].includes(c))return'☂︎';if([71,73,75].includes(c))return'❄︎';if([95,96,99].includes(c))return'ϟ';return'☁︎';
}
async function loadWeather(){
  if(!state.place)return;
  try{
    const {lat,lon}=state.place;
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,cloud_cover,wind_speed_10m&daily=sunrise,sunset,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`;
    const r=await fetch(url);if(!r.ok)throw new Error();
    state.weather=await r.json();renderWeather();
  }catch{
    state.weather=null;$('weatherCondition').textContent='Wetter konnte nicht geladen werden';renderHome();
  }
}
function closestHourlyIndex(){
  if(!state.weather?.hourly?.time)return-1;
  const target=dateTime().getTime();
  let best=-1,dist=Infinity;
  state.weather.hourly.time.forEach((s,i)=>{const d=Math.abs(new Date(s).getTime()-target);if(d<dist){dist=d;best=i}});
  return best;
}
function renderWeather(){
  const w=state.weather;if(!w)return;
  const i=closestHourlyIndex(),h=w.hourly||{},c=w.current||{};
  const temp=i>=0?h.temperature_2m[i]:c.temperature_2m,cloud=i>=0?h.cloud_cover[i]:c.cloud_cover,wind=i>=0?h.wind_speed_10m[i]:c.wind_speed_10m,hum=i>=0?h.relative_humidity_2m[i]:c.relative_humidity_2m,rain=i>=0?h.precipitation_probability[i]:0,code=i>=0?h.weather_code[i]:c.weather_code;
  $('weatherTemp').textContent=Number.isFinite(temp)?`${nf0.format(temp)}°`:'–°';
  $('weatherCondition').textContent=weatherCodeText(code);$('weatherSymbol').textContent=weatherSymbol(code);
  $('weatherClouds').textContent=Number.isFinite(cloud)?`${nf0.format(cloud)}%`:'–';
  $('weatherWind').textContent=Number.isFinite(wind)?`${nf0.format(wind)} km/h`:'–';
  $('weatherHumidity').textContent=Number.isFinite(hum)?`${nf0.format(hum)}%`:'–';
  $('weatherRain').textContent=Number.isFinite(rain)?`${nf0.format(rain)}%`:'–';
  const score=photoWeatherScore(cloud,wind,rain,code);
  $('photoWeatherScore').textContent=score;
  const adv=[];
  if(cloud<20)adv.push(['Licht','Klarer Himmel: hartes Tageslicht, gute Sterne bei Nacht.']);
  else if(cloud<=70)adv.push(['Wolken','Strukturierte Bewölkung kann Sonnenauf- und -untergänge interessanter machen.']);
  else adv.push(['Weiches Licht','Starke Bewölkung liefert gleichmäßiges Licht, verdeckt aber Sonnenfarben.']);
  if(rain>=55)adv.push(['Regenschutz','Erhöhte Niederschlagswahrscheinlichkeit – Kamera schützen.']);
  if(wind>=30)adv.push(['Stativ','Stärkerer Wind – Stativ beschweren und kurze Zeiten bei bewegten Motiven nutzen.']);
  if([45,48].includes(code))adv.push(['Nebel','Gute Bedingungen für Wald, Landschaft und reduzierte Motive.']);
  if(!adv.length)adv.push(['Bedingungen','Keine auffälligen Wetterhindernisse für die gewählte Zeit.']);
  $('photoWeatherAdvice').innerHTML=adv.map(x=>`<div class="advice-item"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join('');
  renderHourly(i);
  renderHome();
}
function photoWeatherScore(cloud,wind,rain,code){
  let s=75;
  if(rain>70)s-=25;else if(rain>40)s-=12;
  if(wind>45)s-=20;else if(wind>25)s-=8;
  if(cloud>=20&&cloud<=70)s+=10;
  if([45,48].includes(code))s+=8;
  return clamp(Math.round(s),0,100);
}
function renderHourly(center){
  const box=$('hourlyWeather');box.innerHTML='';const h=state.weather?.hourly;if(!h||center<0)return;
  const start=Math.max(0,center-2),end=Math.min(h.time.length,start+12);
  for(let i=start;i<end;i++){
    const d=new Date(h.time[i]),el=document.createElement('div');el.className='hour-card';
    el.innerHTML=`<small>${String(d.getHours()).padStart(2,'0')}:00</small><strong>${weatherSymbol(h.weather_code[i])}</strong><span>${nf0.format(h.temperature_2m[i])}°</span><small>${nf0.format(h.cloud_cover[i])}% Wolken</small>`;
    box.appendChild(el);
  }
}

function mod(n,m){return((n%m)+m)%m}
function compressed2full(x){return(5/195)*(Math.exp(.0195*x)-1)}
function lpZone(r){
  if(r<.01)return'0';if(r<.06)return'1a';if(r<.11)return'1b';if(r<.19)return'2a';if(r<.33)return'2b';if(r<.58)return'3a';if(r<1)return'3b';if(r<1.73)return'4a';if(r<3)return'4b';if(r<5.2)return'5a';if(r<9)return'5b';if(r<15.59)return'6a';if(r<27)return'6b';if(r<46.77)return'7a';return'7b'
}
function lpDescription(zone){const n=parseInt(zone,10);if(n<=1)return'sehr dunkel';if(n<=2)return'dunkel';if(n<=3)return'mäßig dunkel';if(n<=4)return'aufgehellt';if(n<=5)return'stark aufgehellt';return'sehr hell'}
async function lightPollutionAt(lat,lon){
  if(lat<-65||lat>75)throw new Error('Atlas außerhalb 65°S–75°N.');
  const lonDL=mod(lon+180,360),latStart=lat+65,tilex=Math.floor(lonDL/5)+1,tiley=Math.floor(latStart/5)+1;
  let ix=Math.round(120*(lonDL-5*(tilex-1)+1/240)),iy=Math.round(120*(latStart-5*(tiley-1)+1/240));
  ix=clamp(ix,1,600);iy=clamp(iy,1,600);
  const r=await fetch(`https://djlorenz.github.io/astronomy/binary_tiles/2025/binary_tile_${tilex}_${tiley}.dat.gz`);
  if(!r.ok)throw new Error('Atlasdaten nicht geladen.');
  const data=new Int8Array(pako.ungzip(await r.arrayBuffer()));
  const first=128*Number(data[0])+Number(data[1]);let change=0;
  for(let i=1;i<iy;i++)change+=Number(data[600*i+1]);
  for(let i=1;i<ix;i++)change+=Number(data[600*(iy-1)+1+i]);
  const ratio=compressed2full(first+change),mpsas=22-5*Math.log(1+ratio)/Math.log(100),zone=lpZone(ratio);
  return{ratio,mpsas,zone}
}
async function loadLightPollution(){
  if(!state.place)return;
  $('lightPollutionInfo').textContent='Lichtverschmutzung wird geladen…';
  try{
    state.lpData=await lightPollutionAt(state.place.lat,state.place.lon);
    const p=state.lpData;
    $('lightPollutionInfo').innerHTML=`LP-Zone <strong>${p.zone}</strong> · ${lpDescription(p.zone)} · <strong>${p.mpsas.toFixed(2)} mag/arcsec²</strong>`;
  }catch(e){state.lpData=null;$('lightPollutionInfo').textContent=e.message}
  updateAstronomy();renderHome();
}

function getFavorites(){
  try{const x=JSON.parse(localStorage.getItem(KEYS.favorites)||'[]');return Array.isArray(x)?x:[]}catch{return[]}
}
function saveFavorite(p=state.place){
  if(!p)return toast('Zuerst einen Ort wählen.',true);
  const a=getFavorites(),n={name:p.name,detail:p.detail||'',lat:+p.lat,lon:+p.lon};
  if(!a.some(x=>Math.abs(x.lat-n.lat)<1e-5&&Math.abs(x.lon-n.lon)<1e-5))a.unshift(n);
  localStorage.setItem(KEYS.favorites,JSON.stringify(a.slice(0,100)));
  toast('Foto-Ort gespeichert.');renderHome();
}
function deleteFavorite(index){const a=getFavorites();a.splice(index,1);localStorage.setItem(KEYS.favorites,JSON.stringify(a));renderHome();renderFavoritesTool()}

function renderHome(){
  $('homePlaceName').textContent=state.place?.name||'Noch kein Ort gewählt';
  if(state.place&&window.SunCalc){
    const noon=new Date(dateTime());noon.setHours(12,0,0,0);const t=SunCalc.getTimes(noon,state.place.lat,state.place.lon),ill=SunCalc.getMoonIllumination(noon);
    $('homeSunset').textContent=formatTime(t.sunset);$('homeGolden').textContent=`Goldene Stunde ${formatTime(t.goldenHour)}`;
    $('homeMoon').textContent=`${nf0.format(ill.fraction*100)}%`;$('homeMoonPhase').textContent=moonPhaseName(ill.phase);
  }else{$('homeSunset').textContent='–';$('homeGolden').textContent='Goldene Stunde –';$('homeMoon').textContent='–';$('homeMoonPhase').textContent='Phase –'}
  if(state.weather?.current){
    $('homeWeather').textContent=`${nf0.format(state.weather.current.temperature_2m)}°`;
    $('homeClouds').textContent=`Bewölkung ${nf0.format(state.weather.current.cloud_cover)}%`;
  }else{$('homeWeather').textContent='–';$('homeClouds').textContent='Bewölkung –'}
  if(state.lpData){$('homeDarkSky').textContent=`${state.lpData.mpsas.toFixed(1)}`;$('homeLp').textContent=`LP-Zone ${state.lpData.zone} · mag/arcsec²`}
  else{$('homeDarkSky').textContent='–';$('homeLp').textContent='Lichtverschmutzung –'}
  const fav=getFavorites().slice(0,3),box=$('homeFavorites');
  box.innerHTML=fav.length?'':'<div class="empty-state compact">Noch keine Orte gespeichert.</div>';
  fav.forEach(p=>{
    const b=document.createElement('button');b.type='button';b.className='mini-place';
    b.innerHTML=`<div><strong>${esc(p.name)}</strong><small>${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</small></div><span>›</span>`;
    b.addEventListener('click',()=>{selectPlace(p,true);navigate('planner')});box.appendChild(b);
  });
}

function updateStarResult(){
  const f=Number($('starFocal')?.value||24),crop=Number($('starSensor')?.value||1),sec=500/(f*crop);
  if($('starResult'))$('starResult').innerHTML=`500er-Regel: <strong>ca. ${nf1.format(sec)} s</strong> · konservativer Startwert: <strong>${nf1.format(sec*.75)} s</strong>`;
}
function syncTimeFromSlider(){
  const m=+$('timeSlider').value,h=Math.floor(m/60),min=m%60,t=`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  $('plannerTime').value=t;$('sliderTimeLabel').textContent=t;updateAstronomy();renderWeather();
}
function syncSliderFromTime(){
  const [h,m]=($('plannerTime').value||'12:00').split(':').map(Number),v=h*60+m;
  $('timeSlider').value=v;$('sliderTimeLabel').textContent=$('plannerTime').value;updateAstronomy();renderWeather();
}

function openTool(tool){
  state.currentTool=tool;
  const titles={assistants:['FOTO-WERKZEUGE','Foto-Assistenten'],nd:['BELICHTUNG','ND-Filter Rechner'],stars:['ASTRO','Sternfoto-Rechner'],editor:['BILDBEARBEITUNG','Lokaler Bildeditor'],places:['ORTE','Foto-Orte entdecken'],favorites:['GESPEICHERT','Favoriten'],settings:['APP','Einstellungen']};
  const [k,t]=titles[tool]||['WERKZEUG','Werkzeug'];$('modalKicker').textContent=k;$('modalTitle').textContent=t;
  $('toolModal').classList.remove('hidden');$('toolModal').setAttribute('aria-hidden','false');
  renderTool(tool);
}
function closeTool(){$('toolModal').classList.add('hidden');$('toolModal').setAttribute('aria-hidden','true');state.currentTool=null}
function renderTool(tool){
  if(tool==='assistants')renderAssistants();
  else if(tool==='nd')renderNd();
  else if(tool==='stars')renderStarTool();
  else if(tool==='editor')renderEditor();
  else if(tool==='places')renderPlacesTool();
  else if(tool==='favorites')renderFavoritesTool();
  else if(tool==='settings')renderSettings();
}
function renderAssistants(){
  const tools=[
    ['portrait','Portrait','Menschen, Freistellung, Augenfokus'],
    ['landscape','Landschaft','Tiefe Schärfe, Stativ, Licht'],
    ['astro','Astro','Sterne, Milchstraße, Nacht'],
    ['underwater','Unterwasser','Farbe, kurze Distanz, Licht'],
    ['studio','Studio','Kontrolliertes Licht, Blitz'],
    ['sport','Sport','Bewegung, AF, kurze Zeiten'],
    ['drone','Drone','Luftbilder, ND, kurze Belichtung']
  ];
  $('modalContent').innerHTML=`<div class="tool-grid">${tools.map(x=>`<button class="tool-card" data-assistant="${x[0]}" type="button"><strong>${x[1]}</strong><small>${x[2]}</small></button>`).join('')}</div><div id="assistantDetail" class="assistant-detail hidden"></div>`;
  $$('[data-assistant]').forEach(b=>b.addEventListener('click',()=>showAssistant(b.dataset.assistant)));
}
function showAssistant(k){
  const d={
    portrait:['Portrait',['AF auf das vordere Auge','Startpunkt f/1.8–f/4','Mindestens etwa 1/250 s bei Bewegung','Hintergrund bewusst vom Motiv trennen']],
    landscape:['Landschaft',['Startpunkt ISO 100','f/8–f/11 als häufig guter Bereich','Stativ bei längeren Zeiten','Goldene/blaue Stunde im Planer prüfen']],
    astro:['Astro',['RAW verwenden','Manuell auf einen hellen Stern fokussieren','Offene Blende','Belichtungszeit mit Sternfoto-Rechner bestimmen','Lichtverschmutzung und Mond beachten']],
    underwater:['Unterwasser',['So nah wie möglich ans Motiv','Rotanteile verschwinden mit Tiefe – Weißabgleich/RAW hilft','Kurze Verschlusszeit gegen Eigenbewegung','Gehäuse-Dichtungen vor dem Tauchgang prüfen']],
    studio:['Studio',['ISO niedrig halten','Blitz-Synchronzeit beachten','Key Light zuerst setzen','Histogramm statt Displayhelligkeit beurteilen']],
    sport:['Sport',['AF-C/Servo','Serienbild','Startpunkt 1/1000 s oder kürzer','ISO automatisch so hoch wie nötig']],
    drone:['Drone',['RAW/JPEG je nach Workflow','ND-Filter für Video und lange Wasserbelichtungen','Wind und lokale Flugregeln prüfen','Belichtung auf helle Flächen kontrollieren']]
  }[k];
  const el=$('assistantDetail');el.classList.remove('hidden');el.innerHTML=`<h3>${d[0]}</h3><ul>${d[1].map(x=>`<li>${x}</li>`).join('')}</ul>`;
}
function renderNd(){
  $('modalContent').innerHTML=`<div class="modal-form">
    <label><span>Ausgangszeit (Sekunden)</span><input id="ndBase" type="number" min="0.000125" step="0.001" value="0.008"></label>
    <label><span>Filter</span><select id="ndStops"><option value="3">ND8 · 3 Stops</option><option value="6">ND64 · 6 Stops</option><option value="10" selected>ND1000 · 10 Stops</option><option value="15">ND32000 · 15 Stops</option></select></label>
    <button id="ndCalcBtn" class="primary-btn" type="button">Berechnen</button><div id="ndOut" class="big-result">–</div></div>`;
  $('ndCalcBtn').addEventListener('click',calcNd);calcNd();
}
function calcNd(){
  const b=+$('ndBase').value,s=+$('ndStops').value;if(!b||b<=0)return;
  const sec=b*Math.pow(2,s),txt=sec<60?`${nf1.format(sec)} s`:`${Math.floor(sec/60)} min ${Math.round(sec%60)} s`;
  $('ndOut').innerHTML=`Neue Belichtungszeit<br><strong>${txt}</strong>`;
}
function renderStarTool(){
  $('modalContent').innerHTML=`<div class="modal-form"><label><span>Brennweite</span><input id="modalFocal" type="number" min="8" max="1000" value="${$('starFocal').value}"></label><label><span>Crop-Faktor</span><select id="modalCrop"><option value="1">Vollformat</option><option value="1.5">APS-C 1,5×</option><option value="1.6">APS-C 1,6×</option><option value="2">MFT 2×</option></select></label><div id="modalStarOut" class="big-result"></div></div>`;
  $('modalCrop').value=state.settings.crop||1;
  const f=()=>{const v=500/(+$('modalFocal').value*+$('modalCrop').value);$('modalStarOut').innerHTML=`500er-Regel<br><strong>${nf1.format(v)} s</strong><br><small>Konservativ etwa ${nf1.format(v*.75)} s</small>`};
  $('modalFocal').addEventListener('input',f);$('modalCrop').addEventListener('change',f);f();
}
function renderFavoritesTool(){
  const a=getFavorites(),box=$('modalContent');
  box.innerHTML=a.length?'<div class="place-list" id="favList"></div>':'<div class="empty-state">Noch keine Foto-Orte gespeichert.</div>';
  if(!a.length)return;
  const list=$('favList');a.forEach((p,i)=>{
    const row=document.createElement('div');row.className='place-row';
    row.innerHTML=`<div><strong>${esc(p.name)}</strong><small>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</small></div><div class="place-row-actions"></div>`;
    const use=document.createElement('button');use.className='tiny-btn';use.textContent='Planen';use.addEventListener('click',()=>{selectPlace(p,true);closeTool();navigate('planner')});
    const del=document.createElement('button');del.className='tiny-btn';del.textContent='Löschen';del.addEventListener('click',()=>deleteFavorite(i));
    row.querySelector('.place-row-actions').append(use,del);list.appendChild(row);
  });
}
function renderPlacesTool(){
  $('modalContent').innerHTML=`<div class="search-line"><input id="modalPlaceSearch" placeholder="Ort oder Motiv suchen"><button id="modalPlaceSearchBtn" class="round-action" type="button">⌕</button></div><div class="row-actions"><button id="nearbyPlacesBtn" class="soft-btn grow" type="button">⌖ Fotospots in meiner Nähe</button></div><div id="modalPlaceResults" class="place-list" style="margin-top:10px"></div>`;
  $('modalPlaceSearchBtn').addEventListener('click',async()=>{const q=$('modalPlaceSearch').value.trim();if(!q)return;renderPlaceToolResults(await geocode(q,10).catch(()=>[]))});
  $('nearbyPlacesBtn').addEventListener('click',findNearbyPlaces);
}
function renderPlaceToolResults(items){
  const box=$('modalPlaceResults');box.innerHTML=items.length?'':'<div class="empty-state compact">Keine Treffer.</div>';
  items.forEach(p=>{
    const row=document.createElement('div');row.className='place-row';row.innerHTML=`<div><strong>${esc(p.name)}</strong><small>${esc(p.detail||'Fotospot')}</small></div><div class="place-row-actions"></div>`;
    const plan=document.createElement('button');plan.className='tiny-btn';plan.textContent='Planen';plan.addEventListener('click',()=>{selectPlace(p,true);closeTool();navigate('planner')});
    const save=document.createElement('button');save.className='tiny-btn';save.textContent='♡';save.addEventListener('click',()=>saveFavorite(p));
    row.querySelector('.place-row-actions').append(plan,save);box.appendChild(row);
  });
}
async function findNearbyPlaces(){
  const box=$('modalPlaceResults');box.innerHTML='<div class="empty-state compact">Suche…</div>';
  try{
    const p=await getPosition(),lat=p.coords.latitude,lon=p.coords.longitude;
    const q=`[out:json][timeout:20];(node(around:15000,${lat},${lon})["tourism"="viewpoint"];node(around:15000,${lat},${lon})["historic"~"castle|ruins|monument"];node(around:15000,${lat},${lon})["natural"~"peak|waterfall"];way(around:15000,${lat},${lon})["natural"="water"]["name"];);out center 20;`;
    const r=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);if(!r.ok)throw new Error();
    const data=await r.json(),seen=new Set(),items=(data.elements||[]).map(e=>{
      const la=e.lat??e.center?.lat,lo=e.lon??e.center?.lon,t=e.tags||{},name=t.name||'Fotospot',detail=t.tourism==='viewpoint'?'Aussichtspunkt':t.historic==='castle'?'Burg / Schloss':t.historic==='ruins'?'Ruine':t.natural==='peak'?'Gipfel':t.natural==='waterfall'?'Wasserfall':t.natural==='water'?'Gewässer':'Fotospot';
      return{name,detail,lat:la,lon:lo}
    }).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&!seen.has(`${x.name}|${x.lat.toFixed(3)}`)&&seen.add(`${x.name}|${x.lat.toFixed(3)}`));
    renderPlaceToolResults(items.slice(0,20));
  }catch{box.innerHTML='<div class="empty-state compact">Umgebungssuche nicht verfügbar.</div>'}
}
function renderSettings(){
  $('modalContent').innerHTML=`<div class="modal-form">
    <label><span>Erscheinungsbild</span><select id="settingTheme"><option value="dark">Dunkel</option><option value="light">Hell</option></select></label>
    <label><span>Standard-Sensor</span><select id="settingCrop"><option value="1">Vollformat</option><option value="1.5">APS-C 1,5×</option><option value="1.6">APS-C 1,6×</option><option value="2">MFT 2×</option></select></label>
    <div class="info-callout">Standort, Favoriten und Einstellungen bleiben im Browser dieses Geräts. Es wird kein Benutzerkonto benötigt.</div>
  </div>`;
  $('settingTheme').value=state.settings.theme;$('settingCrop').value=String(state.settings.crop);
  $('settingTheme').addEventListener('change',e=>{state.settings.theme=e.target.value;saveSettings()});
  $('settingCrop').addEventListener('change',e=>{state.settings.crop=+e.target.value;saveSettings();$('starSensor').value=String(state.settings.crop);updateStarResult()});
}

function renderEditor(){
  $('modalContent').innerHTML=`<div class="editor-load"><strong>Foto lokal öffnen</strong><div style="color:var(--muted);font-size:.72rem;margin-top:4px">Das Bild bleibt auf diesem Gerät.</div><input id="editorFile" type="file" accept="image/*"></div>
  <div id="editorPanel" class="hidden">
    <div class="editor-stage"><canvas id="editorCanvas"></canvas></div>
    <div class="slider-row"><span>Helligkeit</span><input id="edBrightness" type="range" min="50" max="150" value="100"><output>100%</output></div>
    <div class="slider-row"><span>Kontrast</span><input id="edContrast" type="range" min="50" max="160" value="100"><output>100%</output></div>
    <div class="slider-row"><span>Farbe</span><input id="edSaturation" type="range" min="0" max="180" value="100"><output>100%</output></div>
    <div class="slider-row"><span>Rauschminderung</span><input id="edDenoise" type="range" min="0" max="15" value="0"><output>0</output></div>
    <div class="slider-row"><span>Reparaturpinsel</span><input id="edBrush" type="range" min="5" max="60" value="18"><output>18 px</output></div>
    <div class="row-actions"><button id="healToggle" class="soft-btn grow" type="button">Reparaturpinsel: Aus</button><button id="editorReset" class="soft-btn" type="button">Reset</button><button id="editorSave" class="primary-btn" type="button">Bild speichern</button></div>
    <div class="info-callout">Reparaturpinsel: aktivieren und störende kleine Stellen antippen. Die Web-Version verwendet eine einfache lokale Umfeld-Glättung.</div>
  </div>`;
  $('editorFile').addEventListener('change',loadEditorImage);
}
function loadEditorImage(e){
  const file=e.target.files?.[0];if(!file)return;
  const img=new Image();img.onload=()=>{
    state.originalImage=img;$('editorPanel').classList.remove('hidden');
    state.editorCanvas=$('editorCanvas');state.editorCtx=state.editorCanvas.getContext('2d',{willReadFrequently:true});
    const max=1400,scale=Math.min(1,max/img.width,max/img.height);state.editorCanvas.width=Math.round(img.width*scale);state.editorCanvas.height=Math.round(img.height*scale);
    bindEditorControls();drawEditor();
  };img.src=URL.createObjectURL(file);
}
function bindEditorControls(){
  ['edBrightness','edContrast','edSaturation','edDenoise','edBrush'].forEach(id=>{
    $(id).addEventListener('input',e=>{e.target.nextElementSibling.textContent=id==='edBrush'?`${e.target.value} px`:id==='edDenoise'?e.target.value:`${e.target.value}%`;if(id!=='edBrush')drawEditor()});
  });
  $('healToggle').addEventListener('click',()=>{state.healMode=!state.healMode;$('healToggle').textContent=`Reparaturpinsel: ${state.healMode?'Ein':'Aus'}`;$('healToggle').classList.toggle('primary-btn',state.healMode)});
  $('editorReset').addEventListener('click',()=>{['edBrightness','edContrast','edSaturation'].forEach(id=>$(id).value=100);$('edDenoise').value=0;state.healMode=false;drawEditor()});
  $('editorSave').addEventListener('click',()=>{const a=document.createElement('a');a.download='MAFoto-bearbeitet.jpg';a.href=state.editorCanvas.toDataURL('image/jpeg',.94);a.click()});
  state.editorCanvas.addEventListener('pointerdown',healCanvas);
}
function drawEditor(){
  if(!state.originalImage||!state.editorCtx)return;
  const b=+$('edBrightness').value,c=+$('edContrast').value,s=+$('edSaturation').value,d=+$('edDenoise').value;
  const ctx=state.editorCtx,cv=state.editorCanvas;ctx.save();ctx.clearRect(0,0,cv.width,cv.height);
  ctx.filter=`brightness(${b}%) contrast(${c}%) saturate(${s}%) blur(${(d/15*1.2).toFixed(2)}px)`;
  ctx.drawImage(state.originalImage,0,0,cv.width,cv.height);ctx.restore();
}
function healCanvas(e){
  if(!state.healMode||!state.editorCtx)return;
  const cv=state.editorCanvas,r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height,br=+$('edBrush').value*(cv.width/r.width);
  const ctx=state.editorCtx,sx=clamp(Math.round(x-br*2),0,cv.width-1),sy=clamp(Math.round(y-br*2),0,cv.height-1),sw=clamp(Math.round(br*4),1,cv.width-sx),sh=clamp(Math.round(br*4),1,cv.height-sy);
  const img=ctx.getImageData(sx,sy,sw,sh),data=img.data;let rr=0,g=0,b=0,n=0;
  for(let yy=0;yy<sh;yy+=3)for(let xx=0;xx<sw;xx+=3){
    const dx=sx+xx-x,dy=sy+yy-y,dist=Math.hypot(dx,dy);if(dist>br*1.25&&dist<br*1.9){const i=(yy*sw+xx)*4;rr+=data[i];g+=data[i+1];b+=data[i+2];n++}
  }
  if(!n)return;rr/=n;g/=n;b/=n;
  ctx.save();ctx.fillStyle=`rgb(${rr|0},${g|0},${b|0})`;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(x,y,br,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.35;ctx.filter=`blur(${Math.max(2,br*.25)}px)`;ctx.beginPath();ctx.arc(x,y,br*1.05,0,Math.PI*2);ctx.fill();ctx.restore();
}

function showInstall(){
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const modal=$('installModal');modal.classList.remove('hidden');
  if(installed){$('installInstructions').innerHTML='<div class="install-step"><b>✓</b><span>MAFoto-Scout läuft bereits im App-Modus.</span></div>';return}
  if(state.deferredPrompt&&!ios){
    $('installInstructions').innerHTML='<div class="install-step"><b>1</b><span>Tippe auf „Jetzt installieren“.</span></div><button id="nativeInstallBtn" class="primary-btn" type="button">Jetzt installieren</button>';
    $('nativeInstallBtn').addEventListener('click',async()=>{state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null;hideInstall()});
  }else if(ios){
    $('installInstructions').innerHTML='<div class="install-step"><b>1</b><span>In Safari unten auf das Teilen-Symbol tippen.</span></div><div class="install-step"><b>2</b><span>„Zum Home-Bildschirm“ auswählen.</span></div><div class="install-step"><b>3</b><span>Oben rechts „Hinzufügen“ tippen.</span></div>';
  }else{
    $('installInstructions').innerHTML='<div class="install-step"><b>1</b><span>Öffne das Browser-Menü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.</span></div>';
  }
}
function hideInstall(){$('installModal').classList.add('hidden')}

function bindEvents(){
  $('plannerSearchBtn').addEventListener('click',searchPlanner);$('plannerSearch').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlanner()});
  $('plannerLocationBtn').addEventListener('click',useLocation);$('quickLocationBtn').addEventListener('click',useLocation);$('mapLocateBtn').addEventListener('click',useLocation);
  $('savePlaceBtn').addEventListener('click',()=>saveFavorite());$('mapSaveBtn').addEventListener('click',()=>saveFavorite());
  $('plannerDate').addEventListener('change',()=>{updateAstronomy();loadWeather()});$('plannerTime').addEventListener('change',syncSliderFromTime);$('timeSlider').addEventListener('input',syncTimeFromSlider);
  $('starFocal').addEventListener('input',updateStarResult);$('starSensor').addEventListener('change',updateStarResult);
  $('lightPollutionBtn').addEventListener('click',()=>{
    state.lpEnabled=!state.lpEnabled;
    if(state.lpEnabled){state.lpLayer?.addTo(state.map);$('lightPollutionBtn').classList.add('active-purple')}
    else{if(state.lpLayer&&state.map?.hasLayer(state.lpLayer))state.map.removeLayer(state.lpLayer);$('lightPollutionBtn').classList.remove('active-purple')}
  });
  $('mapSearchBtn').addEventListener('click',()=>navigate('planner'));
  $('modalCloseBtn').addEventListener('click',closeTool);$('modalBackdrop').addEventListener('click',closeTool);
  $('installAppBtn').addEventListener('click',showInstall);$$('[data-close-install]').forEach(x=>x.addEventListener('click',hideInstall));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e});
}

function setupPwa(){
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

function init(){
  loadSettings();
  const now=new Date();$('plannerDate').value=localDate(now);$('plannerTime').value=timeString(now);
  const mins=now.getHours()*60+now.getMinutes();$('timeSlider').value=mins;$('sliderTimeLabel').textContent=timeString(now);
  $('starSensor').value=String(state.settings.crop);
  bindNavigation();bindEvents();initMap();setupPwa();updateStarResult();renderHome();navigate('home');
}
document.addEventListener('DOMContentLoaded',init);
})();

(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  place: null,
  map: null,
  marker: null,
  deferredPrompt: null,
  weather: null
};

const FAV_KEY = 'mafoto-scout-favorites-v1';
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

function toast(message, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function timeString(d = new Date()) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '–';
  return new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(d);
}

function formatRange(a,b) {
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '–';
  return `${formatTime(a)}–${formatTime(b)}`;
}

function deg(rad) { return rad * 180 / Math.PI; }
function compass(degrees) {
  const dirs = ['N','NO','O','SO','S','SW','W','NW'];
  return dirs[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}

function setTab(id) {
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === id));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  if (id === 'planner' && state.map) setTimeout(() => state.map.invalidateSize(), 80);
  if (id === 'favorites') renderFavorites();
  window.scrollTo({top:0,behavior:'smooth'});
}

function initNavigation() {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  $$('[data-go]').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.go)));
}

function initMap() {
  if (!window.L) {
    $('map').innerHTML = '<div class="status-box error">Die Kartenbibliothek konnte nicht geladen werden. Prüfe die Internetverbindung.</div>';
    return;
  }
  state.map = L.map('map',{zoomControl:true}).setView([51.1657,10.4515],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap-Mitwirkende'
  }).addTo(state.map);

  state.map.on('click', async (e) => {
    const {lat,lng} = e.latlng;
    const name = await reverseGeocode(lat,lng).catch(() => null);
    selectPlace({lat,lon:lng,name:name || `Standpunkt ${lat.toFixed(5)}, ${lng.toFixed(5)}`}, true);
  });
}

function setMarker(lat,lon) {
  if (!state.map) return;
  if (state.marker) state.marker.setLatLng([lat,lon]);
  else state.marker = L.marker([lat,lon],{draggable:true}).addTo(state.map);
  state.marker.off('dragend');
  state.marker.on('dragend', async () => {
    const pos = state.marker.getLatLng();
    const name = await reverseGeocode(pos.lat,pos.lng).catch(() => null);
    selectPlace({lat:pos.lat,lon:pos.lng,name:name || `Standpunkt ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`}, false);
  });
}

async function geocode(query, limit=6) {
  const q = query.trim();
  if (!q) return [];
  const coord = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (coord) {
    const lat = Number(coord[1]), lon = Number(coord[2]);
    if (Math.abs(lat)<=90 && Math.abs(lon)<=180) return [{lat,lon,name:`Koordinaten ${lat.toFixed(5)}, ${lon.toFixed(5)}`,detail:'Direkte Koordinateneingabe'}];
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&accept-language=de&q=${encodeURIComponent(q)}`;
  const res = await fetch(url,{headers:{'Accept':'application/json'}});
  if (!res.ok) throw new Error(`Ortssuche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data.map(x => ({
    lat:Number(x.lat),
    lon:Number(x.lon),
    name:(x.name || x.display_name || q).split(',')[0],
    detail:x.display_name || '',
    type:x.type || x.category || ''
  }));
}

async function reverseGeocode(lat,lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=de&lat=${lat}&lon=${lon}`;
  const res = await fetch(url,{headers:{'Accept':'application/json'}});
  if (!res.ok) return null;
  const x = await res.json();
  return x.display_name || null;
}

function renderSearchResults(containerId, results, onPick) {
  const box = $(containerId);
  box.innerHTML = '';
  if (!results.length) {
    box.innerHTML = '<div class="status-box warn">Keine passenden Orte gefunden.</div>';
    return;
  }
  results.forEach(item => {
    const btn = document.createElement('button');
    btn.type='button';
    btn.className='search-result';
    btn.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail || `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}`)}</small>`;
    btn.addEventListener('click',()=>onPick(item));
    box.appendChild(btn);
  });
}

async function plannerSearch() {
  const input = $('plannerSearch');
  const q = input.value.trim();
  if (!q) return toast('Bitte einen Ort eingeben.',true);
  $('plannerSearchBtn').disabled = true;
  $('plannerResults').innerHTML = '<div class="status-box">Suche…</div>';
  try {
    const results = await geocode(q);
    renderSearchResults('plannerResults',results,item => {
      selectPlace(item,true);
      $('plannerResults').innerHTML='';
      input.value=item.name;
    });
  } catch (e) {
    $('plannerResults').innerHTML = `<div class="status-box error">${escapeHtml(e.message)}</div>`;
  } finally {
    $('plannerSearchBtn').disabled = false;
  }
}

async function placesSearch() {
  const q = $('placesSearch').value.trim();
  if (!q) return toast('Bitte einen Suchbegriff eingeben.',true);
  const btn = $('placesSearchBtn');
  btn.disabled=true;
  $('placesResults').innerHTML='<div class="status-box">Suche…</div>';
  try{
    const results=await geocode(q,9);
    renderPlaceCards(results);
  }catch(e){
    $('placesResults').innerHTML=`<div class="status-box error">${escapeHtml(e.message)}</div>`;
  }finally{btn.disabled=false}
}

async function nearbyPhotoPlaces() {
  const btn=$('nearbyBtn');
  btn.disabled=true;
  $('placesResults').innerHTML='<div class="status-box">Suche Fotomotive in der Nähe…</div>';
  try{
    const pos = await getPosition();
    const {latitude:lat,longitude:lon}=pos.coords;
    const query = `[out:json][timeout:20];(node(around:12000,${lat},${lon})["tourism"="viewpoint"];node(around:12000,${lat},${lon})["historic"~"castle|ruins|monument"];node(around:12000,${lat},${lon})["natural"~"peak|waterfall"];way(around:12000,${lat},${lon})["natural"~"water|wetland"]["name"];);out center 18;`;
    const url=`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res=await fetch(url);
    if(!res.ok) throw new Error(`Umgebungssuche fehlgeschlagen (${res.status})`);
    const data=await res.json();
    const seen=new Set();
    const places=(data.elements||[]).map(el=>{
      const la=el.lat ?? el.center?.lat, lo=el.lon ?? el.center?.lon;
      const name=el.tags?.name || typeLabel(el.tags);
      return {lat:la,lon:lo,name,detail:typeLabel(el.tags)};
    }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.name&&!seen.has(`${p.name}|${p.lat.toFixed(3)}|${p.lon.toFixed(3)}`)&&seen.add(`${p.name}|${p.lat.toFixed(3)}|${p.lon.toFixed(3)}`));
    renderPlaceCards(places.slice(0,18));
    if(!places.length) toast('Keine typischen Fotospots im 12-km-Radius gefunden.');
  }catch(e){
    $('placesResults').innerHTML=`<div class="status-box error">${escapeHtml(e.message || 'Standort konnte nicht ermittelt werden.')}</div>`;
  }finally{btn.disabled=false}
}

function typeLabel(tags={}) {
  if(tags.tourism==='viewpoint') return 'Aussichtspunkt';
  if(tags.historic==='castle') return 'Burg / Schloss';
  if(tags.historic==='ruins') return 'Ruine';
  if(tags.historic==='monument') return 'Denkmal';
  if(tags.natural==='peak') return 'Gipfel';
  if(tags.natural==='waterfall') return 'Wasserfall';
  if(tags.natural==='water') return 'Gewässer';
  return 'Fotospot';
}

function renderPlaceCards(items) {
  const box=$('placesResults');
  box.innerHTML='';
  if(!items.length){
    box.innerHTML='<div class="status-box warn">Keine passenden Orte gefunden.</div>';
    return;
  }
  items.forEach(item=>{
    const card=document.createElement('article');
    card.className='place';
    card.innerHTML=`<h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.detail || `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}`)}</p>`;
    const actions=document.createElement('div');
    actions.className='place-actions';
    const plan=document.createElement('button');
    plan.type='button'; plan.className='primary'; plan.textContent='Planen';
    plan.addEventListener('click',()=>{selectPlace(item,true);setTab('planner')});
    const save=document.createElement('button');
    save.type='button'; save.className='ghost'; save.textContent='Speichern';
    save.addEventListener('click',()=>saveFavorite(item));
    actions.append(plan,save);
    card.appendChild(actions);
    box.appendChild(card);
  });
}

function selectPlace(place, recenter=true) {
  state.place={name:place.name || 'Foto-Standpunkt',lat:Number(place.lat),lon:Number(place.lon),detail:place.detail || ''};
  $('selectedPlace').innerHTML=`<strong>${escapeHtml(state.place.name)}</strong><br><span class="muted">${state.place.lat.toFixed(5)}, ${state.place.lon.toFixed(5)}</span>`;
  setMarker(state.place.lat,state.place.lon);
  if(state.map && recenter) state.map.setView([state.place.lat,state.place.lon],13);
  updateSunAndAstro();
  loadWeather();
}

function selectedDateTime() {
  const date=$('plannerDate').value || localDateString();
  const time=$('plannerTime').value || '12:00';
  const d=new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime())?new Date():d;
}

function updateSunAndAstro() {
  if(!state.place || !window.SunCalc) return;
  const {lat,lon}=state.place;
  const dt=selectedDateTime();
  const noon=new Date(dt); noon.setHours(12,0,0,0);
  const times=SunCalc.getTimes(noon,lat,lon);
  const pos=SunCalc.getPosition(dt,lat,lon);
  const az=((deg(pos.azimuth)+180)%360+360)%360;
  const alt=deg(pos.altitude);

  $('lightSummary').innerHTML=`
    <div class="metric"><span>Sonnenaufgang</span><strong>${formatTime(times.sunrise)}</strong></div>
    <div class="metric"><span>Sonnenuntergang</span><strong>${formatTime(times.sunset)}</strong></div>
    <div class="metric"><span>Goldene Stunde</span><strong>${formatRange(times.goldenHour,times.sunset)}</strong></div>
    <div class="metric"><span>Blaue Stunde*</span><strong>${formatRange(times.dusk,times.nauticalDusk)}</strong></div>`;

  $('sunDirection').innerHTML=`Zur gewählten Uhrzeit: Sonne <strong>${compass(az)} · ${nf0.format(az)}°</strong>, Höhe <strong>${nf0.format(alt)}°</strong>.<br><span class="muted">* Blaue Stunde als Näherung über die Dämmerungsphasen.</span>`;

  const moonTimes=SunCalc.getMoonTimes(noon,lat,lon,true);
  const illum=SunCalc.getMoonIllumination(noon);
  const phase=moonPhaseName(illum.phase);
  const nightStart=times.night, nightEnd=times.nightEnd;
  $('astroMetrics').innerHTML=`
    <div class="metric"><span>Mondaufgang</span><strong>${formatTime(moonTimes.rise)}</strong></div>
    <div class="metric"><span>Monduntergang</span><strong>${formatTime(moonTimes.set)}</strong></div>
    <div class="metric"><span>Mondphase</span><strong>${phase} · ${nf0.format(illum.fraction*100)}%</strong></div>
    <div class="metric"><span>Astro-Nacht</span><strong>${formatRange(nightStart,nightEnd)}</strong></div>`;

  let astroText='Die astronomische Nacht ist die dunkelste Zeitspanne für Sternaufnahmen.';
  if(illum.fraction<0.25) astroText+=' Der Mond ist relativ wenig beleuchtet – das kann für dunklen Himmel günstig sein.';
  else if(illum.fraction>0.75) astroText+=' Der Mond ist stark beleuchtet und kann den Himmel deutlich aufhellen.';
  else astroText+=' Die Mondhelligkeit liegt im mittleren Bereich.';
  $('astroAdvice').textContent=astroText;
}

function moonPhaseName(p) {
  if(p<0.03 || p>0.97) return 'Neumond';
  if(p<0.22) return 'Zunehmende Sichel';
  if(p<0.28) return 'Erstes Viertel';
  if(p<0.47) return 'Zunehmender Mond';
  if(p<0.53) return 'Vollmond';
  if(p<0.72) return 'Abnehmender Mond';
  if(p<0.78) return 'Letztes Viertel';
  return 'Abnehmende Sichel';
}

function weatherCodeText(code) {
  const map={
    0:'Klar',1:'Überwiegend klar',2:'Teilweise bewölkt',3:'Bewölkt',
    45:'Nebel',48:'Reifnebel',51:'Leichter Nieselregen',53:'Nieselregen',55:'Starker Nieselregen',
    61:'Leichter Regen',63:'Regen',65:'Starker Regen',71:'Leichter Schneefall',73:'Schneefall',
    75:'Starker Schneefall',80:'Regenschauer',81:'Regenschauer',82:'Starke Regenschauer',
    95:'Gewitter',96:'Gewitter mit Hagel',99:'Starkes Gewitter mit Hagel'
  };
  return map[code] || `Wettercode ${code}`;
}

async function loadWeather() {
  if(!state.place) return;
  const {lat,lon}=state.place;
  const status=$('weatherStatus'), metrics=$('weatherMetrics');
  status.className='status-box';
  status.textContent='Wetter wird geladen…';
  metrics.classList.add('hidden');
  const target=$('plannerDate').value || localDateString();
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m&daily=sunrise,sunset,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`;
    const res=await fetch(url);
    if(!res.ok) throw new Error(`Wetterdienst antwortet mit ${res.status}`);
    const data=await res.json();
    state.weather=data;
    const idx=(data.daily?.time||[]).indexOf(target);
    const currentDate=localDateString();
    if(idx<0 && target!==currentDate){
      status.className='status-box warn';
      status.textContent='Für dieses Datum liegt im aktuellen Wetterdienst kein Vorhersagezeitraum vor. Licht- und Astro-Berechnung funktionieren trotzdem.';
      metrics.classList.add('hidden');
      $('photoAdvice').className='status-box warn';
      $('photoAdvice').textContent='Keine belastbare Wetterprognose für dieses Datum verfügbar.';
      return;
    }
    const c=data.current || {};
    const dailyCode=idx>=0 ? data.daily.weather_code[idx] : c.weather_code;
    const rain=idx>=0 ? data.daily.precipitation_probability_max[idx] : null;
    status.className='status-box good';
    status.textContent=`${weatherCodeText(dailyCode)}${target===currentDate?' · aktuelle Mess-/Modelldaten':' · Tagesprognose'}`;
    metrics.innerHTML=`
      <div class="metric"><span>Temperatur jetzt</span><strong>${Number.isFinite(c.temperature_2m)?nf1.format(c.temperature_2m)+' °C':'–'}</strong></div>
      <div class="metric"><span>Bewölkung jetzt</span><strong>${Number.isFinite(c.cloud_cover)?nf0.format(c.cloud_cover)+' %':'–'}</strong></div>
      <div class="metric"><span>Wind jetzt</span><strong>${Number.isFinite(c.wind_speed_10m)?nf0.format(c.wind_speed_10m)+' km/h':'–'}</strong></div>
      <div class="metric"><span>Regenrisiko Tag</span><strong>${Number.isFinite(rain)?nf0.format(rain)+' %':'–'}</strong></div>`;
    metrics.classList.remove('hidden');
    updatePhotoAdvice(c,rain,dailyCode);
  }catch(e){
    status.className='status-box error';
    status.textContent='Wetter konnte nicht geladen werden. Licht- und Astro-Funktionen bleiben nutzbar.';
    $('photoAdvice').className='status-box warn';
    $('photoAdvice').textContent='Ohne Wetterdaten ist nur die Lichtplanung verfügbar.';
  }
}

function updatePhotoAdvice(c,rain,code) {
  const adv=[];
  const cloud=Number(c.cloud_cover);
  const wind=Number(c.wind_speed_10m);
  if(Number.isFinite(cloud)){
    if(cloud<20) adv.push('Sehr klarer Himmel: gut für Sterne, bei Landschaften kann das Licht härter wirken.');
    else if(cloud<=70) adv.push('Teilweise Bewölkung kann Sonnenauf- und -untergänge strukturreicher machen.');
    else adv.push('Starke Bewölkung: eher weiches Licht; Sonnenfarben können verdeckt sein.');
  }
  if(Number.isFinite(rain) && rain>=60) adv.push('Erhöhtes Regenrisiko: Regenschutz für Kamera und Objektiv einplanen.');
  if(Number.isFinite(wind) && wind>=30) adv.push('Mehr Wind: stabiles Stativ und kurze Belichtungszeit bei bewegten Motiven beachten.');
  if([45,48].includes(code)) adv.push('Nebel kann für Wald-, Landschafts- und Architekturaufnahmen interessant sein.');
  const box=$('photoAdvice');
  box.className='status-box good';
  box.textContent=adv.join(' ') || 'Die Bedingungen wirken unauffällig. Lichtzeit und Motiv entscheiden über die beste Aufnahmezeit.';
}

function getPosition() {
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error('Geolocation wird auf diesem Gerät nicht unterstützt.'));
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  });
}

async function useCurrentLocation() {
  try{
    toast('Standort wird ermittelt…');
    const pos=await getPosition();
    const {latitude:lat,longitude:lon}=pos.coords;
    const name=await reverseGeocode(lat,lon).catch(()=>null);
    selectPlace({lat,lon,name:name || 'Aktueller Standort'},true);
    $('plannerSearch').value=name ? name.split(',')[0] : 'Aktueller Standort';
    setTab('planner');
  }catch(e){
    toast('Standort konnte nicht verwendet werden. Bitte Browser-Berechtigung prüfen.',true);
  }
}

function saveFavorite(place=state.place) {
  if(!place) return toast('Wähle zuerst einen Ort.',true);
  const favs=getFavorites();
  const normalized={name:place.name || 'Foto-Ort',lat:Number(place.lat),lon:Number(place.lon),detail:place.detail || ''};
  const exists=favs.some(x=>Math.abs(x.lat-normalized.lat)<0.00001 && Math.abs(x.lon-normalized.lon)<0.00001);
  if(!exists) favs.unshift(normalized);
  localStorage.setItem(FAV_KEY,JSON.stringify(favs.slice(0,100)));
  renderFavorites();
  toast(exists?'Ort ist bereits gespeichert.':'Ort gespeichert.');
}

function getFavorites() {
  try{
    const arr=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');
    return Array.isArray(arr)?arr:[];
  }catch{return[]}
}

function renderFavorites() {
  const box=$('favoritesList');
  const favs=getFavorites();
  box.innerHTML='';
  if(!favs.length){
    box.innerHTML='<div class="status-box">Noch keine Favoriten gespeichert.</div>';
    return;
  }
  favs.forEach((item,index)=>{
    const card=document.createElement('article');
    card.className='place';
    card.innerHTML=`<h3>${escapeHtml(item.name)}</h3><p>${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}</p>`;
    const actions=document.createElement('div');
    actions.className='place-actions';
    const open=document.createElement('button');
    open.type='button';open.className='primary';open.textContent='Planen';
    open.addEventListener('click',()=>{selectPlace(item,true);setTab('planner')});
    const del=document.createElement('button');
    del.type='button';del.className='ghost danger';del.textContent='Löschen';
    del.addEventListener('click',()=>{
      const next=getFavorites();next.splice(index,1);
      localStorage.setItem(FAV_KEY,JSON.stringify(next));renderFavorites();toast('Favorit gelöscht.');
    });
    actions.append(open,del);card.append(actions);box.append(card);
  });
}

function updateStarCalc() {
  const focal=Number($('focalLength').value);
  const crop=Number($('sensorType').value);
  $('focalOut').textContent=`${focal} mm`;
  const seconds=500/(focal*crop);
  $('starCalc').innerHTML=`500er-Regel: ca. <strong>${nf1.format(seconds)} s</strong> maximale Belichtungszeit als grober Startwert.<br><span class="muted">Bei hochauflösenden Sensoren können kürzere Zeiten nötig sein.</span>`;
}

function calcNd() {
  const base=Number($('baseShutter').value);
  const stops=Number($('ndStops').value);
  if(!Number.isFinite(base)||base<=0) return toast('Gültige Ausgangszeit eingeben.',true);
  const sec=base*Math.pow(2,stops);
  $('ndResult').innerHTML=`${nf1.format(base)} s mit ${stops} Stops → <strong>${formatDuration(sec)}</strong>`;
}

function formatDuration(sec) {
  if(sec<1) return `${nf1.format(sec)} s`;
  if(sec<60) return `${nf1.format(sec)} s`;
  const m=Math.floor(sec/60), s=Math.round(sec%60);
  return `${m} min ${s} s`;
}

function cameraTip(type) {
  const tips={
    landscape:'Startpunkt: ISO 100, f/8–f/11. Verschlusszeit nach Licht wählen. Bei längeren Zeiten Stativ und ggf. 2-s-Auslöser verwenden.',
    portrait:'Startpunkt: f/1.8–f/4 je nach gewünschter Schärfentiefe. Augen-AF nutzen, Verschlusszeit eher 1/250 s oder kürzer bei Bewegung.',
    astro:'Startpunkt: RAW, manuelle Scharfstellung auf einen hellen Stern, offene Blende, Belichtungszeit nach Sternfoto-Rechner, ISO anschließend passend anheben.',
    sport:'Startpunkt: 1/1000 s oder kürzer, kontinuierlicher Autofokus und Serienbild. ISO so hoch wie nötig, damit die Verschlusszeit gehalten wird.'
  };
  $('cameraTipDetail').textContent=tips[type]||'';
}

function bindEvents() {
  $('plannerSearchBtn').addEventListener('click',plannerSearch);
  $('plannerSearch').addEventListener('keydown',e=>{if(e.key==='Enter') plannerSearch()});
  $('placesSearchBtn').addEventListener('click',placesSearch);
  $('placesSearch').addEventListener('keydown',e=>{if(e.key==='Enter') placesSearch()});
  $('nearbyBtn').addEventListener('click',nearbyPhotoPlaces);
  $('useLocationBtn').addEventListener('click',useCurrentLocation);
  $('useLocationHero').addEventListener('click',useCurrentLocation);
  $('savePlaceBtn').addEventListener('click',()=>saveFavorite());
  $('centerMapBtn').addEventListener('click',()=>{
    if(state.place && state.map) state.map.setView([state.place.lat,state.place.lon],14);
    else toast('Wähle zuerst einen Ort.',true);
  });
  $('plannerDate').addEventListener('change',()=>{updateSunAndAstro();loadWeather()});
  $('plannerTime').addEventListener('change',updateSunAndAstro);
  $('focalLength').addEventListener('input',updateStarCalc);
  $('sensorType').addEventListener('change',updateStarCalc);
  $('calcNdBtn').addEventListener('click',calcNd);
  $$('.tip').forEach(btn=>btn.addEventListener('click',()=>cameraTip(btn.dataset.tip)));
  $('clearFavoritesBtn').addEventListener('click',()=>{
    if(!getFavorites().length) return toast('Keine Favoriten vorhanden.');
    localStorage.removeItem(FAV_KEY);renderFavorites();toast('Favoriten gelöscht.');
  });
}

function setupPwa() {
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    state.deferredPrompt=e;
    $('installBtn').classList.remove('hidden');
  });
  $('installBtn').addEventListener('click',async()=>{
    if(!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt=null;
    $('installBtn').classList.add('hidden');
  });
}

function updateOnlineState() {
  $('onlineState').textContent=navigator.onLine?'Online':'Offline';
}

function init() {
  const now=new Date();
  $('plannerDate').value=localDateString(now);
  $('plannerTime').value=timeString(now);
  initNavigation();
  initMap();
  bindEvents();
  setupPwa();
  updateStarCalc();
  calcNd();
  renderFavorites();
  updateOnlineState();
  window.addEventListener('online',updateOnlineState);
  window.addEventListener('offline',updateOnlineState);

  // Neutrale Startansicht Deutschland – kein persönlicher Standort wird gespeichert.
  if(state.map) state.map.setView([51.1657,10.4515],6);
}

document.addEventListener('DOMContentLoaded',init);
})();

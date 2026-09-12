/*
  ForThePatient.org — app.js v2.0 (POSTCARD-1, September 12, 2026)
  ─────────────────────────────────────────────────────────────────────────
  v2.0  POSTCARD-1: scroll-first rebuild (SCROLL-1 + SCROLL-2 in one pass,
        in the Postcard design system).
        - The FEED is the primary surface on every device: nearby_facilities
          (Invariants #3–5: all params, !! coercion, p_limit 5000) fetched around
          ONE origin (your location, a state centroid, or a deep-linked point),
          distance-sorted client-side (haversineMiles), paged client-side.
        - The MAP is a section: initialized lazily on first open (mobile) or at
          load on desktop (≥960px). It renders the same rows as the feed as
          L.divIcon markers (Invariants #7/#8/#31); marker click scrolls to the
          card. CARTO + CMS attribution visible whenever the map is open (D152).
        - The FACILITY REPORT is a scroll document rendered by buildReportHtml
          from facility_detail (Invariant #6: no new RPCs, no new params).
          Deep links ?fid= open it directly; history/popstate preserved.
        - Sheet machinery deleted (setSheetView, syncSheetBarMetrics, the
          data-sheet-* body attributes, D159 positioning): the surface it
          served no longer exists, so its bug class (#24b/⧖#34) is gone.
        - No inline on* handlers anywhere: every control is wired by delegated
          listeners on data-* attributes, so the JS-string-context hazard that
          jsq() guarded (FA-1) cannot recur. jsq() is retained for the record.
        - ⧖#35 AbortController now passed to the RPC (.abortSignal); ⧖#36
          clipboard guarded; ⧖#37 directions link omitted on null coords.
        - Compare tray (session-only, max three) and a compare view.
        - DATA_VINTAGE and STATUS_STRING are single tokens (J-ORG rule).
        Carried verbatim in substance: escapeHtml (#15), DEBUG gate (#14),
        theme (#12), geolocation timing (#11), buildPatientSummary (TRANSLATE-1),
        buildEnforcementHtml (ENF-VIZ), buildPaymentPenaltyHtml (B-FLAG-SCOPE),
        the capability model (CAP-VIZ), Decision 114's two severity vocabularies.
        Not carried: state_summary bubbles (the feed replaces the national
        view); the desktop side panel; markercluster (never instantiated since
        C3-NOCLUSTER); Font Awesome (⧖D178).
*/
(function(){
'use strict';

// ── Single-token public facts (edit here only) ──────────────────────────────
const DATA_VINTAGE='June 2026';                       // refreshed with every seed
const STATUS_STRING='ForThePatient.org is a nonprofit initiative; 501(c)(3) formation is underway.'; // Q-63 (D156)
const SITE_URL='https://forthepatient.org/';

// ── Backend (Invariants #1, #2) ─────────────────────────────────────────────
const SUPABASE_URL='https://nhajnwffxlztmoadqcdl.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oYWpud2ZmeGx6dG1vYWRxY2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA1NzAsImV4cCI6MjA4ODMyNjU3MH0.lUVbH_ka0LS8B6xuQJG8KuOdwgk7lTejl9dPfzSUHwQ';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

// ── Vocabulary ──────────────────────────────────────────────────────────────
const FACILITY_TYPES=[{value:'hospital',label:'Hospitals',one:'hospital'},{value:'nursing_home',label:'Nursing homes',one:'nursing home'},{value:'dialysis',label:'Dialysis',one:'dialysis center'},{value:'home_health',label:'Home health',one:'home health agency'},{value:'hospice',label:'Hospice',one:'hospice'},{value:'irf',label:'Rehab (IRF)',one:'rehab facility'},{value:'ltch',label:'Long-term (LTCH)',one:'long-term care hospital'}];
const TYPE_LABEL=Object.fromEntries(FACILITY_TYPES.map(t=>[t.value,t.label]));
const TYPE_ONE=Object.fromEntries(FACILITY_TYPES.map(t=>[t.value,t.one]));
// Journeys are PRESETS of FACILITY_TYPES[].value keys (⧖D175). They never change a verdict.
const JOURNEYS=[
  {key:'me',label:'For me',types:['hospital'],title:'Hospitals'},
  {key:'parent',label:'For my parent',types:['nursing_home','home_health','hospice'],title:'Nursing homes, home health and hospice'},
  {key:'after',label:'After a hospital stay',types:['irf','ltch','home_health'],title:'Rehab, long-term care and home health'}
];
// CAP-VIZ model, carried. Server keys map to the five live nearby_facilities booleans
// (no new RPC param — Invariant #6); client keys filter rows already in hand.
const CAPABILITIES=[
  {key:'er',label:'Emergency room',kind:'server'},{key:'nicu',label:'NICU',kind:'server'},{key:'cath',label:'Cardiac cath lab',kind:'server'},
  {key:'trauma',label:'Trauma center',kind:'server'},{key:'teaching',label:'Teaching hospital',kind:'server'},
  {key:'cardsurg',label:'Cardiac surgery',kind:'client',field:'has_cardiac_surgery'},{key:'mri',label:'MRI on site',kind:'client',field:'has_mri'},
  {key:'burn',label:'Burn unit',kind:'client',field:'has_burn_unit'},{key:'transplant',label:'Transplant',kind:'client',field:'has_organ_transplant'},
  {key:'highcmi',label:'Higher complexity',kind:'client',field:'case_mix_index',cmiMin:1.75}
];
const CAP_SERVER_KEYS=CAPABILITIES.filter(c=>c.kind==='server').map(c=>c.key);
const CAP_CLIENT=CAPABILITIES.filter(c=>c.kind==='client');
// The band is the ONLY color carrier and it always travels with its word + number (⧖Inv #46).
const BAND={'Exceptional':'exceptional','Above Average':'above','Average':'average','Below Average':'below','Poor':'poor','Unrated':'unrated'};
const BAND_WORD={'Exceptional':'Exceptional','Above Average':'Above average','Average':'Average','Below Average':'Below average','Poor':'Poor','Unrated':'Not scored'};
const BAND_HEX={exceptional:'#1F6E4E',above:'#2F7D50',average:'#5F6B78',below:'#B85C13',poor:'#8F2A22',unrated:'#8B8794'};
// One short verdict sentence per label — the card's second line; the report carries the full reading.
const VERDICT={'Exceptional':'Among the strongest of its type. A confident choice.','Above Average':'Better than most nearby. Worth a visit.','Average':'Typical for its type. Ask about the parts that matter to you.','Below Average':'Weaker than most. Look at other options first.','Poor':'Serious concerns. We would look elsewhere.','Unrated':'Not enough public data to score it. That is not a bad sign — ask the facility directly.'};
const SEV_RANK={CRITICAL:4,SEVERE:3,MODERATE:2,MINOR:1};
const SEV_WORD={CRITICAL:'critical',SEVERE:'severe',MODERATE:'moderate',MINOR:'minor'};
const LVL_WORD={immediate_jeopardy:'critical',condition:'significant',standard:'minor',critical:'critical',significant:'significant',minor:'minor'};
const RADII=[10,25,50,100];
const PAGE=20;
const US_STATES=[{n:'Alabama',s:'AL',lat:32.806671,lng:-86.79113},{n:'Alaska',s:'AK',lat:61.370716,lng:-152.404419},{n:'Arizona',s:'AZ',lat:33.729759,lng:-111.431221},{n:'Arkansas',s:'AR',lat:34.969704,lng:-92.373123},{n:'California',s:'CA',lat:36.116203,lng:-119.681564},{n:'Colorado',s:'CO',lat:39.059811,lng:-105.311104},{n:'Connecticut',s:'CT',lat:41.597782,lng:-72.755371},{n:'Delaware',s:'DE',lat:39.318523,lng:-75.507141},{n:'Florida',s:'FL',lat:27.766279,lng:-81.686783},{n:'Georgia',s:'GA',lat:33.040619,lng:-83.643074},{n:'Hawaii',s:'HI',lat:21.094318,lng:-157.498337},{n:'Idaho',s:'ID',lat:44.240459,lng:-114.478773},{n:'Illinois',s:'IL',lat:40.349457,lng:-88.986137},{n:'Indiana',s:'IN',lat:39.849426,lng:-86.258278},{n:'Iowa',s:'IA',lat:42.011539,lng:-93.210526},{n:'Kansas',s:'KS',lat:38.5266,lng:-96.726486},{n:'Kentucky',s:'KY',lat:37.66814,lng:-84.670067},{n:'Louisiana',s:'LA',lat:31.169546,lng:-91.867805},{n:'Maine',s:'ME',lat:44.693947,lng:-69.381927},{n:'Maryland',s:'MD',lat:39.063946,lng:-76.802101},{n:'Massachusetts',s:'MA',lat:42.230171,lng:-71.530106},{n:'Michigan',s:'MI',lat:43.326618,lng:-84.536095},{n:'Minnesota',s:'MN',lat:45.694454,lng:-93.900192},{n:'Mississippi',s:'MS',lat:32.741646,lng:-89.678696},{n:'Missouri',s:'MO',lat:38.456085,lng:-92.288368},{n:'Montana',s:'MT',lat:46.921925,lng:-110.454353},{n:'Nebraska',s:'NE',lat:41.12537,lng:-98.268082},{n:'Nevada',s:'NV',lat:38.313515,lng:-117.055374},{n:'New Hampshire',s:'NH',lat:43.452492,lng:-71.563896},{n:'New Jersey',s:'NJ',lat:40.298904,lng:-74.521011},{n:'New Mexico',s:'NM',lat:34.840515,lng:-106.248482},{n:'New York',s:'NY',lat:42.165726,lng:-74.948051},{n:'North Carolina',s:'NC',lat:35.630066,lng:-79.806419},{n:'North Dakota',s:'ND',lat:47.528912,lng:-99.784012},{n:'Ohio',s:'OH',lat:40.388783,lng:-82.764915},{n:'Oklahoma',s:'OK',lat:35.565342,lng:-96.928917},{n:'Oregon',s:'OR',lat:44.572021,lng:-122.070938},{n:'Pennsylvania',s:'PA',lat:40.590752,lng:-77.209755},{n:'Rhode Island',s:'RI',lat:41.680893,lng:-71.51178},{n:'South Carolina',s:'SC',lat:33.856892,lng:-80.945007},{n:'South Dakota',s:'SD',lat:44.299782,lng:-99.438828},{n:'Tennessee',s:'TN',lat:35.747845,lng:-86.692345},{n:'Texas',s:'TX',lat:31.054487,lng:-97.563461},{n:'Utah',s:'UT',lat:40.150032,lng:-111.862434},{n:'Vermont',s:'VT',lat:44.045876,lng:-72.710686},{n:'Virginia',s:'VA',lat:37.769337,lng:-78.169968},{n:'Washington',s:'WA',lat:47.400902,lng:-121.490494},{n:'West Virginia',s:'WV',lat:38.491226,lng:-80.954456},{n:'Wisconsin',s:'WI',lat:44.268543,lng:-89.616508},{n:'Wyoming',s:'WY',lat:42.755966,lng:-107.30249},{n:'District of Columbia',s:'DC',lat:38.897438,lng:-77.026817},{n:'Puerto Rico',s:'PR',lat:18.220833,lng:-66.590149},{n:'Guam',s:'GU',lat:13.444304,lng:144.793731},{n:'U.S. Virgin Islands',s:'VI',lat:18.335765,lng:-64.896335}];
const STATE_BY_ABBR=Object.fromEntries(US_STATES.map(s=>[s.s,s]));

// ── Debug gate (Invariant #14) ──────────────────────────────────────────────
const DEBUG=(function(){try{return(new URLSearchParams(location.search).get('debug')==='1')||location.hostname==='localhost'||location.hostname==='127.0.0.1'}catch(e){return false}})();
const dlog=DEBUG?console.log.bind(console,'[FTP]'):function(){};
const derr=DEBUG?console.error.bind(console,'[FTP]'):function(){};

// ── State ───────────────────────────────────────────────────────────────────
let currentTheme='light';
let activeTypes=new Set(['hospital']);
let journey='me';
let radius=25;
let origin=null;                 // {lat,lng,kind:'geo'|'state'|'url',state?}
let currentFacilities=[];        // rows from the last nearby_facilities call, with _dist
let shownCount=PAGE;
let flagOnly=false;
let activeCaps=Object.fromEntries(CAPABILITIES.map(c=>[c.key,false]));
let compare=[];                  // up to 3 facility rows (session-only, A4)
let openFacilityId=null;
let view='home';
let map=null,facilityLayer=null,userLayer=null,markerById=new Map(),tileLayer=null;
let inflight=null;
let isOnline=navigator.onLine;
let homeScrollY=0;
let searchRows=[];

// ── Helpers ─────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
function escapeHtml(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function jsq(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")} // retained (FA-1); no inline handlers remain
function truthy(v){if(v===true)return true;if(v===false||v==null)return false;const s=String(v).toLowerCase();return s==='y'||s==='yes'||s==='true'||s==='1'}
function debounce(fn,ms){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms)}}
function normSev(s){if(s==null)return null;const u=String(s).trim().toUpperCase();return SEV_RANK[u]?u:null}
function haversineMiles(lat1,lng1,lat2,lng2){const R=3958.8,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
function fmtDist(mi){if(mi==null||!isFinite(mi))return'';return(mi<10?mi.toFixed(1):String(Math.round(mi)))+' mi'}
function isDesktop(){return window.innerWidth>=960}
function icon(name,cls){return'<svg class="icon'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#i-'+name+'"/></svg>'}
function scoreOf(f){return(f&&f.final_score!=null)?Number(f.final_score):null}
function labelOf(f){const c=f&&f.score_classification;return(c&&BAND[c])?c:'Unrated'}
function stateName(abbr){const s=STATE_BY_ABBR[abbr];return s?s.n:null}
function typeNoun(){const t=Array.from(activeTypes);if(journey){const j=JOURNEYS.find(x=>x.key===journey);if(j&&j.types.length===t.length&&j.types.every(v=>activeTypes.has(v)))return j.title}if(t.length===1)return TYPE_LABEL[t[0]];if(t.length===FACILITY_TYPES.length)return'All facilities';return'Facilities'}
function toast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),2200)}

// ── The stamp: one renderer for the verdict's color+word+number (⧖Inv #46/#47) ──
function stampHtml(f,big){
  const lbl=labelOf(f),band=BAND[lbl],s=scoreOf(f);
  const num=(lbl==='Unrated'||s==null)?'not scored':s.toFixed(1);
  return'<div class="stamp '+(band==='unrated'?'unrated':'')+'" aria-label="Score '+escapeHtml(num)+', '+escapeHtml(BAND_WORD[lbl])+'"><span class="num band-'+band+'">'+escapeHtml(num)+'</span><span class="word">'+escapeHtml(BAND_WORD[lbl])+'</span></div>';
}
function ribbonHtml(f){
  if(!f||!f.has_active_enforcement)return'';
  const sev=normSev(f.enforcement_severity);
  const light=sev&&SEV_RANK[sev]<=2;
  return'<span class="ribbon'+(light?' outline':'')+'">'+icon('flag')+'Flagged'+(sev?': '+escapeHtml(SEV_WORD[sev]):'')+'</span>';
}
function payLineHtml(f){return truthy(f&&f.has_payment_penalty)?'<div class="pay-line">Medicare reduced payments here last year — a routine payment adjustment, not a safety flag.</div>':''}

// ── Front door controls ─────────────────────────────────────────────────────
function buildControls(){
  $('journeys').innerHTML=JOURNEYS.map(j=>'<button class="journey" type="button" data-journey="'+j.key+'" aria-pressed="'+(journey===j.key)+'">'+escapeHtml(j.label)+'</button>').join('');
  $('radius-chips').innerHTML='<span class="lbl">Within</span>'+RADII.map(r=>'<button class="chip" type="button" data-radius="'+r+'" aria-pressed="'+(radius===r)+'">'+r+' mi</button>').join('');
  $('type-chips').innerHTML=FACILITY_TYPES.map(t=>'<button class="chip" type="button" role="switch" data-type="'+t.value+'" aria-checked="'+activeTypes.has(t.value)+'">'+escapeHtml(t.label)+'</button>').join('');
  $('cap-chips').innerHTML=CAPABILITIES.map(c=>'<button class="chip" type="button" role="switch" data-cap="'+c.key+'" aria-checked="'+!!activeCaps[c.key]+'">'+escapeHtml(c.label)+'</button>').join('');
  const sel=$('state-select');sel.innerHTML='<option value="">Pick a state…</option>'+US_STATES.map(s=>'<option value="'+s.s+'">'+escapeHtml(s.n)+'</option>').join('');
  syncControls();
}
function syncControls(){
  document.querySelectorAll('[data-journey]').forEach(b=>b.setAttribute('aria-pressed',String(journey===b.dataset.journey)));
  document.querySelectorAll('[data-radius]').forEach(b=>b.setAttribute('aria-pressed',String(radius===Number(b.dataset.radius))));
  document.querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-checked',String(activeTypes.has(b.dataset.type))));
  document.querySelectorAll('[data-cap]').forEach(b=>b.setAttribute('aria-checked',String(!!activeCaps[b.dataset.cap])));
  const fo=$('flag-only');if(fo)fo.setAttribute('aria-pressed',String(flagOnly));
  const capWrap=$('cap-chips');if(capWrap){const show=activeTypes.has('hospital');capWrap.hidden=!show;const h=capWrap.previousElementSibling;if(h&&h.tagName==='H3')h.hidden=!show}
  const rc=$('radius-chips');if(rc)rc.hidden=!!(origin&&origin.kind==='state');
  const sel=$('state-select');if(sel)sel.value=(origin&&origin.kind==='state')?origin.state:'';
  const lbl=$('near-label');
  if(lbl){
    if(!origin)lbl.textContent='Where should we look? Use your location, or pick a state.';
    else if(origin.kind==='geo')lbl.textContent='Showing facilities near your location.';
    else if(origin.kind==='state')lbl.textContent='Showing every facility in '+(stateName(origin.state)||origin.state)+', best score first.';
    else lbl.textContent='Showing facilities near the linked location.';
  }
  const ul=$('use-location');if(ul)ul.setAttribute('aria-pressed',String(!!(origin&&origin.kind==='geo')));
  $('results-title').textContent=origin&&origin.kind==='state'?(typeNoun()+' in '+(stateName(origin.state)||origin.state)):(typeNoun()+(origin?' within '+radius+' miles':''));
  $('sort-note').textContent=origin&&origin.kind==='state'?'Sorted by score, best first. The stamp is the verdict; a red ribbon means state inspectors found active problems.':'Sorted by distance. The stamp is the verdict; a red ribbon means state inspectors found active problems.';
}
function setJourney(key){const j=JOURNEYS.find(x=>x.key===key);if(!j)return;journey=key;activeTypes=new Set(j.types);syncControls();pushUrlState(true);fetchFeed()}
function toggleType(v){if(activeTypes.has(v))activeTypes.delete(v);else activeTypes.add(v);journey=null;syncControls();pushUrlState(true);fetchFeed()}
function setRadius(r){radius=r;syncControls();pushUrlState(true);fetchFeed()}
function toggleCap(key){activeCaps[key]=!activeCaps[key];syncControls();pushUrlState(true);if(CAP_SERVER_KEYS.includes(key))fetchFeed();else renderFeed()}
function toggleFlagOnly(){flagOnly=!flagOnly;syncControls();pushUrlState(true);renderFeed()}
function useMyLocation(){
  if(!navigator.geolocation){toast('Location is not available on this device.');return}
  setFeedBusy(true);
  navigator.geolocation.getCurrentPosition(pos=>{origin={lat:pos.coords.latitude,lng:pos.coords.longitude,kind:'geo'};syncControls();pushUrlState(true);fetchFeed();renderUserDot()},
    ()=>{setFeedBusy(false);toast('Could not get your location. Pick a state instead.');renderEmpty('no-origin')},{timeout:6000,maximumAge:120000});   // Invariant #11
}
function pickState(abbr){const s=STATE_BY_ABBR[abbr];if(!s){origin=null;syncControls();renderEmpty('no-origin');return}origin={lat:s.lat,lng:s.lng,kind:'state',state:abbr};syncControls();pushUrlState(true);fetchFeed()}

// ── URL state ───────────────────────────────────────────────────────────────
function getUrlState(){const p=new URLSearchParams(location.search);return{lat:parseFloat(p.get('lat'))||null,lng:parseFloat(p.get('lng'))||null,r:parseInt(p.get('r'))||null,types:p.get('types')?p.get('types').split(',').filter(t=>TYPE_LABEL[t]):null,journey:p.get('j')||null,state:p.get('state')||null,fid:p.get('fid')||null,theme:p.get('theme')||null,flag:p.get('flag')==='1'}}
function pushUrlState(replace){
  const p=new URLSearchParams;
  if(openFacilityId)p.set('fid',openFacilityId);
  else{
    if(origin&&origin.kind==='state')p.set('state',origin.state);
    else if(origin){p.set('lat',origin.lat.toFixed(4));p.set('lng',origin.lng.toFixed(4))}
    if(radius!==25)p.set('r',String(radius));
    if(journey)p.set('j',journey);else p.set('types',Array.from(activeTypes).sort().join(','));
    if(flagOnly)p.set('flag','1');
  }
  if(currentTheme==='dark')p.set('theme','dark');
  const q=p.toString();const url=location.pathname+(q?'?'+q:'');
  if(replace)history.replaceState(null,'',url);else history.pushState(null,'',url);
}

// ── Fetching the feed (Invariants #3–5, #6) ─────────────────────────────────
function setFeedBusy(b){const f=$('feed');f.setAttribute('aria-busy',b?'true':'false');if(b){f.innerHTML='<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';$('feed-more').innerHTML='';$('results-count').textContent=''}}
async function fetchFeed(){
  if(!origin){renderEmpty('no-origin');return}
  if(!isOnline){renderEmpty('offline');return}
  const types=Array.from(activeTypes);
  if(!types.length){currentFacilities=[];renderEmpty('no-types');return}
  const stateMode=origin.kind==='state';
  const params={p_lat:origin.lat,p_lng:origin.lng,p_radius_miles:stateMode?500:radius,p_types:types,p_min_score:null,
    p_require_nicu:!!activeCaps.nicu,p_require_cath:!!activeCaps.cath,p_require_trauma:!!activeCaps.trauma,p_require_teaching:!!activeCaps.teaching,p_require_er:!!activeCaps.er,p_limit:5000};
  dlog('nearby_facilities',JSON.stringify(params));
  setFeedBusy(true);
  if(inflight)inflight.abort();
  const ctrl=new AbortController();inflight=ctrl;
  try{
    const{data,error}=await sb.rpc('nearby_facilities',params).abortSignal(ctrl.signal);
    if(ctrl.signal.aborted)return;
    if(error)throw error;
    let rows=data||[];
    if(stateMode)rows=rows.filter(r=>r.state===origin.state);
    rows.forEach(r=>{r._dist=(r.latitude!=null&&r.longitude!=null)?haversineMiles(origin.lat,origin.lng,Number(r.latitude),Number(r.longitude)):Infinity});
    if(stateMode)rows.sort((a,b)=>(scoreOf(b)??-1)-(scoreOf(a)??-1)||a._dist-b._dist);
    else rows.sort((a,b)=>a._dist-b._dist);
    currentFacilities=rows;shownCount=PAGE;if(map)map._ftpFitted=false;
    dlog('rows',rows.length);
    renderFeed();
  }catch(e){if(e&&e.name==='AbortError')return;derr('nearby_facilities failed',e);renderEmpty('error',e)}
  finally{if(inflight===ctrl)inflight=null;$('feed').setAttribute('aria-busy','false')}
}
function capabilityClientFilter(rows){
  const active=CAP_CLIENT.filter(c=>activeCaps[c.key]);if(!active.length)return rows;
  return rows.filter(f=>active.every(c=>{const v=f[c.field];if(c.cmiMin!=null){const n=Number(v);return isFinite(n)&&n>=c.cmiMin}return truthy(v)}));
}
function visibleFacilities(){let rows=flagOnly?currentFacilities.filter(f=>!!f.has_active_enforcement):currentFacilities;return capabilityClientFilter(rows)}

// ── Rendering the feed of postcards ─────────────────────────────────────────
function cardHtml(f){
  const lbl=labelOf(f);const inCmp=compare.some(c=>String(c.facility_id)===String(f.facility_id));
  const meta=[TYPE_LABEL[f.facility_type]||'',fmtDist(f._dist),[f.city,f.state].filter(Boolean).join(', ')].filter(Boolean).map(escapeHtml).join(' · ');
  return'<article class="postcard" tabindex="-1" data-card="'+escapeHtml(f.facility_id)+'">'+
    '<div class="pc-main">'+ribbonHtml(f)+
      '<h3 class="pc-name"><a href="?fid='+encodeURIComponent(f.facility_id)+'" data-open="'+escapeHtml(f.facility_id)+'">'+escapeHtml(f.facility_name||'')+'</a></h3>'+
      '<p class="pc-verdict">'+escapeHtml(VERDICT[lbl])+(f.has_active_enforcement?' State inspectors found active problems.':'')+'</p>'+
      '<div class="pc-meta">'+meta+'</div>'+
      '<div class="pc-actions"><button class="btn small compare" type="button" data-compare="'+escapeHtml(f.facility_id)+'" aria-pressed="'+inCmp+'">'+icon('compare')+(inCmp?'Added':'Compare')+'</button></div>'+
    '</div>'+stampHtml(f)+payLineHtml(f)+'</article>';
}
function renderFeed(){
  const feed=$('feed'),more=$('feed-more');
  const rows=visibleFacilities();
  syncControls();
  if(!currentFacilities.length){renderEmpty('no-results');return}
  if(!rows.length){renderEmpty(flagOnly?'no-flag':'no-cap');return}
  const shown=rows.slice(0,shownCount);
  feed.innerHTML=shown.map(cardHtml).join('');
  $('results-count').textContent=rows.length.toLocaleString()+(rows.length===1?' result':' results')+(currentFacilities.length>=5000?' (nearest 5,000)':'');
  more.innerHTML=rows.length>shown.length?'<button class="btn" type="button" id="show-more">Show more ('+(rows.length-shown.length).toLocaleString()+' left)</button>':'';
  renderMarkers(rows);
}
function renderEmpty(kind,err){
  const feed=$('feed');$('feed-more').innerHTML='';$('results-count').textContent='';
  const wider=RADII.find(r=>r>radius);
  const copy={
    'no-origin':['Where should we look?','Turn on your location, or pick a state above.','<button class="btn primary" type="button" data-act="location">'+icon('location')+' Use my location</button>'],
    'no-types':['No facility types selected','Pick a journey above, or turn on at least one type under More filters.',''],
    'no-results':['No '+typeNoun().toLowerCase()+' within '+radius+' miles',wider?'Widen the search, or look one up by name.':'Try a different journey or facility type, or look one up by name.',wider?'<button class="btn primary" type="button" data-act="widen" data-radius="'+wider+'">Widen to '+wider+' miles</button>':''],
    'no-flag':['No flagged facilities here','None of these have an active inspection finding. That is good news for the area.','<button class="btn" type="button" data-act="unflag">Show all</button>'],
    'no-cap':['Nothing matches every need','Remove a requirement to see more.','<button class="btn" type="button" data-act="clearcaps">Clear needs</button>'],
    'offline':['You are offline','The feed needs a connection. It will reload when you are back online.',''],
    'error':['Could not load the feed',(err&&err.message)?escapeHtml(err.message):'Something went wrong on our side.','<button class="btn primary" type="button" data-act="retry">Try again</button>']
  }[kind]||['Nothing here','',''];
  if(origin&&origin.kind==='state'&&kind==='no-results'){copy[0]='No '+typeNoun().toLowerCase()+' in '+(stateName(origin.state)||origin.state);copy[1]='Try another type.';copy[2]=''}
  feed.innerHTML='<div class="empty"><h3>'+copy[0]+'</h3><p>'+copy[1]+'</p>'+copy[2]+'</div>';
  if(kind!=='no-flag'&&kind!=='no-cap')renderMarkers([]);
}

// ── The map: a section, not the surface (D152 attribution visible when open) ──
function tilesFor(theme){return'https://{s}.basemaps.cartocdn.com/'+(theme==='dark'?'dark_all':'light_all')+'/{z}/{x}/{y}{r}.png'}
function ensureMap(){
  if(map||!window.L)return!!map;
  const el=$('map');if(!el)return false;
  map=L.map('map',{center:origin?[origin.lat,origin.lng]:[39.5,-98],zoom:origin?(origin.kind==='state'?7:10):4,zoomControl:true,attributionControl:false,preferCanvas:true});
  L.control.attribution({prefix:false}).addTo(map);
  tileLayer=L.tileLayer(tilesFor(currentTheme),{attribution:'&copy; CARTO &middot; CMS public data',subdomains:'abcd',maxZoom:20}).addTo(map);
  facilityLayer=L.layerGroup().addTo(map);
  userLayer=L.layerGroup().addTo(map);
  renderMarkers(visibleFacilities());renderUserDot();
  return true;
}
function renderMarkers(rows){
  if(!map||!facilityLayer)return;
  facilityLayer.clearLayers();markerById.clear();
  const pts=[];
  rows.forEach(f=>{
    if(f.latitude==null||f.longitude==null)return;
    const lbl=labelOf(f),band=BAND[lbl],color=BAND_HEX[band];
    const sev=f.has_active_enforcement?normSev(f.enforcement_severity):null;
    const ds=isDesktop()?12:14;let html,w=ds;
    const dot='<div class="ftp-dot'+(band==='unrated'?' unrated':'')+'" style="background:'+color+';width:'+ds+'px;height:'+ds+'px"></div>';
    if(sev){const pad=SEV_RANK[sev]>=3?7:5;w=ds+pad*2;html='<div class="ftp-flag" style="width:'+w+'px;height:'+w+'px"><span class="ring'+(SEV_RANK[sev]<=2?' light':'')+'"></span>'+dot+'</div>'}
    else html=dot;
    const m=L.marker([Number(f.latitude),Number(f.longitude)],{icon:L.divIcon({className:'',html,iconSize:[w,w],iconAnchor:[w/2,w/2]}),keyboard:false});
    const s=scoreOf(f);
    m.bindPopup('<strong>'+escapeHtml(f.facility_name||'')+'</strong><br><span style="color:var(--muted);font-size:12px">'+escapeHtml(TYPE_LABEL[f.facility_type]||'')+'</span><br><span class="pp-score '+(band==='unrated'?'unrated':'')+'" style="background:'+(band==='unrated'?'transparent':color)+'">'+(s==null?'not scored':s.toFixed(1))+' · '+escapeHtml(BAND_WORD[lbl])+'</span>'+(sev?'<br><span style="color:var(--flag);font-weight:600;font-size:12px">Flagged: '+escapeHtml(SEV_WORD[sev])+'</span>':''),{maxWidth:240});
    m.on('click',()=>focusCard(f.facility_id));
    facilityLayer.addLayer(m);markerById.set(String(f.facility_id),m);pts.push([Number(f.latitude),Number(f.longitude)]);
  });
  if(pts.length&&!map._ftpFitted){map._ftpFitted=true;try{map.fitBounds(L.latLngBounds(pts).pad(0.15),{maxZoom:12})}catch(e){}}
}
function renderUserDot(){
  if(!map||!userLayer||!origin||origin.kind!=='geo')return;
  userLayer.clearLayers();
  userLayer.addLayer(L.marker([origin.lat,origin.lng],{icon:L.divIcon({className:'',html:'<div class="ftp-geo" role="img" aria-label="Your location"><span class="pulse"></span><span class="core"></span></div>',iconSize:[26,26],iconAnchor:[13,13]}),interactive:false,keyboard:false,zIndexOffset:1000}));
}
function focusCard(fid){
  const rows=visibleFacilities();const idx=rows.findIndex(r=>String(r.facility_id)===String(fid));
  if(idx<0){openFacility(fid);return}
  if(idx>=shownCount){shownCount=Math.ceil((idx+1)/PAGE)*PAGE;renderFeed()}
  const card=Array.from(document.querySelectorAll('[data-card]')).find(c=>c.dataset.card===String(fid));
  if(!card){openFacility(fid);return}
  document.querySelectorAll('.postcard.is-focus').forEach(c=>c.classList.remove('is-focus'));
  card.classList.add('is-focus');card.scrollIntoView({block:'center'});card.focus({preventScroll:true});
}
function syncMapLayout(){
  const sec=$('map-section');if(!sec)return;
  if(isDesktop()){if(!sec.open)sec.open=true;ensureMap()}
  if(map)setTimeout(()=>map.invalidateSize(),60);
}

// ── Compare tray (session-only) ─────────────────────────────────────────────
function toggleCompare(fid){
  const i=compare.findIndex(c=>String(c.facility_id)===String(fid));
  if(i>-1)compare.splice(i,1);
  else{const f=currentFacilities.find(r=>String(r.facility_id)===String(fid))||searchRows.find(r=>String(r.facility_id)===String(fid));if(!f)return;if(compare.length>=3){toast('You can compare three at a time.');return}compare.push(f)}
  renderTray();
  document.querySelectorAll('[data-compare]').forEach(b=>{const on=compare.some(c=>String(c.facility_id)===b.dataset.compare);b.setAttribute('aria-pressed',String(on));b.innerHTML=icon('compare')+(on?'Added':'Compare')});
}
function renderTray(){
  const tray=$('tray'),slots=$('tray-slots'),msg=$('tray-msg'),go=$('tray-go');
  slots.innerHTML=[0,1,2].map(i=>{const f=compare[i];if(!f)return'<span class="slot"></span>';const lbl=labelOf(f),band=BAND[lbl],s=scoreOf(f);return'<span class="slot on '+(band==='unrated'?'unrated':'band-'+band)+'" title="'+escapeHtml(f.facility_name||'')+'">'+(s==null?'—':s.toFixed(1))+'<button type="button" data-uncompare="'+escapeHtml(f.facility_id)+'" aria-label="Remove '+escapeHtml(f.facility_name||'')+'">×</button></span>'}).join('');
  const n=compare.length;
  msg.textContent=n===0?'':n===1?'Add one more to compare.':n+' of 3 selected.';
  go.disabled=n<2;
  tray.classList.toggle('on',n>0);document.body.classList.toggle('has-tray',n>0);
}
function showCompare(){
  if(compare.length<2)return;
  homeScrollY=window.scrollY;
  $('compare-body').innerHTML='<div class="compare-grid">'+compare.map(f=>{const lbl=labelOf(f);return'<div class="compare-card">'+stampHtml(f)+'<h3>'+escapeHtml(f.facility_name||'')+'</h3><div class="m">'+escapeHtml(TYPE_LABEL[f.facility_type]||'')+(f._dist!=null&&isFinite(f._dist)?' · '+fmtDist(f._dist):'')+'</div>'+ribbonHtml(f)+'<p>'+escapeHtml(VERDICT[lbl])+'</p>'+payLineHtml(f)+'<a class="btn small" href="?fid='+encodeURIComponent(f.facility_id)+'" data-open="'+escapeHtml(f.facility_id)+'">Open report</a></div>'}).join('')+'</div><p class="provenance" style="margin-top:12px">Data as of '+escapeHtml(DATA_VINTAGE)+' · one score per facility, from CMS compulsory reporting.</p>';
  setView('compare');window.scrollTo(0,0);
}

// ── Views ───────────────────────────────────────────────────────────────────
function setView(v){
  view=v;
  $('view-home').hidden=v!=='home';$('view-facility').hidden=v!=='facility';$('view-compare').hidden=v!=='compare';
  const nav=document.querySelector('.site-nav a[href="/"]');if(nav){if(v==='home')nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current')}
  if(v!=='home')document.body.classList.remove('has-tray');else renderTray();
}
function goHome(){
  openFacilityId=null;document.title='ForThePatient.org — independent quality reports for hospitals, nursing homes and more';
  setView('home');pushUrlState(true);
  requestAnimationFrame(()=>{window.scrollTo(0,homeScrollY);if(map)map.invalidateSize()});
}

// ── The facility report (scroll document) ───────────────────────────────────
async function openFacility(fid,fromPop){
  if(!fid)return;
  if(view==='home')homeScrollY=window.scrollY;
  openFacilityId=String(fid);
  if(!fromPop)pushUrlState(false);
  document.title='Loading… — ForThePatient.org';
  setView('facility');window.scrollTo(0,0);
  $('report-body').innerHTML='<div class="skeleton" style="height:220px"></div><div class="skeleton" style="margin-top:14px"></div><div class="skeleton" style="margin-top:14px"></div>';
  try{
    const{data,error}=await sb.rpc('facility_detail',{p_facility_id:fid});
    if(error)throw error;if(!data)throw new Error('No data returned');
    if(openFacilityId!==String(fid))return;
    $('report-body').innerHTML=buildReportHtml(data);
    const f=data.facility||data;const s=scoreOf(f);lastReport=f;if(lastReport.facility_id==null)lastReport.facility_id=String(fid);
    document.title=(f.facility_name||'Facility')+' — '+(s==null?'not scored':s.toFixed(1)+' · '+BAND_WORD[labelOf(f)])+' | ForThePatient.org';
  }catch(e){derr('facility_detail failed',e);$('report-body').innerHTML='<div class="section error"><h2>Could not load this report</h2><p class="note">'+escapeHtml(e.message||'')+'</p><button class="btn primary" type="button" data-retry="'+escapeHtml(fid)+'">Try again</button></div>'}
}
function pctWhole(p){const n=Math.round(Number(p));return Math.max(1,Math.min(99,n))}
function pctBand(p){if(p>=80)return{word:'near the top',tone:'good'};if(p>=60)return{word:'in the upper range',tone:'good'};if(p>=40)return{word:'around the middle',tone:'mid'};if(p>=20)return{word:'in the lower range',tone:'low'};return{word:'near the bottom',tone:'low'}}
function scoreBand(s){if(s==null)return{word:'',tone:'mid'};if(s>=7.5)return{word:'a strong quality record',tone:'good'};if(s>=6)return{word:'an above-average quality record',tone:'good'};if(s>=4.5)return{word:'a middle-of-the-pack quality record',tone:'mid'};if(s>=3)return{word:'a below-average quality record',tone:'low'};return{word:'a weak quality record',tone:'low'}}
function peerNoun(t){const m={hospital:'hospitals',nursing_home:'nursing homes',dialysis:'dialysis centers',home_health:'home-health agencies',hospice:'hospices',irf:'rehab facilities',ltch:'long-term care hospitals'};return m[t]||'facilities'}
// TRANSLATE-1, carried: the plain-language reading. Order: flag → quality → proximity.
function buildPatientSummary(f){
  if(!f)return'';
  const score=scoreOf(f),cls=labelOf(f),unrated=(score==null)||cls==='Unrated',flagged=!!f.has_active_enforcement,sev=normSev(f.enforcement_severity);
  const rawPct=(f.state_percentile==null)?null:Number(f.state_percentile),hasPct=(rawPct!=null&&!isNaN(rawPct));
  const sName=stateName(f.state),peers=peerNoun(f.facility_type);
  const parts=[];
  if(flagged){const sevWord=sev?SEV_WORD[sev]:null;
    if(sev&&SEV_RANK[sev]>=3)parts.push('This facility is currently under active Medicare enforcement for '+(sevWord?escapeHtml(sevWord)+'-severity ':'')+'safety problems. If you have other options nearby, they may be the safer choice. If this is your only option, ask about recent improvements and know your rights as a patient.');
    else parts.push('This facility has a current, unresolved CMS survey finding on record'+(sevWord?' ('+escapeHtml(sevWord)+' severity)':'')+'. It is worth asking the facility what has been done to address it.');}
  if(unrated)parts.push('There isn\u2019t enough public Medicare data to give this facility a quality score yet, so it is shown as not scored. That is not a mark against it \u2014 it means the data needed to rate it isn\u2019t available.');
  else{const sbd=scoreBand(score);let sentence=(flagged?'Setting the enforcement flag aside, its overall quality score is':'Its overall quality score is')+' '+score.toFixed(1)+' out of 10 \u2014 '+sbd.word+'.';
    if(hasPct){const w=pctWhole(rawPct),band=pctBand(rawPct);sentence+=' That places it '+band.word+' \u2014 better than about '+w+'%'+(sName?(' of '+escapeHtml(sName)+' '+peers):(' of '+peers+' in its state'))+'.'}
    else sentence+=' There are too few comparable '+peers+(sName?(' in '+escapeHtml(sName)):'')+' to rank it against its peers.';
    parts.push(sentence)}
  if(origin&&origin.kind==='geo'&&f.latitude!=null&&f.longitude!=null){const mi=haversineMiles(origin.lat,origin.lng,Number(f.latitude),Number(f.longitude));if(isFinite(mi)){const miStr=mi<10?mi.toFixed(1):String(Math.round(mi));parts.push('It is about '+miStr+' mile'+((miStr==='1'||miStr==='1.0')?'':'s')+' from your current location.')}}
  return'<div class="summary'+(flagged?' tone-flag':'')+'">'+parts.map(p=>'<p>'+p+'</p>').join('')+'</div>';
}
// ENF-VIZ, carried: banner + survey history (collapsed by default). Gloss first when present.
let enfSeq=0;
function buildEnforcementHtml(f,hist){
  const flagged=!!f.has_active_enforcement,sev=normSev(f.enforcement_severity),rows=Array.isArray(hist)?hist:[];
  if(!flagged&&!sev&&!rows.length)return'<p class="note">No CMS survey findings on record for this facility.</p>';
  let banner='';
  if(flagged&&sev)banner='<div class="enf-banner">'+icon('warn')+'<div><b>Under active enforcement — '+escapeHtml(SEV_WORD[sev])+'</b><p>CMS has a current, unresolved survey finding on record for this facility. Recent findings are marked Current below.</p></div></div>';
  else if(!flagged&&(sev||rows.length))banner='<div class="enf-banner expired">'+icon('clock')+'<div><b>No active enforcement</b><p>'+(sev?'A past finding (severity: '+escapeHtml(SEV_WORD[sev])+') has since expired. ':'')+'Any items below are historical and no longer affect the score.</p></div></div>';
  let histHtml='';
  if(rows.length){
    const sorted=rows.slice().sort((a,b)=>String(b.survey_date||'').localeCompare(String(a.survey_date||'')));
    const render=r=>{const d=r.survey_date?String(r.survey_date).slice(0,10):'';const lvl=LVL_WORD[(r.deficiency_level||r.severity||'').toLowerCase()]||'minor';const lvlLabel=lvl==='critical'?'Immediate jeopardy':lvl==='significant'?'Condition-level':'Standard';const active=!!r.is_active;
      const text=r.plain_summary||r.deficiency_description;
      return'<div class="finding"><div class="top"><span>'+escapeHtml(d)+'</span><span class="lvl '+lvl+'">'+lvlLabel+'</span><span class="'+(active?'cur':'res')+'">'+(active?'Current':'Resolved')+'</span>'+(r.deficiency_tag?'<span>Tag '+escapeHtml(String(r.deficiency_tag))+'</span>':'')+'</div>'+(text?'<p class="desc">'+escapeHtml(String(text))+'</p>':'')+'</div>'};
    const n=sorted.length,noun=n===1?'survey finding':'survey findings',pid='enf-panel-'+(++enfSeq);
    histHtml='<button class="disc-btn" type="button" aria-expanded="false" aria-controls="'+pid+'" data-disc="'+pid+'"><span>Show '+n+' '+noun+'</span>'+icon('chev')+'</button><div class="disc-panel" id="'+pid+'" hidden>'+sorted.map(render).join('')+'<p class="source">Source: CMS survey deficiency records (QCOR). Findings linger on the score after the survey date, then expire.</p></div>';
  }
  return banner+histHtml;
}
// B-FLAG-SCOPE (D148), carried: the demoted, neutral payment line.
function buildPaymentPenaltyHtml(f){
  if(!f||!truthy(f.has_payment_penalty))return'';
  const detail=f.payment_penalty_detail?String(f.payment_penalty_detail):'Medicare reduced this hospital\u2019s payments under a readmissions (HRRP) or hospital-acquired-condition (HAC) program. These are routine Medicare payment adjustments and do not, on their own, indicate an immediate safety problem.';
  return'<div class="section"><h2>Medicare payment adjustments</h2><p class="note">'+escapeHtml(detail)+'</p></div>';
}
function buildReportHtml(payload){
  const f=payload.facility||payload,comps=payload.components||[],enf=payload.enforcement||[],hospEnf=payload.hospital_enforcement||[];
  const lbl=labelOf(f);
  const badges=[];if(truthy(f.teaching_status))badges.push('Teaching');if(truthy(f.has_cardiac_cath_lab))badges.push('Cardiac cath');if(truthy(f.has_cardiac_surgery))badges.push('Cardiac surgery');if(truthy(f.nicu_level))badges.push('NICU');if(truthy(f.has_trauma_center))badges.push('Trauma center');if(truthy(f.has_burn_unit))badges.push('Burn unit');if(truthy(f.has_organ_transplant))badges.push('Transplant');if(truthy(f.has_mri))badges.push('MRI');if(f.case_mix_index!=null)badges.push('CMI '+Number(f.case_mix_index).toFixed(2));
  const hasCoords=f.latitude!=null&&f.longitude!=null;
  const addr=[(f.address?'<span>'+icon('pin')+' '+escapeHtml(f.address)+(f.city?', ':'')+escapeHtml(f.city||'')+(f.state?', ':'')+escapeHtml(f.state||'')+' '+escapeHtml(f.zip_code||'')+'</span>':''),(f.phone?'<a href="tel:'+escapeHtml(String(f.phone).replace(/[^\d+]/g,''))+'">'+icon('phone')+' '+escapeHtml(f.phone)+'</a>':''),(hasCoords?'<a href="https://maps.google.com/?q='+encodeURIComponent(Number(f.latitude)+','+Number(f.longitude))+'" target="_blank" rel="noopener noreferrer">'+icon('directions')+' Directions</a>':'')].filter(Boolean).join('');
  const compHtml=comps.length?comps.slice().sort((a,b)=>(a.component_order||0)-(b.component_order||0)).map(c=>{const cs=c.component_score!=null?Number(c.component_score):null;const pct=cs!=null?Math.max(0,Math.min(100,cs*10)):0;const b=cs==null?'unrated':cs>=7.5?'exceptional':cs>=6?'above':cs>=4.5?'average':cs>=3?'below':'poor';return'<div class="comp"><span class="cn">'+escapeHtml(c.component_name||'')+'</span><span class="cs">'+(cs==null?'—':cs.toFixed(1))+'</span><div class="bar"><i class="band-'+b+'" style="width:'+pct+'%"></i></div></div>'}).join(''):'<p class="note">No component data.</p>';
  const penHtml=enf.length?'<div class="section"><h2>Regulatory actions ('+enf.length+')</h2>'+enf.slice(0,8).map(e=>'<div class="pen"><span>'+escapeHtml(e.penalty_type||'Penalty')+(e.amount?' · $'+Number(e.amount).toLocaleString():'')+'</span><span>'+escapeHtml(e.penalty_date?String(e.penalty_date).slice(0,10):'')+'</span></div>').join('')+(enf.length>8?'<p class="note">+ '+(enf.length-8)+' more on record.</p>':'')+'</div>':'';
  const stars=f.cms_overall_rating?'<span class="badge">CMS overall '+escapeHtml(String(f.cms_overall_rating))+'/5</span>':'';
  return'<article class="hero">'+
    '<div>'+ribbonHtml(f)+'<h1>'+escapeHtml(f.facility_name||'')+'</h1><div class="type-line">'+escapeHtml(TYPE_LABEL[f.facility_type]||f.facility_type||'')+(f.city?' · '+escapeHtml(f.city)+', '+escapeHtml(f.state||''):'')+'</div><p class="verdict">'+escapeHtml(VERDICT[lbl])+(f.has_active_enforcement?' State inspectors found active problems.':'')+'</p></div>'+
    stampHtml(f,true)+'<div class="postmark">CMS data<br>'+escapeHtml(DATA_VINTAGE)+'</div>'+
    (badges.length||stars?'<div class="badges">'+stars+badges.map(b=>'<span class="badge">'+escapeHtml(b)+'</span>').join('')+'</div>':'')+
    (addr?'<div class="addr">'+addr+'</div>':'')+
    '<div class="actions"><button class="btn primary" type="button" data-share="'+escapeHtml(f.facility_id)+'">'+icon('share')+' Share</button><button class="btn" type="button" data-copy="'+escapeHtml(f.facility_id)+'">'+icon('link')+' Copy link</button></div>'+
  '</article>'+
  '<section class="section"><h2>What this means for you</h2>'+buildPatientSummary(f)+'</section>'+
  '<section class="section"><h2>What inspectors found</h2>'+buildEnforcementHtml(f,hospEnf)+'</section>'+
  '<section class="section"><h2>How the score is built</h2><p class="note">The score combines these measures, each on the same 1–10 scale (1 weakest, 10 strongest), so you can see where this facility is strong or weak.</p>'+compHtml+'</section>'+
  penHtml+buildPaymentPenaltyHtml(f)+
  '<section class="section provenance"><h2>Where this comes from</h2><p>Every number on this page comes from data the facility is required to report to CMS, refreshed as of '+escapeHtml(DATA_VINTAGE)+'. Nothing is self-reported to us and no one we rate pays us. <a href="/methodology">How we score</a> · <a href="/dispute-process">Report an error</a></p></section>';
}
function facilityUrl(id){return SITE_URL.replace(/\/$/,'')+location.pathname+'?fid='+encodeURIComponent(id)}
function shareText(f){const s=scoreOf(f);return(f.facility_name||'')+' — '+(s==null?'not scored':s.toFixed(1)+', '+BAND_WORD[labelOf(f)])+(f.has_active_enforcement?', flagged by state inspectors':'')+'. Data as of '+DATA_VINTAGE+'. ForThePatient.org'}
function currentReportFacility(){const t=document.querySelector('#report-body .hero h1');return{facility_name:t?t.textContent:'',final_score:null}}
async function copyLink(id){const url=facilityUrl(id);try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);toast('Link copied')}else{prompt('Copy this link',url)}}catch(e){prompt('Copy this link',url)}}   // ⧖#36
async function share(id,f){const url=facilityUrl(id);const data={title:(f&&f.facility_name?f.facility_name+' — ':'')+'ForThePatient.org',text:f?shareText(f):'',url};if(navigator.share){try{await navigator.share(data)}catch(e){}}else copyLink(id)}

// ── Name search (search_facilities_by_name, Invariant #6) ───────────────────
function renderNameResults(rows){
  const el=$('name-results'),input=$('name-search');searchRows=rows;
  if(!rows.length){el.innerHTML='<div class="name-result"><span class="nr-meta">No matches. Try fewer words.</span></div>'}
  else el.innerHTML=rows.map(r=>{const lbl=labelOf(r),band=BAND[lbl],s=scoreOf(r);return'<button class="name-result" type="button" role="option" data-open="'+escapeHtml(r.facility_id)+'"><span class="nr-name">'+escapeHtml(r.facility_name||'')+'</span><span class="nr-score '+(band==='unrated'?'unrated':'band-'+band)+'">'+(s==null?'—':s.toFixed(1))+'</span><span class="nr-meta">'+escapeHtml(TYPE_LABEL[r.facility_type]||'')+' · '+escapeHtml(r.city||'')+(r.city&&r.state?', ':'')+escapeHtml(r.state||'')+' · '+escapeHtml(BAND_WORD[lbl])+'</span></button>'}).join('');
  el.hidden=false;input.setAttribute('aria-expanded','true');
}
function closeNameResults(){const el=$('name-results');if(el)el.hidden=true;$('name-search').setAttribute('aria-expanded','false')}
function wireNameSearch(){
  const input=$('name-search'),results=$('name-results'),clear=$('name-clear');let kb=-1;
  const run=debounce(async()=>{const q=input.value.trim();clear.hidden=!q;if(q.length<2){closeNameResults();return}if(!isOnline)return;
    try{const{data,error}=await sb.rpc('search_facilities_by_name',{p_query:q,p_limit:12});if(error)throw error;renderNameResults(data||[]);kb=-1}catch(e){derr('search failed',e)}},250);
  input.addEventListener('input',run);
  input.addEventListener('focus',()=>{if(results.children.length&&input.value.trim().length>=2){results.hidden=false;input.setAttribute('aria-expanded','true')}});
  input.addEventListener('keydown',e=>{const items=results.querySelectorAll('.name-result[data-open]');
    if(e.key==='ArrowDown'){e.preventDefault();kb=Math.min(kb+1,items.length-1)}else if(e.key==='ArrowUp'){e.preventDefault();kb=Math.max(kb-1,-1)}
    else if(e.key==='Enter'&&kb>=0&&items[kb]){e.preventDefault();items[kb].click();return}else if(e.key==='Escape'){closeNameResults();return}else return;
    items.forEach((el,i)=>{el.classList.toggle('kb-active',i===kb);if(i===kb)el.scrollIntoView({block:'nearest'})})});
  clear.addEventListener('click',()=>{input.value='';clear.hidden=true;closeNameResults();input.focus()});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-row'))closeNameResults()});
}

// ── Theme (Invariant #12) ───────────────────────────────────────────────────
function applyTheme(t){
  currentTheme=t==='dark'?'dark':'light';
  document.documentElement.setAttribute('data-theme',currentTheme);
  try{localStorage.setItem('theme',currentTheme)}catch(e){}
  const b=$('theme-toggle-btn');b.setAttribute('aria-checked',String(currentTheme==='dark'));b.setAttribute('aria-pressed',String(currentTheme==='dark'));b.innerHTML=icon(currentTheme==='dark'?'sun':'moon');b.setAttribute('aria-label',currentTheme==='dark'?'Light mode':'Dark mode');
  document.querySelector('meta[name="theme-color"]').content=currentTheme==='dark'?'#1B2838':'#CFE3F0';
  if(map&&tileLayer){map.removeLayer(tileLayer);tileLayer=L.tileLayer(tilesFor(currentTheme),{attribution:'&copy; CARTO &middot; CMS public data',subdomains:'abcd',maxZoom:20}).addTo(map);tileLayer.bringToBack()}
  pushUrlState(true);
}

// ── Wiring (delegated; no inline handlers) ──────────────────────────────────
function wire(){
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-open],[data-compare],[data-uncompare],[data-journey],[data-radius],[data-type],[data-cap],[data-act],[data-share],[data-copy],[data-disc],[data-retry],#show-more,#flag-only,#use-location,#report-back,#compare-back,#compare-clear,#tray-go,#search-jump,#theme-toggle-btn');
    if(!t)return;
    if(t.dataset.open!=null){e.preventDefault();closeNameResults();openFacility(t.dataset.open);return}
    if(t.dataset.compare!=null){toggleCompare(t.dataset.compare);return}
    if(t.dataset.uncompare!=null){toggleCompare(t.dataset.uncompare);return}
    if(t.dataset.journey){setJourney(t.dataset.journey);return}
    if(t.dataset.radius&&t.dataset.act!=='widen'){setRadius(Number(t.dataset.radius));return}
    if(t.dataset.type){toggleType(t.dataset.type);return}
    if(t.dataset.cap){toggleCap(t.dataset.cap);return}
    if(t.dataset.share!=null){const f=lastReport&&String(lastReport.facility_id)===t.dataset.share?lastReport:null;share(t.dataset.share,f);return}
    if(t.dataset.copy!=null){copyLink(t.dataset.copy);return}
    if(t.dataset.disc){const p=$(t.dataset.disc);if(!p)return;const open=p.hidden;p.hidden=!open;t.setAttribute('aria-expanded',String(open));const n=p.querySelectorAll('.finding').length;t.querySelector('span').textContent=open?'Hide '+(n===1?'survey finding':'survey findings'):'Show '+n+' '+(n===1?'survey finding':'survey findings');return}
    if(t.dataset.retry){openFacility(t.dataset.retry);return}
    if(t.dataset.act){const a=t.dataset.act;if(a==='location')useMyLocation();else if(a==='widen')setRadius(Number(t.dataset.radius));else if(a==='unflag')toggleFlagOnly();else if(a==='clearcaps'){CAPABILITIES.forEach(c=>activeCaps[c.key]=false);syncControls();fetchFeed()}else if(a==='retry')fetchFeed();return}
    if(t.id==='show-more'){shownCount+=PAGE;renderFeed();return}
    if(t.id==='flag-only'){toggleFlagOnly();return}
    if(t.id==='use-location'){useMyLocation();return}
    if(t.id==='report-back'||t.id==='compare-back'){goHome();return}
    if(t.id==='compare-clear'){compare=[];renderTray();goHome();return}
    if(t.id==='tray-go'){showCompare();return}
    if(t.id==='search-jump'){if(view!=='home')goHome();setTimeout(()=>{const i=$('name-search');i.scrollIntoView({block:'center'});i.focus()},50);return}
    if(t.id==='theme-toggle-btn'){applyTheme(currentTheme==='dark'?'light':'dark');return}
  });
  $('state-select').addEventListener('change',e=>pickState(e.target.value));
  $('map-section').addEventListener('toggle',e=>{if(e.target.open){ensureMap();setTimeout(()=>map&&map.invalidateSize(),60)}});
  window.addEventListener('popstate',()=>{const s=getUrlState();if(s.fid)openFacility(s.fid,true);else if(view!=='home'){openFacilityId=null;setView('home')}});
  window.addEventListener('resize',debounce(syncMapLayout,150));
  window.addEventListener('offline',()=>{isOnline=false;toast('You are offline')});
  window.addEventListener('online',()=>{isOnline=true;if(view==='home'&&!currentFacilities.length)fetchFeed()});
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('input,select,textarea')){e.preventDefault();const i=$('name-search');i.scrollIntoView({block:'center'});i.focus()}
    if(e.key==='Escape'){if(!$('name-results').hidden)closeNameResults();else if(view!=='home')goHome()}
  });
  wireNameSearch();
}
// The report keeps the last-loaded facility so Share text renders from the same object as the hero (⧖Inv #47).
let lastReport=null;

// ── Boot ────────────────────────────────────────────────────────────────────
window.addEventListener('load',()=>{
  const u=getUrlState();
  const saved=u.theme||(function(){try{return localStorage.getItem('theme')}catch(e){return null}})()||'light';
  currentTheme=saved==='dark'?'dark':'light';
  document.documentElement.setAttribute('data-theme',currentTheme);
  const b=$('theme-toggle-btn');b.setAttribute('aria-checked',String(currentTheme==='dark'));b.innerHTML=icon(currentTheme==='dark'?'sun':'moon');
  $('status-line').textContent=STATUS_STRING;
  $('vintage-line').textContent='Data as of '+DATA_VINTAGE+'. Counts and scores change with every refresh; see the methodology for the exact vintage.';
  if(u.journey&&JOURNEYS.some(j=>j.key===u.journey)){journey=u.journey;activeTypes=new Set(JOURNEYS.find(j=>j.key===u.journey).types)}
  else if(u.types&&u.types.length){journey=null;activeTypes=new Set(u.types)}
  if(u.r&&RADII.includes(u.r))radius=u.r;
  flagOnly=!!u.flag;
  buildControls();wire();renderTray();
  if(u.state&&STATE_BY_ABBR[u.state])origin={lat:STATE_BY_ABBR[u.state].lat,lng:STATE_BY_ABBR[u.state].lng,kind:'state',state:u.state};
  else if(u.lat&&u.lng)origin={lat:u.lat,lng:u.lng,kind:'url'};
  syncControls();
  if(u.fid)openFacility(u.fid,true);
  if(origin)fetchFeed();
  else if(navigator.geolocation){
    setFeedBusy(true);
    navigator.geolocation.getCurrentPosition(pos=>{origin={lat:pos.coords.latitude,lng:pos.coords.longitude,kind:'geo'};syncControls();pushUrlState(true);fetchFeed();renderUserDot()},
      ()=>{setFeedBusy(false);renderEmpty('no-origin')},{timeout:6000,maximumAge:120000});   // Invariant #11: 6s, silent fallback
    setTimeout(()=>{if(!origin&&!currentFacilities.length){setFeedBusy(false);renderEmpty('no-origin')}},7000);
  }else renderEmpty('no-origin');
  syncMapLayout();
});
})();

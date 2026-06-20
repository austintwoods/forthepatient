    /*
      ForThePatient.org — app.js v1.2 (Session CAP-VIZ — June 2026)
      Capability filter + de-clustered markers + red enforcement-severity gradient
      + component-weight removal + map legend. Pure frontend; consumes the live
      B-ENF-FLAG contract read-only — NO new RPC, NO new RPC PARAM, NO schema
      change. Closes the last product-track polish items requested by the founder.
      Changelog vs v1.1:
        C1-RING: Enforcement marker RING is now a graduated RED scale, so MINOR →
              CRITICAL reads as light-red → deep-red at a glance (CSS in index.html;
              JS still resolves the sev-WORD class from the 4-tier
              enforcement_severity). MINOR no longer renders gray. Drives a parallel
              red gradient on the detail-card banner left edge + the mobile FLAGGED
              pill. The literal hexes live in CSS; JS only sets the sev-<word> class.
        C2-CAP: NEW "Capabilities" filter in the desktop filter bar AND the mobile
              home sheet — a single dropdown/panel letting a patient require
              facilities that have what their condition needs (NICU, ER, Cardiac
              Cath, Trauma, Teaching — the five live nearby_facilities server params
              — PLUS, applied CLIENT-SIDE over already-fetched rows when the field is
              present, Cardiac Surgery, MRI, Burn Unit, Transplant, and a
              higher-complexity CMI cut). activeSpecialties now also carries the
              client-side keys; capabilityClientFilter() degrades gracefully (only
              filters on a field that actually appears in the returned rows, so it
              can never blank the map on a column the RPC didn't return). No new RPC
              param (Invariant #6): the five booleans reuse the existing params; the
              rest filter rows we already have (re-affirms Decision 132b).
        C3-NOCLUSTER: ALL pie-chart clustering is eliminated at EVERY zoom. Every
              individual facility now renders as its own .ftp-dot (with its
              enforcement ring) in the un-clustered facilityLayer — never a cluster
              pie — in the ordinary facility view as well as the state drill-down.
              The ONLY clusters that remain are the national state bubbles
              (zoom < 7), which are unchanged. The markercluster dependency and its
              CSS are retained but no longer instantiated (no dep removed → Invariant
              #17 intact; the cluster icon builder is dead-coded but kept for the
              record). Supersedes Invariants #9/#10 (cluster tuning) — see headers.
        C4-NOWEIGHT: The detail-card "Component breakdown" no longer prints the
              per-component weight percentage. Each row shows the component name and
              its 1–10 score only; the bar still encodes the score. The .section-note
              copy drops the "percentage is how much it counts" clause.
        C5-LEGEND: A small, always-on rating-color legend sits at the top-left of the
              map, directly below the search/filter bar (desktop), and as a compact
              strip in the mobile home sheet. Reads the documented classification
              palette only — no new colors.
        ── carried from v1.1 (TRANSLATE-1) ──
        T1-1: buildPatientSummary(f,hist) — a calm, second-person reading rendered
              at the TOP of the card body (primary path; persona-1 wins), fed by
              the shared buildFacilityDetailHtml so it appears in BOTH the desktop
              side panel and the mobile sheet (Invariants #29/#30). Order: (1) the
              enforcement flag — the "is anything wrong here" answer — then (2) the
              quality reading (score + classification + state percentile), then
              (3) proximity (reuses the existing geolocation + haversineMiles; no
              new math). Coherent for the flagged-but-scores-well case (Q-15): the
              flag leads, then "Setting the enforcement flag aside, its … score is".
        T1-2: Percentile phrasing (Q-40) = "better than about X% of <State> <peers>"
              + a directional cue (near the bottom / around the middle / near the
              top). This is the literal percentile definition and never inverts.
              pctWhole() rounds half-up and clamps 1..99 (never "0%"/"100%").
        T1-3: NULL state_percentile (Q-40) split into two honest, never-blank cases:
              Unrated (no score at all → "not enough public data to rate") vs a
              scored facility with too few in-state same-type peers to rank. Never
              prints "0th percentile", "null", or a blank.
        T1-4: Glossary-in-context (not a separate page): the score line now reads
              "1 (weakest) to 10 (strongest)" and a one-line .section-note under
              "Component breakdown" explains the weighting in plain words.
        T1-5: All facility-derived strings routed through escapeHtml (#15). No new
              deps (#17). New colors: none beyond the existing #C0392B tint and one
              darker shade of the documented --cls-excep green (#5FA85F), confined
              to a 4px accent bar — same treatment Invariant #18 already grants the
              banner-icon tints. No build step; two static files (#16).
    */
    const SUPABASE_URL='https://nhajnwffxlztmoadqcdl.supabase.co';
    const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oYWpud2ZmeGx6dG1vYWRxY2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA1NzAsImV4cCI6MjA4ODMyNjU3MH0.lUVbH_ka0LS8B6xuQJG8KuOdwgk7lTejl9dPfzSUHwQ';
    const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    const STATE_ZOOM=7;
    const FACILITY_TYPES=[{value:'hospital',label:'Hospitals',icon:'fa-hospital'},{value:'nursing_home',label:'Nursing Homes',icon:'fa-house-medical'},{value:'dialysis',label:'Dialysis',icon:'fa-droplet'},{value:'home_health',label:'Home Health',icon:'fa-house-chimney-medical'},{value:'hospice',label:'Hospice',icon:'fa-hand-holding-heart'},{value:'irf',label:'Rehab (IRF)',icon:'fa-person-walking'},{value:'ltch',label:'Long-Term (LTCH)',icon:'fa-bed-pulse'}];
    const TYPE_LABEL=Object.fromEntries(FACILITY_TYPES.map(t=>[t.value,t.label]));
    const SPECIALTIES=[{key:'er',label:'ER',icon:'fa-truck-medical'},{key:'nicu',label:'NICU',icon:'fa-baby'},{key:'trauma',label:'Trauma',icon:'fa-kit-medical'},{key:'teaching',label:'Teaching',icon:'fa-graduation-cap'},{key:'cath',label:'Cardiac Cath',icon:'fa-heart-pulse'}];
    // ── CAP-VIZ: the "Capabilities" filter model ───────────────────────────────
    // Two kinds of capability. SERVER keys map to the five live nearby_facilities
    // boolean params (no new RPC param — Invariant #6). CLIENT keys filter the rows
    // we already fetched (Decision 132b); each names the facility field to test and
    // is only ever applied when that field is actually present on returned rows, so
    // a missing column can never blank the map. CMI is a numeric "higher-complexity"
    // cut rather than a boolean. `field` is read from a nearby_facilities row.
    const CAPABILITIES=[
        {key:'er',       label:'Emergency room',   icon:'fa-truck-medical',          kind:'server', hint:'Has an emergency department'},
        {key:'nicu',     label:'NICU',             icon:'fa-baby',                   kind:'server', hint:'Newborn intensive care'},
        {key:'cath',     label:'Cardiac cath lab', icon:'fa-heart-pulse',            kind:'server', hint:'Cardiac catheterization'},
        {key:'trauma',   label:'Trauma center',    icon:'fa-kit-medical',            kind:'server', hint:'Designated trauma center'},
        {key:'teaching', label:'Teaching hospital',icon:'fa-graduation-cap',         kind:'server', hint:'Academic / teaching status'},
        {key:'cardsurg', label:'Cardiac surgery',  icon:'fa-heart-circle-bolt',      kind:'client', field:'has_cardiac_surgery', hint:'Open-heart / cardiac surgery'},
        {key:'mri',      label:'MRI on site',      icon:'fa-magnet',                 kind:'client', field:'has_mri',            hint:'On-site MRI imaging'},
        {key:'burn',     label:'Burn unit',        icon:'fa-fire',                   kind:'client', field:'has_burn_unit',      hint:'Specialized burn care'},
        {key:'transplant',label:'Transplant',      icon:'fa-hand-holding-medical',   kind:'client', field:'has_organ_transplant',hint:'Organ transplant program'},
        {key:'highcmi',  label:'Higher complexity',icon:'fa-layer-group',            kind:'client', field:'case_mix_index', cmiMin:1.75, hint:'Case-mix index ≥ 1.75 (sicker, more complex caseload)'}
    ];
    const CAP_SERVER_KEYS=CAPABILITIES.filter(c=>c.kind==='server').map(c=>c.key);
    const CAP_CLIENT=CAPABILITIES.filter(c=>c.kind==='client');
    const CLASS_COLORS={'Exceptional':'#A0D8A0','Above Average':'#B8E6A0','Average':'#F8D08A','Below Average':'#F0B8A0','Poor':'#E8A0A0','Unrated':'#BDC3C7'};
    const CLASS_ORDER=['Exceptional','Above Average','Average','Below Average','Poor','Unrated'];
    const US_STATES=[{n:'Alabama',s:'AL',lat:32.806671,lng:-86.79113},{n:'Alaska',s:'AK',lat:61.370716,lng:-152.404419},{n:'Arizona',s:'AZ',lat:33.729759,lng:-111.431221},{n:'Arkansas',s:'AR',lat:34.969704,lng:-92.373123},{n:'California',s:'CA',lat:36.116203,lng:-119.681564},{n:'Colorado',s:'CO',lat:39.059811,lng:-105.311104},{n:'Connecticut',s:'CT',lat:41.597782,lng:-72.755371},{n:'Delaware',s:'DE',lat:39.318523,lng:-75.507141},{n:'Florida',s:'FL',lat:27.766279,lng:-81.686783},{n:'Georgia',s:'GA',lat:33.040619,lng:-83.643074},{n:'Hawaii',s:'HI',lat:21.094318,lng:-157.498337},{n:'Idaho',s:'ID',lat:44.240459,lng:-114.478773},{n:'Illinois',s:'IL',lat:40.349457,lng:-88.986137},{n:'Indiana',s:'IN',lat:39.849426,lng:-86.258278},{n:'Iowa',s:'IA',lat:42.011539,lng:-93.210526},{n:'Kansas',s:'KS',lat:38.5266,lng:-96.726486},{n:'Kentucky',s:'KY',lat:37.66814,lng:-84.670067},{n:'Louisiana',s:'LA',lat:31.169546,lng:-91.867805},{n:'Maine',s:'ME',lat:44.693947,lng:-69.381927},{n:'Maryland',s:'MD',lat:39.063946,lng:-76.802101},{n:'Massachusetts',s:'MA',lat:42.230171,lng:-71.530106},{n:'Michigan',s:'MI',lat:43.326618,lng:-84.536095},{n:'Minnesota',s:'MN',lat:45.694454,lng:-93.900192},{n:'Mississippi',s:'MS',lat:32.741646,lng:-89.678696},{n:'Missouri',s:'MO',lat:38.456085,lng:-92.288368},{n:'Montana',s:'MT',lat:46.921925,lng:-110.454353},{n:'Nebraska',s:'NE',lat:41.12537,lng:-98.268082},{n:'Nevada',s:'NV',lat:38.313515,lng:-117.055374},{n:'New Hampshire',s:'NH',lat:43.452492,lng:-71.563896},{n:'New Jersey',s:'NJ',lat:40.298904,lng:-74.521011},{n:'New Mexico',s:'NM',lat:34.840515,lng:-106.248482},{n:'New York',s:'NY',lat:42.165726,lng:-74.948051},{n:'North Carolina',s:'NC',lat:35.630066,lng:-79.806419},{n:'North Dakota',s:'ND',lat:47.528912,lng:-99.784012},{n:'Ohio',s:'OH',lat:40.388783,lng:-82.764915},{n:'Oklahoma',s:'OK',lat:35.565342,lng:-96.928917},{n:'Oregon',s:'OR',lat:44.572021,lng:-122.070938},{n:'Pennsylvania',s:'PA',lat:40.590752,lng:-77.209755},{n:'Rhode Island',s:'RI',lat:41.680893,lng:-71.51178},{n:'South Carolina',s:'SC',lat:33.856892,lng:-80.945007},{n:'South Dakota',s:'SD',lat:44.299782,lng:-99.438828},{n:'Tennessee',s:'TN',lat:35.747845,lng:-86.692345},{n:'Texas',s:'TX',lat:31.054487,lng:-97.563461},{n:'Utah',s:'UT',lat:40.150032,lng:-111.862434},{n:'Vermont',s:'VT',lat:44.045876,lng:-72.710686},{n:'Virginia',s:'VA',lat:37.769337,lng:-78.169968},{n:'Washington',s:'WA',lat:47.400902,lng:-121.490494},{n:'West Virginia',s:'WV',lat:38.491226,lng:-80.954456},{n:'Wisconsin',s:'WI',lat:44.268543,lng:-89.616508},{n:'Wyoming',s:'WY',lat:42.755966,lng:-107.30249},{n:'District of Columbia',s:'DC',lat:38.897438,lng:-77.026817},{n:'Puerto Rico',s:'PR',lat:18.220833,lng:-66.590149},{n:'Guam',s:'GU',lat:13.444304,lng:144.793731},{n:'U.S. Virgin Islands',s:'VI',lat:18.335765,lng:-64.896335}];
    const STATE_BY_ABBR=Object.fromEntries(US_STATES.map(s=>[s.s,s]));

    // Debug logging gate: only console.log in localhost or with ?debug=1
    const DEBUG=(function(){try{return(new URLSearchParams(location.search).get('debug')==='1')||location.hostname==='localhost'||location.hostname==='127.0.0.1'}catch(e){return false}})();
    const dlog=DEBUG?console.log.bind(console,'[FTP]'):function(){};
    const derr=DEBUG?console.error.bind(console,'[FTP]'):function(){};

    let map,facilityLayer,stateBubbleLayer,stateFacilityLayer;
    let currentTheme='light',currentFacilities=[],openFacilityId=null;
    let activeTypes=new Set(['hospital']);
    let activeSpecialties={teaching:false,nicu:false,cath:false,trauma:false,er:false,cardsurg:false,mri:false,burn:false,transplant:false,highcmi:false};
    // ENF-VIZ-2: "Recent CMS Enforcement" filter. When on, only facilities with
    // a current, unresolved CMS survey finding (has_active_enforcement) are shown.
    // Client-side over rows already returned by nearby_facilities — no RPC change.
    let enforcementOnly=false;
    let isMobile=false,isOnline=navigator.onLine,isTouching=false,pendingFetch=false,detailPanelPinned=false,inflightController=null;
    let stateSummaryCache=null,currentViewMode='state';
    let sheetState='closed',sheetSnap='peek',sheetMode='home',userLocation=null;
    let filteredState=null;

    function classColor(c){return CLASS_COLORS[c]||CLASS_COLORS.Unrated}
    function classBadgeClass(c){return(!c||c==='Unrated')?'unrated':''}
    // ── ENF-VIZ: enforcement severity (facility-level 4-tier) ───────────────
    // {CRITICAL,SEVERE,MODERATE,MINOR}. Drives the marker ring + flag pill.
    const SEV_RANK={CRITICAL:4,SEVERE:3,MODERATE:2,MINOR:1};
    const SEV_WORD={CRITICAL:'critical',SEVERE:'severe',MODERATE:'moderate',MINOR:'minor'};
    function normSev(s){if(s==null)return null;const u=String(s).trim().toUpperCase();return SEV_RANK[u]?u:null}
    // Per-survey level (3-tier {critical,significant,minor}, Decision 114).
    const LVL_WORD={immediate_jeopardy:'critical',condition:'significant',standard:'minor',critical:'critical',significant:'significant',minor:'minor'};
    function debounce(fn,ms){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms)}}
    function truthy(v){if(v===true)return true;if(v===false||v==null)return false;const s=String(v).toLowerCase();return s==='y'||s==='yes'||s==='true'||s==='1'}
    function escapeHtml(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
    function scoreToBarColor(s){if(s==null)return'var(--border)';if(s>=7.5)return'#A0D8A0';if(s>=6)return'#B8E6A0';if(s>=4.5)return'#F8D08A';if(s>=3)return'#F0B8A0';return'#E8A0A0'}
    function scoreToClassColor(s){if(s==null)return'#BDC3C7';if(s>=7.5)return'#A0D8A0';if(s>=6)return'#B8E6A0';if(s>=4.5)return'#F8D08A';if(s>=3)return'#F0B8A0';return'#E8A0A0'}
    function haptic(ms){if(isMobile&&navigator.vibrate)try{navigator.vibrate(ms||10)}catch(e){}}
    function checkMobile(){isMobile=window.innerWidth<=768}
    function haversineMiles(lat1,lng1,lat2,lng2){const R=3958.8,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
    function originForDistance(){if(userLocation)return userLocation;if(map){const c=map.getCenter();return{lat:c.lat,lng:c.lng}}return null}
    function activeTypeNoun(){if(activeTypes.size===1){const v=Array.from(activeTypes)[0];return(TYPE_LABEL[v]||'facilities').toLowerCase()}return'facilities'}

    function getViewportRadiusMiles(){if(!map)return 25;const b=map.getBounds(),d=map.distance(b.getNorthEast(),b.getSouthWest());const h=(d/1609.344)/2;return Math.max(2,Math.min(2000,Math.ceil(h)))}

    function getUrlState(){const p=new URLSearchParams(location.search);return{lat:parseFloat(p.get('lat'))||null,lng:parseFloat(p.get('lng'))||null,z:parseInt(p.get('z'))||null,types:p.get('types')?p.get('types').split(','):null,state:p.get('state')||null,facilityId:p.get('fid')||null,theme:p.get('theme')||null}}
    function pushUrlState(replace){if(!map)return;const c=map.getCenter(),p=new URLSearchParams;p.set('lat',c.lat.toFixed(4));p.set('lng',c.lng.toFixed(4));p.set('z',map.getZoom());const t=Array.from(activeTypes).sort();const allTypes=FACILITY_TYPES.map(x=>x.value).sort();if(t.join(',')!==allTypes.join(','))p.set('types',t.join(','));if(filteredState)p.set('state',filteredState);if(openFacilityId)p.set('fid',openFacilityId);if(currentTheme==='dark')p.set('theme','dark');const url=location.pathname+'?'+p.toString();if(replace)history.replaceState(null,'',url);else history.pushState(null,'',url)}

    function initMap(){
        const u=getUrlState();
        const center=(u.lat&&u.lng)?[u.lat,u.lng]:[39.5,-98.0];
        const zoom=u.z||4;
        map=L.map('map',{center,zoom,zoomControl:false,preferCanvas:true});
        const tileUrl=currentTheme==='dark'?'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png':'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        L.tileLayer(tileUrl,{attribution:'&copy; CARTO &middot; CMS public data',subdomains:'abcd',maxZoom:20}).addTo(map);
        // CAP-VIZ (C3-NOCLUSTER): facilities are NEVER clustered. Every facility is
        // its own marker in this plain layer group, at every zoom — no pie charts.
        // (The markercluster library + CSS remain loaded so no dependency is removed,
        //  Invariant #17 intact, but markerClusterGroup is no longer instantiated.)
        facilityLayer=L.layerGroup().addTo(map);
        // Retained second un-clustered layer used only in the state drill-down so the
        // two visual treatments (ordinary dot vs brighter state dot) stay separable.
        stateFacilityLayer=L.layerGroup().addTo(map);
        stateBubbleLayer=L.layerGroup().addTo(map);
        wireCapabilityFilter();buildLegend();
        map.getContainer().addEventListener('touchstart',()=>{isTouching=true},{passive:true});
        map.getContainer().addEventListener('touchend',()=>{isTouching=false;if(pendingFetch){pendingFetch=false;onViewChange()}},{passive:true});
        const dv=debounce(()=>{if(isTouching){pendingFetch=true;return}onViewChange();pushUrlState(true)},300);
        map.on('moveend',dv);map.on('zoomend',dv);
        buildFilterChips();wireNameSearch();wireResizeHandle();wireStateFilterBadge();wireEnfFilter();
        buildSheetChips();wireSheetSearch();wireNearMe();wireViewToggle();
        if(u.types)activeTypes=new Set(u.types.filter(t=>TYPE_LABEL[t]));
        if(u.state&&STATE_BY_ABBR[u.state])filteredState=u.state;
        syncChips();
        updateStateFilterIndicator();
        loadStateSummary().then(()=>{
            if(!u.lat&&navigator.geolocation){navigator.geolocation.getCurrentPosition(pos=>{map.setView([pos.coords.latitude,pos.coords.longitude],6)},()=>onViewChange(),{timeout:4000})}else{onViewChange()}
        });
        setTimeout(()=>{if(!currentFacilities.length&&!stateSummaryCache)onViewChange()},2000);
        if(u.facilityId)setTimeout(()=>openFacilityDetail(u.facilityId),500);
        window.addEventListener('popstate',()=>{const s=getUrlState();if(!s.facilityId&&openFacilityId)closeFacilityInfo();else if(s.facilityId&&s.facilityId!==openFacilityId)openFacilityDetail(s.facilityId)});
        document.getElementById('loading').classList.add('hidden');
    }

    async function loadStateSummary(){try{const{data,error}=await sb.from('state_summary').select('*');if(error)throw error;stateSummaryCache=data||[];dlog('state_summary:',stateSummaryCache.length,'rows')}catch(e){derr('state_summary failed:',e);stateSummaryCache=[]}}

    function onViewChange(){
        if(!map)return;
        const z=map.getZoom();
        if(z<STATE_ZOOM){
            if(currentViewMode!=='state'){facilityLayer.clearLayers();stateFacilityLayer.clearLayers();currentFacilities=[]}
            currentViewMode='state';
            if(filteredState){filteredState=null;updateStateFilterIndicator()}
            renderStateBubbles();
        }else{
            if(currentViewMode!=='facility')stateBubbleLayer.clearLayers();
            currentViewMode='facility';
            fetchInView();
        }
    }

    function renderStateBubbles(){
        stateBubbleLayer.clearLayers();
        if(!stateSummaryCache||!stateSummaryCache.length)return;
        const agg={};
        stateSummaryCache.forEach(r=>{if(!activeTypes.has(r.facility_type))return;if(!agg[r.state])agg[r.state]={count:0,scoreSum:0,scoredCount:0};agg[r.state].count+=Number(r.facility_count);if(r.mean_score!=null&&r.scored_count>0){agg[r.state].scoreSum+=Number(r.mean_score)*Number(r.scored_count);agg[r.state].scoredCount+=Number(r.scored_count)}});
        const counts=Object.values(agg).map(a=>a.count);
        const maxCount=Math.max(...counts,1);
        let totalAll=0,scoreSumAll=0,scoredAll=0;
        Object.entries(agg).forEach(([st,d])=>{
            const si=STATE_BY_ABBR[st];if(!si)return;
            totalAll+=d.count;scoreSumAll+=d.scoreSum;scoredAll+=d.scoredCount;
            const avg=d.scoredCount>0?d.scoreSum/d.scoredCount:null;
            const bg=scoreToClassColor(avg);
            const minS=30,maxS=62;
            const logS=Math.log(d.count+1)/Math.log(maxCount+1);
            const size=Math.round(minS+logS*(maxS-minS));
            const fs=size<38?10:size<50?12:14;
            const cfs=Math.max(8,fs-3);
            const icon=L.divIcon({className:'',html:'<div class="state-bubble" style="width:'+size+'px;height:'+size+'px;background:'+bg+'"><span class="st-abbr" style="font-size:'+fs+'px;color:#2C3E50">'+st+'</span><span class="st-count" style="font-size:'+cfs+'px;color:#2C3E50">'+d.count.toLocaleString()+'</span></div>',iconSize:[size,size],iconAnchor:[size/2,size/2]});
            const m=L.marker([si.lat,si.lng],{icon});
            m.on('click',()=>{filteredState=st;updateStateFilterIndicator();if(isMobile)setSheetSnap('half');map.setView([si.lat,si.lng],STATE_ZOOM)});
            const scoreStr=avg!=null?avg.toFixed(1):'—';
            m.bindTooltip('<strong>'+si.n+'</strong><br>'+d.count.toLocaleString()+' facilities · avg '+scoreStr,{direction:'top',offset:[0,-size/2-4]});
            stateBubbleLayer.addLayer(m);
        });
        const avgAll=scoredAll>0?(scoreSumAll/scoredAll).toFixed(1):'—';
        setStats(totalAll,avgAll,activeTypeNoun()+' nationwide');
        if(isMobile)renderSheetList();
    }

    // CAP-VIZ (C3-NOCLUSTER): createClusterIcon is RETAINED but NO LONGER CALLED.
    // Facilities are never clustered, so the pie-chart icon builder is dead code.
    // It is kept (a) so the markercluster dependency need not be removed (Invariant
    // #17) and (b) as a record of the old behavior should clustering ever return via
    // an explicit numbered decision. Do not wire it back without one.
    function createClusterIcon(cluster){
        const ch=cluster.getAllChildMarkers(),count=ch.length,size=count<20?40:count<100?48:56;
        const cnts={};ch.forEach(m=>{const c=m.options._classification||'Unrated';cnts[c]=(cnts[c]||0)+1});
        const r=size/2;let segs='',sa=0;
        CLASS_ORDER.forEach(cls=>{if(!cnts[cls])return;const pct=cnts[cls]/count,ea=sa+pct*360,lg=pct>.5?1:0,sr=sa*Math.PI/180,er=ea*Math.PI/180;
        const x1=r+r*Math.sin(sr),y1=r-r*Math.cos(sr),x2=r+r*Math.sin(er),y2=r-r*Math.cos(er);
        if(pct>=.999)segs+='<circle cx="'+r+'" cy="'+r+'" r="'+r+'" fill="'+CLASS_COLORS[cls]+'"/>';
        else segs+='<path d="M'+r+','+r+' L'+x1+','+y1+' A'+r+','+r+' 0 '+lg+' 1 '+x2+','+y2+' Z" fill="'+CLASS_COLORS[cls]+'"/>';sa=ea});
        return L.divIcon({html:'<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" xmlns="http://www.w3.org/2000/svg">'+segs+'<circle cx="'+r+'" cy="'+r+'" r="'+(r*.6)+'" fill="'+(currentTheme==='dark'?'#2C3E50':'#FFFFFF')+'"/><text x="'+r+'" y="'+r+'" text-anchor="middle" dominant-baseline="central" font-size="'+(size<48?11:13)+'" font-weight="700" fill="'+(currentTheme==='dark'?'#ECF0F1':'#2C3E50')+'">'+count+'</text></svg>',className:'cluster-pie',iconSize:[size,size],iconAnchor:[size/2,size/2]});
    }

    function buildFilterChips(){
        const sc=document.getElementById('chip-scroll');sc.innerHTML='';
        FACILITY_TYPES.forEach(t=>{const c=document.createElement('button');c.className='f-chip'+(activeTypes.has(t.value)?' active':'');c.dataset.type=t.value;c.setAttribute('role','switch');c.setAttribute('aria-checked',activeTypes.has(t.value));c.setAttribute('aria-label',t.label);c.type='button';c.innerHTML='<i class="fas '+t.icon+'" aria-hidden="true"></i> '+t.label;c.addEventListener('click',()=>{if(activeTypes.has(t.value))activeTypes.delete(t.value);else activeTypes.add(t.value);haptic(10);syncChips();onViewChange()});sc.appendChild(c)});
        syncChips();
    }

    function syncChips(){
        document.querySelectorAll('.f-chip[data-type]').forEach(c=>{const a=activeTypes.has(c.dataset.type);c.classList.toggle('active',a);c.setAttribute('aria-checked',a)});
        document.querySelectorAll('.sheet-chip[data-type]').forEach(c=>{const a=activeTypes.has(c.dataset.type);c.classList.toggle('on',a);c.setAttribute('aria-checked',a)});
        pushUrlState(true);
    }

    function updateStateFilterIndicator(){
        const on=!!(filteredState&&STATE_BY_ABBR[filteredState]);
        const badge=document.getElementById('state-filter-badge');
        const nameEl=document.getElementById('state-filter-name');
        if(badge&&nameEl){if(on){nameEl.textContent=STATE_BY_ABBR[filteredState].n;badge.hidden=false}else{badge.hidden=true;nameEl.textContent=''}}
        const pill=document.getElementById('sheet-state-pill');
        const pillName=document.getElementById('sheet-state-name');
        if(pill&&pillName){if(on){pillName.textContent=STATE_BY_ABBR[filteredState].n;pill.classList.add('active')}else{pill.classList.remove('active');pillName.textContent=''}}
    }

    function clearStateFilter(){
        if(!filteredState)return;
        filteredState=null;
        updateStateFilterIndicator();
        haptic(10);
        if(currentViewMode==='facility'){fetchInView()}
        pushUrlState(true);
    }
    function wireStateFilterBadge(){
        const badge=document.getElementById('state-filter-badge');
        if(badge&&!badge._wired){badge._wired=true;badge.addEventListener('click',clearStateFilter)}
        const pill=document.getElementById('sheet-state-pill');
        if(pill&&!pill._wired){pill._wired=true;pill.addEventListener('click',clearStateFilter)}
    }

    async function fetchInView(){
        if(!map||!isOnline)return;
        const c=map.getCenter();
        const types=Array.from(activeTypes);
        // When state-filtered, anchor the radius search on the state centroid
        // (the map view might be off-center) and use a generous radius so we
        // capture facilities anywhere in that state. Out-of-state rows are
        // dropped client-side below.
        let centerLat=c.lat,centerLng=c.lng,radius=getViewportRadiusMiles();
        if(filteredState&&STATE_BY_ABBR[filteredState]){
            const si=STATE_BY_ABBR[filteredState];
            centerLat=si.lat;centerLng=si.lng;
            radius=Math.max(radius,500);
        }
        dlog('fetchInView: center=('+centerLat.toFixed(4)+','+centerLng.toFixed(4)+'), radius='+radius+'mi, types=['+types.join(',')+'], zoom='+map.getZoom()+', state='+(filteredState||'-'));
        if(!types.length){facilityLayer.clearLayers();stateFacilityLayer.clearLayers();currentFacilities=[];updateStats([]);if(isMobile)showSheetGuide('no-types');showEmptyState('no-types');return}
        const params={p_lat:centerLat,p_lng:centerLng,p_radius_miles:radius,p_types:types,p_min_score:null,p_require_nicu:!!activeSpecialties.nicu,p_require_cath:!!activeSpecialties.cath,p_require_trauma:!!activeSpecialties.trauma,p_require_teaching:!!activeSpecialties.teaching,p_require_er:!!activeSpecialties.er,p_limit:5000};
        dlog('RPC params:',JSON.stringify(params));
        showLoading(true);
        try{if(inflightController)inflightController.abort();inflightController=new AbortController();
        const{data,error}=await sb.rpc('nearby_facilities',params);if(error)throw error;
        let rows=data||[];
        const rawCount=rows.length;
        if(filteredState)rows=rows.filter(r=>r.state===filteredState);
        currentFacilities=rows;
        dlog('RPC returned '+rawCount+' rows, '+currentFacilities.length+' after state filter');
        if(currentFacilities.length>0){const tc={};currentFacilities.forEach(f=>{tc[f.facility_type]=(tc[f.facility_type]||0)+1});dlog('Type breakdown:',JSON.stringify(tc))}
        const vis=visibleFacilities();
        renderMarkers(vis);updateStats(vis);
        if(isMobile)renderSheetList();
        const ov=document.getElementById('map-empty-overlay');if(ov&&vis.length>0)ov.remove();
        if(!currentFacilities.length)showEmptyState('no-results');
        else if(!vis.length&&!isMobile)showEmptyState('no-enf');
        }catch(e){if(e.name!=='AbortError'){derr('RPC failed:',e);showErrorState(e)}}finally{showLoading(false)}
    }

    function renderMarkers(facs){
        // CAP-VIZ (C3-NOCLUSTER): facilities are NEVER clustered. Every facility is
        // its own .ftp-dot, at every zoom. The ONLY remaining clusters are the
        // national state bubbles (renderStateBubbles, zoom < 7). The state
        // drill-down keeps a slightly larger/brighter dot for legibility, but that
        // is a styling variant — both modes are un-clustered individual markers.
        const stateMode=!!(filteredState&&STATE_BY_ABBR[filteredState]);
        facilityLayer.clearLayers();stateFacilityLayer.clearLayers();
        const baseDs=isMobile?14:12;
        const ds=stateMode?(isMobile?18:16):baseDs;   // larger/more visible in state mode
        const z=map?map.getZoom():STATE_ZOOM;
        const markers=facs.map(f=>{if(f.latitude==null||f.longitude==null)return null;
        const color=classColor(f.score_classification);
        const sev=f.has_active_enforcement?normSev(f.enforcement_severity):null;
        // The RED severity ring always shows for CRITICAL/SEVERE; the lighter-red
        // MODERATE/MINOR rings show in state drill-down (whole state laid out) or at
        // closer zooms, so a dense metro view of thousands of dots stays readable.
        const showRing=sev&&(stateMode||SEV_RANK[sev]>=3||z>=11);
        const dotCls=stateMode?'ftp-dot ftp-statedot':'ftp-dot';
        let html,iconW=ds,anchor=ds/2;
        if(showRing){const pad=SEV_RANK[sev]>=3?7:5;iconW=ds+pad*2;anchor=iconW/2;
            html='<div class="ftp-flag'+(stateMode?' statedot-flag':'')+'" style="width:'+iconW+'px;height:'+iconW+'px"><span class="enf-ring sev-'+SEV_WORD[sev]+'"></span><div class="'+dotCls+'" style="background:'+color+';width:'+ds+'px;height:'+ds+'px"></div></div>';}
        else html='<div class="'+dotCls+'" style="background:'+color+';width:'+ds+'px;height:'+ds+'px"></div>';
        const icon=L.divIcon({className:'',html,iconSize:[iconW,iconW],iconAnchor:[anchor,anchor]});
        const m=L.marker([f.latitude,f.longitude],{icon,_classification:f.score_classification||'Unrated',_facilityId:f.facility_id});
        if(isMobile)m.on('click',()=>openFacilityDetail(f.facility_id));
        else{m.bindPopup(buildPopup(f),{maxWidth:240});m.on('click',()=>openFacilityDetail(f.facility_id))}
        return m}).filter(Boolean);
        dlog('renderMarkers:',markers.length,stateMode?'(state dots)':'(individual dots)');
        const layer=stateMode?stateFacilityLayer:facilityLayer;
        markers.forEach(m=>layer.addLayer(m));
    }

    function buildPopup(f){const s=f.final_score!=null?f.final_score.toFixed(1):'—';const sev=f.has_active_enforcement?normSev(f.enforcement_severity):null;const enfLine=sev?'<br><span style="display:inline-block;margin-top:4px;font-size:11px;font-weight:600;color:#C0392B"><i class="fas fa-triangle-exclamation"></i> Active enforcement · '+escapeHtml(sev.charAt(0)+sev.slice(1).toLowerCase())+'</span>':'';return'<div><strong>'+escapeHtml(f.facility_name||'')+'</strong><br><span style="color:var(--text-secondary);font-size:11px">'+escapeHtml(TYPE_LABEL[f.facility_type]||'')+'</span><br><span style="display:inline-block;padding:2px 8px;margin-top:4px;border-radius:10px;font-size:11px;font-weight:600;background:'+classColor(f.score_classification)+';color:#2C3E50">'+s+' · '+escapeHtml(f.score_classification||'Unrated')+'</span>'+enfLine+'</div>'}
    function updateStats(rows){const sc=rows.filter(r=>r.final_score!=null);const avg=sc.length>0?(sc.reduce((s,r)=>s+r.final_score,0)/sc.length).toFixed(1):'—';let lbl=activeTypeNoun()+' nearby';if(filteredState&&STATE_BY_ABBR[filteredState])lbl=activeTypeNoun()+' in '+STATE_BY_ABBR[filteredState].n;setStats(rows.length,avg,lbl)}

    function showEmptyState(reason){const el=document.getElementById('map-empty-overlay');if(el)el.remove();if(isMobile)return;
        if(reason==='no-enf'){const o=document.createElement('div');o.id='map-empty-overlay';o.className='empty-state';o.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:450;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:30px 40px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:calc(100% - 32px)';o.innerHTML='<i class="fas fa-gavel"></i><h4>No flagged facilities in view</h4><p>None of the facilities here are under recent CMS enforcement. Turn off the filter to see all of them, or move the map.</p><button class="clear-btn" type="button" onclick="setEnforcementOnly(false)">Show all facilities</button>';document.getElementById('map-page').appendChild(o);return}
        if(reason==='no-cap'){const o=document.createElement('div');o.id='map-empty-overlay';o.className='empty-state';o.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:450;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:30px 40px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:calc(100% - 32px)';o.innerHTML='<i class="fas fa-list-check"></i><h4>No facilities match every capability</h4><p>None of the facilities in view have all the capabilities you selected. Remove a requirement or move the map.</p><button class="clear-btn" type="button" onclick="clearCapabilities()">Clear capabilities</button>';document.getElementById('map-page').appendChild(o);return}
        if(currentFacilities.length>0)return;const o=document.createElement('div');o.id='map-empty-overlay';o.className='empty-state';o.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:450;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:30px 40px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:calc(100% - 32px)';if(reason==='no-types')o.innerHTML='<i class="fas fa-filter"></i><h4>No types selected</h4><p>Enable at least one facility type.</p>';else if(filteredState&&STATE_BY_ABBR[filteredState]){const typeNames=Array.from(activeTypes).map(t=>TYPE_LABEL[t]||t).join(', ');o.innerHTML='<i class="fas fa-search"></i><h4>No results in '+escapeHtml(STATE_BY_ABBR[filteredState].n)+'</h4><p>No '+(typeNames||'facilities')+' found in this state. Try adding more facility types or clearing the state filter.</p><button class="clear-btn" type="button" onclick="clearAllFilters()">Clear Filters</button>'}else o.innerHTML='<i class="fas fa-search"></i><h4>No facilities found</h4><p>Try zooming out or adjusting filters.</p><button class="clear-btn" type="button" onclick="clearAllFilters()">Clear Filters</button>';document.getElementById('map-page').appendChild(o)}
    function showErrorState(err){const el=document.getElementById('map-empty-overlay');if(el)el.remove();const o=document.createElement('div');o.id='map-empty-overlay';o.className='error-state';o.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:450;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:30px 40px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:calc(100% - 32px)';o.innerHTML='<i class="fas fa-triangle-exclamation"></i><h4>Unable to load</h4><p>'+escapeHtml(err.message||'Error')+'</p><button class="retry-btn" type="button" onclick="onViewChange();this.closest(\'.error-state\').remove()">Retry</button>';document.getElementById('map-page').appendChild(o)}
    function clearAllFilters(){activeTypes=new Set(FACILITY_TYPES.map(t=>t.value));Object.keys(activeSpecialties).forEach(k=>activeSpecialties[k]=false);enforcementOnly=false;syncEnfFilter();syncCapabilityFilter();filteredState=null;updateStateFilterIndicator();syncChips();const o=document.getElementById('map-empty-overlay');if(o)o.remove();onViewChange()}
    // ── ENF-FILTER + CAP-VIZ client-side capability filter ──────────────────
    // visibleFacilities() composes every CLIENT-SIDE view filter over the rows we
    // already fetched (no refetch): first the "Recent CMS enforcement" toggle, then
    // any selected client-side capabilities (Cardiac surgery / MRI / Burn / Transplant
    // / higher-complexity CMI). The five SERVER capabilities (NICU/ER/Cath/Trauma/
    // Teaching) are already applied by nearby_facilities and need no client pass.
    function capabilityClientFilter(rows){
        const active=CAP_CLIENT.filter(c=>activeSpecialties[c.key]);
        if(!active.length)return rows;
        return rows.filter(f=>active.every(c=>{
            // Degrade gracefully: if NONE of the rows even carry this field, the RPC
            // didn't return it — don't filter on it (never blank the map on a missing
            // column). We test per-row presence; a row missing the field fails the
            // requirement (we can't claim a capability we can't see).
            const v=f[c.field];
            if(c.cmiMin!=null){const n=Number(v);return isFinite(n)&&n>=c.cmiMin}
            return truthy(v);
        }));
    }
    // Some columns (has_mri, has_burn_unit, …) may not be returned by
    // nearby_facilities. If a selected client capability is supported by ZERO rows
    // in the current result set, we surface it rather than silently emptying the
    // map: capabilityUnsupported() lists those keys so the UI can note them.
    function capabilityFieldPresent(field){return currentFacilities.some(f=>Object.prototype.hasOwnProperty.call(f,field)&&f[field]!=null)}
    function activeClientCapabilities(){return CAP_CLIENT.filter(c=>activeSpecialties[c.key])}
    function capabilityCount(){return CAPABILITIES.reduce((n,c)=>n+(activeSpecialties[c.key]?1:0),0)}
    function visibleFacilities(){
        let rows=enforcementOnly?currentFacilities.filter(f=>!!f.has_active_enforcement):currentFacilities;
        rows=capabilityClientFilter(rows);
        return rows;
    }
    function syncEnfFilter(){
        const d=document.getElementById('enf-filter-chip');
        if(d)d.setAttribute('aria-pressed',enforcementOnly?'true':'false');
        const m=document.getElementById('sheet-enf-toggle');
        if(m)m.setAttribute('aria-pressed',enforcementOnly?'true':'false');
    }
    function setEnforcementOnly(on){
        enforcementOnly=!!on;syncEnfFilter();haptic(10);
        // Re-render in place from the rows we already have.
        if(currentViewMode==='facility'){
            const vis=visibleFacilities();
            renderMarkers(vis);updateStats(vis);
            if(isMobile)renderSheetList();
            if(!vis.length&&currentFacilities.length){if(!isMobile)showEmptyState('no-enf')}
            else{const ov=document.getElementById('map-empty-overlay');if(ov)ov.remove()}
        }
        pushUrlState(true);
    }
    function toggleEnforcementOnly(){setEnforcementOnly(!enforcementOnly)}
    function wireEnfFilter(){
        const d=document.getElementById('enf-filter-chip');
        if(d&&!d._wired){d._wired=true;d.addEventListener('click',toggleEnforcementOnly)}
        const m=document.getElementById('sheet-enf-toggle');
        if(m&&!m._wired){m._wired=true;m.addEventListener('click',toggleEnforcementOnly)}
        syncEnfFilter();
    }

    // ── CAP-VIZ: the "Capabilities" filter ─────────────────────────────────
    // One control on each surface lets a patient require the services their
    // condition needs. The five SERVER capabilities (NICU/ER/Cath/Trauma/Teaching)
    // change the nearby_facilities query (re-fetch); the CLIENT capabilities
    // (Cardiac surgery/MRI/Burn/Transplant/higher-complexity) filter rows we already
    // have (re-render in place). We track which keys are server-vs-client so toggling
    // a client key never costs a network round-trip.
    function applyCapabilityChange(key){
        const isServer=CAP_SERVER_KEYS.indexOf(key)!==-1;
        haptic(10);
        syncCapabilityFilter();
        pushUrlState(true);
        if(isServer){
            // server param changed → re-query
            if(currentViewMode==='facility')fetchInView();
        }else{
            // client capability → re-render from rows in hand
            if(currentViewMode==='facility'){
                const vis=visibleFacilities();
                renderMarkers(vis);updateStats(vis);
                if(isMobile)renderSheetList();
                const ov=document.getElementById('map-empty-overlay');
                if(!vis.length&&currentFacilities.length){if(!isMobile)showEmptyState('no-cap')}
                else if(ov)ov.remove();
            }
        }
    }
    function toggleCapability(key){activeSpecialties[key]=!activeSpecialties[key];applyCapabilityChange(key)}
    function clearCapabilities(){CAPABILITIES.forEach(c=>activeSpecialties[c.key]=false);haptic(10);syncCapabilityFilter();pushUrlState(true);if(currentViewMode==='facility')fetchInView()}
    // Build the desktop dropdown menu + the mobile sheet panel from CAPABILITIES.
    function capabilityRowsHtml(prefix){
        return CAPABILITIES.map(c=>{
            const on=!!activeSpecialties[c.key];
            return'<button class="cap-opt'+(on?' on':'')+'" type="button" role="menuitemcheckbox" aria-checked="'+(on?'true':'false')+'" data-cap="'+c.key+'" data-prefix="'+prefix+'">'+
                '<span class="cap-ic"><i class="fas '+c.icon+'" aria-hidden="true"></i></span>'+
                '<span class="cap-text"><span class="cap-label">'+escapeHtml(c.label)+'</span><span class="cap-hint">'+escapeHtml(c.hint)+'</span></span>'+
                '<span class="cap-check" aria-hidden="true"><i class="fas fa-check"></i></span>'+
            '</button>';
        }).join('');
    }
    function buildCapabilityFilter(){
        const menu=document.getElementById('cap-menu');
        if(menu)menu.innerHTML='<div class="cap-menu-head">Required capabilities<button class="cap-clear" type="button" id="cap-clear-desktop">Clear</button></div><div class="cap-menu-list" role="menu" aria-label="Required capabilities">'+capabilityRowsHtml('desktop')+'</div><div class="cap-menu-foot">Showing facilities that have <strong>all</strong> selected capabilities. Some apply to hospitals only.</div>';
        const sheet=document.getElementById('sheet-cap-list');
        if(sheet)sheet.innerHTML=capabilityRowsHtml('sheet');
    }
    function wireCapabilityFilter(){
        buildCapabilityFilter();
        const btn=document.getElementById('cap-filter-btn'),menu=document.getElementById('cap-menu');
        if(btn&&menu&&!btn._wired){btn._wired=true;
            btn.addEventListener('click',e=>{e.stopPropagation();const open=menu.classList.toggle('open');btn.setAttribute('aria-expanded',open?'true':'false')});
            document.addEventListener('click',e=>{if(!e.target.closest('#cap-menu')&&!e.target.closest('#cap-filter-btn')){menu.classList.remove('open');btn.setAttribute('aria-expanded','false')}});
            document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){menu.classList.remove('open');btn.setAttribute('aria-expanded','false');btn.focus()}});
        }
        // Delegated handlers for option buttons on both surfaces (rebuilt on sync).
        const onCapClick=e=>{const b=e.target.closest('[data-cap]');if(!b)return;e.preventDefault();toggleCapability(b.dataset.cap)};
        if(menu&&!menu._wired){menu._wired=true;menu.addEventListener('click',e=>{const cl=e.target.closest('#cap-clear-desktop');if(cl){clearCapabilities();return}onCapClick(e)})}
        const sheetList=document.getElementById('sheet-cap-list');
        if(sheetList&&!sheetList._wired){sheetList._wired=true;sheetList.addEventListener('click',onCapClick)}
        const sheetClear=document.getElementById('sheet-cap-clear');
        if(sheetClear&&!sheetClear._wired){sheetClear._wired=true;sheetClear.addEventListener('click',clearCapabilities)}
        syncCapabilityFilter();
    }
    function syncCapabilityFilter(){
        const n=capabilityCount();
        // Desktop trigger button: show a count badge when any capability is active.
        const btn=document.getElementById('cap-filter-btn');
        if(btn){btn.classList.toggle('has-active',n>0);btn.setAttribute('aria-label',n>0?('Capabilities filter ('+n+' selected)'):'Filter by capabilities');
            const badge=btn.querySelector('.cap-count');if(badge){badge.textContent=n>0?String(n):'';badge.style.display=n>0?'inline-flex':'none'}}
        // Mobile trigger row badge.
        const sBadge=document.getElementById('sheet-cap-count');
        if(sBadge){sBadge.textContent=n>0?String(n):'';sBadge.style.display=n>0?'inline-flex':'none'}
        // Reflect checked state on every option button without a full rebuild.
        document.querySelectorAll('[data-cap]').forEach(b=>{const on=!!activeSpecialties[b.dataset.cap];b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false')});
    }

    // ── CAP-VIZ (C5-LEGEND): map rating legend ─────────────────────────────
    // A small, always-on key for the dot colors, top-left of the map under the
    // search/filter bar. Reads the documented classification palette only.
    const LEGEND_ITEMS=[
        {label:'Exceptional',color:'#A0D8A0'},
        {label:'Above Average',color:'#B8E6A0'},
        {label:'Average',color:'#F8D08A'},
        {label:'Below Average',color:'#F0B8A0'},
        {label:'Poor',color:'#E8A0A0'},
        {label:'Unrated',color:'#BDC3C7'}
    ];
    function buildLegend(){
        const el=document.getElementById('map-legend');if(!el)return;
        const rows=LEGEND_ITEMS.map(i=>'<span class="lg-row"><span class="lg-swatch" style="background:'+i.color+'"></span>'+escapeHtml(i.label)+'</span>').join('');
        el.innerHTML='<div class="lg-title">Quality rating</div><div class="lg-rows">'+rows+'</div>'+
            '<div class="lg-enf"><span class="lg-ring" aria-hidden="true"></span>Red ring = recent CMS enforcement (darker red = more severe)</div>';
    }
    function showLoading(a){const el=document.getElementById('query-loading');if(a)el.classList.add('active');else el.classList.remove('active')}

    async function openFacilityDetail(fid){
        openFacilityId=fid;pushUrlState(false);document.title='Loading… — ForThePatient';
        if(isMobile){setSheetContent('detail');document.getElementById('detail-sheet-body').innerHTML=buildSkeletonHtml();setSheetSnap('half')}
        else{const p=document.getElementById('info-panel');document.getElementById('facility-info-content').innerHTML=buildSkeletonHtml();p.classList.add('active')}
        const ov=document.getElementById('map-empty-overlay');if(ov)ov.remove();
        try{const{data,error}=await sb.rpc('facility_detail',{p_facility_id:fid});if(error)throw error;if(!data)throw new Error('No data');
        const html=buildFacilityDetailHtml(data);
        if(isMobile)document.getElementById('detail-sheet-body').innerHTML=html;else document.getElementById('facility-info-content').innerHTML=html;
        const f=data.facility||data;const s=f.final_score!=null?f.final_score.toFixed(1):'';document.title=(f.facility_name||'Facility')+' — Quality Score'+(s?' '+s:'')+' | ForThePatient';
        }catch(e){derr('detail failed',e);const eh='<div class="error-state"><i class="fas fa-triangle-exclamation"></i><h4>Could not load</h4><p>'+escapeHtml(e.message||'')+'</p><button class="retry-btn" type="button" onclick="openFacilityDetail(\''+escapeHtml(fid)+'\')">Retry</button></div>';if(isMobile)document.getElementById('detail-sheet-body').innerHTML=eh;else document.getElementById('facility-info-content').innerHTML=eh}
    }

    function buildSkeletonHtml(){return'<div class="facility-info" style="padding-top:14px"><div style="display:flex;justify-content:flex-end;gap:4px;margin-bottom:8px"><div class="skeleton-block" style="width:32px;height:32px;border-radius:6px"></div><div class="skeleton-block" style="width:32px;height:32px;border-radius:6px"></div><div class="skeleton-block" style="width:32px;height:32px;border-radius:6px"></div></div><div class="skeleton-block skeleton-line w70"></div><div class="skeleton-block skeleton-line w40" style="height:8px;margin-bottom:14px"></div><div style="display:flex;gap:14px;align-items:center;margin-bottom:20px"><div class="skeleton-block skeleton-circle"></div><div style="flex:1"><div class="skeleton-block skeleton-line w50"></div><div class="skeleton-block skeleton-line w40" style="height:8px"></div></div></div><div class="skeleton-block skeleton-line w40" style="height:8px;margin-bottom:14px"></div><div class="skeleton-block skeleton-line w90"></div><div class="skeleton-block skeleton-bar"></div><div class="skeleton-block skeleton-line w90"></div><div class="skeleton-block skeleton-bar"></div><div class="skeleton-block skeleton-line w90"></div><div class="skeleton-block skeleton-bar"></div><div class="skeleton-block skeleton-line w90"></div><div class="skeleton-block skeleton-bar"></div><div style="margin-top:18px"><div class="skeleton-block skeleton-line w70"></div><div class="skeleton-block skeleton-line w50"></div></div></div>'}

    // ── TRANSLATE-1: plain-language patient summary (S-4) ──────────────────
    // A calm, second-person reading that synthesizes, in this order:
    //   (1) is anything wrong here  (enforcement flag — the persona-1 question)
    //   (2) how good is the quality  (score + classification + state percentile)
    //   (3) how close is it          (reused "Near me" geolocation, no new math)
    // It is the LANGUAGE layer over data already on the card — no new RPC, no new
    // statistic. The same builder feeds the desktop side panel and the mobile
    // sheet (Invariants #29/#30). Every facility-derived string is escaped (#15).
    //
    // Q-40 (percentile phrasing) is resolved as "better than ~X% of peers": that
    // is the literal definition of a percentile, it never inverts, and it stays
    // positive for strong facilities. A plain directional cue ("near the bottom"
    // / "around the middle" / "near the top") carries the gist so a stressed
    // reader needn't do the arithmetic; the % is supporting detail. NULL is split
    // into two honest cases and NEVER prints "0th"/"null"/blank: an Unrated
    // facility ("not enough public data to rate") vs a scored facility with too
    // few in-state same-type peers to rank ("too few comparable … to rank").

    // Round-half-up to a whole percent for display (avoids "15.6th"); clamps 1..99
    // so we never say "0%" or "100%" of peers.
    function pctWhole(p){const n=Math.round(Number(p));return Math.max(1,Math.min(99,n))}
    // Map a percentile to a plain directional phrase + a tone token (drives accent).
    function pctBand(p){
        if(p>=80)return{word:'near the top',tone:'good'};
        if(p>=60)return{word:'in the upper range',tone:'good'};
        if(p>=40)return{word:'around the middle',tone:'mid'};
        if(p>=20)return{word:'in the lower range',tone:'low'};
        return{word:'near the bottom',tone:'low'};
    }
    // Plain reading of the 1-10 score for someone who has never seen the scale.
    function scoreBand(s){
        if(s==null)return{word:'',tone:'mid'};
        if(s>=7.5)return{word:'a strong quality record',tone:'good'};
        if(s>=6)return{word:'an above-average quality record',tone:'good'};
        if(s>=4.5)return{word:'a middle-of-the-pack quality record',tone:'mid'};
        if(s>=3)return{word:'a below-average quality record',tone:'low'};
        return{word:'a weak quality record',tone:'low'};
    }
    function stateName(abbr){const s=STATE_BY_ABBR[abbr];return s?s.n:null}
    // Type noun for one facility, lowercased and singular-ish, for "… of N.C. hospitals".
    function peerNoun(t){const m={hospital:'hospitals',nursing_home:'nursing homes',dialysis:'dialysis centers',home_health:'home-health agencies',hospice:'hospices',irf:'rehab facilities',ltch:'long-term care hospitals'};return m[t]||'facilities'}

    function buildPatientSummary(f,hist){
        if(!f)return'';
        const score=(f.final_score!=null)?Number(f.final_score):null;
        const cls=f.score_classification||'Unrated';
        const unrated=(score==null)||cls==='Unrated';
        const flagged=!!f.has_active_enforcement;
        const sev=normSev(f.enforcement_severity);
        const rawPct=(f.state_percentile==null)?null:Number(f.state_percentile);
        const hasPct=(rawPct!=null&&!isNaN(rawPct));
        const sName=stateName(f.state);
        const peers=peerNoun(f.facility_type);

        const parts=[];   // each entry: {t: text, tone: 'good'|'mid'|'low'|'flag'}

        // (1) Enforcement first — the "is anything wrong here" answer.
        if(flagged){
            const sevWord=sev?(sev.charAt(0)+sev.slice(1).toLowerCase()):null;
            if(sev&&SEV_RANK[sev]>=3){
                parts.push({t:'This facility is currently under active Medicare enforcement for '+(sevWord?escapeHtml(sevWord.toLowerCase())+'-severity ':'')+'safety problems. If you have other options nearby, they may be the safer choice. If this is your only option, ask about recent improvements and know your rights as a patient.',tone:'flag'});
            }else{
                parts.push({t:'This facility has a current, unresolved CMS survey finding on record'+(sevWord?' ('+escapeHtml(sevWord.toLowerCase())+' severity)':'')+'. It is worth asking the facility what has been done to address it.',tone:'flag'});
            }
        }

        // (2) Quality reading — score + classification + state percentile.
        if(unrated){
            parts.push({t:'There isn\u2019t enough public Medicare data to give this facility a quality score yet, so it is shown as Unrated. That is not a mark against it \u2014 it means the data needed to rate it isn\u2019t available.',tone:'mid'});
        }else{
            const sb=scoreBand(score);
            const lead=flagged?'Setting the enforcement flag aside, its overall quality score is':'Its overall quality score is';
            let sentence=lead+' '+score.toFixed(1)+' out of 10 \u2014 '+sb.word+'.';
            // Percentile clause, when we can rank it.
            if(hasPct){
                const w=pctWhole(rawPct),band=pctBand(rawPct);
                const where=sName?(' of '+escapeHtml(sName)+' '+peers):(' of '+peers+' in its state');
                sentence+=' That places it '+band.word+' \u2014 better than about '+w+'%'+where+'.';
                parts.push({t:sentence,tone:band.tone});
            }else{
                // scored, but no percentile: too few in-state same-type peers to rank.
                sentence+=' There are too few comparable '+peers+(sName?(' in '+escapeHtml(sName)):'')+' to rank it against its peers.';
                parts.push({t:sentence,tone:sb.tone});
            }
        }

        // (3) Proximity — reuse the existing geolocation/distance, no new math.
        const o=originForDistance();
        if(o&&f.latitude!=null&&f.longitude!=null&&userLocation){
            const mi=haversineMiles(o.lat,o.lng,Number(f.latitude),Number(f.longitude));
            if(isFinite(mi)){
                const miStr=mi<10?mi.toFixed(1):String(Math.round(mi));
                parts.push({t:'It is about '+miStr+' mile'+((miStr==='1'||miStr==='1.0')?'':'s')+' from your current location.',tone:'mid'});
            }
        }

        if(!parts.length)return'';
        // Overall tone: a live flag dominates; otherwise the quality reading leads.
        const tone=flagged?'flag':(parts[0]?parts[0].tone:'mid');
        const body=parts.map(p=>'<p class="ps-line">'+p.t+'</p>').join('');
        return'<div class="patient-summary tone-'+tone+'" role="note" aria-label="Plain-language summary">'+
            '<div class="ps-eyebrow"><i class="fas fa-circle-info" aria-hidden="true"></i> What this means for you</div>'+
            body+
            '<div class="ps-foot">A plain-language reading of the data below. <a href="/methodology">How we score</a>.</div>'+
        '</div>';
    }

    // ── ENF-VIZ: hospital enforcement banner + survey history ──────────────
    // facility.enforcement_severity is UNGATED here, so it may be a historical
    // (expired) label when has_active_enforcement is false. Label accordingly.
    function buildEnforcementHtml(f,hist){
        const flagged=!!f.has_active_enforcement;
        const sev=normSev(f.enforcement_severity);
        const rows=Array.isArray(hist)?hist:[];
        if(!flagged&&!sev&&!rows.length)return'';
        let banner='';
        if(flagged&&sev){
            const word=sev.charAt(0)+sev.slice(1).toLowerCase();
            banner='<div class="enf-banner sev-'+SEV_WORD[sev]+'"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><div class="enf-banner-body"><div class="enf-banner-head">Under active enforcement &middot; '+escapeHtml(word)+'</div><div class="enf-banner-sub">CMS has a current, unresolved survey finding on record for this facility. Recent findings are marked <strong>Current</strong> below.</div></div></div>';
        }else if(!flagged&&(sev||rows.length)){
            // expired label or only-historical records: do NOT present as current
            banner='<div class="enf-banner expired"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i><div class="enf-banner-body"><div class="enf-banner-head">No active enforcement</div><div class="enf-banner-sub">'+(sev?'A past finding (severity: '+escapeHtml((sev.charAt(0)+sev.slice(1).toLowerCase()))+') has since expired. ':'')+'Any items below are historical and no longer affect the score.</div></div></div>';
        }
        let histHtml='';
        if(rows.length){
            const sorted=rows.slice().sort((a,b)=>String(b.survey_date||'').localeCompare(String(a.survey_date||'')));
            const render=r=>{
                const d=r.survey_date?String(r.survey_date).slice(0,10):'';
                const lvlRaw=(r.deficiency_level||r.severity||'').toLowerCase();
                const lvl=LVL_WORD[lvlRaw]||'minor';
                const lvlLabel=lvl==='critical'?'Immediate jeopardy':lvl==='significant'?'Condition-level':'Standard';
                const active=!!r.is_active;
                const tag=r.deficiency_tag?'Tag '+escapeHtml(String(r.deficiency_tag)):'';
                const desc=r.deficiency_description?'<div class="enf-desc">'+escapeHtml(String(r.deficiency_description))+'</div>':'';
                return'<div class="enf-row"><div class="enf-row-top"><span class="enf-date">'+escapeHtml(d)+'</span><span class="enf-level lvl-'+lvl+'">'+lvlLabel+'</span><span class="enf-status '+(active?'current':'resolved')+'">'+(active?'Current':'Resolved')+'</span>'+(tag?'<span class="enf-tag">'+tag+'</span>':'')+'</div>'+desc+'</div>';
            };
            const n=sorted.length;
            const noun=n===1?'survey finding':'survey findings';
            // Collapsed by default: NO rows shown until the disclosure is opened.
            const pid='enf-disc-panel-'+(++enfDiscSeq);
            const allRows=sorted.map(render).join('');
            histHtml='<h3 class="section-header">Survey findings ('+n+')</h3>'+
                '<div class="enf-disclosure"><button class="enf-disc-btn" type="button" aria-expanded="false" aria-controls="'+pid+'" onclick="toggleEnfHistory(this)">'+
                    '<i class="fas fa-chevron-right ed-ic" aria-hidden="true"></i>'+
                    '<span class="ed-label">Show '+n+' '+noun+'</span>'+
                    '<span class="ed-caret" aria-hidden="true"><i class="fas fa-list"></i></span>'+
                '</button>'+
                '<div class="enf-disc-panel" id="'+pid+'" hidden><div class="enf-history">'+allRows+'</div>'+
                '<div class="enf-more">Source: CMS survey deficiency records (QCOR). Findings linger on the score after the survey date, then expire.</div></div></div>';
        }
        return banner+histHtml;
    }
    let enfDiscSeq=0;
    function toggleEnfHistory(btn){
        const id=btn.getAttribute('aria-controls');const panel=id?document.getElementById(id):null;if(!panel)return;
        const willOpen=panel.hidden;panel.hidden=!willOpen;
        btn.setAttribute('aria-expanded',willOpen?'true':'false');
        const label=btn.querySelector('.ed-label');
        if(label){const total=(panel.querySelectorAll('.enf-row')||[]).length;const noun=total===1?'survey finding':'survey findings';label.textContent=willOpen?('Hide '+noun):('Show '+total+' '+noun);}
    }

    function buildFacilityDetailHtml(payload){
        const f=payload.facility||payload,comps=payload.components||[],enf=payload.enforcement||[];
        const hospEnf=payload.hospital_enforcement||[];
        const score=f.final_score!=null?f.final_score.toFixed(1):'—',cls=f.score_classification||'Unrated',stars=f.cms_overall_rating||null;
        const compHtml=comps.length===0?'<div class="component-na">No component data</div>':comps.sort((a,b)=>(a.component_order||0)-(b.component_order||0)).map(c=>{const cs=c.component_score!=null?c.component_score.toFixed(1):'—';const fp=c.component_score!=null?Math.max(0,Math.min(100,(c.component_score/10)*100)):0;return'<div><div class="component-row"><div class="component-name">'+escapeHtml(c.component_name||'')+'</div><div class="component-score">'+cs+'</div></div><div class="component-bar"><div class="component-bar-fill" style="width:'+fp+'%;background:'+scoreToBarColor(c.component_score)+'"></div></div></div>'}).join('');
        const badges=[];if(truthy(f.teaching_status))badges.push('Teaching');if(truthy(f.has_cardiac_cath_lab))badges.push('Cardiac Cath');if(truthy(f.has_cardiac_surgery))badges.push('Cardiac Surgery');if(truthy(f.nicu_level))badges.push('NICU');if(truthy(f.has_trauma_center))badges.push('Trauma Center');if(truthy(f.has_burn_unit))badges.push('Burn Unit');if(truthy(f.has_organ_transplant))badges.push('Transplant');if(truthy(f.has_mri))badges.push('MRI');if(f.case_mix_index!=null)badges.push('CMI '+Number(f.case_mix_index).toFixed(2));
        const bHtml=badges.length?'<div class="specialty-badges">'+badges.map(b=>'<span class="spec-badge">'+escapeHtml(b)+'</span>').join('')+'</div>':'';
        const eHtml=enf.length?'<div class="enforcement-block"><div class="enforcement-title"><i class="fas fa-gavel"></i> '+enf.length+' regulatory action'+(enf.length===1?'':'s')+'</div>'+enf.slice(0,5).map(e=>'<div class="enforcement-amt">'+escapeHtml(e.penalty_type||'Penalty')+(e.amount?' · $'+Number(e.amount).toLocaleString():'')+(e.penalty_date?' · '+escapeHtml(String(e.penalty_date).slice(0,10)):'')+'</div>').join('')+(enf.length>5?'<div class="enforcement-amt">+ '+(enf.length-5)+' more</div>':'')+'</div>':'';
        const cmsLine=stars?'<span class="cms-stars">CMS overall: '+'<i class="fas fa-star star-icon"></i>'.repeat(Math.round(stars))+' '+stars+'/5</span>':'';
        const psHtml=buildPatientSummary(f,hospEnf);
        const enfVizHtml=buildEnforcementHtml(f,hospEnf);
        return'<div class="facility-info"><div class="detail-header-actions"><button class="detail-action-btn" type="button" onclick="copyFacilityLink(\''+escapeHtml(f.facility_id)+'\')" aria-label="Copy link" title="Copy link"><i class="fas fa-link"></i></button><button class="detail-action-btn" type="button" onclick="shareFacility(\''+escapeHtml(f.facility_id)+'\',\''+escapeHtml(f.facility_name)+'\')" aria-label="Share" title="Share"><i class="fas fa-share-nodes"></i></button><button class="detail-action-btn" type="button" data-pin onclick="togglePinPanel()" aria-label="Pin" title="Pin"><i class="fas fa-thumbtack"></i></button><button class="detail-action-btn" type="button" onclick="closeFacilityInfo()" aria-label="Close" title="Close"><i class="fas fa-times"></i></button></div><div class="facility-header"><h2 class="facility-name">'+escapeHtml(f.facility_name||'')+'</h2><div class="facility-type-line">'+escapeHtml(TYPE_LABEL[f.facility_type]||f.facility_type||'')+'</div><div class="score-block"><div class="score-circle '+(cls==='Unrated'?'unrated':'')+'" style="background:'+classColor(cls)+'">'+score+'</div><div class="score-meta"><span class="classification-badge '+classBadgeClass(cls)+'" style="background:'+classColor(cls)+'">'+escapeHtml(cls)+'</span><span class="score-out-of">FTP score · 1 (weakest) to 10 (strongest)</span>'+cmsLine+'</div></div>'+bHtml+'</div>'+psHtml+'<h3 class="section-header">Component breakdown</h3><p class="section-note">The score combines these measures. Each is shown on the same 1&ndash;10 scale, so you can see where this facility is strong or weak.</p>'+compHtml+eHtml+enfVizHtml+'<div class="addr-block">'+(f.address?'<div><i class="fas fa-map-marker-alt"></i>'+escapeHtml(f.address||'')+'</div>':'')+'<div style="padding-left:20px">'+escapeHtml(f.city||'')+(f.city?', ':'')+escapeHtml(f.state||'')+' '+escapeHtml(f.zip_code||'')+'</div>'+(f.phone?'<div><i class="fas fa-phone"></i>'+escapeHtml(f.phone)+'</div>':'')+'</div><a href="https://maps.google.com/?q='+f.latitude+','+f.longitude+'" target="_blank" rel="noopener noreferrer" class="directions-btn">Get Directions</a><div class="print-methodology-url">Methodology: https://forthepatient.org/methodology</div></div>';
    }

    function closeFacilityInfo(){
        openFacilityId=null;
        document.title='For The Patient — Healthcare Quality Map';
        if(isMobile){setSheetContent('home');setSheetSnap('half')}
        else document.getElementById('info-panel').classList.remove('active','pinned');
        pushUrlState(true);
    }
    function copyFacilityLink(id){const url=location.origin+location.pathname+'?fid='+encodeURIComponent(id);navigator.clipboard.writeText(url).then(()=>{const b=document.querySelector('.detail-action-btn[onclick*="copyFacilityLink"]');if(b){const i=b.querySelector('i');i.className='fas fa-check';setTimeout(()=>{i.className='fas fa-link'},1500)}}).catch(()=>{})}
    function shareFacility(id,name){const url=location.origin+location.pathname+'?fid='+encodeURIComponent(id);if(navigator.share)navigator.share({title:name+' — Quality Score | ForThePatient',url}).catch(()=>{});else copyFacilityLink(id)}
    function togglePinPanel(){const p=document.getElementById('info-panel');detailPanelPinned=!detailPanelPinned;p.classList.toggle('pinned',detailPanelPinned);if(detailPanelPinned)p.style.width='';setTimeout(()=>map.invalidateSize(),350)}

    function wireNameSearch(){
        const input=document.getElementById('name-search'),results=document.getElementById('name-results');if(!input||!results)return;let kbIdx=-1;
        const search=debounce(async()=>{const q=input.value.trim();if(q.length<2){results.classList.remove('active');input.setAttribute('aria-expanded','false');return}if(!isOnline)return;
        try{const{data,error}=await sb.rpc('search_facilities_by_name',{p_query:q,p_limit:12});if(error)throw error;renderNameResults(data||[],results);input.setAttribute('aria-expanded','true');kbIdx=-1}catch(e){derr('search failed',e)}},250);
        input.addEventListener('input',search);
        input.addEventListener('focus',()=>{if(results.children.length>0){results.classList.add('active');input.setAttribute('aria-expanded','true')}});
        input.addEventListener('keydown',e=>{const items=results.querySelectorAll('.name-result-item');if(e.key==='ArrowDown'){e.preventDefault();kbIdx=Math.min(kbIdx+1,items.length-1);updateKbActive(items,kbIdx)}else if(e.key==='ArrowUp'){e.preventDefault();kbIdx=Math.max(kbIdx-1,-1);updateKbActive(items,kbIdx)}else if(e.key==='Enter'&&kbIdx>=0&&items[kbIdx]){e.preventDefault();items[kbIdx].click()}else if(e.key==='Escape'){results.classList.remove('active');input.setAttribute('aria-expanded','false')}});
        document.addEventListener('click',e=>{if(!e.target.closest('.search-compact')){results.classList.remove('active');input.setAttribute('aria-expanded','false')}});
    }
    function updateKbActive(items,idx){items.forEach((el,i)=>{el.classList.toggle('kb-active',i===idx);if(i===idx)el.scrollIntoView({block:'nearest'})})}
    function renderNameResults(rows,el){
        if(!rows.length){el.innerHTML='<div class="name-result-item"><div class="name-result-meta">No matches</div></div>';el.classList.add('active');return}
        el.innerHTML=rows.map((r,i)=>{const sc=classColor(r.score_classification),st=r.final_score!=null?r.final_score.toFixed(1):'—';return'<div class="name-result-item" data-id="'+escapeHtml(r.facility_id)+'" data-lat="'+r.latitude+'" data-lng="'+r.longitude+'" role="option"><div class="name-result-name">'+escapeHtml(r.facility_name||'')+'</div><div class="name-result-meta">'+escapeHtml(TYPE_LABEL[r.facility_type]||'')+' · '+escapeHtml(r.city||'')+', '+escapeHtml(r.state||'')+' · <span class="name-result-score" style="background:'+sc+'">'+st+'</span></div></div>'}).join('');
        el.classList.add('active');
        el.querySelectorAll('.name-result-item[data-id]').forEach(el=>{el.addEventListener('click',()=>{const lat=parseFloat(el.dataset.lat),lng=parseFloat(el.dataset.lng);if(!isNaN(lat)&&!isNaN(lng))map.setView([lat,lng],14);document.getElementById('name-results').classList.remove('active');document.getElementById('name-search').value='';openFacilityDetail(el.dataset.id)})});
    }

    function wireResizeHandle(){const h=document.getElementById('resize-handle'),p=document.getElementById('info-panel');if(!h||!p)return;let sx,sw;function md(e){e.preventDefault();sx=e.clientX;sw=p.offsetWidth;document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu)}function mm(e){p.style.width=Math.max(320,Math.min(600,sw+(sx-e.clientX)))+'px'}function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu)}h.addEventListener('mousedown',md)}

    function toggleTheme(){currentTheme=currentTheme==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',currentTheme);try{localStorage.setItem('theme',currentTheme)}catch(e){}const btn=document.getElementById('theme-toggle-btn');btn.classList.toggle('active',currentTheme==='dark');btn.setAttribute('aria-checked',currentTheme==='dark');btn.querySelector('.toggle-slider i').className=currentTheme==='dark'?'fas fa-moon':'fas fa-sun';document.querySelector('meta[name="theme-color"]').content=currentTheme==='dark'?'#1A1F36':'#FDF8F0';map.eachLayer(l=>{if(l instanceof L.TileLayer)map.removeLayer(l)});L.tileLayer(currentTheme==='dark'?'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png':'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; CARTO &middot; CMS public data',subdomains:'abcd',maxZoom:20}).addTo(map);if(currentViewMode==='facility'&&currentFacilities.length)renderMarkers(currentFacilities);else if(currentViewMode==='state')renderStateBubbles();pushUrlState(true)}

    // ─── v5.0 mobile home sheet ──────────────────────────────────────────────
    function buildSheetChips(){
        const el=document.getElementById('sheet-chips');if(!el)return;el.innerHTML='';
        FACILITY_TYPES.forEach(t=>{
            const c=document.createElement('button');
            c.className='sheet-chip'+(activeTypes.has(t.value)?' on':'');
            c.dataset.type=t.value;c.type='button';c.setAttribute('role','switch');
            c.setAttribute('aria-checked',activeTypes.has(t.value));c.setAttribute('aria-label',t.label);
            c.innerHTML='<i class="fas '+t.icon+'" aria-hidden="true"></i> '+t.label;
            c.addEventListener('click',()=>{if(activeTypes.has(t.value))activeTypes.delete(t.value);else activeTypes.add(t.value);haptic(10);syncChips();onViewChange()});
            el.appendChild(c);
        });
    }
    function wireViewToggle(){
        const t=document.getElementById('view-toggle');if(!t||t._wired)return;t._wired=true;
        t.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
            if(sheetMode==='detail')closeFacilityInfo();
            setSheetSnap(b.dataset.view==='map'?'peek':'half');
            haptic(10);
        }));
    }
    function updateViewToggle(){
        const t=document.getElementById('view-toggle');if(!t)return;
        const mapOn=(sheetSnap==='peek');
        t.querySelectorAll('button').forEach(b=>{const on=(b.dataset.view==='map')===mapOn;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
    }
    // Near me (mobile). Single in-flight request at a time; spinner set on tap and
    // restored on EVERY exit path. Within 4s (Invariant #11) a denial shows the
    // location-off guide. On a 4s TIMEOUT we keep silently watching in the
    // background (so a slow-but-eventually-granted fix still recenters) AND surface
    // an explicit "still trying… / retry" affordance (Q-42: explicit-retry).
    let nearMeBusy=false,nearMeWatchId=null;
    function setNearMeBusy(b,on){
        nearMeBusy=on;
        const i=b.querySelector('i');
        if(on){if(!b._iconPrev)b._iconPrev=i?i.className:'';if(i)i.className='fas fa-spinner fa-spin';b.disabled=true;b.setAttribute('aria-busy','true');}
        else{if(i&&b._iconPrev)i.className=b._iconPrev;b._iconPrev='';b.disabled=false;b.removeAttribute('aria-busy');}
    }
    function clearNearMeWatch(){if(nearMeWatchId!=null&&navigator.geolocation){try{navigator.geolocation.clearWatch(nearMeWatchId)}catch(e){}}nearMeWatchId=null}
    function applyNearMeFix(lat,lng){
        userLocation={lat,lng};
        if(filteredState){filteredState=null;updateStateFilterIndicator()}
        if(map)map.setView([lat,lng],11);
        setSheetSnap('half');
        if(isMobile)renderSheetList();
    }
    function startNearMe(){
        const b=document.getElementById('sheet-nearme');if(!b)return;
        if(nearMeBusy)return;                              // in-flight guard: ignore repeat taps
        haptic(10);
        if(!navigator.geolocation){showSheetGuide('location-off');setSheetSnap('half');return}
        clearNearMeWatch();
        setNearMeBusy(b,true);
        let settled=false;
        const done=fn=>{if(settled)return;settled=true;setNearMeBusy(b,false);if(fn)fn()};
        navigator.geolocation.getCurrentPosition(
            pos=>{clearNearMeWatch();done(()=>applyNearMeFix(pos.coords.latitude,pos.coords.longitude))},
            err=>{
                // code 3 = TIMEOUT: GPS may still resolve. Keep a background watch and
                // offer an explicit retry, while honoring the silent map fallback.
                if(err&&err.code===3){
                    done(()=>{setSheetSnap('half');showNearMePending();
                        if(navigator.geolocation&&nearMeWatchId==null){
                            nearMeWatchId=navigator.geolocation.watchPosition(
                                pos=>{clearNearMeWatch();applyNearMeFix(pos.coords.latitude,pos.coords.longitude)},
                                ()=>{clearNearMeWatch()},
                                {enableHighAccuracy:false,maximumAge:60000});
                        }
                    });
                }else{
                    // denial / position-unavailable: stop, explain, restore.
                    clearNearMeWatch();done(()=>{showSheetGuide('location-off');setSheetSnap('half')});
                }
            },
            {timeout:4000,maximumAge:60000}
        );
    }
    function wireNearMe(){
        const b=document.getElementById('sheet-nearme');if(!b||b._wired)return;b._wired=true;
        b.addEventListener('click',startNearMe);
    }
    function wireSheetSearch(){
        const input=document.getElementById('sheet-search'),results=document.getElementById('sheet-search-results');if(!input||!results)return;
        const run=debounce(async()=>{
            const q=input.value.trim();
            if(q.length<2){results.classList.remove('active');results.innerHTML='';input.setAttribute('aria-expanded','false');return}
            if(!isOnline)return;
            try{const{data,error}=await sb.rpc('search_facilities_by_name',{p_query:q,p_limit:12});if(error)throw error;renderSheetSearchResults(data||[]);input.setAttribute('aria-expanded','true')}catch(e){derr('sheet search failed',e)}
        },250);
        input.addEventListener('input',()=>{if(isMobile&&sheetSnap==='peek')setSheetSnap('half');run()});
        input.addEventListener('focus',()=>{if(isMobile&&sheetSnap==='peek')setSheetSnap('half')});
    }
    function renderSheetSearchResults(rows){
        const el=document.getElementById('sheet-search-results');if(!el)return;
        if(!rows.length){el.innerHTML='<div class="name-result-item"><div class="name-result-meta">No facilities match that name. Check the spelling, or try fewer words.</div></div>';el.classList.add('active');return}
        el.innerHTML=rows.map(r=>{const sc=classColor(r.score_classification),st=r.final_score!=null?r.final_score.toFixed(1):'—';return'<div class="name-result-item" data-id="'+escapeHtml(r.facility_id)+'" data-lat="'+r.latitude+'" data-lng="'+r.longitude+'" role="option"><div class="name-result-name">'+escapeHtml(r.facility_name||'')+'</div><div class="name-result-meta">'+escapeHtml(TYPE_LABEL[r.facility_type]||'')+' · '+escapeHtml(r.city||'')+', '+escapeHtml(r.state||'')+' · <span class="name-result-score" style="background:'+sc+'">'+st+'</span></div></div>'}).join('');
        el.classList.add('active');
        el.querySelectorAll('.name-result-item[data-id]').forEach(it=>it.addEventListener('click',()=>{
            const lat=parseFloat(it.dataset.lat),lng=parseFloat(it.dataset.lng);
            if(!isNaN(lat)&&!isNaN(lng))map.setView([lat,lng],14);
            const inp=document.getElementById('sheet-search');if(inp)inp.value='';
            el.classList.remove('active');el.innerHTML='';
            openFacilityDetail(it.dataset.id);
        }));
    }
    function setStats(count,avg,label){
        const tc=document.getElementById('total-count'),as=document.getElementById('avg-score');
        if(tc)tc.textContent=count.toLocaleString();if(as)as.textContent=avg;
        const ss=document.getElementById('sheet-stats');
        if(ss)ss.innerHTML='<strong>'+count.toLocaleString()+'</strong> '+escapeHtml(label)+' · avg <strong>'+avg+'</strong>/10';
    }
    function renderSheetList(){
        const wrap=document.getElementById('sheet-list');if(!wrap)return;
        if(currentViewMode==='state'){showSheetGuide(filteredState?'state-loading':'start');return}
        const o=originForDistance();
        const rows=visibleFacilities().slice();
        if(o)rows.forEach(r=>{r._dist=(r.latitude!=null&&r.longitude!=null)?haversineMiles(o.lat,o.lng,r.latitude,r.longitude):Infinity});
        if(o)rows.sort((a,b)=>(a._dist||Infinity)-(b._dist||Infinity));
        if(!rows.length){
            const capActive=capabilityCount()>0;
            if(enforcementOnly&&!capabilityClientFilter(currentFacilities.filter(f=>!!f.has_active_enforcement)).length&&currentFacilities.some(f=>!!f.has_active_enforcement)){showSheetGuide('no-enf');return}
            if(capActive&&currentFacilities.length){showSheetGuide('no-cap');return}
            showSheetGuide(enforcementOnly&&currentFacilities.length?'no-enf':'empty');return;
        }
        const CAP=60,shown=rows.slice(0,CAP);
        let html=shown.map(f=>{
            const cls=f.score_classification||'Unrated',sc=classColor(cls),st=f.final_score!=null?f.final_score.toFixed(1):'—';
            const dist=(o&&f._dist!=null&&isFinite(f._dist))?'<span class="fdist">'+(f._dist<10?f._dist.toFixed(1):Math.round(f._dist))+' mi</span>':'';
            const sev=f.has_active_enforcement?normSev(f.enforcement_severity):null;
            const flag=f.has_active_enforcement?'<span class="sheet-flag'+(sev?' sev-'+SEV_WORD[sev]:'')+'" aria-label="Under active enforcement'+(sev?', '+SEV_WORD[sev]:'')+'">FLAGGED</span>':'';
            return'<button class="sheet-frow" type="button" data-id="'+escapeHtml(f.facility_id)+'"><span class="sc '+(cls==='Unrated'?'unrated':'')+'" style="background:'+sc+'">'+st+'</span><span class="fmeta"><span class="fnm">'+escapeHtml(f.facility_name||'')+'</span><span class="fsub">'+escapeHtml(TYPE_LABEL[f.facility_type]||'')+' · '+escapeHtml(cls)+'</span></span>'+flag+dist+'</button>';
        }).join('');
        if(rows.length>CAP)html+='<div class="sheet-guide" style="padding:14px 10px"><p>Showing the nearest '+CAP+' of '+rows.length.toLocaleString()+'. Zoom in or search to narrow it down.</p></div>';
        html+='<div class="sheet-legend">Scores run 1&ndash;10. <span class="lg-dot" style="background:var(--cls-excep)"></span><span class="lg-dot" style="background:var(--cls-average)"></span><span class="lg-dot" style="background:var(--cls-poor)"></span> Green is stronger, red is weaker, gray means not enough public data to rate.</div>';
        html+=sheetLinksHtml();
        wrap.innerHTML=html;
        wrap.querySelectorAll('.sheet-frow[data-id]').forEach(it=>it.addEventListener('click',()=>{
            const f=currentFacilities.find(x=>String(x.facility_id)===it.dataset.id);
            if(f&&f.latitude!=null&&f.longitude!=null)map.setView([f.latitude,f.longitude],Math.max(map.getZoom(),13));
            openFacilityDetail(it.dataset.id);
        }));
    }
    function showSheetGuide(kind){
        const wrap=document.getElementById('sheet-list');if(!wrap)return;
        let icon='fa-magnifying-glass-location',h='Find a facility',p='Search by name above, tap Near me, or tap a state on the map to zoom in.';
        if(kind==='empty'){icon='fa-map-location-dot';h='No facilities here yet';p='Zoom out, move the map, or search by name.';}
        else if(kind==='location-off'){icon='fa-location-crosshairs';h='Location is off';p='No problem — search by name above, or pan the map to your area.';}
        else if(kind==='state-loading'){icon='fa-spinner fa-spin';h='Loading facilities…';p='One moment.';}
        else if(kind==='no-types'){icon='fa-filter';h='No types selected';p='Pick at least one facility type above to see results.';}
        else if(kind==='no-enf'){icon='fa-gavel';h='No flagged facilities here';p='None of the facilities in view are under recent CMS enforcement. Turn off the filter to see all of them, or move the map.';}
        else if(kind==='no-cap'){icon='fa-list-check';h='No facilities match every capability';p='None of the facilities here have all the capabilities you selected. Remove a requirement in Capabilities, or move the map.';}
        wrap.innerHTML='<div class="sheet-guide"><i class="fas '+icon+'" aria-hidden="true"></i><h4>'+h+'</h4><p>'+p+'</p></div>'+sheetLinksHtml();
    }
    // Slow-GPS state: the 4s timeout fired but we're still listening in the
    // background. Show progress + an explicit Retry (Q-42 explicit-retry).
    function showNearMePending(){
        const wrap=document.getElementById('sheet-list');if(!wrap)return;
        wrap.innerHTML='<div class="sheet-guide"><i class="fas fa-location-crosshairs fa-fade" aria-hidden="true"></i><h4>Still finding your location…</h4><p>This can take a moment. We&rsquo;ll center the map automatically once your device responds — or you can search by name above.</p><button class="clear-btn" type="button" id="nearme-retry" style="margin-top:6px">Try again</button></div>'+sheetLinksHtml();
        const r=document.getElementById('nearme-retry');if(r)r.addEventListener('click',()=>{clearNearMeWatch();startNearMe()});
    }
    function sheetLinksHtml(){return'<div class="sheet-links"><a href="/about">About</a><a href="/methodology">Methodology</a><a href="/medical-disclaimer">Disclaimer</a><a href="/dispute-process">Dispute</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>'}
    function setSheetContent(mode){
        sheetMode=mode;
        const home=document.getElementById('sheet-home'),detail=document.getElementById('sheet-detail');
        if(!home||!detail)return;
        if(mode==='detail'){home.hidden=true;detail.hidden=false}else{detail.hidden=true;home.hidden=false}
    }

    // ─── Bottom sheet (mobile only) ──────────────────────────────────────────
    function getSnapHeights(){
        const vh=window.innerHeight;
        let peek=170;
        const handle=document.getElementById('detail-sheet-handle'),rail=document.querySelector('.sheet-rail');
        if(rail){const rh=rail.offsetHeight,hh=handle?handle.offsetHeight:18;if(rh>0)peek=hh+rh+6}
        const full=Math.round(vh*0.9);
        peek=Math.min(peek,Math.round(vh*0.45));
        let half=Math.max(Math.round(vh*0.5),peek+72);half=Math.min(half,full);
        return{closed:0,peek,half,full};
    }
    function applySheetHeight(h,animate){const sheet=document.getElementById('detail-sheet');if(!sheet)return;sheet.style.transition=animate?'height .3s cubic-bezier(.25,.1,.25,1)':'none';sheet.style.height=Math.max(0,h)+'px'}
    function setSheetSnap(snap,animate){
        if(!isMobile)return;
        const sheet=document.getElementById('detail-sheet');if(!sheet)return;
        let key=snap;
        if(sheetMode==='detail'&&key==='peek')key='half';   // detail never rests at peek
        const heights=getSnapHeights();
        const h=heights[key]!=null?heights[key]:heights.half;
        sheetSnap=key;
        sheet.setAttribute('aria-hidden','false');
        applySheetHeight(h,animate!==false);
        updateViewToggle();
    }
    // Back-compat shims for older call sites.
    function openBottomSheet(snap){setSheetSnap(snap==='full'?'full':'half')}
    function closeBottomSheet(){setSheetContent('home');setSheetSnap('peek')}
    function setupBottomSheetHandle(){
        const sheet=document.getElementById('detail-sheet');
        const oldHandle=document.getElementById('detail-sheet-handle');
        if(!sheet||!oldHandle)return;
        const handle=oldHandle.cloneNode(false);              // drop stale listeners
        oldHandle.parentNode.replaceChild(handle,oldHandle);
        let sY,sH,drag=false;
        handle.addEventListener('touchstart',e=>{drag=true;sY=e.touches[0].clientY;sH=sheet.offsetHeight;sheet.style.transition='none'},{passive:true});
        handle.addEventListener('touchmove',e=>{if(!drag)return;const heights=getSnapHeights();const newH=Math.min(heights.full,Math.max(0,sH+(sY-e.touches[0].clientY)));applySheetHeight(newH,false)},{passive:true});
        handle.addEventListener('touchend',()=>{
            if(!drag)return;drag=false;
            const heights=getSnapHeights(),h=sheet.offsetHeight;
            const cands=sheetMode==='detail'
                ?[['back',heights.peek],['half',heights.half],['full',heights.full]]
                :[['peek',heights.peek],['half',heights.half],['full',heights.full]];
            cands.sort((a,b)=>Math.abs(h-a[1])-Math.abs(h-b[1]));
            const best=cands[0][0];
            if(sheetMode==='detail'&&best==='back')closeFacilityInfo();   // drag down in detail = back to list
            else setSheetSnap(best);
            haptic(10);
        },{passive:true});
    }

    function handleViewportResize(){
        checkMobile();
        if(isMobile){
            setupBottomSheetHandle();
            setSheetContent(sheetMode);
            setSheetSnap(sheetSnap==='closed'?'peek':sheetSnap,false);
        }else{
            const sheet=document.getElementById('detail-sheet');if(sheet)sheet.style.height='';
        }
        if(map)map.invalidateSize();
    }

    function setupOfflineDetection(){const t=document.getElementById('offline-toast');window.addEventListener('offline',()=>{isOnline=false;t.classList.add('active')});window.addEventListener('online',()=>{isOnline=true;t.classList.remove('active');onViewChange()})}
    function setupKeyboardShortcuts(){document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('input,select,textarea')){e.preventDefault();document.getElementById('name-search')?.focus()}if(e.key==='Escape'&&openFacilityId)closeFacilityInfo()})}

    window.addEventListener('load',()=>{
        checkMobile();
        const debouncedResize=debounce(handleViewportResize,150);
        window.addEventListener('resize',debouncedResize);
        window.addEventListener('orientationchange',()=>{setTimeout(handleViewportResize,250)});
        const u=getUrlState();
        const saved=u.theme||(function(){try{return localStorage.getItem('theme')}catch(e){return null}})()||'light';
        currentTheme=saved;
        document.documentElement.setAttribute('data-theme',currentTheme);
        if(currentTheme==='dark'){
            const b=document.getElementById('theme-toggle-btn');
            b.classList.add('active');b.setAttribute('aria-checked','true');
            b.querySelector('.toggle-slider i').className='fas fa-moon';
            document.querySelector('meta[name="theme-color"]').content='#1A1F36';
        }
        initMap();
        setupOfflineDetection();
        setupKeyboardShortcuts();
        if(isMobile){setupBottomSheetHandle();setSheetContent('home');renderSheetList();requestAnimationFrame(()=>setSheetSnap('peek',false))}
    });

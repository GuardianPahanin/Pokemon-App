/* Doubles Team Builder — uses globals from index.html: TYPES, COL, CHART, eff, badge */
(function(){
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toID = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
let G = null, M = null; // active game data, meta data
const DS = {}; // dataset key -> game data
const dsKey = t => (t.format==="champ"||t.format==="svi") ? "main" : t.format;
const isEra = t => /^g\d$/.test(t.format);
const genOf = t => isEra(t) ? +t.format.slice(1) : 9;
const DEXMAX = {1:151,2:251,3:386,4:493,5:649,6:721,7:809,8:905,9:1025};
const dexLbl = g => g===1 ? "Gen 1 only" : `Gen 1–${g}`;
const EMPTY_META = {usage:[], sets:{}, teams:[]};
let curGen = 9;
function use(t){ const k = dsKey(t); if (G !== DS[k]){ G = DS[k]; for (const x in moveIdx) delete moveIdx[x]; G.moves.forEach((x,i) => moveIdx[toID(x[0])] = i); } curGen = genOf(t); }
const TY = () => curGen >= 6 ? TYPES : TYPES.filter(x => x !== "Fairy");
function ef(a, d){ if (curGen <= 5 && d === "Steel" && (a === "Ghost" || a === "Dark")) return 0.5; return eff(a, d); }
const fmtLabel = t => (t.format==="champ" ? "Champions M-C" : t.format==="svi" ? "SV Reg I" : `Gen ${genOf(t)} rules`) + (t.dex && !isEra(t) ? ` · ${dexLbl(t.dex)} dex` : "");
function ensureData(t){
  const k = dsKey(t); if (DS[k]) return Promise.resolve();
  return fetch(k==="main" ? "data/game.json" : `data/gen${k.slice(1)}.json`).then(r => r.json()).then(g => { DS[k] = g; });
}
const STORE = "doubles-teams-v1";
let teams = [], curTeam = null, curSlot = -1;
const root = () => $("#teamMode");

/* ---------- storage ---------- */
function load(){ try{ teams = JSON.parse(localStorage.getItem(STORE)) || []; }catch(e){ teams = []; } }
function save(){ try{ localStorage.setItem(STORE, JSON.stringify(teams)); }catch(e){} }
const uid = () => Math.random().toString(36).slice(2,10);

/* ---------- data helpers ---------- */
const S = id => G.species[id];
const mv = i => { const m = G.moves[i]; return {i, n:m[0], t:m[1], c:m[2], bp:m[3], acc:m[4], pri:m[5], spread:m[6], d:m[7], bad:m[9]}; };
const moveIdx = {}; // name id -> index
const fmt = t => G.formats[t.format];
const meta = t => (M && M[t.format]) || EMPTY_META;
const sprite = id => `sprites/${(G.species[id]||{}).sp||0}.png`;
function effSpecies(mon){ // mega form if holding its stone
  const it = mon.item && G.items[mon.item];
  if (it && it.m && it.m[mon.s]) return it.m[mon.s];
  return mon.s;
}
const typesOf = mon => S(effSpecies(mon)).t;
const setOf = (t, id) => meta(t).sets[id];
const usageOf = (t, id) => { const u = meta(t).usage.find(x => x[0]===id); return u ? u[1] : 0; };
const tmPct = (t, a, b) => { const s = setOf(t, a); if(!s) return 0; const x = s.tm.find(y => y[0]===b); return x ? x[1] : 0; };
const learnable = (t, id) => fmt(t).learn[id] || [];
const inDex = (t, id) => !t.dex || isEra(t) || S(id).nm <= DEXMAX[t.dex];
const legalSpecies = t => Object.keys(fmt(t).learn).filter(id => inDex(t, id));
const itemLegal = (t, id) => fmt(t).items.includes(id);
function megaStoneFor(t, sid){ return fmt(t).items.filter(i => G.items[i].m && G.items[i].m[sid]); }

const STAPLE = {
  fakeout:"Fake Out", tailwind:"Speed control", trickroom:"Speed control", icywind:"Speed control", electroweb:"Speed control",
  followme:"Redirection", ragepowder:"Redirection", helpinghand:"Support", wideguard:"Support", spore:"Sleep", partingshot:"Pivot",
  snarl:"Support", willowisp:"Support", protect:"Protect", detect:"Protect", spikyshield:"Protect", quickguard:"Support",
  encore:"Support", taunt:"Support", reflect:"Screens", lightscreen:"Screens", thunderwave:"Speed control", allyswitch:"Support"
};

/* ---------- suggestions ---------- */
function teamCtx(t, exceptSlot){ const used = new Set(), mons = t.mons.filter((m,i)=>m && i!==exceptSlot); mons.forEach(m => m.item && used.add(m.item)); return {used, mega: mons.some(m => effSpecies(m)!==m.s), noMega: noMegas()}; }
function suggestSet(t, sid, ctx){
  ctx = ctx || {used:new Set(), mega:false};
  const okItem = i => itemLegal(t, i) && !ctx.used.has(i) && !((ctx.mega || ctx.noMega) && G.items[i].m);
  const set = setOf(t, sid), sp = S(sid), L = learnable(t, sid);
  let ability = GOOD_ABIL.find(x => sp.a.includes(x)) || sp.a[0], item = "", moves = [];
  if (set){
    if (set.a.length) ability = set.a[0][0];
    const it = set.i.find(x => okItem(x[0])); if (it) item = it[0];
    moves = set.m.filter(x => L.includes(x[0])).slice(0,4).map(x => x[0]);
  }
  if (moves.length < 4) for (const r of heuristicMoves(t, sid)) { if (moves.length>=4) break; if (!moves.includes(r.i)) moves.push(r.i); }
  if (!item){ item = itemIdeas(t, sid, moves).find(x => okItem(x.k))?.k || ""; }
  return {ability, item, moves};
}
function heuristicMoves(t, sid){ // for any Pokémon: strongest STAB, coverage, Protect, doubles staples
  const sp = S(sid), L = learnable(t, sid).map(mv);
  const physical = sp.s[1] >= sp.s[3];
  const score = m => {
    if (m.c === "X"){ const tag = STAPLE[toID(m.n)]; return tag ? (tag==="Protect" ? 90 : 60) : -1; }
    let s = m.bp * (m.acc ? m.acc/100 : 1);
    if (sp.t.includes(m.t)) s *= 1.5;
    if ((m.c === "P") !== physical) s *= 0.6;
    if (m.spread === 1) s *= 1.2; else if (m.spread === 2) s *= 0.7; // hits your partner too
    if (/recoil/i.test(m.d)) s *= 0.9;
    if (m.t === "Normal" && !sp.t.includes("Normal")) s *= 0.75;
    if (m.bad) return -1;
    return s;
  };
  const scored = L.map(m => ({...m, sc:score(m)})).filter(m => m.sc > 0).sort((a,b)=>b.sc-a.sc);
  const out = [], typesUsed = new Set();
  const prot = scored.find(m => STAPLE[toID(m.n)]==="Protect");
  for (const m of scored){ if (m.c==="X") continue; if (typesUsed.has(m.t)) continue; out.push({...m, why: sp.t.includes(m.t) ? "STAB" : "Coverage"}); typesUsed.add(m.t); if (out.length>=2) break; }
  if (prot) out.push({...prot, why:"Protect"});
  for (const m of scored){ if (m.c!=="X"||out.find(o=>o.i===m.i)) continue; out.push({...m, why: STAPLE[toID(m.n)]}); if (out.length>=6) break; }
  for (const m of scored){ if (out.length>=8) break; if (!out.find(o=>o.i===m.i)) out.push({...m, why: m.c==="X" ? STAPLE[toID(m.n)] : (sp.t.includes(m.t) ? "STAB" : "Coverage")}); }
  return out;
}
const GOOD_ABIL = ["Intimidate","Drizzle","Drought","Sand Stream","Snow Warning","Orichalcum Pulse","Hadron Engine","Psychic Surge","Grassy Surge","Electric Surge","Misty Surge","Armor Tail","Good as Gold","Unseen Fist","Prankster","Friend Guard","Regenerator","Inner Focus","Sword of Ruin","Beads of Ruin","Vessel of Ruin","Tablets of Ruin","Protosynthesis","Quark Drive","Commander","Unaware","Supersweet Syrup","Tera Shift","Toxic Chain","Poison Puppeteer","Hospitality","Embody Aspect (Cornerstone)","Embody Aspect (Hearthflame)","Embody Aspect (Wellspring)","Mind's Eye","Sharpness","Opportunist","Defiant","Competitive","Mold Breaker","Adaptability","Moody","As One (Glastrier)","As One (Spectrier)","Stamina","Rough Skin","Swift Swim","Chlorophyll","Sand Rush","Slush Rush","Levitate","Multiscale","Lightning Rod","Storm Drain","Water Absorb","Sap Sipper","Flash Fire"];
const COMMON_ITEMS = ["sitrusberry","focussash","lifeorb","leftovers","choicescarf","choicespecs","choiceband","assaultvest","rockyhelmet","safetygoggles","covertcloak","clearamulet","boosterenergy","mysticwater","whiteherb","mentalherb","lumberry","ejectbutton"];
function itemIdeas(t, sid, moves){ // ordered item ideas with reasons, for any Pokémon/format
  const sp = S(sid), ms = (moves||[]).map(mv), atk = ms.filter(m => m.c !== "X"), status = ms.length - atk.length;
  const physical = sp.s[1] >= sp.s[3], fast = sp.s[5] >= 95, bulky = sp.s[0] + sp.s[2] + sp.s[4] >= 300;
  const types = {}; atk.forEach(m => types[m.t] = (types[m.t]||0) + (sp.t.includes(m.t) ? 2 : 1));
  const mainType = Object.entries(types).sort((a,b)=>b[1]-a[1])[0]?.[0] || sp.t[0];
  const boost = Object.keys(G.items).find(k => new RegExp(`^Holder's ${mainType}-type attacks have 1\\.2x`).test(G.items[k].d) && !/Plate/.test(G.items[k].n));
  const out = [], add = (k, why) => { if (G.items[k] && itemLegal(t, k) && !out.find(o=>o.k===k)) out.push({k, why}); };
  if (bulky || status >= 2) { add("sitrusberry","Bulky / support"); add("leftovers","Bulky / support"); }
  if (atk.length >= 3) { add("lifeorb","Attacker"); if (boost) add(boost, `Boosts ${mainType} moves`); if (!ms.some(m => STAPLE[toID(m.n)]==="Protect")) add(physical ? "choiceband" : "choicespecs","All-out attacker"); }
  if (!bulky) add("focussash","Frail — survive one hit");
  if (fast && atk.length >= 3) add("choicescarf","Outspeed threats");
  add("sitrusberry","Safe default"); add("lumberry","Status protection"); add("safetygoggles","Blocks spore/powder & weather");
  add("covertcloak","Blocks flinch & side effects"); add("assaultvest","Special bulk"); add("rockyhelmet","Punish contact");
  if (boost) add(boost, `Boosts ${mainType} moves`); add("whiteherb","Resets stat drops"); add("mentalherb","Blocks Taunt/Encore"); add("shellbell","Recover HP when attacking"); add("leftovers","Passive recovery");
  return out;
}
function teamFeatures(t){
  const mons = t.mons.filter(Boolean), f = {fake:0, speed:0, redirect:0, intim:0, protect:0, spread:0, trick:0, tail:0};
  for (const m of mons){
    const ids = m.moves.map(i => toID(G.moves[i][0]));
    if (ids.includes("fakeout")) f.fake++;
    if (ids.some(x => STAPLE[x]==="Speed control")) f.speed++;
    if (ids.includes("trickroom")) f.trick++;
    if (ids.includes("tailwind")) f.tail++;
    if (ids.some(x => STAPLE[x]==="Redirection")) f.redirect++;
    if (ids.some(x => STAPLE[x]==="Protect")) f.protect++;
    if (m.moves.some(i => G.moves[i][6] && G.moves[i][2]!=="X")) f.spread++;
    if (m.ability === "Intimidate") f.intim++;
  }
  return f;
}
function defenseTable(t){
  const mons = t.mons.filter(Boolean);
  return TY().map(a => {
    let weak=0, res=0, imm=0;
    for (const m of mons){ const x = typesOf(m).reduce((p,d)=>p*ef(a,d),1); if (x===0) imm++; else if (x>1) weak++; else if (x<1) res++; }
    return {type:a, weak, res, imm};
  });
}
/* Partner filters — add new ones to this list */
const FILTERS = [
  {id:"nolegend", label:"No legendaries", keep: id => !S(id).lg},
  {id:"nomega", label:"No Megas", keep: (id, t) => { const st = setOf(t, id); return !(st && st.i[0] && (G.items[st.i[0][0]]||{}).m); }},
  {id:"noub", label:"No Ultra Beasts", keep: id => !S(id).ub},
];
const noMegas = () => activeFilters.includes("nomega");
let activeFilters = (() => { try { return JSON.parse(localStorage.getItem("partner-filters")) || []; } catch(e){ return []; } // If the Teams tab is already showing when this script loads (restored on startup), draw it now
if (teamVisible()) window.openTeams();
if (battleVisible()) window.openBattle();
// Redraw when the app returns from the background (phones can restore an empty view)
window.addEventListener("pageshow", e => { if (teamVisible() && (e.persisted || !root().innerHTML.trim())) window.openTeams(); if (battleVisible() && (e.persisted || !broot().innerHTML.trim())) window.openBattle(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") return; if (teamVisible() && !root().innerHTML.trim()) window.openTeams(); if (battleVisible() && !broot().innerHTML.trim()) window.openBattle(); });
})();
const saveFilters = () => { try { localStorage.setItem("partner-filters", JSON.stringify(activeFilters)); } catch(e){} };
const passesFilters = (id, t) => FILTERS.every(f => !activeFilters.includes(f.id) || f.keep(id, t));
function partnerSuggestions(t, limit=10){
  const mons = t.mons.filter(Boolean); const have = new Set(mons.map(m => S(m.s).nm));
  const restrictedCount = mons.filter(m => S(m.s).r).length;
  const def = defenseTable(t), feats = teamFeatures(t);
  const pool = new Set(meta(t).usage.map(u=>u[0]).filter(id => inDex(t,id)));
  for (const m of mons){ const s = setOf(t, m.s); if (s) s.tm.forEach(x => inDex(t,x[0]) && pool.add(x[0])); }
  const metaPool = pool.size >= 12;
  if ([...pool].filter(id => passesFilters(id, t)).length < 12) legalSpecies(t).forEach(id => { if (!S(id).nfe) pool.add(id); });
  const out = [];
  for (const c of pool){
    if (!fmt(t).learn[c] || have.has(S(c).nm) || !inDex(t,c) || !passesFilters(c, t)) continue;
    if (S(c).r && restrictedCount >= fmt(t).maxRestricted) continue;
    let score = 0; const why = [];
    let pair = 0, best = null;
    for (const m of mons){ const p = (tmPct(t, m.s, c) + tmPct(t, c, m.s)) / (tmPct(t,m.s,c)&&tmPct(t,c,m.s)?2:1); if (p > pair){ pair = p; best = m.s; } score += p; }
    if (best && pair >= 10) why.push(`Paired with ${S(best).n} on ${Math.round(pair)}% of teams`);
    const u = usageOf(t, c); score += u * 0.6; if (!mons.length && u) why.push(`${u.toFixed(1)}% usage`);
    if (S(c).a.every(a => ["Truant","Slow Start","Defeatist","Klutz","Stall"].includes(a))){ score -= 40; }
    if (!u){ const bst = S(c).s.reduce((a,b)=>a+b,0); score += (bst - 420) / 6; if (!mons.length || (bst >= 580 && !why.length)) why.push(`Base stat total ${bst}`); if (S(c).r && isEra(t)){ score -= 60; why.push("Legendary — often banned in-game"); } }
    const set = setOf(t, c); const cm = set ? set.m.filter(x=>x[1]>=15).map(x=>toID(G.moves[x[0]][0])) : heuristicMoves(t,c).map(m=>toID(m.n));
    const ct = S(effSpecies({s:c, item: suggestSet(t,c,teamCtx(t)).item})).t;
    let cover = [];
    if (mons.length) for (const d of def){
      if (d.weak - d.res - d.imm >= 2){ const x = ct.reduce((p,k)=>p*ef(d.type,k),1); if (x<1){ score += 7; cover.push(d.type); } else if (x>1) score -= 6; }
    }
    if (cover.length) why.push(`Covers your ${cover.join("/")} weakness`);
    if (mons.length){
      if (!feats.fake && cm.includes("fakeout")){ score += 8; why.push("Adds Fake Out"); }
      if (!feats.speed && cm.some(x => STAPLE[x]==="Speed control")){ score += 8; why.push("Adds speed control"); }
      if (!feats.redirect && cm.some(x => STAPLE[x]==="Redirection")){ score += 5; why.push("Adds redirection"); }
      if (!feats.intim && ((set && set.a[0] && set.a[0][0]==="Intimidate") || (!set && S(c).a.includes("Intimidate")))){ score += 6; why.push("Adds Intimidate"); }
    }
    out.push({id:c, score, why});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0, limit);
}
function sampleTeams(t){
  const mine = new Set(t.mons.filter(Boolean).map(m=>m.s));
  return meta(t).teams.map(tm => ({tm, overlap: tm.filter(x=>mine.has(x.s)).length}))
    .filter(x => !mine.size || x.overlap>0).sort((a,b)=>b.overlap-a.overlap).slice(0,8);
}
function makeMon(t, sid, item, slot, base){ const ctx = teamCtx(t, slot); if (base) ctx.noMega = true; const s = suggestSet(t, sid, ctx); if (item && (ctx.used.has(item) || ((ctx.mega || ctx.noMega) && G.items[item].m))) item = ""; return {s:sid, sp:S(sid).sp, ability:s.ability, item: item || s.item, moves:s.moves}; }
function nonMegaItem(t, mon, slot, reserve){ // best non-stone item for a Pokémon dropping its Mega Stone
  const ctx = teamCtx(t, slot); ctx.noMega = true; if (reserve) ctx.used.add(reserve);
  const set = setOf(t, mon.s); const ok = i => itemLegal(t, i) && !ctx.used.has(i) && !G.items[i].m;
  const it = set && set.i.find(x => ok(x[0])); if (it) return it[0];
  const idea = itemIdeas(t, mon.s, mon.moves).find(x => ok(x.k)); return idea ? idea.k : "";
}
function monFromKey(t, key, slot){ const [sid, stone] = key.split("|"); return stone ? makeMon(t, sid, stone, slot) : makeMon(t, sid, null, slot, true); }
function addToTeam(t, sid, item){ const i = t.mons.findIndex(x=>!x); if (i<0) return false; t.mons[i] = makeMon(t, sid, item); save(); return true; }
function autoFill(t){ while (t.mons.some(x=>!x)){ const p = partnerSuggestions(t,1)[0]; if (!p) break; addToTeam(t, p.id); } }

/* ---------- export / import ---------- */
function exportText(t){
  return t.mons.filter(Boolean).map(m => {
    const it = m.item ? ` @ ${G.items[m.item].n}` : "";
    return `${S(m.s).n}${it}\nAbility: ${m.ability}\nLevel: 50\n${m.moves.map(i=>"- "+G.moves[i][0]).join("\n")}`;
  }).join("\n\n");
}
function importText(t, txt){
  const blocks = txt.trim().split(/\n\s*\n/); const mons = [];
  const itemByName = {}; for (const [k,v] of Object.entries(G.items)) itemByName[toID(v.n)] = k;
  for (const b of blocks){
    const lines = b.split("\n").map(l=>l.trim()).filter(Boolean); if (!lines.length) continue;
    let [head, item] = lines[0].split(" @ ");
    head = head.replace(/\s*\((M|F)\)\s*$/,""); const nick = head.match(/\(([^)]+)\)\s*$/); if (nick) head = nick[1];
    const sid = toID(head); if (!fmt(t).learn[sid]) continue;
    const mon = {s:sid, ability:S(sid).a[0], item: item ? (itemByName[toID(item)]||"") : "", moves:[]};
    for (const l of lines.slice(1)){
      if (l.startsWith("Ability:")) mon.ability = l.slice(8).trim();
      else if (l.startsWith("-")){ const i = moveIdx[toID(l.slice(1))]; if (i!==undefined && mon.moves.length<4) mon.moves.push(i); }
    }
    mons.push(mon); if (mons.length===6) break;
  }
  return mons;
}

/* ---------- views ---------- */
function typeBadges(types){ return types.map(badge).join(""); }
function render(){ if (!DS.main || !M){ root().innerHTML = `<div class="card">Loading team data…</div>`; return; } if (curTeam && !DS[dsKey(curTeam)]) { openTeam(curTeam); return; } curTeam ? renderTeam() : renderList(); }

function renderList(){
  let h = `<div class="tb-head"><h2>My doubles teams</h2></div>
  <div class="tb-row"><button class="btn primary" id="tbNew">+ New team</button><button class="btn" id="tbImport">Import paste</button></div>`;
  if (!teams.length) h += `<div class="card hint">No teams yet. Tap <b>New team</b>, pick a Pokémon or two, and the coach will suggest partners, moves and items from the current meta.</div>`;
  for (const t of teams){
    h += `<button class="card tb-teamcard" data-open="${t.id}"><div class="tb-tc-top"><b>${esc(t.name)}</b><span class="fmt ${t.format}">${esc(fmtLabel(t))}</span></div>
      <div class="tb-minis">${t.mons.map(m => m ? `<img src="sprites/${m.sp || ((DS.main&&DS.main.species[m.s]||{}).sp) || 0}.png" alt="">` : `<span class="tb-empty-mini"></span>`).join("")}</div></button>`;
  }
  h += `<div class="hint" style="margin-top:16px">Teams are saved on this device. Meta suggestions come from a Pikalytics snapshot (Showdown ladder + tournament teams, ${esc(M.champ.date)}). Older-generation teams have no meta data, so their coach uses stats, typing and doubles roles. Legal Pokémon, moves and items come from Pokémon Showdown.</div>`;
  root().innerHTML = h;
  $("#tbNew").onclick = () => sheet(`<h3>New team</h3>
    <label>Team name</label><input id="ntName" value="Team ${teams.length+1}" autocomplete="off">
    <label>Today's rules (with meta coach)</label>
    <button class="btn block opt on" data-fmt="champ">VGC 2026 Reg M-C<br><small>Pokémon Champions · current</small></button>
    <button class="btn block opt" data-fmt="svi">VGC 2025 Reg I<br><small>Scarlet/Violet · 2 restricted</small></button>
    <div id="ntDex"><label>Limit to Pokémon from…</label>
    <div class="tb-chips"><button class="chip on" data-dex="0">All gens</button>${[1,2,3,4,5,6,7,8].map(g=>`<button class="chip" data-dex="${g}">${dexLbl(g)}</button>`).join("")}</div></div>
    <label>Classic generation (that game's rules)</label>
    <div class="hint">That generation's Pokédex, learnsets, items, abilities and type chart. Doubles started in Gen 3.</div>
    <div class="tb-chips">${[3,4,5,6,7,8].map(g=>`<button class="chip opt" data-fmt="g${g}">Gen ${g}<br><small>${{3:"Ruby/Sapphire/Emerald",4:"Diamond/Pearl/Plat",5:"Black/White",6:"X/Y/ORAS",7:"Sun/Moon/USUM",8:"Sword/Shield"}[g]}</small></button>`).join("")}</div>
    <div class="nt-foot"><div class="hint" id="ntSummary"></div><button class="btn primary block" id="ntCreate">Create team</button></div>`, el => {
      let dex = 0, f = "champ";
      const sync = () => {
        el.querySelectorAll("[data-fmt]").forEach(x => x.classList.toggle("on", x.dataset.fmt === f));
        el.querySelectorAll("[data-dex]").forEach(x => x.classList.toggle("on", +x.dataset.dex === dex));
        const modern = f === "champ" || f === "svi"; $("#ntDex").classList.toggle("dim", !modern);
        $("#ntSummary").textContent = "Creating: " + fmtLabel({format:f, dex: modern ? dex : 0});
      };
      el.querySelectorAll("[data-fmt]").forEach(b => b.onclick = () => { f = b.dataset.fmt; sync(); });
      el.querySelectorAll("[data-dex]").forEach(b => b.onclick = () => { dex = +b.dataset.dex; if (f !== "champ" && f !== "svi") f = "champ"; sync(); });
      $("#ntCreate").onclick = () => { const t = {id:uid(), name: ($("#ntName").value.trim() || `Team ${teams.length+1}`), format:f, mons:[null,null,null,null,null,null]};
        if (dex && (f==="champ"||f==="svi")) t.dex = dex; teams.unshift(t); save(); closeSheet(); openTeam(t); };
      sync();
    });
  $("#tbImport").onclick = () => sheet(`<h3>Import Showdown paste</h3>
    <div class="tb-chips"><button class="chip on" data-f="champ">Champions M-C</button><button class="chip" data-f="svi">SV Reg I</button>${[3,4,5,6,7,8].map(g=>`<button class="chip" data-f="g${g}">Gen ${g}</button>`).join("")}</div>
    <textarea id="tbPaste" rows="10" placeholder="Paste a team in Showdown format…"></textarea><button class="btn primary block" id="tbDoImport">Import</button>`, el => {
      let f = "champ"; el.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { f = b.dataset.f; el.querySelectorAll("[data-f]").forEach(x=>x.classList.toggle("on", x===b)); });
      $("#tbDoImport").onclick = () => { const t = {id:uid(), name:`Imported ${teams.length+1}`, format:f, mons:[]}; const txt = $("#tbPaste").value;
        ensureData(t).then(() => { use(t); const mons = importText(t, txt).map(m => ({...m, sp:S(m.s).sp}));
          if (!mons.length){ toast("Couldn't read any legal Pokémon from that paste"); return; }
          t.mons = mons.concat(Array(6-mons.length).fill(null)); teams.unshift(t); save(); closeSheet(); openTeam(t); }); };
    });
  root().querySelectorAll("[data-open]").forEach(b => b.onclick = () => openTeam(teams.find(t=>t.id===b.dataset.open)));
}

function openTeam(t){ curTeam = t; if (DS[dsKey(t)]){ render(); return; } root().innerHTML = `<div class="card">Loading ${esc(fmtLabel(t))} data…</div>`;
  ensureData(t).then(render).catch(e => { console.error(e); root().innerHTML = `<div class="card">Couldn't load that data. Check your connection.</div>`; curTeam = null; }); }
let coachTab = "partners";
let lastTeamId = null;
function renderTeam(){
  const t = curTeam, mons = t.mons; use(t);
  if (lastTeamId !== t.id){ lastTeamId = t.id; coachTab = "partners"; }
  let h = `<div class="tb-head"><button class="btn small" id="tbBack">‹ Teams</button>
    <input class="tb-name" id="tbName" value="${esc(t.name)}"><button class="btn small" id="tbMenu">⋯</button></div>
    <div class="hint" style="margin:0 0 8px">${esc(fmt(t).name)}${t.dex && !isEra(t) ? ` · only Pokémon from ${dexLbl(t.dex)}` : ""}${isEra(t) ? " · no meta data — coach uses stats, typing and roles" : ""}</div><div class="tb-slots">`;
  mons.forEach((m,i) => {
    if (!m) { h += `<button class="tb-slot empty" data-slot="${i}"><span>+</span><small>Add Pokémon</small></button>`; return; }
    const es = effSpecies(m);
    h += `<button class="tb-slot" data-slot="${i}">${es!==m.s?'<span class="mega-badge">Mega</span>':""}<img src="${sprite(es)}" alt=""><b>${esc(S(es).n)}</b><div>${typeBadges(S(es).t)}</div><small>${m.item?esc(G.items[m.item].n):"No item"}</small></button>`;
  });
  h += `</div>`;
  if (mons.some(x=>!x)) h += `<button class="btn block" id="tbAuto">✨ Auto-fill empty slots from the meta</button>`;
  h += `<div class="tb-tabs">${[["partners","Partners"],["teams","Meta teams"],["analysis","Analysis"]].map(([k,l])=>`<button data-ct="${k}" class="${coachTab===k?"on":""}">${l}</button>`).join("")}</div><div id="tbCoach"></div>`;
  root().innerHTML = h;
  $("#tbBack").onclick = () => { curTeam = null; render(); };
  $("#tbName").onchange = e => { t.name = e.target.value || t.name; save(); };
  $("#tbMenu").onclick = () => sheet(`<h3>${esc(t.name)}</h3>
    <button class="btn block" id="tbExport">Export Showdown paste</button>
    ${isEra(t) ? "" : `<label>Limit to Pokémon from…</label><div class="tb-chips">${[0,1,2,3,4,5,6,7,8].map(g=>`<button class="chip ${(t.dex||0)===g?"on":""}" data-setdex="${g}">${g?dexLbl(g):"All gens"}</button>`).join("")}</div>`}
    <button class="btn block" id="tbDup">Duplicate team</button>
    <button class="btn block danger" id="tbDel">Delete team</button>`, () => {
      $("#tbExport").onclick = () => sheet(`<h3>Showdown paste</h3><textarea rows="14" readonly id="tbOut">${esc(exportText(t))}</textarea><button class="btn primary block" id="tbCopy">Copy</button>`, () => {
        $("#tbCopy").onclick = () => { const txt = $("#tbOut").value; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(()=>toast("Copied"), ()=>{ $("#tbOut").select(); toast("Select all and copy"); }); };
      });
      document.querySelectorAll("[data-setdex]").forEach(b => b.onclick = () => { const g = +b.dataset.setdex; if (g) t.dex = g; else delete t.dex; save(); closeSheet(); render();
        const out = t.mons.filter(m => m && !inDex(t, m.s)); if (out.length) toast(`${out.map(m=>S(m.s).n).join(", ")} ${out.length>1?"are":"is"} outside that limit`); });
      $("#tbDup").onclick = () => { const c = JSON.parse(JSON.stringify(t)); c.id = uid(); c.name += " (copy)"; teams.unshift(c); save(); closeSheet(); curTeam = c; render(); };
      $("#tbDel").onclick = () => { $("#tbDel").outerHTML = `<button class="btn block danger" id="tbDel2">Tap again to delete</button>`; $("#tbDel2").onclick = () => { teams = teams.filter(x=>x!==t); save(); closeSheet(); curTeam = null; render(); }; };
    });
  root().querySelectorAll("[data-slot]").forEach(b => b.onclick = () => { curSlot = +b.dataset.slot; mons[curSlot] ? slotEditor() : speciesPicker(key => { mons[curSlot] = monFromKey(t, key, curSlot); save(); render(); slotEditor(); }); });
  const auto = $("#tbAuto"); if (auto) auto.onclick = () => { autoFill(t); render(); toast(activeFilters.length ? "Filled using your partner filters" : "Filled with the best-scoring partners"); };
  root().querySelectorAll("[data-ct]").forEach(b => b.onclick = () => { coachTab = b.dataset.ct; renderTeam(); });
  renderCoach();
}

function renderCoach(){
  const t = curTeam, el = $("#tbCoach"), mons = t.mons.filter(Boolean);
  if (coachTab === "partners"){
    const full = mons.length >= 6;
    const ps = partnerSuggestions(t, 10);
    let h = `<div class="tb-filters"><span class="hint">Filter:</span>${FILTERS.map(f => `<button class="chip ${activeFilters.includes(f.id)?"on":""}" data-filter="${f.id}">${activeFilters.includes(f.id)?"✓ ":""}${esc(f.label)}</button>`).join("")}</div>`;
    h += `<div class="hint">${mons.length ? "Best partners for your current team — based on how often they're paired in the meta, what they cover, and what roles you're missing." : "Start with a top meta pick, or add any Pokémon you like."}</div>`;
    h += ps.map(p => { const it = suggestSet(t, p.id, teamCtx(t)).item; const shown = effSpecies({s:p.id, item:it});
      return `<div class="tb-sugg"><img src="${sprite(shown)}" alt=""><div class="tb-sugg-body"><b>${esc(S(shown).n)}</b> ${typeBadges(S(shown).t)}<div class="hint">${p.why.slice(0,3).map(esc).join(" · ") || "Solid meta pick"}</div></div>${full?"":`<button class="btn small primary" data-add="${p.id}">Add</button>`}</div>`; }).join("");
    if (!ps.length) h += `<div class="hint">No suggestions match these filters.</div>`;
    el.innerHTML = h;
    el.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { const id = b.dataset.filter; activeFilters = activeFilters.includes(id) ? activeFilters.filter(x=>x!==id) : activeFilters.concat(id); saveFilters(); renderCoach(); });
    el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => { addToTeam(t, b.dataset.add); render(); toast(`Added ${S(b.dataset.add).n} with its most common set`); });
  } else if (coachTab === "teams"){
    const st = sampleTeams(t);
    if (!st.length){ el.innerHTML = `<div class="hint">${meta(t).teams.length ? "No featured tournament teams include your Pokémon yet — try Auto-fill, which builds from teammate data." : "No tournament team lists are in the snapshot for this format. Use Auto-fill or the Partners tab, which are built from teammate data."}</div>`; return; }
    el.innerHTML = `<div class="hint">Recent tournament teams ${mons.length?"that share Pokémon with yours":"from the meta"}. "Use" fills your empty slots with the rest.</div>` +
      st.map((x,k) => `<div class="tb-sugg"><div class="tb-minis">${x.tm.map(m => `<img title="${esc(S(m.s).n)}" src="${sprite(m.i&&G.items[m.i].m?G.items[m.i].m[m.s]:m.s)}" alt="">`).join("")}</div><button class="btn small primary" data-use="${k}">Use</button></div>`).join("");
    el.querySelectorAll("[data-use]").forEach(b => b.onclick = () => {
      const tm = st[+b.dataset.use].tm; const have = new Set(mons.map(m=>S(m.s).nm)); let n = 0;
      for (const m of tm){ if (have.has(S(m.s).nm)) continue; if (addToTeam(t, m.s, m.i)) n++; }
      render(); toast(n ? `Added ${n} Pokémon` : "Team is full");
    });
  } else {
    if (!mons.length){ el.innerHTML = `<div class="hint">Add Pokémon to see the analysis.</div>`; return; }
    const def = defenseTable(t), f = teamFeatures(t);
    const warn = [];
    const items = mons.map(m=>m.item).filter(Boolean); const dupe = items.filter((x,i)=>items.indexOf(x)!==i);
    if (dupe.length) warn.push(["bad", `Item Clause: ${[...new Set(dupe)].map(i=>G.items[i].n).join(", ")} used twice (not allowed)`]);
    const outDex = mons.filter(m => !inDex(t, m.s)); if (outDex.length) warn.push(["bad", `${outDex.map(m=>S(m.s).n).join(", ")} ${outDex.length>1?"are":"is"} outside your ${dexLbl(t.dex)} limit`]);
    const nums = mons.map(m=>S(m.s).nm); if (new Set(nums).size !== nums.length) warn.push(["bad","Species Clause: two of the same Pokémon"]);
    const rc = mons.filter(m=>S(m.s).r).length; if (isEra(t) && rc) warn.push(["info", `${rc} legendary/mythical — usually banned from in-game Battle Facility doubles`]);
    if (!isEra(t) && rc > fmt(t).maxRestricted) warn.push(["bad", `${rc} restricted legendaries (max ${fmt(t).maxRestricted})`]);
    const megas = mons.filter(m => effSpecies(m)!==m.s).length; if (megas > 1) warn.push(["info", `${megas} Mega Stones — only one Pokémon can Mega Evolve per battle`]);
    const check = (ok, good, bad) => warn.push([ok?"ok":"warn", ok?good:bad]);
    check(f.fake, `Fake Out ×${f.fake}`, "No Fake Out — it's the most common way to open in doubles");
    check(f.speed, `Speed control ×${f.speed}${f.tail?" (Tailwind)":""}${f.trick?" (Trick Room)":""}`, "No speed control (Tailwind, Trick Room, Icy Wind, Electroweb…)");
    check(f.intim || f.redirect, `${f.intim?`Intimidate ×${f.intim}`:""}${f.intim&&f.redirect?" · ":""}${f.redirect?`Redirection ×${f.redirect}`:""}`, "No Intimidate or redirection (Follow Me / Rage Powder) to protect partners");
    check(f.protect >= Math.min(4, mons.length), `Protect on ${f.protect}/${mons.length}`, `Only ${f.protect}/${mons.length} have Protect/Detect — most doubles mons run it`);
    check(f.spread, `Spread moves on ${f.spread}`, "No spread moves (Heat Wave, Rock Slide, Earthquake, Hyper Voice…)");
    const noMoves = mons.filter(m=>m.moves.length<4); if (noMoves.length) warn.push(["warn", `${noMoves.map(m=>S(m.s).n).join(", ")} ${noMoves.length>1?"have":"has"} fewer than 4 moves`]);
    let h = `<div class="tb-checks">${warn.map(([k,txt])=>`<div class="ck ${k}">${{ok:"✓",warn:"!",bad:"✕",info:"i"}[k]} ${esc(txt)}</div>`).join("")}</div>`;
    h += `<h4>Team weaknesses</h4><div class="tb-def">${def.map(d => {
      const net = d.weak - d.res - d.imm; const cls = d.weak>=3 && net>=2 ? "hot" : net>=2 ? "warm" : net<=-2 ? "cool" : "";
      return `<div class="tb-def-cell ${cls}"><span class="badge" style="background:${COL[d.type]}">${d.type}</span><span>${d.weak?`<b>${d.weak}</b> weak`:""}${d.weak&&(d.res+d.imm)?" · ":""}${d.res+d.imm?`${d.res+d.imm} resist`:""}${!d.weak&&!(d.res+d.imm)?"—":""}</span></div>`; }).join("")}</div>`;
    const atk = new Set(); mons.forEach(m => m.moves.forEach(i => { const x = G.moves[i]; if (x[2]!=="X" && x[3]>0) atk.add(x[1]); }));
    const hits = TY().filter(d => [...atk].some(a => ef(a,d) > 1)), miss = TY().filter(d => !hits.includes(d));
    h += `<h4>Super-effective coverage</h4><div class="hint">Your attacks hit ${hits.length}/${TY().length} types super-effectively.</div>${miss.length?`<div class="hint">Nothing super-effective vs: ${miss.map(badge).join("")}</div>`:""}`;
    el.innerHTML = h;
  }
}

/* ---------- slot editor ---------- */
function slotEditor(){
  const t = curTeam, m = t.mons[curSlot]; const sp = S(m.s), es = effSpecies(m), set = setOf(t, m.s);
  const pct = (arr, k) => { const x = arr && arr.find(y=>y[0]===k); return x ? `<span class="pct">${Math.round(x[1])}%</span>` : ""; };
  let h = `<div class="tb-ed-top"><img src="${sprite(es)}" alt=""><div><h3>${esc(S(es).n)}</h3>${typeBadges(S(es).t)}<div class="hint">${set?`${usageOf(t,m.s).toFixed(1)}% usage in this format`:"Not in the meta snapshot — suggestions use STAB, coverage and doubles staples"}</div></div></div>
    <div class="tb-row"><button class="btn" id="edChange">Change Pokémon</button><button class="btn primary" id="edMeta">${set?"Apply meta set":"Apply suggested set"}</button></div>`;
  const stones = megaStoneFor(t, m.s);
  if (stones.length){
    const lbl = st => { const f = S(G.items[st].m[m.s]).n.replace(S(m.s).n, "").replace(/^-/,""); return f.replace(/-/g," ") || "Mega"; };
    h += `<label>Mega Evolution</label><div class="tb-chips"><button class="chip ${es===m.s?"on":""}" data-mega="">Off</button>${stones.map(st => `<button class="chip ${m.item===st?"on":""}" data-mega="${st}">${esc(lbl(st))}</button>`).join("")}</div><div id="megaWarn"></div>`;
  }
  if (es !== m.s) h += `<div class="hint">Mega Evolves into ${esc(S(es).n)} (holding ${esc(G.items[m.item].n)}) — ability ${esc(S(es).a[0])}. Weaknesses use the Mega's typing.</div>`;
  h += `<label>Ability</label><div class="tb-chips">${sp.a.map(a => `<button class="chip ${m.ability===a?"on":""}" data-ab="${esc(a)}">${esc(a)} ${pct(set&&set.a,a)}</button>`).join("")}</div>`;
  if (G.abilities[m.ability]) h += `<div class="hint">${esc(G.abilities[m.ability])}</div>`;
  h += `<label>Item</label><button class="btn block left" id="edItem">${m.item?`<b>${esc(G.items[m.item].n)}</b> ${pct(set&&set.i,m.item)}<br><small>${esc(G.items[m.item].d)}</small>`:"Choose item…"}</button>`;
  h += `<label>Moves</label>`;
  for (let k=0;k<4;k++){ const i = m.moves[k];
    h += i!==undefined ? (() => { const x = mv(i); return `<button class="btn block left tb-move" data-mv="${k}"><span class="badge" style="background:${COL[x.t]}">${x.t}</span> <b>${esc(x.n)}</b> ${pct(set&&set.m,i)}<br><small>${x.c==="X"?"Status":x.c==="P"?"Physical":"Special"}${x.bp?` · ${x.bp} BP`:""}${x.spread===1?" · hits both foes":x.spread===2?" · hits all incl. partner":""}${x.pri?` · priority ${x.pri>0?"+":""}${x.pri}`:""}</small></button>`; })()
      : `<button class="btn block left tb-move" data-mv="${k}">+ Add move</button>`;
  }
  h += `<button class="btn block danger" id="edRemove">Remove from team</button>`;
  sheet(h, () => {
    $("#edChange").onclick = () => speciesPicker(key => { t.mons[curSlot] = monFromKey(t, key, curSlot); save(); render(); slotEditor(); });
    $("#edMeta").onclick = () => { const s = suggestSet(t, m.s, teamCtx(t, curSlot)); Object.assign(m, s); save(); render(); slotEditor(); toast("Set applied"); };
    document.querySelectorAll("[data-ab]").forEach(b => b.onclick = () => { m.ability = b.dataset.ab; save(); slotEditor(); });
    document.querySelectorAll("[data-mega]").forEach(b => b.onclick = () => {
      const st = b.dataset.mega;
      if (!st){ if (G.items[m.item] && G.items[m.item].m) { m.item = nonMegaItem(t, m, curSlot); save(); render(); slotEditor(); toast("Mega Evolution off"); } return; }
      const other = t.mons.findIndex((x,i) => x && i!==curSlot && effSpecies(x)!==x.s);
      const apply = () => { m.item = st; save(); render(); slotEditor(); toast(`${S(G.items[st].m[m.s]).n} on`); };
      if (other < 0) return apply();
      const o = t.mons[other];
      $("#megaWarn").innerHTML = `<div class="ck warn">! ${esc(S(effSpecies(o)).n)} is already your Mega — only one Pokémon can Mega Evolve per battle.
        <div class="tb-row"><button class="btn small primary" id="mwSwitch">Make this my Mega instead</button><button class="btn small" id="mwBoth">Keep both stones</button></div></div>`;
      $("#mwSwitch").onclick = () => { o.item = nonMegaItem(t, o, other, st); apply(); };
      $("#mwBoth").onclick = apply;
    });
    $("#edItem").onclick = () => itemPicker();
    document.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => movePicker(+b.dataset.mv));
    $("#edRemove").onclick = () => { t.mons[curSlot] = null; save(); closeSheet(); render(); };
  }, () => render());
}

function listPicker(title, items, onPick, opts={}){
  // items: [{key, html, search, group}]
  sheet(`<h3>${title}</h3><input class="tb-search" id="lpQ" placeholder="Search…" autocomplete="off"><div id="lpList" class="tb-list"></div>`, () => {
    const q = $("#lpQ"), list = $("#lpList");
    const draw = () => { const v = toID(q.value); let lastG = null, n = 0, h = "";
      for (const it of items){ if (v && !it.search.includes(v)) continue; if (++n > 150) break;
        if (it.group !== lastG){ h += `<div class="tb-group">${esc(it.group)}</div>`; lastG = it.group; }
        h += `<button class="tb-li" data-k="${esc(it.key)}">${it.html}</button>`; }
      list.innerHTML = h || `<div class="hint">No matches</div>`;
      list.querySelectorAll("[data-k]").forEach(b => b.onclick = () => onPick(b.dataset.k)); };
    q.oninput = draw; draw(); if (!opts.noFocus) setTimeout(()=>q.focus(), 50);
  }, opts.onClose);
}
function speciesPicker(cb){
  const t = curTeam; const have = new Set(t.mons.filter((x,i)=>x && i!==curSlot).map(m=>S(m.s).nm));
  const usage = Object.fromEntries(meta(t).usage);
  const ids = legalSpecies(t).filter(id => !have.has(S(id).nm)).sort((a,b) => (usage[b]||0)-(usage[a]||0) || S(a).n.localeCompare(S(b).n));
  const rows = [];
  for (const id of ids){
    const group = usage[id] ? "Top of the meta" : "All legal Pokémon";
    rows.push({key:id, search:toID(S(id).n), group, html:`<img src="${sprite(id)}" loading="lazy" alt=""><span class="li-main">${esc(S(id).n)}${S(id).r?' <small class="pct">R</small>':""}</span>${typeBadges(S(id).t)}${usage[id]?`<span class="pct">${usage[id].toFixed(1)}%</span>`:""}`});
    for (const st of megaStoneFor(t, id)){ const mid = G.items[st].m[id]; if (!S(mid)) continue;
      rows.push({key:`${id}|${st}`, search:toID(S(mid).n)+"mega"+toID(S(id).n), group, html:`<img src="${sprite(mid)}" loading="lazy" alt=""><span class="li-main">${esc(S(mid).n)}<br><small>holds ${esc(G.items[st].n)}</small></span>${typeBadges(S(mid).t)}`}); }
  }
  listPicker("Choose Pokémon", rows,
    sid => { closeSheet(); cb(sid); }, {onClose: () => { if (curTeam.mons[curSlot]) slotEditor(); }});
}
function itemPicker(){
  const t = curTeam, m = t.mons[curSlot], set = setOf(t, m.s);
  const metaItems = set ? set.i.filter(x=>itemLegal(t,x[0])) : [];
  const stones = megaStoneFor(t, m.s);
  const legal = fmt(t).items.filter(i => !G.items[i].m || G.items[i].m[m.s]);
  const seen = new Set(); const rows = [];
  const row = (k, group, extra="") => { if (seen.has(k)) return; seen.add(k); rows.push({key:k, group, search:toID(G.items[k].n), html:`<span class="li-main"><b>${esc(G.items[k].n)}</b>${extra}<br><small>${esc(G.items[k].d)}</small></span>`}); };
  metaItems.forEach(([k,p]) => row(k, "Meta picks", ` <span class="pct">${Math.round(p)}%</span>`));
  stones.forEach(k => row(k, "Mega Stone"));
  itemIdeas(t, m.s, m.moves).forEach(x => row(x.k, "Suggested", ` <span class="tag">${esc(x.why)}</span>`));
  legal.sort((a,b)=>G.items[a].n.localeCompare(G.items[b].n)).forEach(k => row(k, "All items"));
  rows.unshift({key:"", group:"", search:"none", html:`<span class="li-main">No item</span>`});
  listPicker(`Item for ${esc(S(m.s).n)}`, rows, k => { m.item = k; save(); render(); slotEditor(); }, {noFocus:true, onClose: () => slotEditor()});
}
function movePicker(k){
  const t = curTeam, m = t.mons[curSlot], set = setOf(t, m.s), L = learnable(t, m.s);
  const taken = new Set(m.moves.filter((x,j)=>j!==k));
  const rows = [], seen = new Set();
  const row = (i, group, extra="") => { if (seen.has(i) || taken.has(i)) return; seen.add(i); const x = mv(i);
    rows.push({key:String(i), group, search:toID(x.n)+toID(x.t), html:`<span class="badge" style="background:${COL[x.t]}">${x.t}</span><span class="li-main"><b>${esc(x.n)}</b>${extra}<br><small>${x.c==="X"?"Status":x.c==="P"?"Phys":"Spec"}${x.bp?` · ${x.bp} BP`:""}${x.acc?` · ${x.acc}%`:""}${x.spread===1?" · hits both foes":x.spread===2?" · hits all incl. partner":""} — ${esc(x.d)}</small></span>`}); };
  if (set) set.m.filter(x=>L.includes(x[0])).forEach(([i,p]) => row(i, "Meta picks", ` <span class="pct">${Math.round(p)}%</span>`));
  heuristicMoves(t, m.s).forEach(x => row(x.i, "Suggested", ` <span class="tag">${esc(x.why||"")}</span>`));
  L.map(mv).sort((a,b)=>a.n.localeCompare(b.n)).forEach(x => row(x.i, "All learnable moves"));
  if (m.moves[k] !== undefined) rows.unshift({key:"-1", group:"", search:"remove", html:`<span class="li-main">— Remove this move</span>`});
  listPicker(`Move ${k+1} for ${esc(S(m.s).n)}`, rows, key => { const i = +key; if (i<0) m.moves.splice(k,1); else { if (k < m.moves.length) m.moves[k] = i; else m.moves.push(i); } save(); render(); slotEditor(); }, {noFocus:true, onClose: () => slotEditor()});
}

/* ---------- battle helper ---------- */
const broot = () => $("#battleMode");
const BSTORE = "battle-v1";
let battle = null;
function bload(){ try { battle = JSON.parse(localStorage.getItem(BSTORE)); } catch(e){ battle = null; } }
function bsave(){ try { localStorage.setItem(BSTORE, JSON.stringify(battle)); } catch(e){} }
const bTeam = () => battle && teams.find(t => t.id === battle.teamId);

// ability effects on incoming move types
function abilityMult(ability, type){
  const g = curGen;
  switch (ability){
    case "Levitate": case "Earth Eater": return type === "Ground" ? 0 : 1;
    case "Flash Fire": case "Well-Baked Body": return type === "Fire" ? 0 : 1;
    case "Water Absorb": case "Dry Skin": return type === "Water" ? 0 : 1;
    case "Storm Drain": return type === "Water" && g >= 5 ? 0 : 1;
    case "Volt Absorb": case "Motor Drive": return type === "Electric" ? 0 : 1;
    case "Lightning Rod": return type === "Electric" && g >= 5 ? 0 : 1;
    case "Sap Sipper": return type === "Grass" ? 0 : 1;
    case "Thick Fat": return type === "Fire" || type === "Ice" ? 0.5 : 1;
    case "Heatproof": case "Water Bubble": return type === "Fire" ? 0.5 : 1;
    case "Purifying Salt": return type === "Ghost" ? 0.5 : 1;
    default: return 1;
  }
}
const abilOf = mon => { const es = effSpecies(mon); return es !== mon.s ? S(es).a[0] : (mon.ability || S(mon.s).a[0]); };
function hitMult(type, mon){
  const ab = abilOf(mon); let x = typesOf(mon).reduce((p,d) => p * ef(type, d), 1) * abilityMult(ab, type);
  if (ab === "Wonder Guard" && x <= 1) x = 0;
  return x;
}
const spe = mon => S(effSpecies(mon)).s[5];
// damaging options of an attacker vs a defender, best first
function attacks(att, def){
  const es = effSpecies(att), stab = S(es).t;
  let ms = att.moves.map(mv).filter(m => m.c !== "X" && m.bp > 0);
  const guessed = !ms.length;
  if (guessed) ms = stab.map(t => ({n:`${t} STAB`, t, c: S(es).s[1] >= S(es).s[3] ? "P" : "S", bp: 80}));
  const sa = S(es).s, sd = S(effSpecies(def)).s;
  return ms.map(m => { const mult = hitMult(m.t, def);
    const ratio = m.c === "P" ? sa[1] / sd[2] : sa[3] / sd[4];
    return {...m, mult, guessed, score: m.bp * mult * (stab.includes(m.t) ? 1.5 : 1) * ratio * (m.spread === 1 ? 0.75 : 1)}; })
    .sort((a,b) => b.score - a.score);
}
const multTxt = x => x === 0 ? "immune" : x >= 4 ? "4×" : x >= 2 ? "2×" : x <= 0.25 ? "¼×" : x < 1 ? "½×" : "1×";

function battleAdvice(t){
  const me = battle.myActive.map(i => i === null ? null : t.mons[i]).filter(m => m && !battle.fainted.includes(t.mons.indexOf(m)));
  const opp = battle.oppActive.map(i => i === null ? null : battle.opp[i]).filter(o => o && !o.fainted);
  const bench = t.mons.map((m,i) => ({m,i})).filter(x => x.m && !battle.myActive.includes(x.i) && !battle.fainted.includes(x.i) && (!battle.brought || battle.brought.includes(x.i)));
  const out = [], suggested = new Set();
  if (!opp.length){ out.push({k:"info", h:"Add the opponent's leads", b:"Tap an empty slot on their side to add what you see."}); return out; }
  for (const a of me){
    const an = S(effSpecies(a)).n;
    // threats to me
    for (const o of opp){
      const on = S(effSpecies(o)).n, atks = attacks(o, a), top = atks.filter(x => x.mult >= 2);
      if (top.length) out.push({k:"bad", h:`${an} is weak to ${on}`, b: top.slice(0,3).map(x => `${x.n} (${multTxt(x.mult)})`).join(", ") + (atks[0].guessed ? " — guessed from its typing" : "")});
    }
    // my best options
    const opts = opp.map(o => ({o, best: attacks(a, o)[0]})).filter(x => x.best);
    opts.sort((x,y) => y.best.score - x.best.score);
    if (opts.length){
      const {o, best} = opts[0];
      out.push({k: best.mult >= 2 ? "ok" : "info", h:`${an}: ${best.n} → ${S(effSpecies(o)).n}`, b:`${multTxt(best.mult)}${best.spread===1?" · hits both foes":""}${best.guessed?" · add its moves for better advice":""}${opts.length>1 ? ` · vs ${S(effSpecies(opts[1].o)).n}: ${opts[1].best.n} (${multTxt(opts[1].best.mult)})` : ""}`});
      const useless = opp.filter(o2 => attacks(a, o2).every(x => x.mult < 1));
      for (const o2 of useless) out.push({k:"warn", h:`${an} can't hit ${S(effSpecies(o2)).n} well`, b:"All its attacks are resisted or blocked."});
    }
    // switch suggestion if threatened
    const worst = Math.max(0, ...opp.map(o => Math.max(0, ...attacks(o, a).map(x => x.mult))));
    if (worst >= 2 && bench.length){
      const cands = bench.map(({m,i}) => ({m, i, w: Math.max(0, ...opp.map(o => Math.max(0, ...attacks(o, m).map(x => x.mult)))), hit: Math.max(0, ...opp.map(o => Math.max(0, ...attacks(m, o).map(x => x.mult)))) }))
        .filter(c => c.w < worst && !suggested.has(c.i)).sort((x,y) => x.w - y.w || y.hit - x.hit);
      if (cands.length){ const c = cands[0]; suggested.add(c.i);
        out.push({k:"switch", h:`Switch idea: ${an} → ${S(effSpecies(c.m)).n}`, b:`Takes at most ${multTxt(c.w)} from their moves${c.hit>=2?` and hits back super-effectively`:""}.`, sw:[t.mons.indexOf(a), c.i]}); }
    }
  }
  // speed
  const all = [...me.map(m => ({n:S(effSpecies(m)).n, s:spe(m), mine:true})), ...opp.map(o => ({n:S(effSpecies(o)).n, s:spe(o), mine:false}))].sort((x,y) => y.s - x.s);
  out.push({k:"info", h:"Speed order (base stats)", b: all.map(x => `${x.mine?"🟦":"🟥"} ${x.n} ${x.s}`).join(" › ") + " — Tailwind, Trick Room, Scarf and EVs change this"});
  // focus target
  if (me.length === 2 && opp.length === 2){
    const sc = opp.map(o => me.reduce((s,a) => s + Math.max(0, ...attacks(a, o).map(x => x.mult >= 2 ? 1 : 0)), 0));
    const f = sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : -1;
    if (f >= 0 && sc[f] >= 1) out.push({k:"ok", h:`Focus ${S(effSpecies(opp[f])).n}`, b: sc[f] === 2 ? "Both your active Pokémon hit it super-effectively." : "One of your active Pokémon hits it super-effectively."});
  }
  // opponent tricks
  for (const o of opp){
    const ids = o.moves.map(i => toID(G.moves[i][0])), on = S(effSpecies(o)).n, notes = [];
    if (ids.includes("fakeout")) notes.push("Fake Out (flinches turn 1)");
    if (ids.includes("trickroom")) notes.push("Trick Room (slow Pokémon move first)");
    if (ids.includes("tailwind")) notes.push("Tailwind (doubles their speed)");
    if (ids.some(x => x==="followme"||x==="ragepowder")) notes.push("redirection");
    if (ids.includes("spore")) notes.push("Spore");
    if (ids.includes("wideguard")) notes.push("Wide Guard (blocks spread moves)");
    if (abilOf(o) === "Intimidate") notes.push("Intimidate");
    if (notes.length) out.push({k:"warn", h:`${on} may use…`, b: notes.join(" · ")});
  }
  return out;
}

function renderBattle(){
  const el = broot(); if (!el) return;
  if (!DS.main || !M){ el.innerHTML = `<div class="card">Loading…</div>`; return; }
  load(); bload();
  const t = bTeam();
  if (!battle || !t){ return battlePickTeam(); }
  if (!DS[dsKey(t)]){ el.innerHTML = `<div class="card">Loading ${esc(fmtLabel(t))} data…</div>`; ensureData(t).then(renderBattle); return; }
  use(t);
  if (!battle.started) return battlePickLeads(t);
  const myCard = (i, side) => {
    const m = i === null || i === undefined ? null : t.mons[i];
    if (!m) return `<button class="bt-card empty" data-myslot="${side}"><span>+</span><small>Send in</small></button>`;
    const es = effSpecies(m), fainted = battle.fainted.includes(i);
    return `<button class="bt-card mine ${fainted?"fainted":""}" data-myslot="${side}"><div class="bt-top"><img src="${sprite(es)}" alt=""><div><b>${esc(S(es).n)}</b><div>${typeBadges(S(es).t)}</div></div></div>
      <small class="bt-item">${m.item?esc(G.items[m.item].n):"No item"} · ${esc(abilOf(m))}</small><div class="bt-moves">${m.moves.map(i2 => { const x = mv(i2); return `<span style="border-color:${COL[x.t]}">${esc(x.n)}</span>`; }).join("")}</div></button>`;
  };
  const oppCard = (idx, side) => {
    const o = idx === null || idx === undefined ? null : battle.opp[idx];
    if (!o) return `<button class="bt-card empty" data-oppslot="${side}"><span>+</span><small>Add their Pokémon</small></button>`;
    const es = effSpecies(o);
    return `<button class="bt-card opp ${o.fainted?"fainted":""}" data-oppslot="${side}"><div class="bt-top"><img src="${sprite(es)}" alt=""><div><b>${esc(S(es).n)}</b><div>${typeBadges(S(es).t)}</div></div></div>
      <small class="bt-item">${o.item?esc(G.items[o.item].n):"No item"}${o.seen&&o.seen.item?" ✓":" ?"} · ${esc(abilOf(o))}</small><div class="bt-moves">${o.moves.map(i2 => { const x = mv(i2); return `<span style="border-color:${COL[x.t]}" class="${(o.seen&&o.seen.moves||[]).includes(i2)?"seen":""}">${esc(x.n)}</span>`; }).join("")}</div></button>`;
  };
  const oppBench = battle.opp.map((o,i) => ({o,i})).filter(x => !battle.oppActive.includes(x.i));
  const myBench = t.mons.map((m,i) => ({m,i})).filter(x => x.m && !battle.myActive.includes(x.i) && (!battle.brought || battle.brought.includes(x.i)));
  let h = `<div class="tb-head"><h2 style="flex:1">${esc(t.name)}</h2><span class="fmt ${t.format}">${esc(fmtLabel(t))}</span></div>
    <div class="tb-row"><button class="btn small" id="btNew">New battle</button><button class="btn small" id="btRematch">Rematch (same team)</button></div>
    <div class="bt-label">Opponent</div><div class="bt-row">${oppCard(battle.oppActive[0],0)}${oppCard(battle.oppActive[1],1)}</div>
    <div class="bt-bench">${oppBench.map(({o,i}) => `<button class="bt-chip ${o.fainted?"fainted":""}" data-oppbench="${i}"><img src="${sprite(effSpecies(o))}" alt="">${esc(S(effSpecies(o)).n)}</button>`).join("")}<button class="bt-chip add" id="btSeen">+ Seen on their team</button></div>
    <div class="bt-label">You</div><div class="bt-row">${myCard(battle.myActive[0],0)}${myCard(battle.myActive[1],1)}</div>
    <div class="bt-bench">${myBench.map(({m,i}) => `<button class="bt-chip ${battle.fainted.includes(i)?"fainted":""}" data-mybench="${i}"><img src="${sprite(effSpecies(m))}" alt="">${esc(S(effSpecies(m)).n)}</button>`).join("")}</div>
    <h4>Advice</h4><div class="bt-advice">${battleAdvice(t).map(a => `<div class="ck ${a.k==="switch"?"info":a.k}"><b>${esc(a.h)}</b><br><span>${esc(a.b)}</span>${a.sw?`<div><button class="btn small primary" data-doswitch="${a.sw.join(",")}">Switch</button></div>`:""}</div>`).join("")}</div>
    <div class="hint" style="margin-top:10px">Opponent sets are assumptions (${meta(t).usage.length ? "most common meta set" : "suggested from stats and learnset"}) — tap their Pokémon to fix moves or items as they're revealed. Advice uses typing, abilities and base stats; it ignores EVs, weather, terrain and Tera.</div>`;
  el.innerHTML = h;
  $("#btNew").onclick = () => { battle = null; bsave(); renderBattle(); };
  $("#btRematch").onclick = () => { battle = {teamId:t.id, started:false, myActive:[null,null], fainted:[], opp:[], oppActive:[null,null]}; bsave(); renderBattle(); };
  $("#btSeen").onclick = () => addOpp(t, null);
  el.querySelectorAll("[data-oppslot]").forEach(b => b.onclick = () => { const side = +b.dataset.oppslot, idx = battle.oppActive[side]; idx === null || idx === undefined ? addOpp(t, side) : oppEditor(t, idx, side); });
  el.querySelectorAll("[data-oppbench]").forEach(b => b.onclick = () => oppEditor(t, +b.dataset.oppbench, null));
  el.querySelectorAll("[data-myslot]").forEach(b => b.onclick = () => mySlotSheet(t, +b.dataset.myslot));
  el.querySelectorAll("[data-mybench]").forEach(b => b.onclick = () => myBenchSheet(t, +b.dataset.mybench));
  el.querySelectorAll("[data-doswitch]").forEach(b => b.onclick = () => { const [from, to] = b.dataset.doswitch.split(",").map(Number); const side = battle.myActive.indexOf(from); if (side >= 0){ battle.myActive[side] = to; bsave(); renderBattle(); toast(`${S(effSpecies(t.mons[to])).n} switched in`); } });
}
function battlePickTeam(){
  const el = broot(); load();
  let h = `<div class="tb-head"><h2>Battle helper</h2></div><div class="hint">Pick the team you're playing with.</div>`;
  const ready = teams.filter(t => t.mons.filter(Boolean).length >= 2);
  if (!ready.length) h += `<div class="card hint">You need a team with at least 2 Pokémon. Build one in the <b>Teams</b> tab first.</div>`;
  for (const t of ready) h += `<button class="card tb-teamcard" data-bteam="${t.id}"><div class="tb-tc-top"><b>${esc(t.name)}</b><span class="fmt ${t.format}">${esc(fmtLabel(t))}</span></div>
    <div class="tb-minis">${t.mons.map(m => m ? `<img src="sprites/${m.sp || ((DS.main&&DS.main.species[m.s]||{}).sp) || 0}.png" alt="">` : "").join("")}</div></button>`;
  el.innerHTML = h;
  el.querySelectorAll("[data-bteam]").forEach(b => b.onclick = () => { battle = {teamId:b.dataset.bteam, started:false, myActive:[null,null], fainted:[], opp:[], oppActive:[null,null]}; bsave(); renderBattle(); });
}
function battlePickLeads(t){
  const el = broot(); const sel = battle.myActive.filter(x => x !== null);
  let h = `<div class="tb-head"><button class="btn small" id="btBack">‹ Teams</button><h2 style="flex:1">${esc(t.name)}</h2></div>
    <div class="hint">Tap your leads in order — <b>1st</b> (left) then <b>2nd</b> (right).</div><div class="tb-slots">`;
  t.mons.forEach((m,i) => { if (!m) return; const es = effSpecies(m), pos = battle.myActive.indexOf(i);
    h += `<button class="tb-slot ${pos>=0?"picked":""}" data-lead="${i}">${pos>=0?`<span class="mega-badge" style="background:#7c6cf0">${pos===0?"1st":"2nd"}</span>`:""}<img src="${sprite(es)}" alt=""><b>${esc(S(es).n)}</b><div>${typeBadges(S(es).t)}</div></button>`; });
  h += `</div><button class="btn primary block" id="btStart" ${sel.length===2?"":"disabled"}>Start battle</button>`;
  el.innerHTML = h;
  $("#btBack").onclick = () => { battle = null; bsave(); renderBattle(); };
  el.querySelectorAll("[data-lead]").forEach(b => b.onclick = () => { const i = +b.dataset.lead, pos = battle.myActive.indexOf(i);
    if (pos >= 0) battle.myActive[pos] = null; else { const free = battle.myActive.indexOf(null); if (free >= 0) battle.myActive[free] = i; }
    bsave(); battlePickLeads(t); });
  $("#btStart").onclick = () => { if (battle.myActive.includes(null)) return; battle.started = true; bsave(); renderBattle(); };
}
function addOpp(t, side){
  const usage = Object.fromEntries(meta(t).usage);
  const ids = legalSpecies(t).sort((a,b) => (usage[b]||0)-(usage[a]||0) || S(a).n.localeCompare(S(b).n));
  const rows = [];
  for (const id of ids){ const group = usage[id] ? "Top of the meta" : "All Pokémon";
    rows.push({key:id, group, search:toID(S(id).n), html:`<img src="${sprite(id)}" loading="lazy" alt=""><span class="li-main">${esc(S(id).n)}</span>${typeBadges(S(id).t)}${usage[id]?`<span class="pct">${usage[id].toFixed(1)}%</span>`:""}`});
    for (const st of megaStoneFor(t, id)){ const mid = G.items[st].m[id]; if (!S(mid)) continue;
      rows.push({key:`${id}|${st}`, group, search:toID(S(mid).n)+"mega"+toID(S(id).n), html:`<img src="${sprite(mid)}" loading="lazy" alt=""><span class="li-main">${esc(S(mid).n)}</span>${typeBadges(S(mid).t)}`}); }
  }
  listPicker("Their Pokémon", rows, key => {
    const [sid, stone] = key.split("|");
    const s = suggestSet(t, sid, {used:new Set(), mega:false, noMega: !stone});
    const o = {s:sid, ability:s.ability, item: stone || s.item, moves:s.moves, seen:{moves:[]}};
    battle.opp.push(o); const idx = battle.opp.length - 1;
    if (side !== null && side !== undefined) battle.oppActive[side] = idx;
    bsave(); closeSheet(); renderBattle(); toast(`${S(effSpecies(o)).n} added with its ${meta(t).sets[sid] ? "most common" : "likely"} set`);
  });
}
function oppEditor(t, idx, side){
  const o = battle.opp[idx], es = effSpecies(o), set = setOf(t, o.s);
  const pct = (arr, k) => { const x = arr && arr.find(y => y[0]===k); return x ? ` <span class="pct">${Math.round(x[1])}%</span>` : ""; };
  let h = `<div class="tb-ed-top"><img src="${sprite(es)}" alt=""><div><h3>${esc(S(es).n)}</h3>${typeBadges(S(es).t)}<div class="hint">Their Pokémon · tap anything to correct it</div></div></div>
    <label>Ability</label><div class="tb-chips">${S(o.s).a.map(a => `<button class="chip ${o.ability===a?"on":""}" data-oab="${esc(a)}">${esc(a)}${pct(set&&set.a,a)}</button>`).join("")}</div>
    <label>Item</label><button class="btn block left" id="oItem">${o.item?`<b>${esc(G.items[o.item].n)}</b>${pct(set&&set.i,o.item)}`:"Unknown / none"}${o.seen&&o.seen.item?" · <small>confirmed</small>":""}</button>
    <label>Moves <small class="hint">(tap ✓ when you see one used)</small></label>`;
  for (let k=0;k<4;k++){ const i = o.moves[k];
    h += i === undefined ? `<button class="btn block left" data-omv="${k}">+ Add move</button>` : (() => { const x = mv(i), seen = (o.seen.moves||[]).includes(i);
      return `<div class="bt-mvrow"><button class="btn left" data-omv="${k}"><span class="badge" style="background:${COL[x.t]}">${x.t}</span> <b>${esc(x.n)}</b>${pct(set&&set.m,i)}<br><small>${x.c==="X"?"Status":x.c==="P"?"Physical":"Special"}${x.bp?` · ${x.bp} BP`:""}</small></button><button class="btn ${seen?"primary":""}" data-oseen="${i}">✓</button></div>`; })(); }
  const isActive = battle.oppActive.includes(idx);
  h += `<div class="tb-row">${isActive ? `<button class="btn" id="oBench">Switched out</button>` : `<button class="btn" id="oIn">Switched in</button>`}<button class="btn" id="oFaint">${o.fainted?"Not fainted":"Fainted"}</button></div>
    <button class="btn block danger" id="oRemove">Remove</button>`;
  sheet(h, () => {
    document.querySelectorAll("[data-oab]").forEach(b => b.onclick = () => { o.ability = b.dataset.oab; bsave(); renderBattle(); oppEditor(t, idx, side); });
    $("#oItem").onclick = () => { const legal = fmt(t).items.filter(i => !G.items[i].m || G.items[i].m[o.s]); const rows = [{key:"", group:"", search:"none", html:`<span class="li-main">Unknown / none</span>`}]; const seen = new Set();
      if (set) set.i.forEach(([k,p]) => { if (legal.includes(k)) { seen.add(k); rows.push({key:k, group:"Most common", search:toID(G.items[k].n), html:`<span class="li-main"><b>${esc(G.items[k].n)}</b> <span class="pct">${Math.round(p)}%</span></span>`}); } });
      legal.filter(k => !seen.has(k)).sort((a,b) => G.items[a].n.localeCompare(G.items[b].n)).forEach(k => rows.push({key:k, group:"All items", search:toID(G.items[k].n), html:`<span class="li-main"><b>${esc(G.items[k].n)}</b><br><small>${esc(G.items[k].d)}</small></span>`}));
      listPicker("Their item", rows, k => { o.item = k; o.seen.item = !!k; bsave(); renderBattle(); oppEditor(t, idx, side); }, {noFocus:true, onClose: () => oppEditor(t, idx, side)}); };
    document.querySelectorAll("[data-omv]").forEach(b => b.onclick = () => { const k = +b.dataset.omv, L = learnable(t, o.s), rows = [], seen = new Set(o.moves.filter((x,j) => j!==k));
      const row = (i, group, extra="") => { if (seen.has(i)) return; seen.add(i); const x = mv(i); rows.push({key:String(i), group, search:toID(x.n)+toID(x.t), html:`<span class="badge" style="background:${COL[x.t]}">${x.t}</span><span class="li-main"><b>${esc(x.n)}</b>${extra}<br><small>${x.c==="X"?"Status":x.c==="P"?"Phys":"Spec"}${x.bp?` · ${x.bp} BP`:""}</small></span>`}); };
      if (set) set.m.filter(x => L.includes(x[0])).forEach(([i,p]) => row(i, "Most common", ` <span class="pct">${Math.round(p)}%</span>`));
      L.map(mv).sort((a,b) => a.n.localeCompare(b.n)).forEach(x => row(x.i, "All learnable"));
      if (o.moves[k] !== undefined) rows.unshift({key:"-1", group:"", search:"remove", html:`<span class="li-main">— Remove this move</span>`});
      listPicker(`Their move ${k+1}`, rows, key => { const i = +key; if (i < 0) o.moves.splice(k,1); else { if (k < o.moves.length) o.moves[k] = i; else o.moves.push(i); if (!o.seen.moves.includes(i)) o.seen.moves.push(i); } bsave(); renderBattle(); oppEditor(t, idx, side); }, {noFocus:true, onClose: () => oppEditor(t, idx, side)}); });
    document.querySelectorAll("[data-oseen]").forEach(b => b.onclick = () => { const i = +b.dataset.oseen; o.seen.moves = o.seen.moves.includes(i) ? o.seen.moves.filter(x => x!==i) : o.seen.moves.concat(i); bsave(); renderBattle(); oppEditor(t, idx, side); });
    const ob = $("#oBench"); if (ob) ob.onclick = () => { const s2 = battle.oppActive.indexOf(idx); battle.oppActive[s2] = null; bsave(); closeSheet(); renderBattle(); };
    const oi = $("#oIn"); if (oi) oi.onclick = () => { const free = battle.oppActive.indexOf(null); if (free >= 0){ battle.oppActive[free] = idx; bsave(); closeSheet(); renderBattle(); } else pickSide("Replace which of their Pokémon?", battle.oppActive.map(i => S(effSpecies(battle.opp[i])).n), s2 => { battle.oppActive[s2] = idx; bsave(); renderBattle(); }); };
    $("#oFaint").onclick = () => { o.fainted = !o.fainted; bsave(); closeSheet(); renderBattle(); };
    $("#oRemove").onclick = () => { battle.opp.splice(idx,1); battle.oppActive = battle.oppActive.map(i => i === null ? null : i === idx ? null : i > idx ? i-1 : i); bsave(); closeSheet(); renderBattle(); };
  });
}
function pickSide(title, names, cb){ sheet(`<h3>${esc(title)}</h3>${names.map((n,i) => `<button class="btn block" data-side="${i}">${esc(n)}</button>`).join("")}`, () => document.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { closeSheet(); cb(+b.dataset.side); })); }
function mySlotSheet(t, side){
  const i = battle.myActive[side], m = i === null ? null : t.mons[i];
  const bench = t.mons.map((x,j) => ({x,j})).filter(y => y.x && !battle.myActive.includes(y.j) && !battle.fainted.includes(y.j));
  let h = m ? `<h3>${esc(S(effSpecies(m)).n)}</h3>` : `<h3>Send in</h3>`;
  h += bench.length ? `<label>${m ? "Switch to" : "Choose"}</label>${bench.map(({x,j}) => `<button class="btn block left" data-swto="${j}"><img src="${sprite(effSpecies(x))}" alt="" style="width:36px;height:36px;vertical-align:middle;image-rendering:pixelated"> ${esc(S(effSpecies(x)).n)}</button>`).join("")}` : `<div class="hint">No healthy Pokémon on the bench.</div>`;
  if (m) h += `<button class="btn block" id="myFaint">${battle.fainted.includes(i) ? "Not fainted" : "Fainted"}</button>`;
  sheet(h, () => {
    document.querySelectorAll("[data-swto]").forEach(b => b.onclick = () => { battle.myActive[side] = +b.dataset.swto; bsave(); closeSheet(); renderBattle(); });
    const f = $("#myFaint"); if (f) f.onclick = () => { battle.fainted = battle.fainted.includes(i) ? battle.fainted.filter(x => x!==i) : battle.fainted.concat(i); bsave(); closeSheet(); renderBattle(); };
  });
}
function myBenchSheet(t, i){
  const m = t.mons[i], fainted = battle.fainted.includes(i);
  sheet(`<h3>${esc(S(effSpecies(m)).n)}</h3>${fainted ? "" : battle.myActive.map((a,s) => `<button class="btn block" data-swin="${s}">Switch in for ${a === null ? "empty slot" : esc(S(effSpecies(t.mons[a])).n)}</button>`).join("")}
    <button class="btn block" id="bFaint">${fainted ? "Not fainted" : "Fainted"}</button>`, () => {
    document.querySelectorAll("[data-swin]").forEach(b => b.onclick = () => { battle.myActive[+b.dataset.swin] = i; bsave(); closeSheet(); renderBattle(); });
    $("#bFaint").onclick = () => { battle.fainted = fainted ? battle.fainted.filter(x => x!==i) : battle.fainted.concat(i); bsave(); closeSheet(); renderBattle(); };
  });
}

/* ---------- sheet + toast ---------- */
let sheetClose = null;
function sheet(html, init, onClose){
  let el = $("#tbSheet");
  if (!el){ el = document.createElement("div"); el.id = "tbSheet"; el.innerHTML = `<div class="tb-backdrop"></div><div class="tb-panel"><button class="tb-x" aria-label="Close">✕</button><div class="tb-panel-body"></div></div>`; document.body.appendChild(el);
    el.querySelector(".tb-backdrop").onclick = () => closeSheet(true); el.querySelector(".tb-x").onclick = () => closeSheet(true); }
  el.querySelector(".tb-panel-body").innerHTML = html; el.hidden = false; el.querySelector(".tb-panel").scrollTop = 0; document.body.classList.add("noscroll");
  sheetClose = onClose || null; if (init) init(el);
}
function closeSheet(user){ const el = $("#tbSheet"); if (el) el.hidden = true; document.body.classList.remove("noscroll"); const c = sheetClose; sheetClose = null; if (user && c) c(); }
function toast(msg){ let el = $("#tbToast"); if (!el){ el = document.createElement("div"); el.id = "tbToast"; document.body.appendChild(el); } el.textContent = msg; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove("show"), 2200); }

/* ---------- boot ---------- */
function teamVisible(){ const el = document.getElementById("teamMode"); return el && !el.hidden; }
function battleVisible(){ const el = document.getElementById("battleMode"); return el && !el.hidden; }
document.addEventListener("error", e => { if (e.target && e.target.tagName === "IMG") e.target.style.visibility = "hidden"; }, true);
let loading = null;
function boot(){
  if (!DS.main && !loading) loading = Promise.all([fetch("data/game.json").then(r=>r.json()), fetch("data/meta.json").then(r=>r.json())]).then(([g,m]) => {
    DS.main = g; M = m; if (teamVisible()) render(); if (battleVisible()) renderBattle();
  }).catch(() => { const msg = `<div class="card">Couldn't load team data. Check your connection and reopen this tab.</div>`; if (teamVisible()) root().innerHTML = msg; if (battleVisible()) broot().innerHTML = msg; loading = null; });
}
window.openTeams = function(){ load(); render(); boot(); };
window.openBattle = function(){ renderBattle(); boot(); };
// If the Teams tab is already showing when this script loads (restored on startup), draw it now
if (teamVisible()) window.openTeams();
if (battleVisible()) window.openBattle();
// Redraw when the app returns from the background (phones can restore an empty view)
window.addEventListener("pageshow", e => { if (teamVisible() && (e.persisted || !root().innerHTML.trim())) window.openTeams(); if (battleVisible() && (e.persisted || !broot().innerHTML.trim())) window.openBattle(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") return; if (teamVisible() && !root().innerHTML.trim()) window.openTeams(); if (battleVisible() && !broot().innerHTML.trim()) window.openBattle(); });
})();

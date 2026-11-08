import fs from 'fs';
const D='/home/claude/pokeapi/ps/data/';
const imp=async p=>{ const tmp='/tmp/tsdata/'+p.replace(/\//g,'_'); fs.mkdirSync('/tmp/tsdata',{recursive:true}); fs.copyFileSync(D+p,tmp); const m=await import(tmp); return Object.values(m)[0]; };
const Dex=await imp('pokedex.ts'), Moves=await imp('moves.ts'), Items=await imp('items.ts'), Abil=await imp('abilities.ts');
const TM=await imp('text/moves.ts'), TI=await imp('text/items.ts'), TA=await imp('text/abilities.ts');
const Learn=await imp('learnsets.ts'), FD=await imp('formats-data.ts');
const CFD=await imp('mods/champions/formats-data.ts'), CLearn=await imp('mods/champions/learnsets.ts'), CItems=await imp('mods/champions/items.ts'), CMoves=await imp('mods/champions/moves.ts');
const toID=s=>(''+s).toLowerCase().replace(/[^a-z0-9]/g,'');
const csv=f=>{const [h,...r]=fs.readFileSync('/home/claude/pokeapi/pokeapi/data/v2/csv/'+f,'utf8').trim().split('\n');const k=h.split(',');return r.map(l=>Object.fromEntries(l.split(',').map((v,i)=>[k[i],v])));};
const pk=csv('pokemon.csv'); const pkByIdent=Object.fromEntries(pk.map(r=>[r.identifier,+r.id]));
const SUF={'-F':'-female','-M':'-male'};
function spriteId(sp){
  let n=sp.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’:%]/g,'').replace(/ /g,'-');
  const FIX={'necrozma-dusk-mane':'necrozma-dusk','necrozma-dawn-wings':'necrozma-dawn','rockruff-dusk':'rockruff-own-tempo'}; if(FIX[n]) n=FIX[n];
  for(const[a,b] of Object.entries(SUF)) if(sp.name.endsWith(a)) n=n.slice(0,-a.length)+b;
  if(pkByIdent[n]) return pkByIdent[n];
  for(const s of ['-male','-normal','-standard','-incarnate','-altered','-land','-ordinary','-aria','-shield','-average','-baile','-midday','-solo','-red-meteor','-amped','-ice','-full-belly','-single-strike','-family-of-four','-zero','-curly','-green-plumage','-two-segment','-disguised','-50','-red','-plant','-overcast','-west','-spring','-red-striped','-small','-meteor','-breed','-mask','-cap','-plumage']) if(pkByIdent[n+s]) return pkByIdent[n+s];
  return null;
}
const tagsOf=sp=>sp.tags||(sp.baseSpecies&&Dex[toID(sp.baseSpecies)]||{}).tags||[];
const restricted=sp=>tagsOf(sp).includes('Restricted Legendary');
const mythical=sp=>tagsOf(sp).includes('Mythical');
const isPickable=sp=>(!sp.battleOnly||sp.requiredItem)&&!/-(Mega|Gmax|Totem|Primal)/.test(sp.name)&&!sp.isCosmeticForme;
// learnset w/ prevo + base forme fallback
function learnFor(id,table,filter){
  const out=new Set(); let cur=Dex[id]; const seen=new Set();
  const add=k=>{const ls=table[k]&&table[k].learnset; if(ls) for(const[m,src] of Object.entries(ls)) if(!filter||src.some(filter)) out.add(m); return !!ls;};
  while(cur&&!seen.has(cur.name)){ const k=toID(cur.name); seen.add(cur.name);
    const own=add(k); const extra=cur.changesFrom||(typeof cur.battleOnly==='string'?cur.battleOnly:null); if(extra) add(toID(extra)); else if(!own&&cur.baseSpecies) add(toID(cur.baseSpecies));
    cur=cur.prevo?Dex[toID(cur.prevo)]:null; }
  return out;
}
const formats={};
// SV Reg I
{ const sp=[],learn={};
  for(const[id,s] of Object.entries(Dex)){ const fd=FD[id]; if(!fd||fd.isNonstandard||fd.tier==='Illegal'||s.isNonstandard) continue;
    if(!isPickable(s)||mythical(s)||s.num<=0) continue;
    let L=learnFor(id,Learn,src=>src.startsWith('9'));
    if(id==='smeargle') L=new Set(Object.keys(Moves).filter(k=>!Moves[k].isNonstandard&&!Moves[k].isZ&&!Moves[k].isMax&&!(Moves[k].flags&&Moves[k].flags.nosketch)));
    if(!L.size) continue; sp.push(id); learn[id]=L; }
  const items=Object.entries(Items).filter(([k,v])=>!v.isNonstandard&&v.num>0).map(([k])=>k);
  formats.svi={name:'VGC 2025 Reg I (Scarlet/Violet)',species:sp,learn,items,maxRestricted:2};
}
// Champions Reg M-C
{ const sp=[],learn={};
  for(const[id,s] of Object.entries(Dex)){ const fd=CFD[id]; if(!fd||fd.isNonstandard||fd.tier==='Illegal') continue;
    if(!isPickable(s)||mythical(s)||restricted(s)||s.num<=0) continue;
    const L=learnFor(id,CLearn,null); if(!L.size) continue; sp.push(id); learn[id]=L; }
  const items=Object.entries(Items).filter(([k,v])=>{ const o=CItems[k]; const ns=o&&('isNonstandard' in o)?o.isNonstandard:v.isNonstandard; return !ns&&v.num>0; }).map(([k])=>k);
  formats.champ={name:'VGC 2026 Reg M-C (Champions)',species:sp,learn,items,maxRestricted:0};
}
// remove learnset moves that are nonstandard in format
const moveOK={svi:k=>Moves[k]&&!Moves[k].isNonstandard, champ:k=>{const o=CMoves[k]; const ns=o&&('isNonstandard' in o)?o.isNonstandard:Moves[k]&&Moves[k].isNonstandard; return Moves[k]&&!ns;}};
const usedMoves=new Set(), usedSpecies=new Set(), usedItems=new Set();
for(const[f,F] of Object.entries(formats)){ for(const s of F.species){ F.learn[s]=[...F.learn[s]].filter(moveOK[f]).filter(m=>!Moves[m].isZ&&!Moves[m].isMax); F.learn[s].forEach(m=>usedMoves.add(m)); usedSpecies.add(s);} F.items.forEach(i=>usedItems.add(i)); }
// megas reachable via legal items
const megaOf={};
for(const i of usedItems){ const ms=Items[i].megaStone; if(ms) for(const[b,m] of Object.entries(ms)){ if(Dex[toID(m)]){ usedSpecies.add(toID(m)); megaOf[i]=megaOf[i]||{}; megaOf[i][toID(b)]=toID(m);} } }
// also forms like Ogerpon masks / crowned via items
const moveList=[...usedMoves].sort(); const midx=Object.fromEntries(moveList.map((m,i)=>[m,i]));
const CAT={Physical:'P',Special:'S',Status:'X'};
const out={
  moves: moveList.map(k=>{const m=Moves[k]; const co=CMoves[k]||{}; return [m.name,m.type,CAT[m.category],m.basePower||0,m.accuracy===true?0:m.accuracy,m.priority||0,m.target==='allAdjacentFoes'?1:m.target==='allAdjacent'?2:0,((TM[k]&&(TM[k].shortDesc||TM[k].desc))||'').slice(0,140), co.basePower||0, (m.flags&&(m.flags.charge||m.flags.recharge))||m.selfdestruct||['focuspunch','dreameater','steelroller','lastresort','belch','synchronoise','futuresight','doomdesire','skyattack','razorwind','meteorbeam','electroshot','solarbeam','solarblade','finalgambit','memento','explosion','selfdestruct','mistyexplosion','healingwish','lunardance'].includes(k)?1:0];}),
  items: Object.fromEntries([...usedItems].map(k=>[k,{n:Items[k].name,d:((TI[k]&&(TI[k].shortDesc||TI[k].desc))||'').slice(0,140),...(megaOf[k]?{m:megaOf[k]}:{})}])),
  species: {}, abilities:{}, formats:{}
};
const missingSprite=[], needSprites=[];
for(const id of usedSpecies){ const s=Dex[id]; let sid=spriteId(s); if(sid&&!fs.existsSync('/home/claude/pokemon-type-app/sprites/'+sid+'.png')){ needSprites.push(sid); sid=null; } if(!sid) missingSprite.push(s.name);
  out.species[id]={n:s.name,t:s.types,a:Object.values(s.abilities),s:[s.baseStats.hp,s.baseStats.atk,s.baseStats.def,s.baseStats.spa,s.baseStats.spd,s.baseStats.spe],sp:sid||s.num,nm:s.num,...(restricted(s)?{r:1}:{}),...(((s.tags||(s.baseSpecies&&Dex[toID(s.baseSpecies)]||{}).tags)||[]).some(x=>/Legendary|Mythical/.test(x))?{lg:1}:{}),...(((s.tags||(s.baseSpecies&&Dex[toID(s.baseSpecies)]||{}).tags)||[]).includes('Ultra Beast')?{ub:1}:{}),...(s.requiredItem?{ri:toID(s.requiredItem)}:{})};
  for(const a of Object.values(s.abilities)){ const ai=Abil[toID(a)]; if(ai) {const ta=TA[toID(a)]; out.abilities[a]=((ta&&(ta.shortDesc||ta.desc))||'').slice(0,140);} } }
for(const[f,F] of Object.entries(formats)) out.formats[f]={name:F.name,maxRestricted:F.maxRestricted,items:F.items,learn:Object.fromEntries(F.species.map(s=>[s,F.learn[s].map(m=>midx[m])]))};
fs.writeFileSync('/home/claude/scripts/build/game.json',JSON.stringify(out));
console.log('moves',moveList.length,'items',usedItems.size,'species',usedSpecies.size,'svi',formats.svi.species.length,'champ',formats.champ.species.length);
console.log('missing sprites',missingSprite.length,missingSprite.slice(0,60).join(', '));
fs.writeFileSync('/tmp/need2',needSprites.map(i=>'/sprites/pokemon/'+i+'.png').join('\n'));fs.writeFileSync('/home/claude/scripts/build/sprite_ids.json',JSON.stringify([...new Set(Object.values(out.species).map(s=>s.sp))]));

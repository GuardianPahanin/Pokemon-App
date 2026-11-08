import fs from 'fs';
const D='/home/claude/pokeapi/ps/data/';
const imp=async p=>{ if(!fs.existsSync(D+p)) return {}; const tmp='/tmp/tsdata/'+p.replace(/\//g,'_'); fs.mkdirSync('/tmp/tsdata',{recursive:true}); fs.copyFileSync(D+p,tmp); const m=await import(tmp); return Object.values(m)[0]||{}; };
const base={dex:await imp('pokedex.ts'),moves:await imp('moves.ts'),items:await imp('items.ts'),fd:await imp('formats-data.ts')};
const Learn=await imp('learnsets.ts'), TM=await imp('text/moves.ts'), TI=await imp('text/items.ts'), TA=await imp('text/abilities.ts');
const mods={}; for(let g=3;g<=8;g++) mods[g]={dex:await imp(`mods/gen${g}/pokedex.ts`),moves:await imp(`mods/gen${g}/moves.ts`),items:await imp(`mods/gen${g}/items.ts`),fd:await imp(`mods/gen${g}/formats-data.ts`)};
const toID=s=>(''+s).toLowerCase().replace(/[^a-z0-9]/g,'');
const prevG=JSON.parse(fs.readFileSync('game.json'));
const spriteOf={}; for(const[k,v] of Object.entries(prevG.species)) spriteOf[k]=v.sp;
const pkcsv=fs.readFileSync('/home/claude/pokeapi/pokeapi/data/v2/csv/pokemon.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const byIdent=Object.fromEntries(pkcsv.map(r=>[r[1],+r[0]]));
function spriteFor(id,s){ if(spriteOf[id]) return spriteOf[id]; let n=s.name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[.'’:%]/g,'').replace(/ /g,'-'); if(n.endsWith('-f')) n=n.slice(0,-2)+'-female';
  for(const x of [n,n+'-normal',n+'-male',n+'-altered',n+'-land',n+'-incarnate',n+'-standard',n+'-ordinary',n+'-aria',n+'-shield',n+'-average',n+'-plant',n+'-red-striped',n+'-midday',n+'-solo',n+'-baile',n+'-red-meteor',n+'-disguised',n+'-amped',n+'-full-belly',n+'-single-strike',n+'-50']) if(byIdent[x]) return byIdent[x]; return s.num; }
const MAXNUM={3:386,4:493,5:649,6:721,7:809,8:905};
const LOGEN={3:3,4:3,5:3,6:3,7:3,8:8};
const PHYS=new Set(['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel']);
const BADMOVE=new Set(['focuspunch','dreameater','steelroller','lastresort','belch','synchronoise','futuresight','doomdesire','skyattack','razorwind','meteorbeam','solarbeam','solarblade','finalgambit','memento','explosion','selfdestruct','healingwish','lunardance','skullbash','bide']);
function merged(kind,id,g){ let o={...(base[kind][id]||{})}; for(let x=8;x>=g;x--){ const m=mods[x][kind][id]; if(m){ o=m.inherit===false?{...m}:{...o,...m}; } } return o; }
const CAT={Physical:'P',Special:'S',Status:'X'};
for(let g=3;g<=8;g++){
  const species={}, learn={}, abilities={}; const usedMoves=new Set();
  for(const id of Object.keys(base.dex)){
    const s=merged('dex',id,g); if(!s.num||s.num<=0||s.num>MAXNUM[g]) continue;
    if((s.gen||0)>g) continue; { const fg=/Alola/.test(s.name)?7:/Galar/.test(s.name)?8:/Hisui|Paldea|Bloodmoon/.test(s.name)?9:0; if(fg>g) continue; } if(/-(Gmax|Totem|Primal)$/.test(s.name)) continue;
    const isMega=/-Mega/.test(s.name); if(isMega&&!(g===6||g===7)) continue;
    let fd=base.fd[id]||{}; for(let x=g;x<=8;x++){ if(mods[x].fd[id]){ fd=mods[x].fd[id]; break; } } if(!isMega&&(fd.isNonstandard||fd.tier==='Illegal')) continue;
    if(s.battleOnly&&!isMega&&!/Crowned/.test(s.name)) continue; if(s.isCosmeticForme) continue;
    const abil=g>=5?Object.values(s.abilities||{}):Object.entries(s.abilities||{}).filter(([k])=>k!=='H').map(([,v])=>v);
    species[id]={n:s.name,t:s.types,a:abil.length?abil:['No Ability'],s:[s.baseStats.hp,s.baseStats.atk,s.baseStats.def,s.baseStats.spa,s.baseStats.spd,s.baseStats.spe],sp:spriteFor(id,s),nm:s.num,...(((s.tags||(s.baseSpecies&&base.dex[toID(s.baseSpecies)]||{}).tags)||[]).some(t=>/Restricted|Mythical/.test(t))?{r:1}:{}),...(((s.tags||(s.baseSpecies&&base.dex[toID(s.baseSpecies)]||{}).tags)||[]).some(t=>/Legendary|Mythical/.test(t))?{lg:1}:{}),...(((s.tags||(s.baseSpecies&&base.dex[toID(s.baseSpecies)]||{}).tags)||[]).includes('Ultra Beast')?{ub:1}:{}),...(s.evos&&s.evos.length?{nfe:1}:{})};
    for(const a of abil){ const ta=TA[toID(a)]; if(ta) abilities[a]=(ta.shortDesc||ta.desc||'').slice(0,140); }
    if(isMega) continue;
    // learnset: sources from LOGEN..g, excluding Virtual Console; include prevos & base forme
    const out=new Set(); let cur=s, seen=new Set();
    const add=k=>{ const ls=Learn[k]&&Learn[k].learnset; if(!ls) return false; for(const[mv,src] of Object.entries(ls)) if(src.some(x=>{const gg=+x[0]; return gg>=LOGEN[g]&&gg<=g&&x[1]!=='V';})) out.add(mv); return true; };
    while(cur&&!seen.has(cur.name)){ seen.add(cur.name); const own=add(toID(cur.name)); const extra=cur.changesFrom||(typeof cur.battleOnly==='string'?cur.battleOnly:null); if(extra) add(toID(extra)); else if(!own&&cur.baseSpecies) add(toID(cur.baseSpecies)); cur=cur.prevo?merged('dex',toID(cur.prevo),g):null; }
    const L=[...out].filter(k=>{ const m=merged('moves',k,g); return m.name&&(m.gen||0)<=g&&!m.isZ&&!m.isMax&&!(m.isNonstandard&&m.isNonstandard!=='Past'); });
    if(!L.length){ delete species[id]; continue; }
    learn[id]=L; L.forEach(m=>usedMoves.add(m));
  }
  // items
  const items={};
  for(const id of Object.keys(base.items)){ const it=merged('items',id,g); if(!it.name||!it.num||it.num<0||(it.gen||0)>g) continue;
    if(it.isNonstandard&&it.isNonstandard!=='Past') continue; if(it.zMove||it.isPokeball||/ Ball$|Fossil|Mail$|TR\d|^TM| Stone$|Amber$|^Up-Grade$|Dubious Disc|Protector|Electirizer|Magmarizer|Reaper Cloth|Razor Fang|Razor Claw|Oval Stone|Prism Scale|Sachet|Whipped Dream/.test(it.name)) continue;
    if(it.gen===2&&it.isNonstandard==='Past'&&g>=3) continue;
    if(g===8&&it.isNonstandard==='Past') continue; if(it.megaStone&&!(g===6||g===7)) continue;
    const o={n:it.name,d:((TI[id]&&(TI[id].shortDesc||TI[id].desc))||'').slice(0,140)};
    if(it.megaStone){ o.m={}; for(const[b,m] of Object.entries(it.megaStone)) if(species[toID(m)]) o.m[toID(b)]=toID(m); if(!Object.keys(o.m).length) continue; }
    items[id]=o; }
  const moveList=[...usedMoves].sort(); const midx=Object.fromEntries(moveList.map((m,i)=>[m,i]));
  const moves=moveList.map(k=>{ const m=merged('moves',k,g); let cat=CAT[m.category]; if(g<=3&&cat!=='X') cat=PHYS.has(m.type)?'P':'S';
    return [m.name,m.type,cat,m.basePower||0,m.accuracy===true?0:m.accuracy,m.priority||0,m.target==='allAdjacentFoes'?1:m.target==='allAdjacent'?2:0,((TM[k]&&(TM[k].shortDesc||TM[k].desc))||'').slice(0,140),0,(m.flags&&(m.flags.charge||m.flags.recharge))||m.selfdestruct||BADMOVE.has(k)?1:0]; });
  const out={gen:g,moves,items,species,abilities,formats:{['g'+g]:{name:`Gen ${g} doubles (in-game rules)`,maxRestricted:6,gen:g,items:Object.keys(items),learn:Object.fromEntries(Object.entries(learn).map(([s,L])=>[s,L.map(m=>midx[m])]))}}};
  fs.writeFileSync(`/home/claude/pokemon-type-app/data/gen${g}.json`,JSON.stringify(out));
  const sz=fs.statSync(`/home/claude/pokemon-type-app/data/gen${g}.json`).size;
  console.log(`gen${g}: species ${Object.keys(species).length} learnsets ${Object.keys(learn).length} moves ${moveList.length} items ${Object.keys(items).length} ${(sz/1024|0)}KB`);
  // checks
  if(g===3){ const c=species.clefairy, mg=species.magnemite; console.log(' clefairy',c&&c.t,'magnemite',mg&&mg.t,'gardevoir',species.gardevoir.t, species.gardevoir.a,'| lifeorb?',!!items.lifeorb,'leftovers?',!!items.leftovers,'| fakeout',moves[midx.fakeout]?.[2],'crunch cat',moves[midx.crunch]?.[2],'| salamence moves',learn.salamence.length); }
  if(g===6) console.log(' charizardite?',!!items.charizarditex,'fairy sylveon',species.sylveon&&species.sylveon.t,'megas',Object.keys(species).filter(k=>k.includes('mega')).length);
  if(g===8) console.log(' bulbasaur in swsh?',!!species.bulbasaur,'incineroar',!!species.incineroar, 'garchomp',!!species.garchomp);
}

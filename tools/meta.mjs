import fs from 'fs';
const G=JSON.parse(fs.readFileSync('game.json'));
const toID=s=>(''+s).toLowerCase().replace(/[^a-z0-9]/g,'');
const midx=Object.fromEntries(G.moves.map((m,i)=>[toID(m[0]),i]));
const megaRev={}; for(const[i,it] of Object.entries(G.items)) if(it.m) for(const[b,m] of Object.entries(it.m)) megaRev[m]=[b,i];
const warn=[];
const USAGE={
 champ:`Rillaboom|30.48,Sneasler|29.71,Incineroar|26.18,Garchomp|21.15,Farigiraf|21.02,Charizard|20.98,Archaludon|20.68,Golisopod|20.52,Kingambit|19.22,Indeedee-F|16.53,Salamence|15.59,Basculegion|14.45,Gholdengo|14.45,Raichu|14.13,Politoed|13.26,Grimmsnarl|12.86,Pelipper|12.31,Whimsicott|10.57,Milotic|10.30,Tyranitar|9.55,Sylveon|8.57,Staraptor|8.18,Volcarona|7.72,Excadrill|7.27,Floette-Eternal|6.97,Sinistcha|6.86,Arcanine-Hisui|6.58,Indeedee|6.57,Gardevoir|6.15,Torkoal|5.09,Froslass|4.85,Metagross|4.54,Armarouge|4.50,Dragonite|4.35,Venusaur|4.22,Gengar|4.15,Glimmora|3.95,Swampert|3.88,Primarina|3.82,Ninetales-Alola|3.77`,
 svi:`Incineroar|47.67,Miraidon|42.62,Calyrex-Shadow|36.90,Zamazenta-Crowned|34.05,Urshifu-Rapid-Strike|29.94,Calyrex-Ice|29.23,Rillaboom|25.70,Chien-Pao|21.01,Raging Bolt|16.76,Whimsicott|16.37,Amoonguss|15.83,Grimmsnarl|15.06,Kyogre|14.84,Volcarona|14.47,Smeargle|14.05,Landorus|13.60,Tornadus|12.84,Flutter Mane|11.05,Farigiraf|9.83,Lunala|9.39,Groudon|9.14,Chi-Yu|8.46,Sneasler|8.12,Koraidon|7.90,Ogerpon-Cornerstone|7.59,Indeedee-F|7.49,Iron Hands|7.40,Ursaluna|6.51,Terapagos|6.24,Roaring Moon|6.09,Ditto|5.04,Weezing-Galar|4.92,Dondozo|4.69,Tatsugiri|4.55,Zacian-Crowned|4.51,Ogerpon-Hearthflame|4.22,Clefairy|4.02,Urshifu|3.72,Maushold|3.61,Iron Jugulis|3.00`};
const FILES={champ:['champ1','champ2','champ3'],svi:['sv1','sv2']};
const out={};
for(const f of ['champ','svi']){
  const F=G.formats[f]; const legal=new Set(Object.keys(F.learn)); const items=new Set(F.items);
  const sid=n=>{let id=toID(n); if(megaRev[id]) return megaRev[id][0]; if(!G.species[id]) warn.push(f+' species? '+n); return id;};
  const usage=USAGE[f].split(',').map(x=>{const[n,p]=x.split('|');return [sid(n),+p];}).filter(([id])=>{ if(!legal.has(id)){warn.push(f+' not legal '+id);return false;} return true;});
  const sets={}; const teams=[]; const teamKey=new Set();
  const txt=FILES[f].map(x=>fs.readFileSync('/home/claude/meta/'+x+'.txt','utf8')).join('\n');
  let cur=null, inTeams=false;
  for(const line of txt.split('\n')){
    const l=line.trim(); if(!l) continue;
    if(l.startsWith('## ')){ cur=sid(l.slice(3)); if(!legal.has(cur)){warn.push(f+' set not legal '+cur);} sets[cur]={m:[],i:[],a:[],tm:[]}; inTeams=false; continue; }
    const kv=l.match(/^(MOVES|ITEMS|ABILITIES|TEAMMATES|TEAMS):\s*(.*)$/);
    if(kv){ inTeams=kv[1]==='TEAMS'; if(inTeams) continue;
      const pairs=kv[2].split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const[n,p]=x.split('=');return [n.trim(),parseFloat(p)];}).filter(([n,p])=>p>0);
      for(const[n,p] of pairs){
        if(kv[1]==='MOVES'){ const i=midx[toID(n)]; if(i===undefined||!(F.learn[cur]||[]).includes(i)) {warn.push(f+' move '+cur+':'+n); continue;} sets[cur].m.push([i,p]); }
        if(kv[1]==='ITEMS'){ const i=toID(n); if(!items.has(i)){warn.push(f+' item '+n);continue;} sets[cur].i.push([i,p]); }
        if(kv[1]==='ABILITIES'){ if(!G.species[cur].a.includes(n)||p<3) continue; sets[cur].a.push([n,p]); }
        if(kv[1]==='TEAMMATES'){ const t=sid(n); if(legal.has(t)) sets[cur].tm.push([t,p]); }
      }
      continue; }
    if(inTeams){ const names=l.replace(/^\d+\.\s*/,'').replace(/^Team \d+[^:]*:\s*/,'').split(',').map(x=>x.trim()).filter(Boolean); if(names.length!==6) continue;
      const mons=names.map(n=>{const id=toID(n); if(megaRev[id]) return {s:megaRev[id][0],i:megaRev[id][1]}; return {s:sid(n)};});
      if(mons.some(m=>!legal.has(m.s))){warn.push(f+' team illegal '+names);continue;}
      const key=mons.map(m=>m.s).sort().join(','); if(teamKey.has(key)) continue; teamKey.add(key); teams.push(mons); }
  }
  out[f]={date:'2026-05',source:'Pikalytics (Showdown ladder 1760+ & tournament teams)',usage,sets,teams};
}
fs.writeFileSync('meta.json',JSON.stringify(out));
console.log('champ sets',Object.keys(out.champ.sets).length,'teams',out.champ.teams.length,'| svi sets',Object.keys(out.svi.sets).length,'teams',out.svi.teams.length);
console.log(warn.join('\n'));

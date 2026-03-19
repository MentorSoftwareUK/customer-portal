import 'dotenv/config'
const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN
const BASE = 'https://api.hubapi.com'
async function searchAll(type, fg, props) {
  const results = []; let after
  do {
    const body = { filterGroups: fg, properties: props, limit: 100 }
    if (after) body.after = after
    const r = await fetch(BASE+'/crm/v3/objects/'+type+'/search', {
      method:'POST', headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
      body: JSON.stringify(body)
    })
    const j = await r.json(); results.push(...(j.results??[])); after = j.paging?.next?.after
  } while(after)
  return results
}
const mk = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
const now = new Date(); const cmk = mk(now)

const cos = await searchAll('companies',[{filters:[{propertyName:'salesstatus',operator:'EQ',value:'paying_customer'}]}],['name'])
const pIds = new Set(cos.map(c=>c.id))
const cNames = new Map(cos.map(c=>[c.id,c.properties.name??'?']))

const deals = await searchAll('deals',[{filters:[
  {propertyName:'pipeline',operator:'EQ',value:'default'},
  {propertyName:'dealstage',operator:'EQ',value:'closedwon'}
]}],['dealname','hs_mrr','hs_v2_date_entered_closedwon','closedate'])

const dcMap = new Map()
for(let i=0;i<deals.length;i+=500){
  const batch=deals.slice(i,i+500)
  const r=await fetch(BASE+'/crm/v4/associations/deals/companies/batch/read',{
    method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({inputs:batch.map(d=>({id:d.id}))})
  })
  const j=await r.json()
  for(const x of j.results??[]) if(x.to?.length) dcMap.set(String(x.from.id),String(x.to[0].toObjectId))
}

let mrrAll=0, mrrBounded=0, mrrSmart=0
let cdMissing=0, cdPast=0, cdFuture=0
const coDeals=new Map()

for(const d of deals){
  const cid=dcMap.get(d.id); if(!cid||!pIds.has(cid)) continue
  if(!coDeals.has(cid)) coDeals.set(cid,[])
  coDeals.get(cid).push(d)
}

const noActiveList=[]
for(const [cid,ds] of coDeals){
  ds.sort((a,b)=>(b.properties.hs_v2_date_entered_closedwon?new Date(b.properties.hs_v2_date_entered_closedwon).getTime():0)-(a.properties.hs_v2_date_entered_closedwon?new Date(a.properties.hs_v2_date_entered_closedwon).getTime():0))
  let coAll=0, coBound=0, coLatest=0, hasActive=false
  for(const d of ds){
    const mrr=parseFloat(d.properties.hs_mrr??'0')||0; if(!mrr) continue
    const won=d.properties.hs_v2_date_entered_closedwon; if(!won) continue
    if(cmk<mk(new Date(won))) continue
    const cd=d.properties.closedate; const cdD=cd?new Date(cd):null
    coAll+=mrr
    if(!coLatest) coLatest=mrr
    if(!cdD){cdMissing++; coBound+=mrr; hasActive=true}
    else if(cdD>=now){cdFuture++; coBound+=mrr; hasActive=true}
    else{cdPast++}
  }
  mrrAll+=coAll; mrrBounded+=coBound
  mrrSmart+=hasActive?coBound:coLatest
  if(!hasActive&&coAll>0) noActiveList.push({name:cNames.get(cid),all:coAll,latest:coLatest})
}

console.log('=== MRR COMPARISON ===')
console.log('A. Sum ALL deals (current):       £'+mrrAll.toFixed(2)+'/mo')
console.log('B. Closedate-bounded (strict):    £'+mrrBounded.toFixed(2)+'/mo')
console.log('C. Smart-bounded (fallback):      £'+mrrSmart.toFixed(2)+'/mo')
console.log('')
console.log('Closedate stats (active MRR deals):')
console.log('  Missing closedate:    '+cdMissing)
console.log('  Future (active):      '+cdFuture)
console.log('  Past (expired):       '+cdPast)
console.log('')
console.log('Paying cos, ALL deals expired ('+noActiveList.length+'):')
noActiveList.sort((a,b)=>b.all-a.all)
for(const c of noActiveList) console.log('  '+c.name+' | sumAll: £'+c.all.toFixed(2)+' | latest: £'+c.latest.toFixed(2))

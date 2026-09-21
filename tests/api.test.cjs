const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../api.js');
const response=data=>({ok:true,status:200,json:async()=>data});
test('complete event retrieval asks for unlimited overlapping range',async()=>{
  const values=Array.from({length:3001},(_,i)=>({id:i}));
  const result=await A.events('bucket / x',{queryStart:1000,queryEnd:2000},async(url,options)=>{
    const u=new URL(url); assert.equal(u.searchParams.get('limit'),'-1'); assert.equal(u.searchParams.get('start'),new Date(1000).toISOString()); assert.equal(u.searchParams.get('end'),new Date(2000).toISOString()); assert.equal(options.cache,'no-store'); assert.ok(u.pathname.includes('bucket%20%2F%20x')); return response(values);
  }); assert.equal(result.length,3001);
});
test('HTTP, JSON, shape, timeout and stalled body failures are explicit',async()=>{
  await assert.rejects(()=>A.json('/','test',async()=>({ok:false,status:503})),/503/);
  await assert.rejects(()=>A.json('/','test',async()=>({ok:true,json:async()=>{throw Error('bad')}})),/Invalid JSON/);
  await assert.rejects(()=>A.events('w',{queryStart:1,queryEnd:2},async()=>response({})),/Invalid event list/);
  const stall=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));
  await assert.rejects(()=>A.json('/','test',stall,10),/timed out/);
  await assert.rejects(()=>A.json('/','body',async(url,{signal})=>({ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}),10),/timed out/);
});
test('load waits for sibling request on failure, missing AFK has no request',async()=>{
  let finished=false,count=0;
  await assert.rejects(()=>A.load({window:'w',afk:'a'},{queryStart:1,queryEnd:2},async url=>{
    if(url.includes('/w/')) return {ok:false,status:500};
    await new Promise(r=>setTimeout(r,10)); finished=true; return response([]);
  })); assert.ok(finished);
  const result=await A.load({window:'w',afk:null},{queryStart:1,queryEnd:2},async()=>{count++;return response([])});
  assert.equal(count,1); assert.equal(result.afk,null);
});

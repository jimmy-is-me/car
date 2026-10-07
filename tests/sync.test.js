import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.js';
import {DriveSync} from '../sync.js';
import {live} from '../core.js';
class Storage { constructor(){this.data=new Map();} getItem(k){return this.data.get(k)||null;} setItem(k,v){this.data.set(k,v);} }
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const makeStore=()=>{const s=new Store(()=>{},new Storage());s.switchAccount('account-a');return s;};
const makeSync=store=>{const statuses=[];const s=new DriveSync(store,(state,message)=>statuses.push({state,message}),()=>{});s.token='test';s.expires=Date.now()+3600000;s.statuses=statuses;return s;};
function drive(){const files=[];let fail=false,loseReply=false;globalThis.fetch=async(url,options={})=>{
  if(fail){fail=false;return new Response('{}',{status:503});}
  if(options.method==='POST'){
    const parts=options.body.split(/\r\n/);const json=parts.filter(x=>x.startsWith('{')).map(JSON.parse);
    const file={id:'file-'+files.length,name:json[0].name,state:json[1]};files.push(file);
    if(loseReply){loseReply=false;throw new Error('Network response lost');}
    return Response.json({id:file.id});
  }
  const u=new URL(url);if(u.searchParams.get('alt')==='media')return Response.json(files.find(f=>f.id===u.pathname.split('/').pop()).state);
  return Response.json({files:files.map(({id,name})=>({id,name}))});
};return {files,fail:()=>fail=true,loseReply:()=>loseReply=true};}
const newVehicle=(store,id,name)=>store.mutate('vehicles',{id,name,odometer:0});
test('independent offline devices merge without snapshot overwrites',async()=>{drive();const a=makeStore(),b=makeStore();newVehicle(a,'a','Car A');newVehicle(b,'b','Car B');const sa=makeSync(a),sb=makeSync(b);await Promise.all([sa.sync(),sb.sync()]);await Promise.all([sa.sync(),sb.sync()]);assert.equal(live(a.state,'vehicles').length,2);assert.equal(live(b.state,'vehicles').length,2);assert.equal(a.pending.length,0);assert.equal(b.pending.length,0);});
test('deletion propagates and stale remote versions do not revive it',async()=>{drive();const a=makeStore(),b=makeStore();const v=newVehicle(a,'a','A');const sa=makeSync(a),sb=makeSync(b);await sa.sync();await sb.sync();a.mutate('vehicles',{...v,deleted:true});await sa.sync();await sb.sync();assert.equal(live(b.state,'vehicles').length,0);await sa.sync();assert.equal(live(a.state,'vehicles').length,0);});
test('failed uploads remain pending and recover after retry',async()=>{const remote=drive(),a=makeStore(),s=makeSync(a);newVehicle(a,'a','A');remote.fail();await s.sync();assert.equal(a.pending.length,1);assert.equal(s.statuses.at(-1).state,'error');await s.sync();assert.equal(a.pending.length,0);assert.equal(remote.files.length,1);});
test('lost upload response is retried without duplicating logical operation',async()=>{const remote=drive(),a=makeStore(),s=makeSync(a);newVehicle(a,'a','A');remote.loseReply();await s.sync();assert.equal(a.pending.length,1);assert.equal(remote.files.length,1);await s.sync();assert.equal(a.pending.length,0);assert.equal(remote.files.length,1);assert.equal(live(a.state,'vehicles').length,1);});
test('guest and Google accounts have independent local state',()=>{const a=new Store(()=>{},new Storage());newVehicle(a,'guest-car','Guest');a.switchAccount('alice');assert.equal(a.state.vehicles.length,0);newVehicle(a,'alice-car','Alice');a.switchAccount('bob');assert.equal(a.state.vehicles.length,0);a.switchAccount('alice');assert.equal(a.state.vehicles[0].name,'Alice');a.switchAccount(null);assert.equal(a.state.vehicles[0].name,'Guest');});
test('quota errors do not discard the previous state',()=>{const disk=new Storage(),a=new Store(()=>{},disk);newVehicle(a,'a','A');disk.setItem=()=>{throw new DOMException('Quota','QuotaExceededError');};assert.throws(()=>newVehicle(a,'b','B'));assert.equal(a.state.vehicles.length,1);assert.equal(a.pending.length,1);});
test('expired tokens retain local pending edits and request reauthorization',async()=>{drive();const a=makeStore(),s=makeSync(a);newVehicle(a,'a','A');s.expires=Date.now()-1000;await s.sync();assert.equal(a.pending.length,1);assert.equal(s.token,null);assert.match(s.statuses.at(-1).message,/授權已到期/);});
test('logout during an in-flight request cannot merge into guest state',async()=>{drive();const a=makeStore(),s=makeSync(a);newVehicle(a,'a','A');let release;globalThis.fetch=()=>new Promise(r=>release=r);const pending=s.sync();s.logout();release(Response.json({files:[]}));await pending;assert.equal(a.key,'car-manager:guest');assert.equal(a.state.vehicles.length,0);});

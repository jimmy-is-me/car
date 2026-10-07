import {emptyState, mergeStates, nextStamp, uuid, validateState} from './core.js';
export class Store {
  constructor(onChange=()=>{},storage=globalThis.localStorage) { this.onChange=onChange; this.storage=storage; this.key='car-manager:guest'; this.load(); }
  load() {
    const raw=this.storage.getItem(this.key);
    if(raw) { const parsed=JSON.parse(raw); this.state=validateState(parsed.state); this.pending=parsed.pending||[]; }
    else { this.state=emptyState(); this.pending=[]; }
  }
  switchAccount(sub) { const oldKey=this.key; this.key=sub?'car-manager:google:'+sub:'car-manager:guest'; try { this.load(); } catch(e) { this.key=oldKey; this.load(); throw e; } this.onChange(); }
  persist(state, pending) {
    this.storage.setItem(this.key,JSON.stringify({state,pending}));
    this.state=state; this.pending=pending; this.onChange();
  }
  mutate(collection, data) {
    const entry={...data,id:data.id||uuid(),updatedAt:nextStamp(this.state),revision:uuid()};
    const operation={...emptyState(),[collection]:[entry]};
    const next=mergeStates(this.state,operation); validateState(next);
    this.persist(next,[...this.pending,{id:uuid(),state:operation}]);
    return entry;
  }
  import(value) {
    validateState(value);
    const stamp=nextStamp(mergeStates(this.state,value));
    const op={...emptyState()};
    for(const k of ['vehicles','records','reminders']) op[k]=value[k].map(x=>({...x,updatedAt:stamp,revision:uuid()}));
    this.persist(mergeStates(this.state,op),[...this.pending,{id:uuid(),state:op}]);
  }
  merge(remote) { validateState(remote); this.persist(mergeStates(this.state,remote),this.pending); }
  acknowledge(id) { this.persist(this.state,this.pending.filter(x=>x.id!==id)); }
}

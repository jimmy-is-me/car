import {emptyState, mergeStates, validateState} from './core.js';
export const CLIENT_ID='174739541877-kjranr4hd63oomtk4117hbgfvouutsef.apps.googleusercontent.com';
const DRIVE='https://www.googleapis.com/drive/v3';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
// Immutable operation files prevent one device overwriting another device's snapshot.
export class DriveSync {
  constructor(store,onStatus,onAccount) { this.store=store; this.onStatus=onStatus; this.onAccount=onAccount; this.cache=new Map(); this.token=null; this.account=null; this.running=false; this.generation=0; }
  async restore() {
    let saved, session;
    try { saved=JSON.parse(localStorage.getItem('car-manager:last-account')||'null'); session=JSON.parse(sessionStorage.getItem('car-manager:session')||'null'); } catch { return; }
    if(!saved?.sub) return;
    try { this.store.switchAccount(saved.sub); } catch { return; }
    this.account=saved; this.onAccount(saved);
    if(!session || session.sub!==saved.sub || session.expires<Date.now()+30000) { this.onStatus('ready','已登入 · 按此繼續同步'); return; }
    try {
      const response=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+session.token},signal:AbortSignal.timeout(15000)});
      const verified=response.ok?await response.json():null;
      if(!verified || verified.sub!==saved.sub) throw new Error('驗證已到期');
      this.token=session.token; this.expires=session.expires; this.onStatus('ready','已恢復 Google 同步'); await this.sync();
    } catch { sessionStorage.removeItem('car-manager:session'); this.onStatus('ready','已登入 · 按此繼續同步'); }
  }
  login() {
    if(!window.google?.accounts?.oauth2) throw new Error('Google 登入尚未載入，請檢查網路後重試');
    const generation=this.generation;
    const client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:`openid email profile ${SCOPE}`,include_granted_scopes:false,
      callback:async result=>{
        if(generation!==this.generation) return;
        try {
          if(result.error) throw new Error('Google 授權未完成：'+result.error);
          if(!google.accounts.oauth2.hasGrantedAllScopes(result,SCOPE)) throw new Error('需允許應用資料存取，才能同步');
          const res=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+result.access_token}});
          if(!res.ok) throw new Error('無法確認 Google 帳號');
          const account=await res.json(); if(!account.sub) throw new Error('無法確認 Google 帳號');
          if(generation!==this.generation) return;
          this.generation++; this.cache.clear();
          this.store.switchAccount(account.sub); this.account=account; this.token=result.access_token; this.expires=Date.now()+Number(result.expires_in)*1000;
          localStorage.setItem('car-manager:last-account',JSON.stringify({sub:account.sub,email:account.email,name:account.name}));
          sessionStorage.setItem('car-manager:session',JSON.stringify({sub:account.sub,token:this.token,expires:this.expires}));
          this.onAccount(account); this.onStatus('ready','等待同步'); await this.sync();
        } catch(e) { this.onStatus('error',e.message); }
      },error_callback:()=>this.onStatus('error','登入視窗已關閉或被阻擋，請再按一次登入')});
    client.requestAccessToken({prompt:this.account?'':'select_account'});
  }
  logout() { this.generation++; this.token=null; this.account=null; this.cache.clear(); localStorage.removeItem('car-manager:last-account'); sessionStorage.removeItem('car-manager:session'); this.store.switchAccount(null); this.onAccount(null); this.onStatus('local','本機模式'); }
  async request(url,options={},generation=this.generation) {
    if(generation!==this.generation) throw new Error('帳號已切換');
    if(!this.token || Date.now()>=this.expires-30000) { this.token=null; sessionStorage.removeItem('car-manager:session'); throw new Error('Google 授權已到期，請按此繼續同步'); }
    const res=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+this.token},signal:AbortSignal.timeout(30000)});
    if(generation!==this.generation) throw new Error('帳號已切換');
    if(!res.ok) {
      if(res.status===401) { this.token=null; sessionStorage.removeItem('car-manager:session'); throw new Error('Google 授權已到期，請按此繼續同步'); }
      if(res.status===403) throw new Error('Google Drive 存取被拒絕，請確認已啟用 API 與授權範圍');
      throw new Error('雲端同步失敗（'+res.status+'），資料已保留在本機，稍後重試');
    }
    return res.json();
  }
  async sync() {
    if(this.running || !this.token || !navigator.onLine) return;
    this.running=true; const generation=this.generation;
    this.onStatus('syncing','同步中');
    try {
      const files=[]; let page='';
      do {
        const params=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='app' and value='car-manager-v1' }",fields:'nextPageToken,files(id,name)',pageSize:'1000'});
        if(page) params.set('pageToken',page);
        const result=await this.request(DRIVE+'/files?'+params,{},generation); files.push(...(result.files||[])); page=result.nextPageToken||'';
      } while(page);
      const fresh=files.filter(f=>!this.cache.has(f.id));
      for(let i=0;i<fresh.length;i+=5) {
        const batch=await Promise.all(fresh.slice(i,i+5).map(async f=>[f.id,validateState(await this.request(DRIVE+'/files/'+encodeURIComponent(f.id)+'?alt=media',{},generation))]));
        if(generation!==this.generation) return;
        for(const [id,state] of batch) this.cache.set(id,state);
      }
      if(generation!==this.generation) return;
      this.store.merge(mergeStates(emptyState(),...this.cache.values()));
      const names=new Set(files.map(f=>f.name));
      for(const op of [...this.store.pending]) {
        if(generation!==this.generation) return;
        const name='op-'+op.id+'.json';
        if(!names.has(name)) {
          const boundary='car_'+crypto.randomUUID();
          const metadata={name,parents:['appDataFolder'],appProperties:{app:'car-manager-v1'}};
          const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(op.state)}\r\n--${boundary}--`;
          const uploaded=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body},generation);
          this.cache.set(uploaded.id,op.state);
        }
        this.store.acknowledge(op.id);
      }
      this.onStatus('synced','已同步 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}));
    } catch(e) { if(generation===this.generation) this.onStatus('error',e.message); }
    finally { this.running=false; }
  }
}

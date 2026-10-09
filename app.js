import {live,today,uuid,emptyState,fuelStats,mileage,reminderStatus,csvCell,validateState,nextServiceDue,addMonths} from './core.js';
import {Store} from './store.js';
import {DriveSync} from './sync.js';
import {parseFuelReceipt} from './receipt.js';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(n);
const number=(n,d=0)=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d});
const paths={dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',records:'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4',reminders:'M6 16V9a6 6 0 0 1 12 0v7l2 2H4z M10 21h4',reports:'M4 20h16 M7 16V9 M12 16V4 M17 16v-5',vehicles:'M3 16V9l3-5h12l3 5v7z M3 10h18 M6 13h2 M16 13h2 M5 16v4 M19 16v4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 4 4 1v8l-4 1-1 4H9l-1-4-4-1V8l4-1z',fuel:'M4 21V3h10v18 M4 9h10 M2 21h14 M14 11h3v6a2 2 0 0 0 4 0V8l-3-3',charge:'M13 2 5 14h6l-1 8 9-13h-7z',maintenance:'M21 3a6 6 0 0 1-8 8L5 20l-3-3 9-8a6 6 0 0 1 8-8l-4 4 2 2z',expense:'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',trip:'M4 20 9 4h6l5 16 M11 7h2 M11 12h2 M11 17h2',plus:'M12 5v14 M5 12h14',edit:'m4 16 12-12 4 4L8 20H4z M14 6l4 4',arrow:'M5 12h14 M13 6l6 6-6 6',cloud:'M6 18a5 5 0 0 1 0-10 6 6 0 0 1 12 1 4 4 0 0 1 0 9 M12 12v8 M9 15l3-3 3 3',check:'m5 12 4 4 10-10',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5'};
const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.records}"/></svg>`;
const navs=[['dashboard','總覽'],['records','紀錄'],['reminders','提醒'],['reports','報表'],['vehicles','車庫'],['settings','設定']];
const types={fuel:'加油',charge:'充電',maintenance:'保養維修',expense:'其他支出',trip:'行程里程',odometer:'里程讀數',tire:'輪胎維護',inflation:'輪胎充氣',battery:'電瓶更換',tax:'稅費',insurance:'保險'};
const services=['機油／機油濾芯','空氣／冷氣濾網','煞車系統','輪胎／定位','電瓶','變速箱油','冷卻液','火星塞','皮帶／正時系統','雨刷','冷氣系統','其他維修'];
let currentTab=location.hash.slice(1)||'dashboard',selected=localStorage.getItem('car-manager:selected')||'',filterType='',query='',from='',to='',account=null,syncState='local',syncMessage='本機模式',timer,editing=null;
const ocrBase=new URL('./vendor/ocr/',import.meta.url).href;
let ocrScriptPromise;
function loadOcr(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!ocrScriptPromise)ocrScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=ocrBase+'tesseract.min.js';script.async=true;
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR 元件無法啟動'));
    script.onerror=()=>reject(new Error('無法下載 OCR 元件；可改用手動輸入'));
    document.head.append(script);
  }).catch(error=>{ocrScriptPromise=null;throw error;});
  return ocrScriptPromise;
}
async function readFuelReceipt(file){
  if(!file.type.startsWith('image/'))throw new Error('請選擇照片檔');
  if(file.size>15000000)throw new Error('照片不可超過 15 MB');
  const form=$('#editor-form'),status=$('#fuel-receipt-status'),button=form.querySelector('button[type=submit]');
  const sameEditor=()=>$('#editor').open&&$('#editor-form')===form&&editing?.collection==='records'&&form.querySelector('#fuel-receipt-status')===status;
  button.disabled=true;status.textContent='正在載入本機辨識元件，第一次可能需要較久…';
  let worker;
  try{
    const Tesseract=await loadOcr();
    worker=await Tesseract.createWorker(['eng','chi_tra'],1,{workerPath:ocrBase+'worker.min.js',corePath:ocrBase+'core',langPath:ocrBase+'lang',workerBlobURL:false,logger:m=>{if(sameEditor()&&m.progress)status.textContent=`正在辨識加油單 ${Math.round(m.progress*100)}%…`;}});
    const result=await worker.recognize(file),raw=result.data.text||'';
    if(!sameEditor())return;
    const parsed=parseFuelReceipt(raw),values=Object.entries(parsed).filter(([,value])=>value!==null&&value!=='');
    for(const [name,value] of values){
      const control=form.elements.namedItem(name);
      if(!control||!('value'in control))continue;
      if(editing.id&&control.value)continue;
      if(name==='date'&&control.value&&control.value!==today())continue;
      control.value=String(value);
      if(name==='cost')control.dataset.manual='1';
    }
    const rawPanel=$('#fuel-receipt-raw');rawPanel.hidden=!raw;rawPanel.querySelector('pre').textContent=raw;
    status.textContent=values.length?`已帶入 ${values.length} 項可能資料；請逐項核對後儲存。照片與辨識文字不會加入紀錄。`:'未辨識到可確認的欄位，請手動填寫。';
  }catch(error){if(sameEditor())status.textContent=`辨識失敗：${error.message}。仍可手動填寫。`;}
  finally{try{if(worker)await worker.terminate();}finally{if(sameEditor())button.disabled=false;}}
}
if(!navs.some(([key])=>key===currentTab))currentTab='dashboard';
let store;
try { store=new Store(()=>render()); } catch(e) { $('#main').innerHTML=`<div class="notice warning">本機資料無法讀取，請先備份瀏覽器資料。${esc(e.message)}</div>`; throw e; }
const sync=new DriveSync(store,(state,message)=>{syncState=state;syncMessage=message;renderStatus();if(currentTab==='settings')render();},a=>{account=a;selected=localStorage.getItem('car-manager:selected')||'';render();});
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('#toast').style.display='none',5000);}
function vehicles(){return live(store.state,'vehicles');}
const themes={
  teal:{accent:'#167766',deep:'#153d3d',soft:'#e7f4ee'},
  blue:{accent:'#3267b1',deep:'#1b365c',soft:'#eaf1fb'},
  copper:{accent:'#aa6737',deep:'#573621',soft:'#fbefe5'},
  violet:{accent:'#7254a8',deep:'#382853',soft:'#f2edfa'},
  forest:{accent:'#39764e',deep:'#193f2c',soft:'#eaf5ec'},
  rose:{accent:'#ad5372',deep:'#552c3d',soft:'#faedf2'},
  slate:{accent:'#586b78',deep:'#27343d',soft:'#edf1f3'},
  graphite:{accent:'#444b51',deep:'#1b2024',soft:'#eef0f1'},
  black:{accent:'#282a2d',deep:'#111315',soft:'#f0f0f0'},
  silver:{accent:'#75858c',deep:'#37464c',soft:'#f1f4f5'},
  gold:{accent:'#9b7535',deep:'#4b3a20',soft:'#f8f2e5'}
};
const themeKeys=Object.keys(themes);
function vehicleTheme(v){return themes[v?.color]||themes[themeKeys[Math.max(0,vehicles().findIndex(x=>x.id===v?.id))%themeKeys.length]];}
function applyVehicleTheme(v){const t=vehicleTheme(v),root=document.documentElement;root.style.setProperty('--accent',t.accent);root.style.setProperty('--vehicle-deep',t.deep);root.style.setProperty('--vehicle-soft',t.soft);}
function vehiclePhoto(v){return v?.photo&&/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.photo)?v.photo:'';}
function heroPhoto(v){const photo=vehiclePhoto(v);return photo?'<div class="hero-photo"><img src="'+esc(photo)+'" alt="'+esc(v.name)+' 的車輛照片"></div>':'';}
function cardPhoto(v){const photo=vehiclePhoto(v);return photo?'<div class="vehicle-card-photo"><img src="'+esc(photo)+'" alt="'+esc(v.name)+' 的車輛照片"></div>':'<div class="vehicle-card-photo placeholder">'+icon('vehicles',34)+'</div>';}
async function resizeVehiclePhoto(file){
  if(!file.type.startsWith('image/'))throw new Error('請選擇圖片檔');
  if(file.size>10000000)throw new Error('圖片請小於 10 MB');
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
  try{
    for(const edge of [960,800,640]){
      const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.7,.56]){
        const data=canvas.toDataURL('image/jpeg',quality);
        if(data.length<=300000)return data;
      }
    }
  }finally{bitmap.close();}
  throw new Error('圖片仍太大，請選擇較小的照片');
}
function vehicle(){const list=vehicles();return list.find(x=>x.id===selected)||list[0];}
function records(){const v=vehicle();return live(store.state,'records').filter(x=>x.vehicleId===v?.id).sort((a,b)=>b.date.localeCompare(a.date)||b.odometer-a.odometer||b.updatedAt-a.updatedAt);}
function reminders(){return live(store.state,'reminders').filter(x=>x.vehicleId===vehicle()?.id);}
function renderStatus(){const b=$('#sync-button');b.textContent=syncState==='error'?'同步待處理':syncMessage;b.dataset.status=syncState;b.title=syncMessage;$('#account-button').textContent=account?account.email||account.name:'登入 Google';}
function navigation(){
  for(const id of ['desktop-nav','mobile-nav']) $('#'+id).innerHTML=navs.map(([key,label])=>`<button data-tab="${key}" class="${key===currentTab?'active':''}" ${key===currentTab?'aria-current="page"':''}>${icon(key)}<span>${label}</span></button>`).join('');
}
function availableTypes(){const power=vehicle()?.power||'汽油';return Object.entries(types).filter(([key])=>key!=='fuel'||power!=='純電').filter(([key])=>key!=='charge'||['純電','插電式油電'].includes(power));}
function switchTab(tab){if(!navs.some(x=>x[0]===tab))tab='dashboard';currentTab=tab;location.hash=tab;render();window.scrollTo({top:0,behavior:'instant'});}
function vehicleSelect(){return `<select class="selection" aria-label="選擇車輛" data-vehicle-select>${vehicles().map(v=>`<option value="${v.id}" ${v.id===vehicle()?.id?'selected':''}>${esc(v.name)}${v.plate?' · '+esc(v.plate):''}</option>`).join('')}</select>`;}
function heading(title,sub,action='record'){return `<div class="page-heading"><div><span class="eyebrow">${currentTab==='dashboard'?'GARAGE OVERVIEW':'YOUR PERSONAL GARAGE'}</span><h1>${title}</h1><p class="muted">${sub}</p></div><div class="actions">${vehicle()?vehicleSelect():''}<button class="primary" data-action="${action}">${icon('plus')}${action==='vehicle'?'新增車輛':action==='reminder'?'新增提醒':'新增紀錄'}</button></div></div>`;}
function stat(label,value,unit,foot,key){return `<div class="stat"><div class="stat-top">${label}${icon(key)}</div><strong>${value} <small>${unit}</small></strong><p>${foot}</p></div>`;}
function empty(title,desc,key='records',action='record',button='新增紀錄'){return `<div class="empty">${icon(key)}<h3>${title}</h3><p>${desc}</p>${action?`<button class="primary" data-action="${action}">${icon('plus')}${button}</button>`:''}</div>`;}
function welcome(){return `<div class="welcome"><div class="hero"><div><span class="eyebrow">EVERY MILE MATTERS</span><h1>把愛車的每一天，<br>記錄得更清楚。</h1><p>從第一筆加油開始，累積完整的保養履歷。免費使用，沒有廣告，資料由你自己掌握。</p><div class="actions" style="margin-top:24px"><button class="primary" data-action="vehicle">${icon('plus')}建立我的第一輛車</button></div></div></div><div class="welcome-cards">${[['fuel','油耗與成本','正確計算滿箱油耗，追蹤加油、充電與每月支出。'],['maintenance','完整保養履歷','記錄保養項目、零件與工資、店家、發票與備註。'],['cloud','跨裝置同步','登入 Google，使用自己的 Drive 同步手機與電腦。']].map(([k,t,d])=>`<div class="panel"><div class="panel-body">${icon(k,26)}<div><h3>${t}</h3><p>${d}</p></div></div></div>`).join('')}</div><p class="muted">尚未登入時，紀錄保存在此瀏覽器。登入後可於設定匯入本機資料。</p></div>`;}
function recordRow(r){const label=r.type==='maintenance'?(r.items||[]).join('、')||'保養維修':r.category||types[r.type];const detail=r.type==='fuel'?`${r.liters?number(r.liters,2)+' L':'未記公升'} · ${r.full?'加滿':'未加滿'}${r.missed?' · 前次漏記':''}`:r.type==='charge'?`${number(r.kwh,2)} kWh${r.socEnd?' · '+r.socEnd+'%':''}`:r.type==='trip'?`${esc(r.origin||'起點')} → ${esc(r.destination||'終點')} · ${number(r.distance,1)} km` :r.type==='odometer'?'保養提醒已依里程更新':esc(r.vendor||'未填店家');return `<div class="row"><div class="record-symbol ${r.type}">${icon(r.type)}</div><div class="row-info"><h3>${esc(label)}</h3><p>${r.date} · ${r.odometerEstimated?'未記里程':number(r.odometer)+' km'}</p><p>${detail}</p></div><div class="row-amount">${money(r.cost)}<small>${r.type==='fuel'?(r.liters?money(r.cost/r.liters)+'/L':'未記單價'):r.type==='charge'?money(r.cost/r.kwh)+'/kWh':esc(r.invoice||'')}</small></div><button class="icon-button" data-edit-record="${r.id}" aria-label="編輯 ${esc(types[r.type])} ${r.date}">${icon('edit')}</button></div>`;}
const statusLabels={normal:'尚未到期',soon:'即將到期',overdue:'已到期',done:'已完成'};
function reminderRow(r){const odo=mileage(vehicle(),records()),status=reminderStatus(r,odo),paymentType=r.category==='稅金'?'tax':r.category==='保險'?'insurance':null;return `<div class="row reminder-row"><div class="record-symbol">${icon('reminders')}</div><div class="row-info"><h3>${esc(r.title)}</h3><p>${r.dueDate?'期限 '+r.dueDate:''}${r.dueDate&&r.dueKm?' · ':''}${r.dueKm?'里程 '+number(r.dueKm)+' km':''}</p><p>${r.dueKm? (r.dueKm>odo?'距離 '+number(r.dueKm-odo)+' km':'已達里程門檻'):''}${r.intervalKm||r.intervalMonths?' · 每 '+[r.intervalKm?number(r.intervalKm)+' km':'',r.intervalMonths?r.intervalMonths+' 個月':''].filter(Boolean).join('／'):''}</p></div><span class="badge ${status}">${statusLabels[status]}</span>${!r.done?(paymentType?`<button class="resolve-button" data-new-type="${paymentType}">${paymentType==='tax'?'記錄繳費':'記錄續保'}</button>`:`<button class="resolve-button" data-resolve-reminder="${r.id}">記錄處理</button>`):''}<button class="icon-button" data-edit-reminder="${r.id}" aria-label="編輯提醒 ${esc(r.title)}">${icon('edit')}</button></div>`;}
function electricReports(v,rows,total,dist,charges,energy){
const detail=charges.length?'<div class="table-scroll"><table><thead><tr><th>日期</th><th>里程</th><th>充入電量</th><th>費用</th></tr></thead><tbody>'+charges.slice().reverse().map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+number(r.odometer)+' km</td><td>'+number(r.kwh,2)+' kWh</td><td>'+money(r.cost)+'</td></tr>').join('')+'</tbody></table></div>':empty('尚無充電紀錄','新增充電紀錄後，就會在這裡顯示。','charge',null);
const costs=availableTypes().map(([k,t])=>{const sum=rows.filter(r=>r.type===k).reduce((n,r)=>n+r.cost,0);return '<div class="cost-bar"><span>'+t+'</span><div class="track"><i style="width:'+(total?sum/total*100:0)+'%"></i></div><strong>'+money(sum)+'</strong></div>';}).join('');
return heading('用車分析','充電量、支出與里程一目了然。')+'<div class="actions" style="margin-bottom:20px"><button class="secondary" data-action="csv">匯出此車 CSV</button><button class="secondary" data-action="print">列印報表</button></div><div class="stats">'+stat('累積充電量',number(energy,1),'kWh','已登錄的充入電量','charge')+stat('充電總支出',money(charges.reduce((n,r)=>n+r.cost,0)),'','已登錄充電費用','charge')+stat('記錄期間成本',dist?number(total/dist,2):'—','TWD/km','已登錄支出 ÷ 起始至最新里程','reports')+'</div><div class="grid-two"><section class="panel"><div class="panel-header"><h2>支出分布</h2><span class="muted">'+money(total)+'</span></div><div class="panel-body">'+costs+'</div></section><section class="panel"><div class="panel-header"><h2>近半年支出</h2></div><div class="panel-body">'+expenseChart(rows)+'</div></section></div><section class="panel"><div class="panel-header"><h2>充電明細</h2><span class="muted">'+charges.length+' 筆</span></div>'+detail+'<div class="panel-body report-meta">此處顯示充入電量，不等同實際行駛電耗；充電損耗與未登錄紀錄會影響估計。</div></section>';
}function expenseChart(rows){const months=Array.from({length:6},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-5+i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});const vals=months.map(m=>rows.filter(r=>r.date.startsWith(m)).reduce((s,r)=>s+r.cost,0));const max=Math.max(...vals,1);return `<svg class="chart" viewBox="0 0 500 175" role="img" aria-label="近六個月支出：${months.map((m,i)=>m+' '+money(vals[i])).join('，')}"><path d="M15 135H485 M15 85H485 M15 35H485" stroke="#e8eeeb" stroke-dasharray="3 5"/>${vals.map((v,i)=>{const x=25+i*80,h=v/max*108;return `<rect x="${x}" y="${135-h}" width="45" height="${Math.max(h,2)}" rx="4" fill="${i===5?'#17343c':'#7ca99a'}"/><text x="${x+22}" y="${127-h}" text-anchor="middle">${v?number(v):''}</text><text x="${x+22}" y="160" text-anchor="middle">${months[i].slice(5)} 月</text>`;}).join('')}</svg><div class="legend"><span><i></i>總支出（TWD）</span><span>近 6 個月</span></div>`;}
function dashboard(){const v=vehicle(),rows=records(),fuel=fuelStats(rows),month=today().slice(0,7),monthly=rows.filter(r=>r.date.startsWith(month)).reduce((s,r)=>s+r.cost,0),due=reminders().filter(r=>!r.done).sort((a,b)=>({overdue:0,soon:1,normal:2}[reminderStatus(a,mileage(v,rows))]-{overdue:0,soon:1,normal:2}[reminderStatus(b,mileage(v,rows))]));return heading('你的愛車，一目了然。','每一筆紀錄，都是更了解愛車的開始。')+`<div class="hero">${heroPhoto(v)}<div><span class="eyebrow">MY VEHICLE</span><h2>${esc(v.name)}</h2><p>${esc([v.brand,v.model,v.year,v.plate].filter(Boolean).join(' · '))||'在車庫完善你的車輛資料'}</p></div><div class="hero-details"><div><strong>${number(mileage(v,rows))}</strong><small>目前里程 · KM</small></div><div><strong>${rows.length}</strong><small>累積紀錄</small></div><button class="secondary" data-tab="vehicles">管理車輛 ${icon('arrow',14)}</button></div></div><div class="stats">${stat('本月總支出',money(monthly),'',`${month} · 所有支出類別`,'expense')}${v.power!=='純電'?stat('平均油耗',fuel.kmL?number(fuel.kmL,2):'—','km/L',fuel.l100?number(fuel.l100,2)+' L/100km · 滿箱法':'需兩次加滿與完整加油紀錄','fuel'):stat('累積充電量',number(rows.filter(r=>r.type==='charge').reduce((s,r)=>s+r.kwh,0),1),'kWh','已記錄的充入電量','charge')}${stat('累積總支出',money(rows.reduce((s,r)=>s+r.cost,0)),'','不含未登錄支出','reports')}${stat('待辦提醒',due.filter(r=>['soon','overdue'].includes(reminderStatus(r,mileage(v,rows)))).length,'項','30 天或 1,000 km 內到期','reminders')}</div><div class="grid-two"><section class="panel"><div class="panel-header"><h2>支出趨勢</h2><span class="badge">近半年</span></div><div class="panel-body">${rows.length?expenseChart(rows):'<div class="chart-empty">你的支出趨勢，從第一筆紀錄開始。<br>記錄加油、保養與日常開銷。</div>'}</div></section><section class="panel"><div class="panel-header"><h2>保養與待辦</h2><button class="quiet" data-tab="reminders">查看全部 ${icon('arrow',14)}</button></div>${due.length?due.slice(0,3).map(reminderRow).join(''):empty('目前沒有待辦','為保養、保險或驗車設定提醒。','reminders','reminder','新增提醒')}</section></div><section class="panel"><div class="panel-header"><h2>最近紀錄</h2><button class="quiet" data-tab="records">查看全部 ${icon('arrow',14)}</button></div>${rows.length?rows.slice(0,5).map(recordRow).join(''):empty('你的汽車履歷，從這裡開始','加油、保養、停車費，記下每一次用車。')}</section>`;}
function quickActions(){return `<div class="quick-actions"><span>快速新增</span>${vehicle()?.power!=='純電'?`<button data-action="fuel">${icon('fuel',17)} 加油</button>`:''}<button data-action="odometer">更新里程</button><button data-action="maintenance">${icon('maintenance',17)} 保養維修</button><button data-action="tire">${icon('vehicles',17)} 輪胎</button><button data-action="tax">${icon('expense',17)} 稅費</button><button data-action="insurance">${icon('expense',17)} 保險</button></div>`;}
function recordList(){const rows=records().filter(r=>(!filterType||r.type===filterType)&&(!from||r.date>=from)&&(!to||r.date<=to)&&(!query||[r.notes,r.vendor,r.category,r.invoice,...r.items||[]].join(' ').toLowerCase().includes(query.toLowerCase())));return heading('用車紀錄','完整的履歷，讓每一次用車都有跡可循。')+quickActions()+`<div class="filters"><input id="record-search" type="search" placeholder="搜尋項目、店家或備註" aria-label="搜尋紀錄" value="${esc(query)}"><select id="type-filter" aria-label="紀錄類別"><option value="">全部類別</option>${availableTypes().map(([k,v])=>`<option value="${k}" ${filterType===k?'selected':''}>${v}</option>`).join('')}</select><div class="filter-dates"><input type="date" id="from-date" aria-label="開始日期" value="${from}"><span class="muted">至</span><input type="date" id="to-date" aria-label="結束日期" value="${to}"></div><button class="secondary" data-action="reset-filters">重設</button></div><section class="panel"><div class="panel-header"><h2>${rows.length} 筆紀錄</h2><span class="muted">合計 ${money(rows.reduce((s,r)=>s+r.cost,0))}</span></div>${rows.length?rows.map(recordRow).join(''):empty('沒有符合的紀錄','試著調整篩選，或新增一筆用車紀錄。')}</section>`;}
function reminderPage(){const rows=reminders().sort((a,b)=>Number(a.done)-Number(b.done)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));return heading('提醒與保養計畫','日期或里程，任一門檻到期就提醒。','reminder')+`<div class="notice">依車主手冊及原廠建議設定保養間隔。提醒會在開啟網站時顯示；目前不提供背景推播。</div><section class="panel">${rows.length?rows.map(reminderRow).join(''):empty('讓下一次保養，準時發生','加入機油、輪胎、保險、稅金或驗車提醒。','reminders','reminder','新增提醒')}</section>`;}
function reports(){const v=vehicle(),rows=records(),fuel=fuelStats(rows),total=rows.reduce((s,r)=>s+r.cost,0),start=Number(v.odometer)||0,dist=Math.max(0,mileage(v,rows)-start),charges=rows.filter(r=>r.type==='charge'),energy=charges.reduce((s,r)=>s+r.kwh,0);if(v.power==='純電')return electricReports(v,rows,total,dist,charges,energy);return heading('用車分析','從紀錄看趨勢，從數據做決定。')+`<div class="actions" style="margin-bottom:20px"><button class="secondary" data-action="csv">${icon('download',16)} 匯出此車 CSV</button><button class="secondary" data-action="print">列印報表</button></div><div class="stats">${v.power!=='純電'?stat('有效平均油耗',fuel.kmL?number(fuel.kmL,2):'—','km/L',`${fuel.intervals.length} 個完整滿箱區間`,'fuel'):''}${stat('記錄期間成本',dist?number(total/dist,2):'—','TWD/km',`里程差 ${number(dist)} km；未記錄支出不計`,'reports')}${['純電','插電式油電'].includes(v.power)?stat('累積充電量',number(energy,1),'kWh','充入電量，包含充電損耗','charge'):''}${v.power!=='純電'?stat('加油總量',number(rows.filter(r=>r.type==='fuel').reduce((s,r)=>s+r.liters,0),1),'L','全部加油紀錄合計','fuel'):''}</div><div class="grid-two"><section class="panel"><div class="panel-header"><h2>支出分布</h2><span class="muted">${money(total)}</span></div><div class="panel-body">${availableTypes().map(([k,t])=>{const sum=rows.filter(r=>r.type===k).reduce((s,r)=>s+r.cost,0);return `<div class="cost-bar"><span>${t}</span><div class="track"><i style="width:${total?sum/total*100:0}%"></i></div><strong>${money(sum)}</strong></div>`;}).join('')}<p class="report-meta">幣別：新臺幣（TWD）。期間成本 = 全部已登錄支出 ÷（最新里程 − 建立車輛時的起始里程）。請完整登錄以提高參考價值。</p></div></section><section class="panel"><div class="panel-header"><h2>近半年支出</h2></div><div class="panel-body">${expenseChart(rows)}</div></section></div><section class="panel"><div class="panel-header"><h2>${v.power==='純電'?'純電車充電分析':'滿箱油耗明細'}</h2><span class="muted">km/L · L/100km</span></div>${fuel.intervals.length?`<div class="table-scroll"><table><thead><tr><th>結束日期</th><th>行駛距離</th><th>消耗燃油</th><th>km/L</th><th>L/100km</th></tr></thead><tbody>${fuel.intervals.slice().reverse().map(x=>`<tr><td>${x.date}</td><td>${number(x.distance)} km</td><td>${number(x.liters,2)} L</td><td>${number(x.kmL,2)}</td><td>${number(x.l100,2)}</td></tr>`).join('')}</tbody></table></div>`:empty('還沒有完整滿箱區間','需要兩次加滿；中途未加滿的油量會累積至下一次加滿。','fuel',null)}<div class="panel-body report-meta">滿箱法：區間公里數 ÷ 區間補充油量。起點那次加油量不計入，終點加滿及中途補油則計入。標記漏記會中斷區間。平均值按總公里／總燃油加權；充電紀錄不直接推算行駛電耗。</div></section>`;}
function vehicleFacts(v,keys){return keys.filter(([label,key])=>v[key]!==undefined&&v[key]!==''&&v[key]!==null).map(([label,key,unit=''])=>`<div><dt>${label}</dt><dd>${esc(v[key])}${unit}</dd></div>`).join('');}
function garage(){return heading('我的車庫','一個地方，照顧你的每一輛車。','vehicle')+`<div class="vehicle-grid">${vehicles().map(v=>{const rows=live(store.state,'records').filter(r=>r.vehicleId===v.id);return `<article class="panel vehicle-card" style="--card-accent:${vehicleTheme(v).accent}">${cardPhoto(v)}<div class="vehicle-line">${icon('vehicles',32)}<span class="badge">${v.id===vehicle()?.id?'目前使用':'車庫車輛'}</span></div><h2>${esc(v.name)}</h2><p class="muted">${esc([v.brand,v.model,v.year].filter(Boolean).join(' · '))||'尚未填寫車型'}</p><dl><div><dt>車牌</dt><dd>${esc(v.plate||'—')}</dd></div><div><dt>動力類型</dt><dd>${esc(v.power||'汽油')}</dd></div><div><dt>目前里程</dt><dd>${number(mileage(v,rows))} km</dd></div><div><dt>下次定期檢驗</dt><dd>${esc(v.inspectionDueDate||'—')}</dd></div></dl><details class="vehicle-facts"><summary>查看完整車輛資料</summary><dl>${vehicleFacts(v,[['車身號碼／VIN','vin'],['引擎號碼','engineNumber'],['出廠日期','manufactureDate'],['初次領牌日期','registrationDate'],['購車日期','purchaseDate'],['車長','lengthMm',' mm'],['車寬','widthMm',' mm'],['車高','heightMm',' mm'],['軸距','wheelbaseMm',' mm'],['輪胎尺碼','tireSize'],['油箱容量','tank',' L'],['引擎／馬達型式','engineType'],['最大馬力','horsepower',' hp'],['最大扭力','torqueNm',' Nm'],['變速箱','transmission'],['驅動系統','driveSystem'],['駕駛輔助','driverAssistance'],['安全氣囊','airbags'],['環景／影像','cameraSystem'],['照明系統','lightingSystem'],['車體結構／安全','bodySafety'],['年度牌照稅預估','annualLicenseTax',' TWD'],['年度燃料使用費預估','annualFuelFee',' TWD']])||'<div class="muted">尚未填寫詳細規格</div>'}</dl></details><div class="actions"><button class="primary" data-select-vehicle="${v.id}">查看紀錄</button><button class="secondary" data-edit-vehicle="${v.id}">編輯</button></div></article>`;}).join('')}</div>`;}
function settings(){return `<div class="page-heading"><div><span class="eyebrow">YOUR DATA, YOUR CONTROL</span><h1>資料與設定</h1><p class="muted">免費使用，沒有付費牆與廣告。</p></div></div>${syncState==='error'?`<div class="notice warning">${esc(syncMessage)}。未上傳的修改會保留，授權後可重試。</div>`:''}<div class="settings-grid"><section class="panel"><div class="panel-header"><h2>Google 雲端同步</h2>${icon('cloud')}</div><div class="panel-body"><h3>${account?esc(account.email||account.name):'目前使用本機模式'}</h3><p>${account?'資料同步至你的 Google Drive 私有應用資料區，其他使用者無法讀取。':'登入同一個 Google 帳號，在手機與電腦查看同一份車輛資料。'}</p><p>狀態：${esc(syncMessage)}<br>待上傳：${store.pending.length} 批修改</p><div class="actions"><button class="primary" data-action="login">${account?'繼續同步／切換帳號':'登入 Google'}</button>${account?'<button class="secondary" data-action="sync">立即同步</button><button class="secondary" data-action="logout">登出</button>':''}</div><p class="report-meta">重新整理會保留已選帳號與有效授權；授權到期時請點選繼續同步。網路離線時仍可記錄，重新連線並授權後補傳。登出後回到獨立的本機資料。</p></div></section><section class="panel"><div class="panel-header"><h2>備份與匯出</h2>${icon('download')}</div><div class="panel-body"><p>JSON 備份包含全部車輛、紀錄與提醒；CSV 適合使用試算表分析單一車輛紀錄。</p><div class="actions"><button class="secondary" data-action="backup">匯出 JSON 備份</button><button class="secondary" data-action="import">匯入 JSON 備份</button>${vehicle()?'<button class="secondary" data-action="csv">匯出此車 CSV</button>':''}</div>${account?'<button class="link-button" data-action="import-guest">將此瀏覽器的本機資料加入帳號</button>':''}<input type="file" id="import-file" accept="application/json,.json" hidden><p class="report-meta">匯入會合併資料；相同 ID 採用匯入內容。請先匯出目前備份。清除瀏覽器資料會移除尚未同步的紀錄。</p></div></section><section class="panel"><div class="panel-header"><h2>使用指南</h2></div><div class="panel-body"><ul><li>首次加油請標記是否加滿；漏記時勾選「前次加油漏記」。</li><li>各車輛獨立計算油耗、支出與到期提醒。</li><li>每次保養可選多個項目，保存店家、零件費及工資。</li><li>提醒以日期或里程先到者為準，可記錄完成、自行更換或延後。</li><li>支援汽油、柴油、油電、插電式油電及純電車。</li><li>可從瀏覽器選單「加入主畫面」安裝網站。</li></ul></div></section><section class="panel"><div class="panel-header"><h2>隱私與服務</h2></div><div class="panel-body"><p>沒有廣告、分析追蹤或共用的車主資料庫。Google 存取權杖暫存於此分頁工作階段，重新整理可保持登入；授權到期需點選繼續同步。</p><p>若同步無法使用，請依儲存庫 README 確認 Drive API、OAuth 網站來源與測試使用者設定。</p><a href="./privacy.html">閱讀隱私權政策</a></div></section></div>`;}
function noVehiclePage(){
  const pages={records:['用車紀錄','完整的履歷，讓每一次用車都有跡可循。','先建立車輛，開始記錄用車生活','加油、充電、保養、支出與行程，都會歸屬到你選擇的車輛。','records'],reminders:['提醒與保養計畫','日期或里程，任一門檻到期就提醒。','先建立車輛，再設定提醒','為你的車輛設定保養、保險、驗車與稅金提醒。','reminders'],reports:['用車分析','從紀錄看趨勢，從數據做決定。','先建立車輛，累積你的用車數據','加入車輛與紀錄後，即可查看油耗、支出趨勢及每公里成本。','reports'],vehicles:['我的車庫','一個地方，照顧你的每一輛車。','車庫裡還沒有車輛','新增第一輛車，建立專屬的汽車管理履歷。','vehicles']};
  const [title,sub,message,description,key]=pages[currentTab];
  return heading(title,sub,'vehicle')+`<section class="panel">${empty(message,description,key,'vehicle','新增車輛')}</section>`;
}
function render(){navigation();renderStatus();const v=vehicle();applyVehicleTheme(v);if(v){selected=v.id;localStorage.setItem('car-manager:selected',selected);}$('#main').innerHTML=currentTab==='settings'?settings():!v?(currentTab==='dashboard'?welcome():noVehiclePage()):({dashboard,records:recordList,reminders:reminderPage,reports,vehicles:garage}[currentTab]||dashboard)();}
const field=(label,name,value='',type='text',extra='',help='')=>`<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}>${help?'<small>'+help+'</small>':''}</label>`;
const selectField=(label,name,choices,value)=>`<label class="field"><span>${label}</span><select name="${name}">${choices.map(x=>{const [k,v]=Array.isArray(x)?x:[x,x];return `<option value="${esc(k)}" ${value===k?'selected':''}>${esc(v)}</option>`;}).join('')}</select></label>`;
const notes=(value='')=>`<label class="field wide"><span>備註</span><textarea name="notes" maxlength="4000" placeholder="補充用車狀況、零件規格或注意事項">${esc(value)}</textarea></label>`;
const vehicleSection=(title,body)=>`<section class="vehicle-form-section"><h3>${title}</h3><div class="form-grid">${body}</div></section>`;
function showEditor(title,body,collection,id){editing={collection,id};$('#dialog-title').textContent=title;$('#editor-form').innerHTML=`<div class="form-grid">${body}<p id="form-error" class="form-error" role="alert"></p></div><div class="form-actions">${id&&collection!=='resolution'?'<button type="button" class="secondary danger" data-action="delete-entry">刪除</button>':''}<button type="button" class="secondary" data-action="cancel">取消</button><button type="submit" class="primary">儲存</button></div>`;$('#editor').showModal();}
function editVehicle(id){
  const v=vehicles().find(x=>x.id===id)||{},color=v.color||themeKeys[vehicles().length%themeKeys.length];
  const photo='<div class="vehicle-photo-field"><div id="vehicle-photo-preview" class="vehicle-photo-preview">'+(vehiclePhoto(v)?'<img src="'+esc(vehiclePhoto(v))+'" alt="車輛照片預覽">':icon('vehicles',30))+'</div><div><strong>車輛照片</strong><p>可選擇自己的愛車照片。會縮小後與車輛資料一同備份及同步。</p><label class="photo-upload">選擇照片<input id="vehicle-photo-file" type="file" accept="image/*" hidden></label><button type="button" class="photo-remove" data-action="remove-photo">移除照片</button></div></div>';
  const colorNames={teal:'青綠',blue:'海藍',copper:'暖銅',violet:'紫羅蘭',forest:'森林綠',rose:'玫瑰',slate:'石板灰',graphite:'石墨灰',black:'黑色',silver:'銀灰',gold:'香檳金'};
  const colors='<fieldset class="theme-choice"><legend>車輛主題色</legend>'+themeKeys.map(key=>'<label><input type="radio" name="color" aria-label="'+colorNames[key]+'" value="'+key+'" '+(color===key?'checked':'')+'><span style="--swatch:'+themes[key].accent+'"></span></label>').join('')+'</fieldset>';
  const basic=field('車輛名稱 *','name',v.name,'text','required maxlength="80" placeholder="例如：我的 Corolla"')+field('車牌','plate',v.plate,'text','maxlength="20"')+field('廠牌','brand',v.brand,'text','maxlength="60"')+field('車型','model',v.model,'text','maxlength="80"')+field('年份','year',v.year||'','number','min="1900" max="2100" step="1"')+selectField('動力類型','power',['汽油','柴油','油電','插電式油電','純電'],v.power||'汽油')+selectField('常用油種','preferredFuel',[['','未設定'],['92 無鉛','92 無鉛'],['95 無鉛','95 無鉛'],['98 無鉛','98 無鉛'],['柴油','柴油']],v.preferredFuel||'')+field('起始里程 (km) *','odometer',v.odometer??0,'number','required min="0" max="9999999" step="1"','建立管理紀錄時的里程，作為成本計算基準。');
  const registration=field('引擎號碼','engineNumber',v.engineNumber,'text','maxlength="60"')+field('車身號碼／VIN','vin',v.vin,'text','maxlength="30"')+field('出廠日期','manufactureDate',v.manufactureDate,'date')+field('初次領牌日期','registrationDate',v.registrationDate,'date')+field('購車日期','purchaseDate',v.purchaseDate,'date');
  const dimensions=field('車長 (mm)','lengthMm',v.lengthMm??'','number','min="0" max="30000" step="1"')+field('車寬 (mm)','widthMm',v.widthMm??'','number','min="0" max="10000" step="1"')+field('車高 (mm)','heightMm',v.heightMm??'','number','min="0" max="10000" step="1"')+field('軸距 (mm)','wheelbaseMm',v.wheelbaseMm??'','number','min="0" max="30000" step="1"')+field('輪胎尺碼','tireSize',v.tireSize,'text','maxlength="80" placeholder="例如 225/45 R17"')+field('油箱容量 (L)','tank',v.tank??'','number','min="0" max="1000" step="0.1"');
  const powertrain=field('引擎／馬達型式','engineType',v.engineType,'text','maxlength="120"')+field('最大馬力 (hp)','horsepower',v.horsepower??'','number','min="0" max="5000" step="0.1"')+field('最大扭力 (Nm)','torqueNm',v.torqueNm??'','number','min="0" max="10000" step="0.1"')+field('變速箱','transmission',v.transmission,'text','maxlength="100"')+field('驅動系統','driveSystem',v.driveSystem,'text','maxlength="100"');
  const safety=field('駕駛輔助','driverAssistance',v.driverAssistance,'text','maxlength="300"')+field('安全氣囊','airbags',v.airbags,'text','maxlength="150"')+field('環景／影像系統','cameraSystem',v.cameraSystem,'text','maxlength="150"')+field('照明系統','lightingSystem',v.lightingSystem,'text','maxlength="150"')+field('車體結構／安全配備','bodySafety',v.bodySafety,'text','maxlength="300"');
  const ownership=field('年度牌照稅預估 (TWD)','annualLicenseTax',v.annualLicenseTax??'','number','min="0" max="9999999" step="1"')+field('年度燃料使用費預估 (TWD)','annualFuelFee',v.annualFuelFee??'','number','min="0" max="9999999" step="1"')+field('下次定期檢驗日期','inspectionDueDate',v.inspectionDueDate,'date')+`<p class="form-help">稅額僅供預估；實際繳費請新增「稅費」紀錄。保單與續保日期請在「保險」紀錄管理。</p>`;
  showEditor(id?'編輯車輛':'新增車輛',photo+colors+vehicleSection('基本資料',basic)+vehicleSection('車籍資料',registration)+vehicleSection('車身尺碼與空間',dimensions)+vehicleSection('動力與操控',powertrain)+vehicleSection('主被動安全防護',safety)+vehicleSection('稅費與定期檢驗',ownership)+notes(v.notes),'vehicles',id);
  $('#editor-form').dataset.photo=vehiclePhoto(v);
}
function dynamicFields(type,r={}){
  if(type==='tax') return selectField('稅費種類','category',['牌照稅','燃料使用費','驗車規費','其他稅費'],r.category||'牌照稅')+field('繳費年度／期別','period',r.period,'text','maxlength="60" placeholder="例如：2026 年度"')+field('下次間隔（月）','intervalMonths',r.intervalMonths??12,'number','min="1" max="120" step="1"','依你輸入的期別推算，不代表法定繳納期限。')+field('實際下次繳費日','nextDueDate',r.nextDueDate,'date')+field('繳費機關／通路','vendor',r.vendor,'text','maxlength="100"');
  if(type==='insurance') return selectField('險種','category',['強制險','第三責任險','車體險','超額責任險','其他保險'],r.category||'強制險')+field('保險公司','vendor',r.vendor,'text','maxlength="100"')+field('保單號碼','policyNumber',r.policyNumber,'text','maxlength="100"')+field('保障起日','coverageStart',r.coverageStart||r.date||today(),'date')+field('保障迄日','coverageEnd',r.coverageEnd,'date')+field('續保間隔（月）','intervalMonths',r.intervalMonths??12,'number','min="1" max="120" step="1"')+field('自負額 (TWD)','deductible',r.deductible??'','number','min="0" step="1"')+field('保障摘要','coverage',r.coverage,'text','maxlength="300"');
  if(type==='tire') return selectField('輪胎作業','category',['輪胎更換','前後換位','四輪定位','補胎','胎紋檢查'],r.category||'輪胎更換')+field('品牌／型號與尺寸','spec',r.spec,'text','maxlength="200"')+field('胎紋深度 (mm)','tread',r.tread??'','number','min="0" max="30" step="0.1"')+field('店家','vendor',r.vendor,'text','maxlength="100"');
  if(type==='inflation') return field('前輪胎壓 (psi)','frontPressure',r.frontPressure??'','number','min="0" max="100" step="0.1"')+field('後輪胎壓 (psi)','rearPressure',r.rearPressure??'','number','min="0" max="100" step="0.1"')+selectField('測量狀態','category',['冷胎','熱胎'],r.category||'冷胎')+field('地點','vendor',r.vendor,'text','maxlength="100"','請依車門標示與車主手冊判讀胎壓。');
  if(type==='battery') return selectField('電瓶作業','category',['更換電瓶','電瓶檢查','充電／救援'],r.category||'更換電瓶')+field('品牌／規格','spec',r.spec,'text','maxlength="200"')+field('保固（月）','warrantyMonths',r.warrantyMonths??'','number','min="0" max="120" step="1"')+field('服務店家','vendor',r.vendor,'text','maxlength="100"');
  if(type==='fuel') {const last=records().find(x=>x.type==='fuel'),preferred=r.category||vehicle()?.preferredFuel||last?.category||(vehicle()?.power==='柴油'?'柴油':'95 無鉛');return `<div class="fuel-receipt field wide"><label class="photo-upload">拍照／選擇加油單<input id="fuel-receipt-file" type="file" accept="image/*" hidden></label><span id="fuel-receipt-status" role="status">照片只在此裝置辨識；首次需載入 OCR 資料，之後可離線使用。辨識後請核對金額與公升。</span><details id="fuel-receipt-raw" hidden><summary>查看辨識文字</summary><pre></pre></details></div>`+field('加油量 (L，可略)','liters',r.liters||'','number','min="0.01" max="10000" step="0.01"','未填公升仍可記帳，但不計入油耗。')+selectField('燃油種類','category',['92 無鉛','95 無鉛','98 無鉛','柴油','其他'],preferred)+field('加油站／店家','vendor',r.vendor||last?.vendor||'','text','maxlength="100"')+field('加油單價 (TWD/L)','unitPrice',r.liters?Number(r.cost/r.liters).toFixed(3):'','number','min="0" step="0.001"','單價與公升皆有填寫時，可帶入總額；折扣後請核對實付金額。')+`<div class="field wide"><label class="check"><input name="full" type="checkbox" ${r.full!==false?'checked':''}>這次加滿油箱</label><label class="check"><input name="missed" type="checkbox" ${r.missed?'checked':''}>前次加油漏記，重新開始油耗區間</label></div>`;}
  if(type==='charge') return field('充入電量 (kWh) *','kwh',r.kwh??'','number','required min="0.01" max="10000" step="0.01"')+selectField('充電方式','category',['AC 慢充','DC 快充','家用充電','其他'],r.category||'AC 慢充')+field('開始電量 (%)','socStart',r.socStart??'','number','min="0" max="100" step="1"')+field('結束電量 (%)','socEnd',r.socEnd??'','number','min="0" max="100" step="1"')+field('充電站／地點','vendor',r.vendor,'text','maxlength="100"');
  if(type==='maintenance') return `<fieldset><legend>保養／維修項目 *</legend><div class="check-list">${services.filter(x=>vehicle()?.power!=='純電'||!['機油／機油濾芯','變速箱油','火星塞','皮帶／正時系統'].includes(x)||(r.items||[]).includes(x)).map(x=>`<label class="check"><input type="checkbox" name="items" value="${x}" ${(r.items||[]).includes(x)?'checked':''}>${x}</label>`).join('')}</div></fieldset>`+field('服務店家','vendor',r.vendor,'text','maxlength="100"')+field('零件／耗材費 (TWD)','parts',r.parts??'','number','min="0" max="99999999" step="0.01"')+field('工資 (TWD)','labor',r.labor??'','number','min="0" max="99999999" step="0.01"','填寫零件費與工資可帶入總額。')+field('零件規格／料號','spec',r.spec,'text','maxlength="200"');
  if(type==='odometer') return '<p class="form-help">只記錄目前儀表里程，不會產生支出；保養提醒會立即依此讀數重新判斷。</p>';
  if(type==='trip') return field('行駛距離 (km) *','distance',r.distance??'','number','required min="0.1" max="100000" step="0.1"')+selectField('行程用途','category',['私人','通勤','商務','旅遊','其他'],r.category||'私人')+field('起點','origin',r.origin,'text','maxlength="100"')+field('終點','destination',r.destination,'text','maxlength="100"')+`<p class="form-help">儀表里程填行程結束時的讀數；行駛距離記錄這一趟的使用里程。</p>`;
  return selectField('支出類別','category',['停車費','eTag 儲值','ETC／過路費','洗車美容','保險','牌照稅','燃料使用費','驗車','配件','罰單','其他'],r.category||'停車費')+field('店家／收款方','vendor',r.vendor,'text','maxlength="100"');
}
function editRecord(id, preferredType='') {
  if(!vehicle()){editVehicle();return;}
  const existing=records().find(x=>x.id===id);
  const allowed=availableTypes();
  const initial=preferredType||filterType||allowed[0][0];
  const r=existing||{type:allowed.some(([key])=>key===initial)?initial:allowed[0][0],date:today(),odometer:initial==='fuel'?'':mileage(vehicle(),records())};
  const choices=existing&&!allowed.some(([key])=>key===existing.type)?[...allowed,[existing.type,types[existing.type]]]:allowed;
  showEditor(id?'編輯用車紀錄':'新增用車紀錄',selectField('紀錄類別','type',choices,r.type)+field('日期 *','date',r.date,'date','required')+field('儀表里程 (km)','odometer',r.odometerEstimated?'':r.odometer,'number',`min="0" max="9999999" step="1" placeholder="目前 ${mileage(vehicle(),records())} km"`,'加油時可略過；不填則只記費用，不計入油耗。')+field('總金額 (TWD)','cost',r.cost??'','number','min="0" max="99999999" step="0.01"')+`<div id="dynamic-fields" class="field wide"><div class="form-grid">${dynamicFields(r.type,r)}</div></div>`+field('發票／收據編號','invoice',r.invoice,'text','maxlength="100"')+notes(r.notes)+`<p class="form-help">金額為實付金額，可填 0。行程只填本次直接支出，避免重複計入加油或稅費。</p>`,'records',id);
  const adjustCost=type=>{const cost=$('[name=cost]'),odo=$('[name=odometer]');cost.closest('.field').hidden=type==='odometer';if(type==='odometer')cost.value='0';odo.required=type!=='fuel';cost.required=type!=='fuel'&&type!=='odometer';};
  adjustCost(r.type);
  $('[name=type]').addEventListener('change',e=>{$('#dynamic-fields').innerHTML=`<div class="form-grid">${dynamicFields(e.target.value)}</div>`;adjustCost(e.target.value);});
}
function editReminder(id){
  if(!vehicle()){editVehicle();return;}
  const r=reminders().find(x=>x.id===id)||{};
  showEditor(id?'編輯保養計畫':'新增保養計畫',field('事項名稱 *','title',r.title,'text','required maxlength="100" placeholder="例如：機油與濾芯"')+selectField('類別','category',['定期保養','保險','驗車','稅金','輪胎','電瓶','其他'],r.category||'定期保養')+field('上次完成日期','lastDate',r.lastDate,'date')+field('上次完成里程 (km)','lastKm',r.lastKm??'','number','min="0" max="9999999" step="1"')+field('每隔多少公里','intervalKm',r.intervalKm??'','number','min="0" max="1000000" step="1"')+field('每隔多少個月','intervalMonths',r.intervalMonths??'','number','min="0" max="120" step="1"')+field('下次到期日期','dueDate',r.dueDate,'date')+field('下次到期里程 (km)','dueKm',r.dueKm||'','number','min="1" max="9999999" step="1"')+`<p class="form-help">填入上次完成時間與週期，會自動推算下次到期；也可直接填到期日期或里程。日期或里程任一項先到，即列為已到期。</p><label class="check"><input name="done" type="checkbox" ${r.done?'checked':''}>停止此計畫</label>`+notes(r.notes),'reminders',id);
}
function saveForm(e){
  e.preventDefault(); const f=$('#editor-form'); if(!f.reportValidity())return;
  const d=new FormData(f),get=k=>String(d.get(k)||'').trim(),num=k=>Number(d.get(k)||0);
  try {
    let entry={id:editing.id,notes:get('notes')};
    if(editing.collection==='vehicles') {
      entry={...entry,name:get('name'),plate:get('plate'),brand:get('brand'),model:get('model'),year:num('year')||'',power:get('power'),preferredFuel:get('preferredFuel'),odometer:num('odometer'),tank:num('tank'),vin:get('vin'),purchaseDate:get('purchaseDate'),color:get('color'),photo:f.dataset.photo||''};
      for(const key of ['engineNumber','manufactureDate','registrationDate','lengthMm','widthMm','heightMm','wheelbaseMm','tireSize','engineType','horsepower','torqueNm','transmission','driveSystem','driverAssistance','airbags','cameraSystem','lightingSystem','bodySafety','annualLicenseTax','annualFuelFee','inspectionDueDate'])entry[key]=['lengthMm','widthMm','heightMm','wheelbaseMm','horsepower','torqueNm','annualLicenseTax','annualFuelFee'].includes(key)?(get(key)===''?'':num(key)):get(key);
    } else if(editing.collection==='records') {
      const type=get('type');
      entry={...entry,vehicleId:vehicle().id,type,date:get('date'),odometer:type==='fuel'&&get('odometer')===''?mileage(vehicle(),records()):num('odometer'),cost:num('cost'),category:get('category'),vendor:get('vendor'),invoice:get('invoice')};
      if(type==='odometer'){entry.cost=0;entry.category='里程更新';}
      if(entry.odometer<vehicle().odometer)throw new Error('紀錄里程低於車輛起始里程，請檢查讀數。');
      if(type==='fuel'){
        Object.assign(entry,{liters:num('liters'),full:d.has('full'),missed:d.has('missed'),odometerEstimated:get('odometer')===''});
        if(!entry.cost&&!entry.liters)throw new Error('請填寫實付金額或加油公升數');
      }
      if(type==='charge'){
        Object.assign(entry,{kwh:num('kwh'),socStart:get('socStart')===''?null:num('socStart'),socEnd:get('socEnd')===''?null:num('socEnd')});
        if(entry.socStart!==null&&entry.socEnd!==null&&entry.socEnd<entry.socStart)throw new Error('結束電量不可低於開始電量');
      }
      if(type==='maintenance'){
        Object.assign(entry,{items:d.getAll('items'),parts:num('parts'),labor:num('labor'),spec:get('spec')});
        if(!entry.items.length)throw new Error('請至少選擇一個保養／維修項目');
      }
      if(type==='trip')Object.assign(entry,{distance:num('distance'),origin:get('origin'),destination:get('destination')});
      for(const key of ['period','intervalMonths','nextDueDate','policyNumber','coverageStart','coverageEnd','deductible','coverage','spec','tread','frontPressure','rearPressure','warrantyMonths'])if(d.has(key))entry[key]=['intervalMonths','deductible','tread','frontPressure','rearPressure','warrantyMonths'].includes(key)?num(key):get(key);
      if(type==='insurance'&&entry.coverageStart&&entry.coverageEnd&&entry.coverageEnd<entry.coverageStart)throw new Error('保障迄日不可早於起日');
    } else {
      entry={...entry,vehicleId:vehicle().id,title:get('title'),category:get('category'),lastDate:get('lastDate'),lastKm:num('lastKm'),intervalKm:num('intervalKm'),intervalMonths:num('intervalMonths'),dueDate:get('dueDate'),dueKm:num('dueKm'),done:d.has('done')};
      const calculated=nextServiceDue({date:entry.lastDate,odometer:entry.lastKm,intervalMonths:entry.intervalMonths,intervalKm:entry.intervalKm});
      if(!entry.dueDate)entry.dueDate=calculated.dueDate;
      if(!entry.dueKm)entry.dueKm=calculated.dueKm;
      if(!entry.dueDate&&!entry.dueKm)throw new Error('請填寫週期與上次完成資訊，或直接填下次到期日期／里程');
    }
    const saved=store.mutate(editing.collection,entry);
    if(editing.collection==='vehicles'){selected=saved.id;updateInspectionReminder(saved);}
    if(editing.collection==='records'&&['tax','insurance'].includes(saved.type))updateRecurringCostReminder(saved);
    $('#editor').close();render();toast('已儲存在本機'+(account?'，正在同步至 Google Drive':''));void sync.sync();
  } catch(err){$('#form-error').textContent=err.name==='QuotaExceededError'?'本機儲存空間不足，請先匯出備份。':err.message;}
}
function updateRecurringCostReminder(record){
  const dueDate=record.nextDueDate||(record.type==='insurance'&&record.coverageEnd)||addMonths(record.date,record.intervalMonths||12);
  if(!dueDate)return;
  const title=record.type==='tax'?`${record.category} · 下期繳費`:`${record.category} · 續保`;
  const linked=reminders().find(r=>r.sourceRecordId===record.id)||reminders().find(r=>r.title===title&&!r.done);
  store.mutate('reminders',{...linked,id:linked?.id,sourceRecordId:record.id,vehicleId:record.vehicleId,title,category:record.type==='tax'?'稅金':'保險',lastDate:record.date,lastKm:record.odometer,intervalMonths:record.intervalMonths||12,intervalKm:0,dueDate,dueKm:0,done:false,notes:record.type==='insurance'?`${record.vendor||''} ${record.policyNumber||''}`.trim():record.period||''});
}
function updateInspectionReminder(v){
  const existing=live(store.state,'reminders').find(r=>r.vehicleId===v.id&&r.sourceVehicleInspection===v.id);
  if(!v.inspectionDueDate){if(existing)store.mutate('reminders',{...existing,deleted:true});return;}
  if(existing?.dueDate===v.inspectionDueDate&&!existing.done)return;
  store.mutate('reminders',{...existing,id:existing?.id,vehicleId:v.id,sourceVehicleInspection:v.id,title:'定期檢驗',category:'驗車',dueDate:v.inspectionDueDate,dueKm:0,done:false,notes:'依車籍資料設定；實際檢驗規定與日期請以主管機關通知為準。'});
}
function resolveReminder(id){
  const r=reminders().find(x=>x.id===id);if(!r)return;
  editing={collection:'resolution',id};
  showEditor('處理保養提醒',`<p class="form-help">${esc(r.title)} · ${r.dueDate?'到期 '+esc(r.dueDate):''} ${r.dueKm?'里程 '+number(r.dueKm)+' km':''}</p>`+selectField('處理方式','resolution',[['done','已保養／更換'],['self','自行更換'],['defer','暫不處理，延後提醒']], 'done')+field('處理日期','date',today(),'date','required')+field('目前里程 (km)','odometer',mileage(vehicle(),records()),'number','required min="0" step="1"')+field('延後至日期','deferDate','','date')+field('延後至里程 (km)','deferKm','','number','min="0" step="1"')+notes(''),'resolution',id);
}
function saveResolution(e){
  e.preventDefault(); const d=new FormData($('#editor-form')),r=reminders().find(x=>x.id===editing.id);
  const get=k=>String(d.get(k)||'').trim(),odometer=Number(get('odometer')),kind=get('resolution');
  try {
    if(!r)throw new Error('找不到提醒');
    if(odometer<vehicle().odometer)throw new Error('目前里程低於車輛起始里程');
    let due;
    if(kind==='defer'){
      due={dueDate:get('deferDate'),dueKm:Number(get('deferKm')||0)};
      if(!due.dueDate&&!due.dueKm)throw new Error('請輸入延後到的日期或里程');
      if(due.dueDate&&due.dueDate<=today() || due.dueKm&&due.dueKm<=odometer)throw new Error('延後門檻必須晚於目前日期或里程');
    } else {
      due=nextServiceDue({date:get('date'),odometer,intervalMonths:r.intervalMonths||0,intervalKm:r.intervalKm||0});
      if(!due.dueDate&&!due.dueKm)due={dueDate:r.dueDate,dueKm:r.dueKm};
    }
    store.mutate('records',{vehicleId:r.vehicleId,type:'maintenance',date:get('date'),odometer,cost:0,items:[r.title],category:kind==='defer'?'暫不處理':kind==='self'?'自行更換':'已完成',vendor:kind==='self'?'自行處理':'',notes:get('notes'),reminderId:r.id});
    store.mutate('reminders',{...r,...due,done:kind!=='defer'&&!r.intervalMonths&&!r.intervalKm,lastDate:kind==='defer'?r.lastDate:get('date'),lastKm:kind==='defer'?r.lastKm:odometer,lastOutcome:kind,lastOutcomeNotes:get('notes')});
    $('#editor').close();render();toast(kind==='defer'?'已記錄延後原因':'已記錄處理結果並換算下次保養');void sync.sync();
  }catch(err){$('#form-error').textContent=err.message;}
}
function download(name,data,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function backup(){download('汽車管理備份-'+today()+'.json',JSON.stringify(store.state,null,2),'application/json');}
function csv(){const v=vehicle();if(!v)return;const head=['車輛','類別','日期','里程(km)','金額(TWD)','公升(L)','電量(kWh)','加滿','漏記','分類','店家','保養項目','零件費','工資','規格','行程距離(km)','起點','終點','發票','備註','下次到期日期','週期間隔(月)','保單號碼','保障起日','保障迄日','自負額','保障內容','胎壓前(kPa)','胎壓後(kPa)','胎紋(mm)','電瓶保固(月)'];const data=records().map(r=>[v.name,types[r.type],r.date,r.odometerEstimated?'':r.odometer,r.cost,r.liters,r.kwh,r.full===undefined?'':r.full?'是':'否',r.missed?'是':'',r.category,r.vendor,(r.items||[]).join('、'),r.parts,r.labor,r.spec,r.distance,r.origin,r.destination,r.invoice,r.notes,r.nextDueDate,r.intervalMonths,r.policyNumber,r.coverageStart,r.coverageEnd,r.deductible,r.coverage,r.frontPressure,r.rearPressure,r.tread,r.warrantyMonths]);download('汽車管理-'+today()+'.csv','\uFEFF'+[head,...data].map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
function importState(value){validateState(value);const count=value.vehicles.filter(x=>!x.deleted).length;if(!confirm(`匯入 ${count} 輛車的備份？相同 ID 的內容會更新。建議先匯出目前備份。`))return;store.import(value);render();toast('資料已合併匯入');void sync.sync();}
function deleteEntry(){const {collection,id}=editing;if(!id)return;const entry=store.state[collection].find(x=>x.id===id);if(collection==='vehicles'&&(live(store.state,'records').some(x=>x.vehicleId===id)||live(store.state,'reminders').some(x=>x.vehicleId===id))){$('#form-error').textContent='此車輛仍有紀錄或提醒，請先備份並處理相關資料，再刪除車輛。';return;}if(!confirm('確定刪除此'+(collection==='vehicles'?'車輛':collection==='records'?'紀錄':'提醒')+'？刪除也會同步至其他裝置。'))return;try{store.mutate(collection,{...entry,deleted:true});$('#editor').close();render();toast('已刪除');void sync.sync();}catch(e){$('#form-error').textContent=e.message;}}
async function action(name){try{switch(name){case 'vehicle':editVehicle();break;case 'remove-photo':document.querySelector('#editor-form').dataset.photo='';document.querySelector('#vehicle-photo-preview').innerHTML=icon('vehicles',30);break;case 'record':editRecord();break;case 'odometer':editRecord(null,'odometer');break;case 'maintenance':editRecord(null,'maintenance');break;case 'tire':editRecord(null,'tire');break;case 'tax':editRecord(null,'tax');break;case 'insurance':editRecord(null,'insurance');break;case 'reminder':editReminder();break;case 'cancel':$('#editor').close();break;case 'delete-entry':deleteEntry();break;case 'login':sync.login();break;case 'logout':sync.logout();break;case 'sync':if(!account||!sync.token)sync.login();else {await sync.sync();toast(syncMessage);}break;case 'backup':backup();break;case 'csv':csv();break;case 'print':window.print();break;case 'import':$('#import-file').click();break;case 'import-guest':{const raw=localStorage.getItem('car-manager:guest');if(!raw){toast('本機沒有可匯入資料');break;}importState(JSON.parse(raw).state);break;}case 'reset-filters':filterType=query=from=to='';render();break;}}catch(e){toast(e.message);}}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tab){switchTab(b.dataset.tab);return;}if(b.dataset.action==='fuel'){editRecord(null,'fuel');return;}if(b.dataset.action){void action(b.dataset.action);return;}if(b.dataset.newType){editRecord(null,b.dataset.newType);return;}if(b.dataset.editRecord){editRecord(b.dataset.editRecord);return;}if(b.dataset.editVehicle){editVehicle(b.dataset.editVehicle);return;}if(b.dataset.editReminder){editReminder(b.dataset.editReminder);return;}if(b.dataset.resolveReminder){resolveReminder(b.dataset.resolveReminder);return;}if(b.dataset.selectVehicle){selected=b.dataset.selectVehicle;switchTab('dashboard');}});
document.addEventListener('change',async e=>{const t=e.target;if(t.matches('[data-vehicle-select]')){selected=t.value;render();}if(t.id==='type-filter'){filterType=t.value;render();}if(t.id==='from-date'){from=t.value;render();}if(t.id==='to-date'){to=t.value;render();}if(t.id==='import-file'){try{const file=t.files[0];if(!file)return;if(file.size>20000000)throw new Error('備份檔不可大於 20 MB');importState(JSON.parse(await file.text()));}catch(err){toast('匯入失敗：'+err.message);}t.value='';}});
document.addEventListener('change',e=>{if(e.target.id!=='fuel-receipt-file')return;const file=e.target.files?.[0];if(file)void readFuelReceipt(file);e.target.value='';});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='record-search'){if(e.isComposing)return;const start=t.selectionStart;query=t.value;render();$('#record-search').focus();$('#record-search').setSelectionRange(start,start);}if(t.name==='cost')t.dataset.manual='1';if(['unitPrice','liters'].includes(t.name)){const price=$('[name=unitPrice]'),liters=$('[name=liters]'),cost=$('[name=cost]');if(price?.value&&liters?.value&&cost&&!cost.dataset.manual&&(!cost.value||cost.dataset.calculated==='1')){cost.value=(Number(price.value)*Number(liters.value)).toFixed(2);cost.dataset.calculated='1';}}if(['parts','labor'].includes(t.name))$('[name=cost]').value=(Number($('[name=parts]').value)+Number($('[name=labor]').value)).toFixed(2);});
$('#editor-form').addEventListener('submit',e=>editing?.collection==='resolution'?saveResolution(e):saveForm(e));$('#close-dialog').addEventListener('click',()=>$('#editor').close());$('#account-button').addEventListener('click',()=>account?switchTab('settings'):void action('login'));$('#editor').addEventListener('cancel',e=>e.preventDefault());$('#sync-button').addEventListener('click',()=>void action('sync'));
window.addEventListener('hashchange',()=>{if(location.hash==='#main')return;currentTab=location.hash.slice(1)||'dashboard';if(!navs.some(x=>x[0]===currentTab))currentTab='dashboard';render();});
window.addEventListener('online',()=>{toast('網路已連線');void sync.sync();});window.addEventListener('offline',()=>{syncState='local';syncMessage='離線 · 已儲存本機';renderStatus();});
window.addEventListener('focus',()=>void sync.sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync.sync();});
window.addEventListener('storage',e=>{if(e.key===store.key){store.load();render();void sync.sync();}});
document.addEventListener('change',async e=>{
  if(e.target.id!=='vehicle-photo-file')return;
  const file=e.target.files?.[0];if(!file)return;
  const save=$('#editor-form button[type=submit]');save.disabled=true;
  try{
    const photo=await resizeVehiclePhoto(file),form=$('#editor-form');
    if(!$('#editor').open||editing?.collection!=='vehicles')return;
    form.dataset.photo=photo;
    $('#vehicle-photo-preview').innerHTML='<img src="'+photo+'" alt="車輛照片預覽">';
  }catch(error){$('#form-error').textContent=error.message;}finally{save.disabled=false;}
});
setInterval(()=>void sync.sync(),30000);
if('serviceWorker'in navigator){
  const hadController=Boolean(navigator.serviceWorker.controller);
  let updatePending=false;
  const reloadUpdatedPage=()=>{if(!updatePending||$('#editor').open)return;updatePending=false;location.reload();};
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController)return;
    updatePending=true;
    if($('#editor').open)toast('網站已有新版本，完成編輯後會自動更新');
    reloadUpdatedPage();
  });
  $('#editor').addEventListener('close',reloadUpdatedPage);
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
    const check=()=>{if(navigator.onLine)void registration.update().catch(()=>{});};
    check();
    window.addEventListener('focus',check);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
    setInterval(check,60000);
  }).catch(()=>{});
}
render();

void sync.restore();

// Suggestions only: receipts vary by station, so never save OCR output without review.
const clean=text=>String(text||'').normalize('NFKC').replace(/[，]/g,',').replace(/[：]/g,':');
const decimal=part=>{
  const value=Number(String(part).replaceAll(',',''));
  return Number.isFinite(value)?value:null;
};
const numbers=line=>[...line.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)].map(m=>decimal(m[0])).filter(x=>x!==null);
const firstInRange=(line,min,max)=>numbers(line).find(x=>x>=min&&x<=max)??null;
function findLabeled(lines,pattern,min,max){
  for(const line of lines){
    if(!pattern.test(line))continue;
    const after=line.replace(pattern,'');
    const value=firstInRange(after,min,max);
    if(value!==null)return value;
  }
  return null;
}
function parseDate(text){
  const match=text.match(/(?:20\d{2}|11\d|12\d)\s*[年\/.-]\s*(\d{1,2})\s*[月\/.-]\s*(\d{1,2})/);
  if(!match)return '';
  const year=Number(match[0].match(/^\d{3,4}/)[0]);
  const iso=`${year<1911?year+1911:year}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;
  return Number.isFinite(Date.parse(iso))&&new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso?iso:'';
}
export function parseFuelReceipt(raw){
  const text=clean(raw),lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const gradeLine=lines.find(line=>/(?:無鉛|汽油|油品|燃油|UNLEADED|GASOLINE)/i.test(line)&&/(?:92|95|98)/.test(line))||'';
  const gradeMatch=gradeLine.match(/(?:92|95|98)/);
  const category=/柴油|DIESEL/i.test(text)?'柴油':gradeMatch?`${gradeMatch[0]} 無鉛`:'';
  const liters=findLabeled(lines,/(?:加油量|總公升|公升數|油量|數量|LITERS?|VOLUME|QTY|升數)\s*[:：]*/i,0.01,1000);
  const unitPrice=findLabeled(lines,/(?:單價|每公升|油價|PRICE\s*\/\s*L|UNIT\s*PRICE)\s*[:：$]*/i,1,200);
  const cost=findLabeled(lines,/(?:實付|應付|總金額|交易金額|支付金額|合計|TOTAL|AMOUNT)\s*[:：$]*/i,1,9999999);
  const odometer=findLabeled(lines,/(?:里程|公里|ODO(?:METER)?)\s*[:：]*/i,1,9999999);
  return {date:parseDate(text),category,liters,unitPrice,cost,odometer};
}

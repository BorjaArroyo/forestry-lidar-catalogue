import { fetchVerifiedAsset, smallAssets, INVENTORY_URL } from './download.js';
const $=id=>document.getElementById(id);let worker,result,timer;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const human=n=>n>=1048576?`${(n/1048576).toFixed(1)} MiB`:`${Math.max(1,Math.round(n/1024))} KiB`;
const reset=()=>{clearTimeout(timer);worker?.terminate();worker=null;$('cancel').disabled=true;$('sample').disabled=false;$('real').disabled=false;$('run').disabled=!$('file').files.length;};
async function run(file){reset();result=null;$('download').disabled=true;$('result').textContent='';
 if(file.size>1048576){$('status').textContent='Prototype input limit is 1 MiB';return;}
 $('sample').disabled=true;$('real').disabled=true;$('run').disabled=true;$('cancel').disabled=false;
 worker=new Worker('./worker.js',{type:'module'});
 worker.onmessage=({data})=>{if(data.type==='phase')$('status').textContent=data.text;
 else if(data.type==='result'){result=data.evidence;$('status').textContent='Completed inside WASI container';$('result').textContent=JSON.stringify(result,null,2);$('download').disabled=false;reset();}
 else{$('status').textContent='Failed: '+data.error;reset();}};
 worker.onerror=e=>{$('status').textContent='Worker failed: '+e.message;reset();};
 timer=setTimeout(()=>{$('status').textContent='Stopped after the 120 second prototype limit';reset();},120000);
 const input=await file.arrayBuffer();worker.postMessage({input},[input]);
}
$('file').onchange=()=>{$('run').disabled=!$('file').files.length;};
$('run').onclick=()=>run($('file').files[0]);
$('sample').onclick=async()=>{const r=await fetch('./sample.las');if(!r.ok)throw Error('Fixture unavailable');run(await r.blob());};
$('cancel').onclick=()=>{$('status').textContent='Cancelled; no source modified';reset();};
$('download').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='canopy-wasi-las-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('real').onclick=async()=>{
 const status=$('status');status.textContent='Loading real FOR-instance subset…';
 const [fixture,lock]=await Promise.all([fetch('./real-subset.las'),fetch('./runtime-lock.json').then(r=>r.json())]);
 const bytes=new Uint8Array(await fixture.arrayBuffer());
 const digest=await sha(bytes);
 if(digest!==lock.real_subset.sha256)throw Error(`Real subset checksum mismatch: ${digest}`);
 status.textContent='Real subset verified ('+human(bytes.byteLength)+'); starting container…';
 run(new Blob([bytes]));
};
let downloaded=null;
$('fetch').onclick=async()=>{
 const asset=JSON.parse($('asset').value);
 const status=$('dl-status');downloaded=null;$('inspect-downloaded').disabled=true;$('save').disabled=true;
 status.textContent='Downloading from the provider…';
 try{
  const {bytes,md5:digest,sha256}=await fetchVerifiedAsset(asset,(received,total)=>status.textContent=`Downloading… ${human(received)} of ${human(total)}`);
  downloaded={bytes,asset,md5:digest,sha256};
  status.textContent=`Verified: provider md5 and pinned size match (${human(bytes.byteLength)}). Data stays in this browser.`;
  $('save').disabled=false;
  if(asset.name.toLowerCase().endsWith('.las')&&bytes.byteLength<=1048576)$('inspect-downloaded').disabled=false;
 }catch(error){status.textContent='Failed: '+error.message;}
};
$('save').onclick=()=>{if(!downloaded)return;const url=URL.createObjectURL(new Blob([downloaded.bytes]));const a=document.createElement('a');a.href=url;a.download=downloaded.asset.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('inspect-downloaded').onclick=()=>{if(!downloaded)return;run(new Blob([downloaded.bytes]));};
(async()=>{
 try{
  const inventory=await(await fetch(INVENTORY_URL)).json();
  const assets=smallAssets(inventory);
  for(const asset of assets){
   const option=document.createElement('option');
   option.value=JSON.stringify(asset);
   option.textContent=`${asset.record_id} · ${asset.name} · ${human(asset.size_bytes)}`;
   $('asset').append(option);
  }
  $('dl-status').textContent=assets.length+' pinned assets within the '+human(8*1048576)+' prototype bound.';
 }catch(error){$('dl-status').textContent='Inventory unavailable: '+error.message;}
})();

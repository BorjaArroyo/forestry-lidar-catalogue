const $=id=>document.getElementById(id);let worker,result,timer;
const reset=()=>{clearTimeout(timer);worker?.terminate();worker=null;$('cancel').disabled=true;$('sample').disabled=false;$('run').disabled=!$('file').files.length;};
async function run(file){reset();result=null;$('download').disabled=true;$('result').textContent='';
 if(file.size>1048576){$('status').textContent='Prototype input limit is 1 MiB';return;}
 $('sample').disabled=true;$('run').disabled=true;$('cancel').disabled=false;
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

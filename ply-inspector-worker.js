/* Dedicated, terminable execution of the browser PLY recipe. */
'use strict';
importScripts('ply-inspector-core.js');
self.onmessage=async event=>{
  try {
    const report=await self.CanopyPly.inspectPly(event.data.file,{onProgress:progress=>self.postMessage({type:'progress',progress})});
    self.postMessage({type:'complete',report});
  } catch(error) {self.postMessage({type:'error',message:error.message||'PLY inspection failed'});}
};

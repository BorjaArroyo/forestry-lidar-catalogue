/* Save a derived report through an explicitly granted directory handle. */
(function(scope){
  'use strict';
  async function saveReport(directory,report,name) {
    if(!/^canopy-ply-inspection-[A-Za-z0-9-]+\.json$/.test(name))throw new Error('Invalid report filename');
    const text=JSON.stringify(report,null,2)+'\n';let exists=false;
    try {await directory.getFileHandle(name);exists=true;}catch(error){if(error.name!=='NotFoundError')throw error;}
    if(exists)throw new Error('The report name already exists; try saving again');
    const handle=await directory.getFileHandle(name,{create:true});let writable=null;
    try {writable=await handle.createWritable();await writable.write(text);await writable.close();return name;}
    catch(error){if(writable)await writable.abort().catch(()=>{});throw error;}
  }
  scope.CanopyPlyStorage={saveReport};if(typeof module!=='undefined'&&module.exports)module.exports={saveReport};
})(globalThis);

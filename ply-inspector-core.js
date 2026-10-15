/* Streaming PLY inspection. No network requests or source-file writes. */
(function (scope) {
  'use strict';
  const VERSION = '1.0.0';
  const LIMITS = Object.freeze({fileBytes:512*1024**2,headerBytes:256*1024,lineBytes:256*1024,properties:256,elements:64,listItems:1000000,chunkBytes:256*1024});
  const TYPES = {
    char:[1,'getInt8',-128,127],int8:[1,'getInt8',-128,127],uchar:[1,'getUint8',0,255],uint8:[1,'getUint8',0,255],
    short:[2,'getInt16',-32768,32767],int16:[2,'getInt16',-32768,32767],ushort:[2,'getUint16',0,65535],uint16:[2,'getUint16',0,65535],
    int:[4,'getInt32',-2147483648,2147483647],int32:[4,'getInt32',-2147483648,2147483647],uint:[4,'getUint32',0,4294967295],uint32:[4,'getUint32',0,4294967295],
    float:[4,'getFloat32'],float32:[4,'getFloat32'],double:[8,'getFloat64'],float64:[8,'getFloat64'],
  };
  const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
  function type(name) {if(!own(TYPES,name))throw new Error(`Unsupported PLY type: ${name}`);return TYPES[name];}
  function count(value,label) {if(!/^\d+$/.test(value))throw new Error(`Invalid ${label}`);const n=Number(value);if(!Number.isSafeInteger(n))throw new Error(`${label} exceeds safe integer range`);return n;}
  class Reader {
    constructor(file,chunkBytes) {this.file=file;this.chunkBytes=chunkBytes;this.next=0;this.offset=0;this.buffer=new Uint8Array(0);this.view=new DataView(this.buffer.buffer);this.maxBuffer=0;}
    get remaining() {return this.buffer.length-this.offset;}
    get position() {return this.next-this.remaining;}
    async fill(required=1) {
      if(this.remaining>=required)return true;
      const tail=this.buffer.subarray(this.offset);
      const end=Math.min(this.file.size,this.next+Math.max(this.chunkBytes,required-tail.length));
      const incoming=new Uint8Array(await this.file.slice(this.next,end).arrayBuffer());
      const joined=new Uint8Array(tail.length+incoming.length);joined.set(tail);joined.set(incoming,tail.length);
      this.buffer=joined;this.view=new DataView(joined.buffer);this.offset=0;this.next=end;this.maxBuffer=Math.max(this.maxBuffer,joined.length);
      return joined.length>=required;
    }
    scalar(spec,little) {const n=this.view[spec[1]](this.offset,little);this.offset+=spec[0];return n;}
    async line(maxBytes=LIMITS.lineBytes) {
      const parts=[];let size=0;
      while(true) {
        if(!this.remaining&&!await this.fill())return size?decode(parts):null;
        const start=this.offset;
        while(this.offset<this.buffer.length&&this.buffer[this.offset]!==10&&this.buffer[this.offset]!==13)this.offset++;
        const piece=this.buffer.slice(start,this.offset);parts.push(piece);size+=piece.length;
        if(size>maxBytes)throw new Error(`PLY line exceeds ${maxBytes} bytes`);
        if(this.remaining) {
          const delimiter=this.buffer[this.offset++];
          if(delimiter===13) {if(!this.remaining)await this.fill();if(this.remaining&&this.buffer[this.offset]===10)this.offset++;}
          return decode(parts);
        }
      }
    }
  }
  function decode(parts) {let size=0;for(const p of parts)size+=p.length;const b=new Uint8Array(size);let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return new TextDecoder('utf-8',{fatal:true}).decode(b);}
  async function header(reader) {
    if(await reader.line()!=='ply')throw new Error('Not a PLY file: expected the ply signature');
    let format=null,current=null;const elements=[],comments=[],objectInfo=[];
    while(true) {
      const line=await reader.line();
      if(reader.position>LIMITS.headerBytes)throw new Error('PLY header exceeds 256 KiB');
      if(line===null)throw new Error('Truncated PLY header: end_header is missing');
      const text=line.trim(),parts=text.split(/\s+/),key=parts[0];
      if(key==='end_header') {if(parts.length!==1)throw new Error('Invalid end_header line');break;}
      if(key==='comment') {comments.push(text.slice(7).trim());continue;}
      if(key==='obj_info') {objectInfo.push(text.slice(8).trim());continue;}
      if(key==='format') {
        if(format||elements.length||parts.length!==3||parts[2]!=='1.0'||!['ascii','binary_little_endian','binary_big_endian'].includes(parts[1]))throw new Error('Unsupported or misplaced PLY format; expected version 1.0');
        format=parts[1];continue;
      }
      if(!format)throw new Error('PLY format must precede the element definitions');
      if(key==='element') {
        if(parts.length!==3||elements.some(e=>e.name===parts[1]))throw new Error('Invalid or duplicate PLY element');
        current={name:parts[1],count:count(parts[2],'element count'),properties:[]};elements.push(current);
        if(elements.length>LIMITS.elements)throw new Error('Too many PLY elements');
      } else if(key==='property') {
        if(!current)throw new Error('PLY property has no element');
        let property;
        if(parts[1]==='list') {
          if(parts.length!==5||type(parts[2]).length!==4)throw new Error('List count must use an integer type');
          type(parts[3]);property={name:parts[4],kind:'list',count_type:parts[2],type:parts[3]};
        } else {if(parts.length!==3)throw new Error('Invalid scalar property');type(parts[1]);property={name:parts[2],kind:'scalar',type:parts[1]};}
        if(current.properties.some(p=>p.name===property.name))throw new Error(`Duplicate property: ${property.name}`);
        current.properties.push(property);if(current.properties.length>LIMITS.properties)throw new Error('Too many PLY properties');
      } else throw new Error(`Unsupported PLY header directive: ${key||'(empty line)'}`);
    }
    if(!format)throw new Error('PLY format is missing');
    const vertices=elements.find(e=>e.name==='vertex');if(!vertices)throw new Error('PLY vertex element is missing');
    for(const axis of ['x','y','z'])if(!vertices.properties.some(p=>p.name===axis&&p.kind==='scalar'))throw new Error(`PLY vertex requires a scalar ${axis} property`);
    for(const element of elements)if(element.count&&!element.properties.length)throw new Error(`Element ${element.name} has no properties`);
    return {format,elements,vertices,comments,objectInfo,bodyOffset:reader.position};
  }
  function asciiScalar(token,spec) {
    if(token===undefined)throw new Error('Truncated ASCII record');
    if(spec.length===4) {if(!/^[+-]?\d+$/.test(token))throw new Error('Invalid integer in ASCII PLY');const n=Number(token);if(!Number.isInteger(n)||n<spec[2]||n>spec[3])throw new Error('ASCII integer is outside its declared type range');return n;}
    if(!/^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|inf(?:inity)?|nan)$/i.test(token))throw new Error('Invalid floating-point value in ASCII PLY');
    const lower=token.toLowerCase();const value=/^[+]?inf(?:inity)?$/.test(lower)?Infinity:/^-inf(?:inity)?$/.test(lower)?-Infinity:Number(token);
    return spec[0]===4?Math.fround(value):value;
  }
  function listCount(n) {if(!Number.isInteger(n)||n<0||n>LIMITS.listItems)throw new Error('Invalid or excessive PLY list count');return n;}
  async function inspectPly(file,options={}) {
    if(!file||!Number.isSafeInteger(file.size)||file.size>LIMITS.fileBytes)throw new Error('Choose a PLY file up to 512 MiB for this browser recipe');
    const started=performance.now(),reader=new Reader(file,options.chunkBytes||LIMITS.chunkBytes);
    const cancelled=()=>{if(options.isCancelled?.()){const e=new Error('Inspection cancelled');e.name='AbortError';throw e;}};
    const progress=(phase,points=0)=>options.onProgress?.({phase,bytes_processed:reader.position,total_bytes:file.size,points_scanned:points});
    cancelled();progress('header');const meta=await header(reader);progress('vertices');
    if(meta.format!=='ascii') {
      let minimum=0;for(const e of meta.elements) {let stride=0;for(const p of e.properties)stride+=type(p.kind==='list'?p.count_type:p.type)[0];minimum+=stride*e.count;}
      if(!Number.isSafeInteger(minimum)||minimum>file.size-meta.bodyOffset)throw new Error('Truncated binary payload: declared elements exceed available bytes');
    }
    let pointCount=0,finitePoints=0,nonfinitePoints=0;const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
    const little=meta.format==='binary_little_endian';let records=0,lastProgress=performance.now();
    for(const element of meta.elements) {
      for(let row=0;row<element.count;row++) {
        cancelled();const xyz=[NaN,NaN,NaN];let tokens=null,index=0;
        if(meta.format==='ascii') {const line=await reader.line();if(line===null)throw new Error(`Truncated ASCII payload in ${element.name} record ${row+1}`);tokens=line.trim()?line.trim().split(/\s+/):[];}
        for(const property of element.properties) {
          const spec=type(property.type);let value;
          if(property.kind==='list') {
            const counter=type(property.count_type);let length;
            if(tokens)length=listCount(asciiScalar(tokens[index++],counter));
            else {if(reader.remaining<counter[0]&&!await reader.fill(counter[0]))throw new Error('Truncated binary list count');length=listCount(reader.scalar(counter,little));}
            if(tokens) {if(length>tokens.length-index)throw new Error('Truncated ASCII list');for(let j=0;j<length;j++)asciiScalar(tokens[index++],spec);}
            else {for(let j=0;j<length;j++){if(reader.remaining<spec[0]&&!await reader.fill(spec[0]))throw new Error('Truncated binary list');reader.scalar(spec,little);}}
          } else {
            if(tokens)value=asciiScalar(tokens[index++],spec);
            else {if(reader.remaining<spec[0]&&!await reader.fill(spec[0]))throw new Error('Truncated binary scalar');value=reader.scalar(spec,little);}
            if(element.name==='vertex'){const axis=property.name==='x'?0:property.name==='y'?1:property.name==='z'?2:-1;if(axis>=0)xyz[axis]=value;}
          }
        }
        if(tokens&&index!==tokens.length)throw new Error(`Unexpected values in ASCII ${element.name} record ${row+1}`);
        if(element.name==='vertex') {
          pointCount++;
          if(xyz.every(Number.isFinite)) {finitePoints++;for(let a=0;a<3;a++){minimum[a]=Math.min(minimum[a],xyz[a]);maximum[a]=Math.max(maximum[a],xyz[a]);}}
          else nonfinitePoints++;
        }
        records++;
        if(records%4096===0&&performance.now()-lastProgress>100){progress(element.name,pointCount);lastProgress=performance.now();}
      }
    }
    const parsedEnd=reader.position;let trailingWhitespace=0;
    if(meta.format==='ascii') {
      while(reader.remaining||await reader.fill()) {
        while(reader.remaining) {const b=reader.buffer[reader.offset++];if(![9,10,13,32].includes(b))throw new Error('Unexpected data after the declared ASCII elements');trailingWhitespace++;}
        cancelled();
      }
    } else if(parsedEnd!==file.size)throw new Error('Unexpected bytes after the declared binary elements');
    if(finitePoints&&maximum.some((n,i)=>!Number.isFinite(n-minimum[i])))throw new Error('Coordinate extent exceeds the browser numeric range');
    cancelled();progress('complete',pointCount);
    const warnings=[];if(nonfinitePoints)warnings.push(`${nonfinitePoints} vertices have non-finite XYZ; bounds use finite vertices only`);if(!pointCount)warnings.push('The vertex element is empty');
    return {
      schema_version:'1.0',recipe:{id:'ply-inspection',version:VERSION,engine:'browser-javascript-worker'},created_at:new Date().toISOString(),
      source:{name:file.name||'unnamed.ply',size_bytes:file.size,last_modified:file.lastModified?new Date(file.lastModified).toISOString():null,sha256:null},
      ply:{format:meta.format,version:'1.0',header_bytes:meta.bodyOffset,elements:meta.elements,comments:meta.comments,object_info:meta.objectInfo},
      points:{declared:meta.vertices.count,scanned:pointCount,finite_xyz:finitePoints,nonfinite_xyz:nonfinitePoints},
      bounds:finitePoints?{min:minimum,max:maximum,extent:maximum.map((n,i)=>n-minimum[i]),units:'not inferred',crs:'not inferred'}:null,
      validation:{all_declared_records_scanned:true,unexpected_trailing_data:false,trailing_whitespace_bytes:trailingWhitespace,source_writes:false,content_hash_computed:false,warnings},
      performance:{elapsed_ms:Math.round((performance.now()-started)*10)/10,input_chunk_bytes:reader.chunkBytes,largest_input_buffer_bytes:reader.maxBuffer,memory_scope:'Input byte buffer only; excludes decoded lines, tokens, runtime and browser memory'},
      limits:{max_file_bytes:LIMITS.fileBytes,max_line_bytes:LIMITS.lineBytes,max_list_items:LIMITS.listItems},
    };
  }
  const api={inspectPly,VERSION,LIMITS};scope.CanopyPly=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQBinaryPayload = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function toUint8Array(value){
    if(value == null) return null;
    if(typeof Uint8Array !== 'undefined' && value instanceof Uint8Array) return value;
    if(typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
    if(typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)){
      return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || 0);
    }
    if(Array.isArray(value)){
      return Uint8Array.from(value.map(function(item){ return Number(item) & 255; }));
    }
    if(value && typeof value === 'object'){
      if(Array.isArray(value.data)){
        return Uint8Array.from(value.data.map(function(item){ return Number(item) & 255; }));
      }
      var keys = Object.keys(value).filter(function(key){ return /^\d+$/.test(key); }).sort(function(a,b){ return Number(a)-Number(b); });
      if(keys.length){
        return Uint8Array.from(keys.map(function(key){ return Number(value[key]) & 255; }));
      }
    }
    return null;
  }

  function toArrayBuffer(value){
    var bytes = toUint8Array(value);
    if(!bytes) return null;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function normalizeResultBuffer(result){
    if(!result || typeof result !== 'object') return result;
    if(!('buffer' in result)) return result;
    var normalized = toArrayBuffer(result.buffer);
    if(!normalized) return result;
    return Object.assign({}, result, { buffer: normalized });
  }

  function normalizeDialogFiles(result){
    if(!result || typeof result !== 'object' || !Array.isArray(result.files)) return result;
    return Object.assign({}, result, {
      files: result.files.map(function(file){
        if(!file || typeof file !== 'object') return file;
        var normalized = toArrayBuffer(file.buffer);
        if(!normalized) return file;
        return Object.assign({}, file, { buffer: normalized });
      })
    });
  }

  return {
    toUint8Array: toUint8Array,
    toArrayBuffer: toArrayBuffer,
    normalizeResultBuffer: normalizeResultBuffer,
    normalizeDialogFiles: normalizeDialogFiles
  };
});

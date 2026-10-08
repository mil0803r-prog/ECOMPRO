// Imita window.claude (db, user, downloads) para que el tablero funcione fuera de Claude.
module.exports = `(function(){
  if (window.claude) return;
  var S = {}, timer = null;
  function call(body){
    return fetch("/api/db",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(function(r){ if(!r.ok) throw new Error("db "+r.status); return r.json(); });
  }
  function col(n){ return S[n] || (S[n] = {docs:null, subs:[], fail:false}); }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function emit(n){ var c=col(n); c.subs.slice().forEach(function(f){ try{ f(c); }catch(e){} }); }
  function refresh(n){
    return call({op:"list",col:n}).then(function(j){ var c=col(n); c.docs=j.docs||{}; c.fail=false; emit(n); })
      .catch(function(){ var c=col(n); c.fail=true; c.subs.slice().forEach(function(f){ try{ f(c,true); }catch(e){} }); });
  }
  function poll(){
    if (timer) return;
    timer = setInterval(function(){
      if (document.hidden) return;
      Object.keys(S).forEach(function(n){ if (S[n].subs.length) refresh(n); });
    }, 8000);
  }
  function split(p){ var i=p.indexOf("/"); return [p.slice(0,i), p.slice(i+1)]; }
  function write(op, path, data){
    var s = split(path), c = col(s[0]);
    var prev = c.docs ? c.docs[s[1]] : undefined;
    if (c.docs) {
      if (op==="delete") delete c.docs[s[1]];
      else c.docs[s[1]] = op==="update" ? Object.assign({}, prev||{}, clone(data)) : clone(data);
      emit(s[0]);
    }
    return call({op:op, path:path, data:data}).catch(function(e){ refresh(s[0]); throw e; });
  }
  var db = {
    doc: function(path){
      var s = split(path);
      return {
        set: function(d){ return write("set", path, d); },
        update: function(d){ return write("update", path, d); },
        delete: function(){ return write("delete", path); },
        onSnapshot: function(cb, err){
          var c = col(s[0]);
          c.subs.push(function(cc, failed){
            if (failed) { if (err) err(new Error("db")); return; }
            var d = cc.docs && cc.docs[s[1]];
            cb({exists: !!d, data: function(){ return d ? clone(d) : undefined; }});
          });
          poll(); if (c.docs) emit(s[0]); else refresh(s[0]);
          return function(){};
        }
      };
    },
    collection: function(name){
      var q = {field:null, dir:"asc", n:null};
      var api = {
        orderBy: function(f,d){ q.field=f; q.dir=d||"asc"; return api; },
        limit: function(n){ q.n=n; return api; },
        onSnapshot: function(cb, err){
          var c = col(name);
          c.subs.push(function(cc, failed){
            if (failed) { if (err) err(new Error("db")); return; }
            var arr = Object.keys(cc.docs||{}).map(function(id){ return {id:id, v:cc.docs[id]}; });
            if (q.field) arr.sort(function(a,b){
              var x=a.v[q.field], y=b.v[q.field]; if (x===y) return 0;
              var r = (x===undefined?"":x) < (y===undefined?"":y) ? -1 : 1; return q.dir==="desc" ? -r : r;
            });
            if (q.n) arr = arr.slice(0,q.n);
            cb({docs: arr.map(function(e){ return {id:e.id, data:function(){ return clone(e.v); }}; })});
          });
          poll(); if (c.docs) emit(name); else refresh(name);
          return function(){};
        }
      };
      return api;
    }
  };
  var user = { can: function(){ return true; } };
  var downloads = { save: function(o){
    var blob = o.data instanceof Blob ? o.data : new Blob([o.data], {type:"text/plain;charset=utf-8"});
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve({status:"saved"});
  }};
  window.claude = { use: function(n){ return Promise.resolve(n==="db"?db:n==="user"?user:n==="downloads"?downloads:null); } };
})();`;

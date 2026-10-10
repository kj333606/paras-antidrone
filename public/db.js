// Client for our own database API (replaces Firebase). Same methods the app already uses.
function makeDB(base){
  const watchers=new Set();
  const refreshAll=()=>watchers.forEach(w=>w());
  async function call(method,path,body){
    const res=await fetch(base+"/api/"+path,{method,headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
    if(res.status===404&&method==="GET") return null;
    if(!res.ok){const t=await res.text();throw new Error(t||("HTTP "+res.status));}
    return res.status===204?null:res.json();
  }
  function watch(fetchFn,cb,err){
    let last=null, stopped=false;
    const run=async()=>{
      if(stopped) return;
      try{
        const value=await fetchFn();
        const key=JSON.stringify(value);
        if(key!==last){last=key;cb(value);}
      }catch(e){ if(err) err(e); }
    };
    watchers.add(run); run();
    const timer=setInterval(run,3000);
    return ()=>{stopped=true;clearInterval(timer);watchers.delete(run);};
  }
  function docRef(col,id){
    return {
      id,
      set:async data=>{await call("PUT",`${col}/${id}`,data);refreshAll();},
      update:async data=>{await call("PATCH",`${col}/${id}`,data);refreshAll();},
      delete:async()=>{await call("DELETE",`${col}/${id}`);refreshAll();},
      onSnapshot:(cb,err)=>watch(()=>call("GET",`${col}/${id}`),
        doc=>cb({id,exists:!!doc,data:()=>doc?doc.data:undefined}),err)
    };
  }
  function collRef(col){
    return {
      doc:id=>docRef(col,id),
      onSnapshot:(cb,err)=>watch(()=>call("GET",col),
        rows=>cb({docs:(rows||[]).map(r=>({id:r.id,exists:true,data:()=>r.data}))}),err)
    };
  }
  return {collection:collRef};
}

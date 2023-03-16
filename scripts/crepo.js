//PouchDB.plugin(upsert);
const db = new PouchDB("aar");

class Crepo {
  constructor() {
    console.debug("Removing stale index...");
    this.db.viewCleanup();
    console.debug("Removing stale index complete.");
    this.db.info().then((info)=>{
        this.info = info;
    });
  }

  get db() {
    return db;
  }


  isSameDoc(a, b) {
    a = JSON.parse(JSON.stringify(a));
    b = JSON.parse(JSON.stringify(b));
    delete a._rev;
    delete b._rev;
    delete a._id;
    delete b._id;
    a = JSON.stringify(a);
    b = JSON.stringify(b);
    return a === b;
  }

  TextSanitize(rec){
    let text = WalkObject(rec);
    text = text.join (' ');
    text = text.toLowerCase();
    text = text.replace(/[^a-z\-]/g, ' ');
    text = text
        .split(/\s+/)
        .filter(w=>{return w.length > 2;})
        .join(' ')
        ;
    return text;
  }
}

export const crepo = new Crepo();


function WalkObject(obj){
    if(!obj){
        return [];
    }
    let rtn = [];
    if(typeof obj === 'object'){
        obj = Object.values(obj);
    }
    if(Array.isArray(obj)){
        for(let item of obj){
            item = WalkObject(item);
            rtn = rtn.concat(item);
        }
        obj = null;
    }
    if(obj){
        rtn.push(obj);
    }
    return rtn;
}

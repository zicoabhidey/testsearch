import { crepo } from "./crepo.js";

async function initialize() {
  let input = document.querySelector('[name="search"]');
  let render = document.querySelector("#packages");
  input.toggleAttribute("disabled", true);
  await InitSearch();

  input.search = new Search(crepo.db, input, render);
  await input.search.search(null);
  let dbinfo = await crepo.db.info();

  let del = document.querySelector("#destroy");
  del.addEventListener("click", async () => {
    await crepo.db.destroy();
    window.location.reload();
  });
  input.search.enabled = true;
}

window.addEventListener("load", () => {
  initialize();
});


class Search {
  constructor(db, input, render) {
    this.db = db;
    this.term = null;
    this.input = input;
    this.render = render;
    this.data = document.querySelector("datalist");
    this.searchDebounce = {
      isrunning: false,
      queue: []
    };

    this.input.addEventListener("search", (e) => {
      this.search(e.target.value);
    });
    this.input.addEventListener("blur", (e) => {
      this.search(e.target.value);
    });
    this.input.addEventListener("keyup", (e) => {
      this.search(e.target.value);
    });

    this.template = this.render.querySelector("template").innerHTML;

    this.search(this.input.value);
  }

  set enabled(flag) {
    flag = flag != false;
    this.input.toggleAttribute("disabled", !flag);
  }
  get enabled() {
    let disabled = this.input.hasAttribute("disabled");
    return !enabled;
  }

  async search(text = null) {
    text = text || this.input.value;
    if(text === '') text = null;
    text = crepo.TextSanitize(text);
    if(text === '') return;

    // check to see if we already have one running
    if (this.searchDebounce.isrunning) {
      this.searchDebounce.queue.push(text);
      return;
    }
    this.searchDebounce.queue = [];

    // if the request is for the current text, we can stop now
    if (this.term === text) return;
    this.term = text;
    this.searchDebounce.isrunning = true;

    let opts = {
      limit: 100,
      reduce: false,
      include_docs: true,
      stale: "update_after"
    };
    if (text === null) {
      opts.skip = Math.min(0,Math.random() * crepo.info.doc_count-10);
    }
    else{
        opts.startkey = text;
        opts.endkey = [opts.startkey,'\ufff0'].join('');
        //opts.reduce = true;
        //opts.group = true;
        //opts.group_level = Math.max(opts.startkey.length,1);
    }
    let results = await this.db.query("search/search", opts);
    let recs = results.rows.reduce((a, d) => {
      d = JSON.parse(JSON.stringify(d));
      let current = a[d.id] || d;
      if (current !== d) {
        if (current.value < d.value) {
          current.key = d.key;
        }
        current.value += d.value;
      }
      current.keystring = current.key;
      a[d.id] = current;
      return a;
    }, {});
    recs = Object.values(recs).sort((a, b) => {
      let score = b.value - a.value;
      if (score === 0) {
        score = a.keystring.localeCompare(b.keystring);
      }
      return score;
    });

    await this.Suggest(recs);
    this.Render(recs);

    this.searchDebounce.isrunning = false;
    text = this.searchDebounce.queue.pop();
    if (text) {
      this.search(text);
    }
  }

  async Suggest(recs) {
    let suggests = {};
    for (let r of recs) {
      r = r.keystring;
      if (!r) continue;
      suggests[r] = r;
    }
    suggests = Object.values(suggests).sort();
    this.data.innerHTML = "";
    for (let r = 0; r < 5 && suggests.length > 0; r++) {
      let row = suggests.shift();
      let opt = document.createElement("option");
      opt.value = row;
      this.data.append(opt);
    }
  }

  async Render(recs) {
    this.render.innerHTML = "";
    if (recs.length === 0) {
      this.render.innerHTML = '<p style="font-size:3em;">&#128533;</p>';
    }
    else for (let rec of recs.slice(0, 10)) {
        let html = this.template;
        for (let f in rec.doc) {
          html = html.replace(`{{${f}}}`, rec.doc[f] || "");
        }
        html = html.replace(/{{.*}}/g, "");
        let li = document.createElement("li");
        li.innerHTML = html;
        li.querySelector("a").href = rec.doc.repo.replace(
          "conda",
          "https://aar-raa.prv/repos/conda/internal"
        );
        this.render.append(li);
    }
  }
}

async function InitSearch() {
  let ddoc = {
    _id: "_design/search",
    views: {
      search: {
        reduce: "_stats",
        map: function (doc) {
          // skip it if it isn't a searchable document
          if (!/^cia\//.test(doc._id)) return;

          let indexSep = "/";

          let emits = {};

          // exact title match
          emits[doc.name.toLowerCase()] = 1000;

          // word match
          let wordscore = 100;
          let wordcount = {};
          for(let word of doc.fulltext.split(' ')){
              if(!(word in wordcount)){
                  wordcount[word] = 0;
              }
              wordcount[word]+=1;
          }
          for(let word of Object.entries(wordcount)){
              let weight = word[1];
              word = word[0];
              let score = wordscore * weight;
              for(word = word.split(''); word.length > 3; word.shift()){
                  let key = word.join('');
                  emits[key] = (emits[key] || 0) + score;
                score = Math.max(score-weight,1);
              }
          }

          // whole phrase match
          /*
          let text = doc.fulltext.split('');
          let phraselen = Math.min(50,text.length);
          let score = 10;
          let phrase = text.slice(0,phraselen-1);
          phrase.unshift(' ');
          text = text.slice(phraselen);
          while(text.length>0){
            let char = text.shift();
            phrase.push(char);
            phrase.shift();
            if(char === ' '){
                score = 10;
                continue;
            }
            let key = phrase.join('');
                  emits[key] = (emits[key] || 0) + score;
            score = Math.max(score-1,1);
          }
          */

          for (let e in emits) {
            emit(e, emits[e]);
          }
        }
          .toString()
      }
    }
  };

  return crepo.db.upsert("_design/search", (olddoc) => {
    if (crepo.isSameDoc(ddoc, olddoc)) {
      return null;
    }
    console.log("Search Indexer has changed. Updating...");
    setTimeout(async () => {
      console.debug("Removing stale index...");
      await crepo.db.viewCleanup();
      console.debug("Removing stale index complete.");
      await crepo.db.query("search/search", { limit: 0 });
      console.log("Search Index update complete.");
    }, 32);
    return ddoc;
  });
}

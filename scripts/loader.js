import { crepo } from "./crepo.js";

const HOUR = 1000 * 60 * 60;
const condaroot = "./data/countries/";

window.addEventListener("load", async () => {
  let status;
  try {
      //lookup when we need to next check the database
    status = await crepo.db.get("_local/status");
  } catch (e) {
      // if we have never checked the database, we shoudl do it now
    status = { nextrun: Date.now() };
  }
  let now = Date.now();
  let wait = status.nextrun - now;
  wait = Math.max(wait, 1); //wait=1;

  // go load the database
  setTimeout(LoadRepos, wait);
});

function getWait() {
  return Math.floor(3 * HOUR + Math.random() * HOUR);
}

async function LoadRepos() {
  let input = document.querySelector('[name="search"]');
  let progress = document.querySelector("progress");

  if (input.search) {
    //input.search.enabled = false;
  }

  let countries = await fetch(`${condaroot}/index.txt`);
  countries = await countries.text();
  countries = countries.split('\n');

  progress.setAttribute(
    "max",
    +progress.getAttribute("max") + countries.length * 1.1 );
  let upserts = [];
  for (let repo of countries) {
    console.debug(`Importing ${repo}`);
    upserts.push(LoadRec(repo));
    progress.setAttribute("value", +progress.getAttribute("value") + 1);
  }
  await Promise.all(upserts);
  progress.setAttribute("value", +progress.getAttribute("value") + countries.length * 0.05);

  console.debug("Imports complete.");
  console.debug("Compacting ...");
  await crepo.db.compact();
  progress.setAttribute("value", +progress.getAttribute("value") + countries.length * 0.01);
  console.debug("Compacting complete.");
  console.debug("Indexing ...");
  await crepo.db.query("search/search", { limit: 0 });
  progress.removeAttribute('value');
  console.debug("Indexing complete.");
  progress.setAttribute("max",1);
  progress.setAttribute("value",1);

  if (input.search) {
    input.search.enabled = true;
  }

  // record the next wait time
  let wait = getWait();
  crepo.db.upsert("_local/status", (doc) => {
    doc.nextrun = Date.now() + wait;
    return doc;
  });
  // and start waiting for the next load
  setTimeout(LoadRepos, wait);
}




async function LoadRec(path) {
  if( `${path.trim()}` === '') return;
  let fullpath = `${condaroot}${path}`;
  let resp = await fetch(fullpath);
  let rec = await resp.text();

  try{
    rec = JSON.parse(rec);
  }
  catch(e){
      console.error(`Cannot Parse document ${path}`);
      throw e;
  }
  let doc = {};
  doc.name = rec.name;
  doc.repo = 'cia';
  doc.path = path;
  doc.fulltext = crepo.TextSanitize(rec);
  doc.desc = rec.introduction.background.substr(0,500);
  doc._id = [doc.repo,doc.name].join('/');

  let upsert = crepo.db.upsert(doc._id, (olddoc) => {
    if (crepo.isSameDoc(olddoc, doc)) {
      return false;
    }
    return doc;
  });

  return upsert;
}

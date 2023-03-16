
const fs = require('fs');
let file = fs.readFileSync('./factbook.json');
file = JSON.parse(file);
let i = 0;
for(let rec of Object.values(file.countries)){
	fs.writeFileSync(`countries/${i++}.json`,JSON.stringify(rec.data,null,'\t'));
}

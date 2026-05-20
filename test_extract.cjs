const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/assets/presets/gomorrah.json'));
let str = '';
const scripts = data.extensions.regex_scripts;
const f = scripts.find(s => s.replaceString && s.replaceString.includes('<!DOCTYPE'));
if (f) str = f.replaceString;

if(str) {
  const lines = str.split('\n');
  for (let i = 280; i < 410; i++) {
     console.log(`${i}: ${lines[i]}`);
  }
}

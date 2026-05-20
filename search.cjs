const fs = require('fs');
const files = ['src/assets/presets/gomorrah.json', 'src/assets/presets/tawa_re_yil.json'];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('toggleTalent')) console.log(f + ' has toggleTalent in raw');
  const b64regex = /"([A-Za-z0-9+/=]{100,})"/g;
  let match;
  while ((match = b64regex.exec(content)) !== null) {
     try {
       const dec = Buffer.from(match[1], 'base64').toString('utf8');
       if (dec.includes('toggleTalent')) {
          console.log(f + ' has toggleTalent in base64');
       }
     } catch(e){}
  }
});

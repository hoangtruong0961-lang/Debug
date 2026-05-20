const fs = require('fs');
const html = fs.readFileSync('src/test.html', 'utf8');

const fullDocRegex = /<!DOCTYPE\s+html>[\s\S]*?<\/html>|<\s*html\b[\s\S]*?<\/html>/gi;
html.replace(fullDocRegex, (match) => {
    console.log("MATCHED!");
    return match;
});

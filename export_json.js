const fs = require('fs');
const raw = fs.readFileSync('src/hevkar-2fc93-firebase-adminsdk-fbsvc-201d12dc27.json', 'utf8');
const parsed = JSON.parse(raw);
const output = JSON.stringify(parsed);
fs.writeFileSync('firebase_env.txt', output);
console.log('Done! Open firebase_env.txt and copy all content');

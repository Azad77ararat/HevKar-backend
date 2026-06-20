const fs = require('fs');
const raw = fs.readFileSync('src/hevkar-2fc93-firebase-adminsdk-fbsvc-201d12dc27.json', 'utf8');
const parsed = JSON.parse(raw);
console.log(JSON.stringify(parsed));

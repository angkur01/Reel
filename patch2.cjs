const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/if \(firestoreQuotaExceeded\) \{\s*firestoreDb = null;\s*return null;\s*\}/g, 'if (firestoreQuotaExceeded) return null;');

fs.writeFileSync('src/server/db.ts', code);

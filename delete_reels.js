const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'db.json');
const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let removedCount = 0;
const toRemove = [];

dbData.reels = dbData.reels.filter(reel => {
    if (reel.views > 120000) {
        toRemove.push(reel.id);
        removedCount++;
        return false;
    }
    return true;
});

if (!dbData.meta) {
    dbData.meta = {};
}
if (!dbData.meta.deletedReelIds) {
    dbData.meta.deletedReelIds = [];
}
toRemove.forEach(id => {
    if (!dbData.meta.deletedReelIds.includes(id)) {
        dbData.meta.deletedReelIds.push(id);
    }
});

fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
console.log(`Removed ${removedCount} reels with > 120k views.`);
console.log('Removed IDs:', toRemove);

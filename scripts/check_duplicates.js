const fs = require('fs');
const code = fs.readFileSync('questions.js', 'utf-8');
const f = new Function(code + '; return QUESTIONS;');
const questions = f();
const ids = questions.map(q => q.id);
const idCounts = {};
ids.forEach(id => { idCounts[id] = (idCounts[id] || 0) + 1; });
const dupIds = Object.entries(idCounts).filter(([id, count]) => count > 1);
console.log('Total questions:', questions.length);
console.log('Duplicate IDs:', dupIds.length);
if (dupIds.length > 0) {
  console.log('Duplicate IDs:', dupIds.slice(0, 20));
}

const stemMap = {};
questions.forEach(q => {
  const key = q.stem.trim();
  stemMap[key] = (stemMap[key] || 0) + 1;
});
const dupStems = Object.entries(stemMap).filter(([stem, count]) => count > 1);
console.log('Duplicate stems:', dupStems.length);
if (dupStems.length > 0) {
  console.log('Duplicate stem examples:');
  dupStems.slice(0, 5).forEach(([s, c]) => {
    console.log(`${c}x: ${s.substring(0, 80)}`);
  });
}

#!/usr/bin/env node
/**
 * Rebuild questions.js:
 * 1. Parse existing questions.js to extract TOPICS and QUESTIONS
 * 2. Read new chemistry questions from chem_questions.txt
 * 3. Append new questions to QUESTIONS
 * 4. Write a clean, valid questions.js back
 */

const fs = require('fs');
const path = require('path');

const projectDir = path.join(__dirname, '..');
const questionsJsPath = path.join(projectDir, 'questions.js');
const newQuestionsPath = path.join(__dirname, 'chem_questions.txt');

// Step 1: Parse existing questions.js
const code = fs.readFileSync(questionsJsPath, 'utf-8');
// Use new Function to evaluate in isolated scope
const extractor = new Function(code + '\nreturn { TOPICS, QUESTIONS };');
const { TOPICS, QUESTIONS } = extractor();

console.log(`Existing: ${TOPICS.length} topics, ${QUESTIONS.length} questions`);
console.log(`Existing CAM questions: ${QUESTIONS.filter(q => q.topic === 'CAM').length}`);

// Step 2: Read new chemistry questions
const newContent = fs.readFileSync(newQuestionsPath, 'utf-8');
// Parse as JSON array (the file has objects separated by commas)
// Wrap in array brackets
const newJson = '[' + newContent.trim().replace(/,\s*$/, '') + ']';
const newQuestions = JSON.parse(newJson);
console.log(`New chemistry questions: ${newQuestions.length}`);

// Step 3: Remove existing CAM image questions, then append new ones
const filteredQuestions = QUESTIONS.filter(q => !(q.topic === 'CAM' && q.image));
const removed = QUESTIONS.length - filteredQuestions.length;
console.log(`Removed ${removed} existing CAM image questions`);

filteredQuestions.push(...newQuestions);
QUESTIONS.length = 0;
QUESTIONS.push(...filteredQuestions);
console.log(`Total after replacement: ${QUESTIONS.length} questions`);
console.log(`CAM questions after replacement: ${QUESTIONS.filter(q => q.topic === 'CAM').length}`);

// Step 4: Write clean questions.js
function formatQuestion(q, indent) {
    const pad = ' '.repeat(indent);
    const pad2 = ' '.repeat(indent + 2);
    const pad4 = ' '.repeat(indent + 4);
    const pad6 = ' '.repeat(indent + 6);
    
    let lines = [];
    lines.push(`${pad}{`);
    lines.push(`${pad2}id: ${JSON.stringify(q.id)},`);
    lines.push(`${pad2}topic: ${JSON.stringify(q.topic)},`);
    lines.push(`${pad2}type: ${JSON.stringify(q.type)},`);
    lines.push(`${pad2}difficulty: ${q.difficulty},`);
    lines.push(`${pad2}stem: ${JSON.stringify(q.stem)},`);
    
    if (q.image) {
        lines.push(`${pad2}image: ${JSON.stringify(q.image)},`);
    }
    
    lines.push(`${pad2}options: [`);
    for (const opt of q.options) {
        lines.push(`${pad4}{ key: ${JSON.stringify(opt.key)}, text: ${JSON.stringify(opt.text)} },`);
    }
    lines.push(`${pad2}],`);
    
    lines.push(`${pad2}answer: ${JSON.stringify(q.answer)},`);
    lines.push(`${pad2}explain: ${JSON.stringify(q.explain)},`);
    lines.push(`${pad2}source: ${JSON.stringify(q.source)},`);
    lines.push(`${pad}},`);
    
    return lines.join('\n');
}

// Group questions by topic
const topicOrder = TOPICS.map(t => t.key);
const grouped = {};
for (const q of QUESTIONS) {
    if (!grouped[q.topic]) grouped[q.topic] = [];
    grouped[q.topic].push(q);
}

// Build output
let output = `/* ════════════════════════════════════════════════════════
   ESAT PWA — Question Bank
   Biology: Ecology, Gene Technology, Evolution, Cell Structure,
   Enzyme and Metabolism, Plant Growth, Animal Physiology,
   Hereditary, Mitosis and Meiosis
   Chemistry: Redox and Electrochemistry, Calculation and Mole,
   Atomic Structure and Periodic Trend, Organic Chemistry,
   Bond and Structure, Experiment, Acid and Equilibrium
   ════════════════════════════════════════════════════════ */

const TOPICS = [
`;

// Topics
for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    const comma = i < TOPICS.length - 1 ? ',' : '';
    const comment = i === 0 ? '  // Biology' : (t.key === 'RED' ? '\n  // Chemistry' : '');
    output += `${comment}\n  { key: ${JSON.stringify(t.key)}, en: ${JSON.stringify(t.en)}, zh: ${JSON.stringify(t.zh)} }${comma}\n`;
}
output += '];\n\n';

// Questions
output += 'const QUESTIONS = [\n';

for (let i = 0; i < topicOrder.length; i++) {
    const topicKey = topicOrder[i];
    const topicInfo = TOPICS.find(t => t.key === topicKey);
    const topicQs = grouped[topicKey] || [];
    
    output += `  // ════════════════════════════════════════\n`;
    output += `  //  ${topicKey} — ${topicInfo.en} (${topicQs.length} questions)\n`;
    output += `  // ════════════════════════════════════════\n`;
    
    for (const q of topicQs) {
        output += formatQuestion(q, 2) + '\n';
    }
    output += '\n';
}

// Remove trailing whitespace and ensure proper ending
output = output.trimEnd() + '\n];\n';

fs.writeFileSync(questionsJsPath, output, 'utf-8');
console.log(`\nWritten ${QUESTIONS.length} questions to ${questionsJsPath}`);
console.log('Done!');

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
convert_docx_questions.py
Reads the ESAT biology docx, parses all questions,
maps them to existing ESAT topic modules, deduplicates,
and outputs new question objects as JS code.
"""

from docx import Document
import json
import re

doc_path = r'F:/PBL项目学习/小程序开发/ESAT题库上线/ESAT_Guide_Biology_June2025ESAT生物模拟题库.docx'
doc = Document(doc_path)

# Get the single table
table = doc.tables[0]

# Parse all rows into a list of [col0, col1]
rows = []
for row in table.rows:
    cells = [cell.text.strip() for cell in row.cells]
    rows.append(cells)

# Group rows into question blocks (separated by ['---', ''] or ['', ''])
questions_raw = []
current_block = []
for row in rows:
    if row[0] == '【序号】':
        if current_block:
            questions_raw.append(current_block)
        current_block = [row]
    elif row[0] == '---':
        if current_block:
            questions_raw.append(current_block)
            current_block = []
    else:
        if current_block:
            current_block.append(row)
if current_block:
    questions_raw.append(current_block)

print(f"Found {len(questions_raw)} question blocks")

# Parse each block into a structured question
parsed_questions = []
for block in questions_raw:
    q = {}
    options = []
    for row in block:
        key = row[0]
        val = row[1] if len(row) > 1 else ''
        if key == '【序号】':
            # Extract the serial number
            m = re.match(r'(\d+)', val)
            q['serial'] = int(m.group(1)) if m else 0
            q['serial_raw'] = val
        elif key == '【板块】':
            q['module'] = val
        elif key == '【难度】':
            q['difficulty'] = int(val) if val.isdigit() else 2
        elif key == '【题干】':
            q['stem'] = val
        elif key == '【图片】':
            q['image'] = val if val and val != '（无）' else ''
        elif re.match(r'^[A-E]\.', key):
            opt_key = key[0]  # A, B, C, D, E
            options.append({'key': opt_key, 'text': val})
        elif key == '【答案】':
            q['answer_raw'] = val
        elif key == '【解析】':
            q['explain'] = val
        elif key == '【来源】':
            q['source'] = val
    q['options'] = options
    parsed_questions.append(q)

print(f"Parsed {len(parsed_questions)} questions")

# Module mapping: docx module -> ESAT topic key
MODULE_MAP = {
    '1_Cells':         'CEL',  # Cell Structure
    '2_Movement':      'CEL',  # Cell transport (diffusion, osmosis, active transport)
    '3_CellDivision':  'MAM',  # Mitosis and Meiosis
    '4_Inheritance':   'HER',  # Hereditary
    '5_DNA':           'GTE',  # Gene Technology (DNA structure)
    '6_GeneTech':      'GTE',  # Gene Technology
    '7_Variation':     'EVL',  # Evolution
    'B8_Enzymes':      'ENM',  # Enzyme and Metabolism
    'B9_AnimalPhys':   'ANP',  # Animal Physiology
    'B10_Ecosystems':  'ECO',  # Ecology
    'B11_PlantPhys':   'PLG',  # Plant Growth
}

# Deduplicate based on stem text (first 80 chars)
seen_stems = set()
unique_questions = []
dupes = []
for q in parsed_questions:
    stem_key = q.get('stem', '')[:80].lower().strip()
    if stem_key in seen_stems:
        dupes.append(q)
        continue
    seen_stems.add(stem_key)
    unique_questions.append(q)

print(f"After dedup: {len(unique_questions)} unique questions ({len(dupes)} duplicates removed)")
for d in dupes:
    print(f"  DUPE: 序号{d.get('serial', '?')} - {d.get('stem', '')[:60]}...")

# Count per module
module_counts = {}
for q in unique_questions:
    mod = q.get('module', 'unknown')
    topic_key = MODULE_MAP.get(mod, '???')
    module_counts[topic_key] = module_counts.get(topic_key, 0) + 1

print("\nQuestions per module (new):")
for k, v in sorted(module_counts.items()):
    print(f"  {k}: {v}")

# Current question counts per module (from existing questions.js)
CURRENT_COUNTS = {
    'ECO': 6, 'GTE': 6, 'EVL': 6, 'CEL': 6, 'ENM': 6,
    'PLG': 5, 'ANP': 5, 'HER': 5, 'MAM': 5,
    'RED': 6, 'CAM': 6, 'ASP': 6, 'ORG': 6,
    'BST': 6, 'EXP': 5, 'ACE': 6,
}

# Track counters per topic
topic_counters = dict(CURRENT_COUNTS)

# Generate JS question objects
js_questions = []
for q in unique_questions:
    mod = q.get('module', '')
    topic_key = MODULE_MAP.get(mod)
    if not topic_key:
        print(f"  WARNING: unknown module '{mod}' for 序号{q.get('serial')}")
        continue

    # Increment counter
    topic_counters[topic_key] = topic_counters.get(topic_key, 0) + 1
    qid = f"{topic_key}_{topic_counters[topic_key]:03d}"

    # Parse answer
    answer_raw = q.get('answer_raw', '').strip()
    # Split by comma
    answer_letters = [a.strip() for a in answer_raw.split(',')]
    # Validate letters
    answer_letters = [a for a in answer_letters if a in ['A', 'B', 'C', 'D', 'E']]

    if not answer_letters:
        print(f"  WARNING: no valid answer for {qid}: '{answer_raw}'")
        continue

    qtype = 'single' if len(answer_letters) == 1 else 'multiple'

    options = q.get('options', [])
    if not options:
        print(f"  WARNING: no options for {qid}")
        continue

    # Build options array
    opts_js = ', '.join([
        f"{{ key: '{o['key']}', text: {json.dumps(o['text'], ensure_ascii=False)} }}"
        for o in options
    ])

    answer_js = '[' + ', '.join(f"'{a}'" for a in answer_letters) + ']'

    explain = q.get('explain', '')
    source = q.get('source', 'ESAT Guide Biology June 2025')

    js_q = f"""  {{
    id: '{qid}',
    topic: '{topic_key}',
    type: '{qtype}',
    difficulty: {q.get('difficulty', 2)},
    stem: {json.dumps(q.get('stem', ''), ensure_ascii=False)},
    options: [
      {opts_js}
    ],
    answer: {answer_js},
    explain: {json.dumps(explain, ensure_ascii=False)},
    source: {json.dumps(source, ensure_ascii=False)},
  }}"""
    js_questions.append(js_q)

# Output as JS
output = "  // ════════════════════════════════════════\n"
output += "  //  Questions from ESAT Guide Biology June 2025\n"
output += "  // ════════════════════════════════════════\n"
output += ',\n'.join(js_questions)
output += '\n'

# Write to file
out_path = r'C:/Users/Admin/WorkBuddy/2026-07-09-09-13-06/esat-quiz-pwa/scripts/new_questions.txt'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(output)

print(f"\nGenerated {len(js_questions)} new question objects")
print(f"Written to: {out_path}")

# Print final counts
print("\nFinal question counts per module:")
for k, v in sorted(topic_counters.items()):
    old = CURRENT_COUNTS.get(k, 0)
    new = v - old
    print(f"  {k}: {old} + {new} = {v}")

print(f"\nTotal questions: {sum(topic_counters.values())}")

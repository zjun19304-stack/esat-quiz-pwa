#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert chemistry docx questions to JS question objects for questions.js."""

import sys
import os
import json
import re

sys.stdout.reconfigure(encoding='utf-8')
from docx import Document

docx_path = r'F:/PBL项目学习/小程序开发/ESAT题库上线/ESAT_Chemistry_65_Questions_题库整理_v3.docx'
doc = Document(docx_path)

# Letter to index mapping
LETTER_TO_IDX = {chr(65+i): i for i in range(26)}

# Parse all tables
questions = []
for ti, table in enumerate(doc.tables):
    rows = {}
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        if len(cells) >= 2 and cells[0]:
            key = cells[0].replace('【', '').replace('】', '')
            rows[key] = cells[1]
    
    # Extract fields
    seq = rows.get('序号', '')
    topic_name = rows.get('板块', '')
    difficulty = int(rows.get('难度', '2') or '2')
    stem_text = rows.get('题干', '')
    image_path = rows.get('图片', '')
    answer_letter = rows.get('答案', '').strip()
    explain_text = rows.get('解析', '')
    source = rows.get('来源', '')
    
    # Extract original question number
    m = re.match(r'(\d+)', seq)
    orig_num = int(m.group(1)) if m else ti + 1
    
    # Parse explanation: "Answer: X\nExplanation: ..."
    # Extract the answer letter and clean explanation
    answer_match = re.match(r'Answer:\s*([A-H])\s*\n?(.*)', explain_text, re.DOTALL)
    if answer_match:
        parsed_answer = answer_match.group(1).strip()
        explain_clean = answer_match.group(2).strip()
        # Remove leading "Explanation: " if present
        explain_clean = re.sub(r'^Explanation:\s*', '', explain_clean)
    else:
        parsed_answer = answer_letter
        explain_clean = explain_text
    
    # Determine number of options: default 7 (A-G) since chemistry images show up to G options
    # If answer is H or beyond, extend to 8 options
    answer_idx = LETTER_TO_IDX.get(parsed_answer, 0)
    if answer_idx >= 7:  # H or beyond
        num_options = 8
    else:
        num_options = 7
    
    # Create options
    options = []
    for i in range(num_options):
        letter = chr(65 + i)
        options.append({
            'key': letter,
            'text': f'Option {letter}'
        })
    
    # Image path: images/cam/image_001.png
    image_file = f'image_{orig_num:03d}.png'
    image_url = f'images/cam/{image_file}'
    
    # Question ID: CAM_007 onwards (existing CAM has 001-006)
    qid = f'CAM_{ti + 7:03d}'
    
    # Create question object
    q = {
        'id': qid,
        'topic': 'CAM',
        'type': 'single',
        'difficulty': difficulty,
        'stem': 'Refer to the image for this question.',
        'image': image_url,
        'options': options,
        'answer': [parsed_answer],
        'explain': explain_clean,
        'source': source,
    }
    questions.append(q)

# Output as JS
print(f"Total questions: {len(questions)}")

# Write to file
out_path = os.path.join(os.path.dirname(__file__), 'chem_questions.txt')
with open(out_path, 'w', encoding='utf-8') as f:
    for q in questions:
        f.write(json.dumps(q, ensure_ascii=False, indent=4))
        f.write(',\n')

print(f"Written to: {out_path}")

# Print summary
print("\nQuestion summary:")
for q in questions:
    print(f"  {q['id']}: answer={q['answer'][0]}, options={len(q['options'])}, image={q['image']}")

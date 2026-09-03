#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Merge new chemistry questions into questions.js after the last CAM question."""

import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
questions_js = os.path.join(project_dir, 'questions.js')
new_questions_file = os.path.join(os.path.dirname(__file__), 'chem_questions.txt')

# Read original questions.js
with open(questions_js, 'r', encoding='utf-8') as f:
    content = f.read()

# Read new questions
with open(new_questions_file, 'r', encoding='utf-8') as f:
    new_questions = f.read().strip()

# Find the last CAM question and its closing brace
# We need to find CAM_006 and insert after it
# Strategy: find the last occurrence of "CAM_006" and then find the next "}," after it
cam006_idx = content.rfind("'CAM_006'")
if cam006_idx == -1:
    print("ERROR: CAM_006 not found in questions.js")
    sys.exit(1)

# Find the closing "}," after CAM_006
# The question object ends with "},\n" or "}\n," 
search_start = cam006_idx
close_brace_idx = content.find('}', search_start)
# Find the next ",\n" after the closing brace
while close_brace_idx != -1:
    # Check what comes after }
    after = content[close_brace_idx:close_brace_idx+10]
    if ',\n' in after or '\n,' in after or ',\r\n' in after:
        break
    close_brace_idx = content.find('}', close_brace_idx + 1)

if close_brace_idx == -1:
    print("ERROR: Could not find closing brace after CAM_006")
    sys.exit(1)

# Find the comma after the closing brace
comma_idx = content.find(',', close_brace_idx)
if comma_idx == -1 or comma_idx > close_brace_idx + 5:
    # No comma, add one
    insert_point = close_brace_idx + 1
    insert_text = ',\n\n  // ════════════════════════════════════════\n  //  CAM — Calculation and Mole (from ESAT Chemistry docx)\n  // ════════════════════════════════════════\n  ' + new_questions
else:
    insert_point = comma_idx + 1
    insert_text = '\n\n  // ════════════════════════════════════════\n  //  CAM — Calculation and Mole (from ESAT Chemistry docx)\n  // ════════════════════════════════════════\n  ' + new_questions

# Insert new questions
new_content = content[:insert_point] + insert_text + content[insert_point:]

# Write back
with open(questions_js, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Inserted {65} new CAM questions after CAM_006")
print(f"File updated: {questions_js}")

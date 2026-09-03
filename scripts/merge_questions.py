#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Merge new questions into questions.js"""

questions_js = r'C:/Users/Admin/WorkBuddy/2026-07-09-09-13-06/esat-quiz-pwa/questions.js'
new_questions_file = r'C:/Users/Admin/WorkBuddy/2026-07-09-09-13-06/esat-quiz-pwa/scripts/new_questions.txt'

with open(questions_js, 'r', encoding='utf-8') as f:
    content = f.read()

with open(new_questions_file, 'r', encoding='utf-8') as f:
    new_content = f.read()

# Find the last occurrence of '\n];' and insert before it
# The file ends with:
#   },
# ];
insert_point = content.rfind('\n];')

if insert_point == -1:
    print("ERROR: Could not find closing ];")
    exit(1)

# Insert a comma before the last }, then add new questions
# The content before ]; should end with },\n
# We need to add the new questions between the last existing question and ];

new_js = content[:insert_point] + ',\n\n' + new_content + '\n' + content[insert_point:]

with open(questions_js, 'w', encoding='utf-8') as f:
    f.write(new_js)

print(f"Merged new questions into questions.js")
print(f"Original size: {len(content)} chars")
print(f"New size: {len(new_js)} chars")

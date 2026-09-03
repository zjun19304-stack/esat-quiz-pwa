#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix merge: remove extra comma that created empty array slot"""

questions_js = r'C:/Users/Admin/WorkBuddy/2026-07-09-09-13-06/esat-quiz-pwa/questions.js'

with open(questions_js, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: replace '},\n,\n\n  // Questions from' with '},\n\n  // Questions from'
content = content.replace('},\n,\n\n  // Questions from', '},\n\n  // Questions from')

with open(questions_js, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed extra comma issue")

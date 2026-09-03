#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix merge: move new chemistry questions to after the CAM_006 question object."""

import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
questions_js = os.path.join(project_dir, 'questions.js')

with open(questions_js, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the marker we inserted
marker = '// ════════════════════════════════════════\n  //  CAM — Calculation and Mole (from ESAT Chemistry docx)'
marker_idx = content.find(marker)
if marker_idx == -1:
    print("ERROR: marker not found")
    sys.exit(1)

# Find the end of the new questions block
# The new questions end with the last "},\n" before the next section
# Find the last CAM_071 reference
cam071_idx = content.find('CAM_071', marker_idx)
if cam071_idx == -1:
    print("ERROR: CAM_071 not found")
    sys.exit(1)

# Find the end of CAM_071 question object (the closing })
# Look for the pattern: "source: ... },\n"
# Search for the next "\n  }," or "\n  }" after CAM_071's source field
source_after_071 = content.find('source:', cam071_idx)
end_brace = content.find('}', source_after_071 + 100)  # skip past the source value
# Find the comma+newline after the closing brace
end_block = content.find('\n', end_brace)

# Extract the new questions block (from marker to end_block)
new_block = content[marker_idx:end_block]
print(f"New block length: {len(new_block)}")
print(f"New block starts: {new_block[:80]}")
print(f"New block ends: {new_block[-80:]}")

# Remove the new block from its current position
content_without_new = content[:marker_idx] + content[end_block:]

# Now find the proper insertion point: after the CAM_006 question object closes
# Find CAM_006
cam006_idx = content_without_new.find("id: 'CAM_006'")
if cam006_idx == -1:
    # Try alternate quote style
    cam006_idx = content_without_new.find("id: 'CAM_006'")
    
print(f"CAM_006 found at: {cam006_idx}")

# Find the closing } of the CAM_006 question object
# The question object starts with { before id: 'CAM_006'
# and ends with the next } at the same indentation level
# Strategy: find "source:" after CAM_006, then find "}," after that
source_after_006 = content_without_new.find('source:', cam006_idx)
print(f"source: after CAM_006 at: {source_after_006}")

# After source: '...', the object closes with }
# Find the }, after the source value
# The source line ends with a quote, then },\n
close_after_source = content_without_new.find('},', source_after_006 + 50)
if close_after_source == -1:
    close_after_source = content_without_new.find('}', source_after_006 + 50)
    
print(f"Closing brace at: {close_after_source}")
print(f"Context: {repr(content_without_new[close_after_source:close_after_source+20])}")

# Insert new questions after the closing },
insert_point = close_after_source + 2  # After "},"
# Find the next newline
newline_after = content_without_new.find('\n', insert_point)
insert_point = newline_after + 1

# Build the insertion text
insertion = '\n  ' + new_block + '\n'

# Insert
new_content = content_without_new[:insert_point] + insertion + content_without_new[insert_point:]

# Write back
with open(questions_js, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Fix applied!")

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
encrypt_questions.py
=====================================
Reads questions.js and encrypts it into questions.enc.js.
Supports multiple students with individual passwords, each linked to a student name.

Usage:
  python encrypt_questions.py  PASSWORD
  python encrypt_questions.py  PASS1,PASS2,PASS3
  python encrypt_questions.py  Name1:PASS1,Name2:PASS2,Name3:PASS3

Examples:
  python encrypt_questions.py  esat2026
  python encrypt_questions.py  studentA,studentB,teacher
  python encrypt_questions.py  Alice:pass1,Bob:pass2,Teacher:t789
"""

import sys
import os
import json
import hashlib
import base64
import subprocess

def generate_keystream(key_bytes, length):
    """SHA-256 counter mode keystream"""
    stream = bytearray()
    counter = 0
    while len(stream) < length:
        block = hashlib.sha256(key_bytes + counter.to_bytes(4, 'big')).digest()
        stream.extend(block)
        counter += 1
    return bytes(stream[:length])

def encrypt_data(plaintext, password):
    """Encrypt: password -> SHA-256 key -> keystream XOR -> base64"""
    key = hashlib.sha256(password.encode('utf-8')).digest()
    data = plaintext.encode('utf-8')
    keystream = generate_keystream(key, len(data))
    encrypted = bytes(a ^ b for a, b in zip(data, keystream))
    return base64.b64encode(encrypted).decode('ascii')

def extract_via_node(js_path):
    """Use Node.js to safely extract TOPICS and QUESTIONS as JSON"""
    node_path = r'C:\Users\Admin\.workbuddy\binaries\node\versions\22.22.2\node.exe'
    with open(js_path, 'r', encoding='utf-8') as f:
        js_code = f.read()
    js_code = js_code.replace('const TOPICS', 'var TOPICS')
    js_code = js_code.replace('const QUESTIONS', 'var QUESTIONS')

    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as tmp:
        tmp.write(js_code)
        tmp.write('\nprocess.stdout.write(JSON.stringify({topics: TOPICS, questions: QUESTIONS}));\n')
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            [node_path, tmp_path],
            capture_output=True, text=True, encoding='utf-8'
        )
        if result.returncode != 0:
            print(f"Node.js parse failed: {result.stderr}")
            sys.exit(1)
        return json.loads(result.stdout)
    finally:
        os.unlink(tmp_path)

def parse_students(arg):
    """
    Parse command-line argument, return [(name, password), ...] list.
    Format:
      "password"                    -> [("Student", "password")]
      "pass1,pass2"                 -> [("Student1", "pass1"), ("Student2", "pass2")]
      "Alice:pass1,Bob:pass2"       -> [("Alice", "pass1"), ("Bob", "pass2")]
    """
    entries = []
    parts = arg.split(',')
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        if ':' in part:
            name, pwd = part.split(':', 1)
            entries.append((name.strip(), pwd.strip()))
        else:
            # No name provided, auto-generate
            entries.append((f"Student{i+1}", part))
    return entries

def main():
    if len(sys.argv) < 2:
        print("Usage: python encrypt_questions.py <PASSWORD>")
        print("Example: python encrypt_questions.py esat2026")
        print("Multiple: python encrypt_questions.py pass1,pass2,pass3")
        print("With names: python encrypt_questions.py Alice:pass1,Bob:pass2,Teacher:t789")
        sys.exit(1)

    students = parse_students(sys.argv[1])
    if not students:
        print("Error: please provide at least one password")
        sys.exit(1)

    # Path handling
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    questions_js = os.path.join(project_dir, 'questions.js')
    output_js = os.path.join(project_dir, 'questions.enc.js')

    if not os.path.exists(questions_js):
        print(f"Error: {questions_js} not found")
        sys.exit(1)

    print(f"Reading question bank: {questions_js}")

    # Use Node.js to safely extract data
    data_obj = extract_via_node(questions_js)
    topics = data_obj.get('topics', [])
    questions = data_obj.get('questions', [])

    print(f"   Topics:   {len(topics)}")
    print(f"   Questions: {len(questions)}")
    print(f"   Students:  {len(students)}")
    print()

    # Generate encrypted version for each student (question bank data + student name)
    encrypted_blobs = []
    for name, pwd in students:
        payload = json.dumps({
            'topics': topics,
            'questions': questions,
            'student': name,
        }, ensure_ascii=False)

        enc = encrypt_data(payload, pwd)
        encrypted_blobs.append(enc)
        print(f"  [{name}] password: {pwd}  encrypted ({len(enc)} chars)")

    # Generate questions.enc.js
    blobs_js = ', '.join(json.dumps(b) for b in encrypted_blobs)
    output = "/* ESAT encrypted question bank - auto-generated */\n"
    output += "/* Do not upload questions.js to GitHub */\n"
    output += "window.__ESAT_ENC__ = [" + blobs_js + "];\n"

    with open(output_js, 'w', encoding='utf-8') as f:
        f.write(output)

    print(f"\nEncrypted question bank generated: {output_js}")
    print(f"   Supports {len(students)} student passwords")
    print(f"\nStudent password table:")
    for name, pwd in students:
        print(f"   {name:12s} -> {pwd}")
    print(f"\nNext steps:")
    print(f"   1. Share each password with the corresponding student")
    print(f"   2. git add questions.enc.js auth.js index.html app.js style.css sw.js")
    print(f"   3. git commit -m 'Update student passwords'")
    print(f"   4. git push")
    print(f"\nImportant: ensure .gitignore includes questions.js")
    print(f"   The original question bank file should NOT be uploaded to GitHub!")

if __name__ == '__main__':
    main()

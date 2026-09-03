#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
encrypt_questions.py
=====================================
Read questions.js and encrypt it into questions.enc.js.
Uses shared master-key encryption: question data encrypted once,
master key encrypted per-student. File size stays ~800KB regardless of student count.

Encryption:
  1. Generate random 32-byte master key
  2. Encrypt full JSON payload with master key (counter-mode XOR) -> data blob
  3. For each student: password -> SHA-256 -> encrypt master key -> key blob
  4. Output: window.__ESAT_ENC__ = {"d":"data_base64","k":[["Name","key_base64"],...]}

Usage:
  python encrypt_questions.py  PASSWORD
  python encrypt_questions.py  Name1:PASS1,Name2:PASS2
"""

import sys
import os
import json
import hashlib
import base64
import subprocess
import argparse
import secrets


def generate_keystream(key_bytes, length):
    """SHA-256 counter mode keystream."""
    stream = bytearray()
    counter = 0
    while len(stream) < length:
        block = hashlib.sha256(key_bytes + counter.to_bytes(4, 'big')).digest()
        stream.extend(block)
        counter += 1
    return bytes(stream[:length])


def xor_encrypt(plaintext, key_bytes):
    """Encrypt plaintext (bytes) with key via keystream XOR."""
    keystream = generate_keystream(key_bytes, len(plaintext))
    return bytes(a ^ b for a, b in zip(plaintext, keystream))


def encrypt_master_key(master_key, password):
    """Encrypt master key with student password -> base64."""
    pw_key = hashlib.sha256(password.encode('utf-8')).digest()
    encrypted = xor_encrypt(master_key, pw_key)
    return base64.b64encode(encrypted).decode('ascii')


def decrypt_master_key(encrypted_b64, password):
    """Decrypt master key from base64 with student password."""
    pw_key = hashlib.sha256(password.encode('utf-8')).digest()
    encrypted = base64.b64decode(encrypted_b64)
    return xor_encrypt(encrypted, pw_key)


def extract_via_node(js_path, node_path='node'):
    """Use Node.js to safely extract TOPICS and QUESTIONS as JSON."""
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
    """Parse "Name1:PASS1,Name2:PASS2,..." into [(name, password), ...]."""
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
            entries.append((f"Student{i+1}", part))
    return entries


def main():
    parser = argparse.ArgumentParser(description='Encrypt ESAT question bank (shared master-key)')
    parser.add_argument('students', help='Student passwords: "Name1:pass1,Name2:pass2"')
    parser.add_argument('--project-dir', default='.',
                        help='Project directory containing questions.js')
    parser.add_argument('--node-path', default='node',
                        help='Path to Node.js executable')
    args = parser.parse_args()

    students = parse_students(args.students)
    if not students:
        print("Error: please provide at least one password")
        sys.exit(1)

    questions_js = os.path.join(args.project_dir, 'questions.js')
    output_js = os.path.join(args.project_dir, 'questions.enc.js')

    if not os.path.exists(questions_js):
        print(f"Error: {questions_js} not found")
        sys.exit(1)

    print(f"Reading question bank: {questions_js}")
    data_obj = extract_via_node(questions_js, args.node_path)
    topics = data_obj.get('topics', [])
    questions = data_obj.get('questions', [])

    print(f"   Topics:   {len(topics)}")
    print(f"   Questions: {len(questions)}")
    print(f"   Students:  {len(students)}")
    print()

    # Step 1: Generate random master key (32 bytes)
    master_key = secrets.token_bytes(32)

    # Step 2: Encrypt full JSON payload once with master key
    payload = json.dumps({
        'topics': topics,
        'questions': questions,
    }, ensure_ascii=False)
    data_blob = base64.b64encode(
        xor_encrypt(payload.encode('utf-8'), master_key)
    ).decode('ascii')
    print(f"  Data blob:    {len(data_blob)} chars")

    # Step 3: Encrypt master key for each student
    key_entries = []
    for name, pwd in students:
        key_blob = encrypt_master_key(master_key, pwd)
        key_entries.append([name, key_blob])

        # Verify: test round-trip decryption
        mk2 = decrypt_master_key(key_blob, pwd)
        assert mk2 == master_key, f"Round-trip failed for {name}"
        print(f"  [{name}] password: {pwd}  (key: {len(key_blob)} chars)")

    # Step 4: Generate output
    keys_json = json.dumps(key_entries, ensure_ascii=False)
    output = "/* ESAT encrypted question bank — shared master-key */\n"
    output += "/* Do not upload questions.js to GitHub */\n"
    output += f"window.__ESAT_ENC__ = {{\"d\":{json.dumps(data_blob)},\"k\":{keys_json}}};\n"

    with open(output_js, 'w', encoding='utf-8') as f:
        f.write(output)

    file_size_kb = os.path.getsize(output_js) / 1024
    print(f"\nEncrypted bank generated: {output_js} ({file_size_kb:.0f} KB)")
    print(f"   Supports {len(students)} student passwords")
    print(f"\nStudent password table:")
    for name, pwd in students:
        print(f"   {name:12s} -> {pwd}")
    print(f"\nNext steps: version bump + upload to GitHub")


if __name__ == '__main__':
    main()

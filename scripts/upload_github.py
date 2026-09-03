#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload updated files to GitHub via REST API"""

import requests
import base64
import json
import os

TOKEN = os.environ.get('GITHUB_TOKEN', '')
OWNER = "zjun19304-stack"
REPO = "esat-quiz-pwa"
BASE_URL = f"https://api.github.com/repos/{OWNER}/{REPO}"

headers = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
}

# Files to upload
project_dir = r'C:/Users/Admin/WorkBuddy/2026-07-09-09-13-06/esat-quiz-pwa'
files_to_upload = [
    'questions.enc.js',
    'sw.js',
]

def get_existing_sha(path):
    """Get the SHA of the existing file (needed for updates)"""
    url = f"{BASE_URL}/contents/{path}"
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        return r.json().get('sha')
    return None

def upload_file(filepath, repo_path):
    """Upload or update a file on GitHub"""
    with open(os.path.join(project_dir, filepath), 'rb') as f:
        content_bytes = f.read()

    content_b64 = base64.b64encode(content_bytes).decode('ascii')
    sha = get_existing_sha(repo_path)

    data = {
        "message": f"Update {repo_path}: add 75 new biology questions + 2 new students (Su, Coco)",
        "content": content_b64,
    }
    if sha:
        data["sha"] = sha

    url = f"{BASE_URL}/contents/{repo_path}"
    r = requests.put(url, headers=headers, json=data)

    if r.status_code in (200, 201):
        print(f"  [OK] {repo_path} ({len(content_bytes)} bytes)")
        return True
    else:
        print(f"  [FAIL] {repo_path}: {r.status_code} {r.text[:200]}")
        return False

print(f"Uploading {len(files_to_upload)} files to GitHub...")

success_count = 0
for f in files_to_upload:
    if upload_file(f, f):
        success_count += 1

print(f"\nDone: {success_count}/{len(files_to_upload)} files uploaded")

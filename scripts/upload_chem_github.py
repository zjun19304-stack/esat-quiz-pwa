#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload updated files to GitHub via Contents API."""

import sys
import os
import json
import base64
import time
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding='utf-8')

TOKEN = os.environ.get('GITHUB_TOKEN', '')
OWNER = 'zjun19304-stack'
REPO = 'esat-quiz-pwa'

API_BASE = f'https://api.github.com/repos/{OWNER}/{REPO}/contents'

def github_api(path, method='GET', data=None):
    """Call GitHub Contents API."""
    url = f'{API_BASE}/{path}'
    headers = {
        'Authorization': f'token {TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    }
    
    body = None
    if data:
        body = json.dumps(data).encode('utf-8')
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return {'error': e.code, 'message': error_body}

def upload_file(local_path, repo_path, commit_msg):
    """Upload or update a file on GitHub."""
    with open(local_path, 'rb') as f:
        content = base64.b64encode(f.read()).decode('ascii')
    
    # Check if file exists (get SHA for update)
    result = github_api(repo_path)
    sha = None
    if 'sha' in result:
        sha = result['sha']
    
    data = {
        'message': commit_msg,
        'content': content,
        'branch': 'main',
    }
    if sha:
        data['sha'] = sha
    
    result = github_api(repo_path, 'PUT', data)
    
    if 'content' in result:
        print(f'  OK: {repo_path} ({len(content)} b64 chars)')
        return True
    elif 'error' in result:
        print(f'  ERROR: {repo_path} -> {result.get("error")}: {result.get("message", "")[:200]}')
        return False
    else:
        print(f'  WARN: {repo_path} -> {str(result)[:200]}')
        return False

# Files to upload
project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

files_to_upload = [
    ('questions.enc.js', 'questions.enc.js', 'Update: 231 questions (65 new CAM chemistry image-based)'),
    ('sw.js', 'sw.js', 'Update SW cache to v4 for chemistry images'),
]

# Add all 65 images
images_dir = os.path.join(project_dir, 'images', 'cam')
for i in range(1, 66):
    img_file = f'image_{i:03d}.png'
    img_path = os.path.join(images_dir, img_file)
    if os.path.exists(img_path):
        repo_path = f'images/cam/{img_file}'
        files_to_upload.append((img_path, repo_path, f'Add CAM chemistry image {i:03d}'))

print(f'Total files to upload: {len(files_to_upload)}')
print()

success = 0
failed = 0
for local_path, repo_path, msg in files_to_upload:
    if not os.path.isabs(local_path):
        local_path = os.path.join(project_dir, local_path)
    
    ok = upload_file(local_path, repo_path, msg)
    if ok:
        success += 1
    else:
        failed += 1
    
    # Rate limiting: GitHub allows 5000 req/hour, but be nice
    time.sleep(0.3)

print(f'\nDone! Success: {success}, Failed: {failed}')
print(f'Live URLs:')
print(f'  Student: https://zjun19304-stack.github.io/esat-quiz-pwa/')
print(f'  Teacher: https://zjun19304-stack.github.io/esat-quiz-pwa/admin.html')

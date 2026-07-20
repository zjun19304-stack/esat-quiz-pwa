/* ════════════════════════════════════════════════════════
   ESAT PWA — Application Logic
   ════════════════════════════════════════════════════════ */

'use strict';

const APP_VERSION = 'v26';

// ════════════════════════════════════════════════════════
//  1. Utility Functions
// ════════════════════════════════════════════════════════

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) return '';
  if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) return '';
  return url;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getTopicInfo(key) {
  return TOPICS.find(t => t.key === key) || { en: key, zh: key };
}

function getQuestionsByTopics(topicKeys) {
  return QUESTIONS.filter(q => topicKeys.includes(q.topic));
}

/**
 * Smart shuffle: avoid repeating recently seen questions across sessions.
 * Keeps a rolling buffer of recently used question IDs in localStorage.
 */
function getSmartShuffledQuestions(pool, count) {
  if (pool.length === 0) return [];
  count = Math.min(count, pool.length);

  // Remove any duplicate IDs from the pool itself
  const uniquePool = [];
  const seen = new Set();
  for (const q of pool) {
    if (!seen.has(q.id)) {
      seen.add(q.id);
      uniquePool.push(q);
    }
  }

  const recentIds = new Set(Storage.getRecentIds());
  const freshPool = uniquePool.filter(q => !recentIds.has(q.id));
  const shuffledFresh = shuffle(freshPool);

  let selected = shuffledFresh.slice(0, count);

  // If not enough fresh questions, fill with recently seen ones (but still shuffled)
  if (selected.length < count) {
    const needed = count - selected.length;
    const recentPool = uniquePool.filter(q => recentIds.has(q.id));
    const shuffledRecent = shuffle(recentPool);
    selected = selected.concat(shuffledRecent.slice(0, needed));
  }

  selected = shuffle(selected);
  Storage.addRecentIds(selected.map(q => q.id));
  return selected;
}

// ════════════════════════════════════════════════════════
//  2. Storage Layer (localStorage) — per-student isolation
// ════════════════════════════════════════════════════════

const Storage = {
  _student: '',
  _keys: {},

  setStudent(name) {
    this._student = (name || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const s = this._student;
    this._keys = {
      wrong:   `esat_wrong_answers_${s}`,
      history: `esat_practice_history_${s}`,
      session: `esat_current_session_${s}`,
      settings:`esat_settings_${s}`,
      recent:  `esat_recent_questions_${s}`,
    };
    this._migrateOnce();
    this._checkVersion();
  },

  _checkVersion() {
    const lastVersion = localStorage.getItem('esat_app_version');
    if (lastVersion !== APP_VERSION) {
      // Clear volatile session/recent data on app update to avoid stale/buggy state
      this.clearSession();
      this.clearRecentIds();
      localStorage.setItem('esat_app_version', APP_VERSION);
    }
  },

  _migrateOnce() {
    if (localStorage.getItem('esat_migrated_v2')) return;
    const oldKeys = ['esat_wrong_answers', 'esat_practice_history', 'esat_current_session', 'esat_settings'];
    oldKeys.forEach(oldKey => {
      const val = localStorage.getItem(oldKey);
      if (val) {
        const type = oldKey.replace('esat_', '').replace('wrong_answers', 'wrong').replace('practice_history', 'history').replace('current_session', 'session');
        if (this._keys[type]) {
          localStorage.setItem(this._keys[type], val);
        }
        localStorage.removeItem(oldKey);
      }
    });
    localStorage.setItem('esat_migrated_v2', '1');
  },

  _k(type) { return this._keys[type] || `esat_${type}`; },

  get(type, fallback) {
    try {
      const v = localStorage.getItem(this._k(type));
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },

  set(type, val) {
    try { localStorage.setItem(this._k(type), JSON.stringify(val)); } catch {}
  },

  remove(type) {
    try { localStorage.removeItem(this._k(type)); } catch {}
  },

  // ── Wrong Bank ──
  getWrong() { return this.get('wrong', []); },
  saveWrong(arr) { this.set('wrong', arr); },
  addWrong(question, selected) {
    const wrong = this.getWrong();
    if (!wrong.find(w => w.id === question.id)) {
      wrong.push({
        id: question.id,
        topic: question.topic,
        type: question.type,
        stem: question.stem,
        image: question.image || null,
        options: question.options,
        answer: question.answer,
        explain: question.explain,
        source: question.source,
        yourAnswer: selected,
        addedAt: Date.now(),
      });
      this.saveWrong(wrong);
    }
  },
  removeWrong(id) {
    const wrong = this.getWrong().filter(w => w.id !== id);
    this.saveWrong(wrong);
  },

  // ── History ──
  getHistory() { return this.get('history', []); },
  addHistory(record) {
    const h = this.getHistory();
    h.unshift(record);
    if (h.length > 100) h.length = 100;
    this.set('history', h);
  },

  // ── Session ──
  getSession() { return this.get('session', null); },
  saveSession(s) { this.set('session', s); },
  clearSession() { this.remove('session'); },

  // ── Recently Seen Questions (smart shuffle) ──
  getRecentIds() {
    const ids = this.get('recent', []);
    return Array.isArray(ids) ? ids : [];
  },
  addRecentIds(ids) {
    const current = this.getRecentIds();
    const combined = current.concat(ids);
    // Keep last 200 IDs to avoid repeats across many sessions
    if (combined.length > 200) {
      combined.splice(0, combined.length - 200);
    }
    this.set('recent', combined);
  },
  clearRecentIds() { this.remove('recent'); },

  // ── Data Export ──
  exportData(studentName) {
    const history = this.getHistory();
    const wrong = this.getWrong();
    const now = new Date().toISOString().slice(0, 10);
    const data = {
      student: studentName || 'unknown',
      exportedAt: new Date().toISOString(),
      history: history,
      wrongAnswers: wrong,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esat-data-${data.student}-${now}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return data;
  },
};

// ════════════════════════════════════════════════════════
//  3. App State
// ════════════════════════════════════════════════════════

const State = {
  selectedTopics: [],
  questionCount: 20,
  useTimer: false,

  practiceQuestions: [],
  currentIndex: 0,
  selectedOptions: [],
  confirmed: false,
  answers: [],
  timerInterval: null,
  timeLeft: 60,
  startTime: 0,

  isWrongRetry: false,
  wrongFilter: 'all',
};

// ════════════════════════════════════════════════════════
//  4. Router
// ════════════════════════════════════════════════════════

const Router = {
  routes: {
    '': 'view-home',
    '#/': 'view-home',
    '#/practice': 'view-practice',
    '#/result': 'view-result',
    '#/wrong': 'view-wrong',
  },

  navigate(hash) {
    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      this.render(hash);
    }
  },

  render(hash) {
    hash = hash || location.hash || '';
    const viewId = this.routes[hash] || 'view-home';

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    window.scrollTo(0, 0);

    if (viewId === 'view-home') HomeView.render();
    else if (viewId === 'view-practice') PracticeView.render();
    else if (viewId === 'view-result') ResultView.render();
    else if (viewId === 'view-wrong') WrongView.render();
  },

  init() {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  }
};

// ════════════════════════════════════════════════════════
//  5. Home View
// ════════════════════════════════════════════════════════

const HomeView = {
  render() {
    this.renderTopics();
    this.renderStats();
    this.bindEvents();
  },

  renderTopics() {
    const grid = document.getElementById('topic-grid');
    grid.innerHTML = '';

    TOPICS.forEach(topic => {
      const count = QUESTIONS.filter(q => q.topic === topic.key).length;
      const isSelected = State.selectedTopics.includes(topic.key);

      const card = document.createElement('div');
      card.className = 'topic-card' + (isSelected ? ' selected' : '');
      card.dataset.topic = topic.key;
      card.innerHTML = `
        <div class="topic-en">${escapeHtml(topic.en)}</div>
        <div class="topic-zh">${escapeHtml(topic.zh)}</div>
        <div class="topic-count">${count} Q</div>
      `;
      card.addEventListener('click', () => this.toggleTopic(topic.key));
      grid.appendChild(card);
    });
  },

  toggleTopic(key) {
    const idx = State.selectedTopics.indexOf(key);
    if (idx > -1) {
      State.selectedTopics.splice(idx, 1);
    } else {
      State.selectedTopics.push(key);
    }
    this.renderTopics();
  },

  renderStats() {
    const history = Storage.getHistory();
    const wrong = Storage.getWrong();

    const totalPracticed = history.reduce((s, h) => s + h.total, 0);
    const totalCorrect = history.reduce((s, h) => s + h.correct, 0);
    const avgAccuracy = totalPracticed > 0
      ? Math.round((totalCorrect / totalPracticed) * 100) : 0;

    document.getElementById('stat-total').textContent = totalPracticed;
    document.getElementById('stat-accuracy').textContent = avgAccuracy + '%';
    document.getElementById('stat-wrong').textContent = wrong.length;
  },

  bindEvents() {
    document.getElementById('btn-select-all').onclick = () => {
      if (State.selectedTopics.length === TOPICS.length) {
        State.selectedTopics = [];
        document.getElementById('btn-select-all').textContent = 'Select All';
      } else {
        State.selectedTopics = TOPICS.map(t => t.key);
        document.getElementById('btn-select-all').textContent = 'Deselect All';
      }
      this.renderTopics();
    };

    document.querySelectorAll('.count-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.questionCount = parseInt(btn.dataset.count);
      };
    });

    document.getElementById('toggle-timer').onchange = (e) => {
      State.useTimer = e.target.checked;
    };

    document.getElementById('btn-start').onclick = () => this.startPractice();

    document.getElementById('btn-wrong-book').onclick = () => {
      Router.navigate('#/wrong');
    };

    document.getElementById('btn-export-data').onclick = () => {
      Storage.exportData(Auth.currentStudent);
    };
  },

  startPractice() {
    if (State.selectedTopics.length === 0) {
      this.toast('Please select at least one topic');
      return;
    }

    const pool = getQuestionsByTopics(State.selectedTopics);
    if (pool.length === 0) {
      this.toast('No questions available for selected topics');
      return;
    }

    // Clear any previous session so PracticeView doesn't restore old questions
    Storage.clearSession();

    const shuffled = getSmartShuffledQuestions(pool, State.questionCount);

    // Hard deduplication by question ID — guarantee no repeats in one set
    const seen = new Map();
    State.practiceQuestions = shuffled.filter(q => {
      if (seen.has(q.id)) return false;
      seen.set(q.id, true);
      return true;
    });

    State.currentIndex = 0;
    State.selectedOptions = [];
    State.confirmed = false;
    State.answers = [];
    State.isWrongRetry = false;
    State.startTime = Date.now();

    Router.navigate('#/practice');
  },

  toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;z-index:9999;pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
};

// ════════════════════════════════════════════════════════
//  6. Practice View
// ════════════════════════════════════════════════════════

const PracticeView = {
  render() {
    const saved = Storage.getSession();
    if (saved && saved.practiceQuestions && saved.practiceQuestions.length > 0) {
      // Reject sessions that contain duplicate IDs (could come from old cached/buggy state)
      const ids = saved.practiceQuestions.map(q => q.id);
      const hasDuplicates = new Set(ids).size !== ids.length;

      if (!hasDuplicates) {
        State.practiceQuestions = saved.practiceQuestions;
        State.currentIndex = saved.currentIndex || 0;
        State.answers = saved.answers || [];
        State.isWrongRetry = saved.isWrongRetry || false;
        State.startTime = saved.startTime || Date.now();
      } else {
        Storage.clearSession();
      }
    }

    if (State.practiceQuestions.length === 0) {
      Router.navigate('#/');
      return;
    }

    State.selectedOptions = [];
    State.confirmed = false;
    this.showQuestion();
    this.bindEvents();
  },

  showQuestion() {
    const q = State.practiceQuestions[State.currentIndex];
    if (!q) { this.finishPractice(); return; }

    const topic = getTopicInfo(q.topic);
    const total = State.practiceQuestions.length;
    const idx = State.currentIndex + 1;

    document.getElementById('progress-text').textContent = `Q ${idx}/${total}`;
    document.getElementById('progress-fill').style.width = `${(idx / total) * 100}%`;

    document.getElementById('q-topic-tag').textContent = topic.en;
    const typeTag = document.getElementById('q-type-tag');
    typeTag.textContent = q.type === 'multiple' ? 'Multiple' : 'Single';
    typeTag.className = 'type-tag ' + (q.type === 'multiple' ? '' : 'single');

    document.getElementById('q-stem').textContent = q.stem;

    const imgWrap = document.getElementById('q-image-wrap');
    const imgEl = document.getElementById('q-image');
    imgEl.onerror = null;
    if (q.image) {
      const safe = safeUrl(q.image);
      imgEl.src = safe;
      imgEl.alt = q.stem;
      imgEl.onerror = () => {
        imgWrap.classList.add('hidden');
        imgEl.onerror = null;
      };
      imgWrap.classList.remove('hidden');
    } else {
      imgWrap.classList.add('hidden');
      imgEl.src = '';
    }

    const optionsList = document.getElementById('q-options');
    optionsList.innerHTML = '';
    q.options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'option-item';
      item.dataset.key = opt.key;
      item.innerHTML = `
        <div class="option-key">${escapeHtml(opt.key)}</div>
        <div class="option-text">${escapeHtml(opt.text)}</div>
        <div class="option-icon"></div>
      `;
      item.addEventListener('click', () => this.selectOption(opt.key));
      optionsList.appendChild(item);
    });

    document.getElementById('explanation-box').style.display = 'none';
    document.getElementById('btn-confirm').classList.remove('hidden');
    document.getElementById('btn-confirm').disabled = true;
    document.getElementById('btn-next').classList.add('hidden');

    if (State.useTimer) {
      this.startTimer();
    } else {
      document.getElementById('timer-display').style.display = 'none';
    }

    this.saveSession();
  },

  selectOption(key) {
    if (State.confirmed) return;

    const q = State.practiceQuestions[State.currentIndex];
    if (q.type === 'single') {
      State.selectedOptions = [key];
    } else {
      const idx = State.selectedOptions.indexOf(key);
      if (idx > -1) {
        State.selectedOptions.splice(idx, 1);
      } else {
        State.selectedOptions.push(key);
      }
    }

    document.querySelectorAll('.option-item').forEach(item => {
      if (State.selectedOptions.includes(item.dataset.key)) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });

    document.getElementById('btn-confirm').disabled = State.selectedOptions.length === 0;
  },

  confirmAnswer() {
    if (State.selectedOptions.length === 0) return;

    State.confirmed = true;
    this.stopTimer();

    const q = State.practiceQuestions[State.currentIndex];
    const correctSet = new Set(q.answer);
    const selectedSet = new Set(State.selectedOptions);
    const isCorrect = q.answer.length === selectedSet.size &&
      [...selectedSet].every(k => correctSet.has(k));

    document.querySelectorAll('.option-item').forEach(item => {
      const key = item.dataset.key;
      item.classList.add('locked');
      item.classList.remove('selected');

      const iconEl = item.querySelector('.option-icon');
      if (correctSet.has(key) && selectedSet.has(key)) {
        item.classList.add('correct');
        iconEl.textContent = '\u2713';
      } else if (selectedSet.has(key) && !correctSet.has(key)) {
        item.classList.add('wrong');
        iconEl.textContent = '\u2717';
      } else if (correctSet.has(key) && !selectedSet.has(key)) {
        item.classList.add('missed');
        iconEl.textContent = '\u2713';
      }
    });

    const expBox = document.getElementById('explanation-box');
    expBox.style.display = 'block';
    const header = document.getElementById('exp-header');
    const icon = document.getElementById('exp-icon');
    const title = document.getElementById('exp-title');
    header.className = 'explanation-header ' + (isCorrect ? 'correct-header' : 'wrong-header');
    icon.textContent = isCorrect ? '\u2713 ' : '\u2717 ';
    title.textContent = isCorrect ? 'Correct!' : 'Wrong';
    document.getElementById('exp-correct').textContent = 'Correct answer: ' + q.answer.join(', ');
    document.getElementById('exp-text').textContent = q.explain || '';
    document.getElementById('exp-source').textContent = q.source || '';

    State.answers.push({
      questionId: q.id,
      topic: q.topic,
      stem: q.stem,
      image: q.image || null,
      options: q.options,
      answer: q.answer,
      explain: q.explain,
      source: q.source,
      type: q.type,
      selected: [...State.selectedOptions],
      correct: isCorrect,
    });

    if (!isCorrect) {
      Storage.addWrong(q, [...State.selectedOptions]);
    }

    document.getElementById('btn-confirm').classList.add('hidden');
    const nextBtn = document.getElementById('btn-next');
    nextBtn.classList.remove('hidden');
    nextBtn.textContent = State.currentIndex === State.practiceQuestions.length - 1
      ? 'See Results' : 'Next';

    this.saveSession();
  },

  nextQuestion() {
    State.currentIndex++;
    State.selectedOptions = [];
    State.confirmed = false;

    if (State.currentIndex >= State.practiceQuestions.length) {
      this.finishPractice();
    } else {
      this.showQuestion();
    }
  },

  finishPractice() {
    this.stopTimer();
    const correct = State.answers.filter(a => a.correct).length;
    const total = State.answers.length;
    const timeUsed = Math.round((Date.now() - State.startTime) / 1000);

    Storage.addHistory({
      date: Date.now(),
      correct,
      total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      timeUsed,
      topics: [...new Set(State.practiceQuestions.map(q => q.topic))],
      isWrongRetry: State.isWrongRetry,
    });

    Storage.clearSession();
    Router.navigate('#/result');
  },

  startTimer() {
    State.timeLeft = 60;
    const display = document.getElementById('timer-display');
    display.style.display = 'inline';
    display.textContent = State.timeLeft + 's';

    this.stopTimer();
    State.timerInterval = setInterval(() => {
      State.timeLeft--;
      display.textContent = State.timeLeft + 's';
      if (State.timeLeft <= 10) {
        display.style.color = '#dc2626';
      }
      if (State.timeLeft <= 0) {
        this.stopTimer();
        if (!State.confirmed) {
          this.confirmAnswer();
        }
      }
    }, 1000);
  },

  stopTimer() {
    if (State.timerInterval) {
      clearInterval(State.timerInterval);
      State.timerInterval = null;
    }
    const display = document.getElementById('timer-display');
    if (display) display.style.color = '';
  },

  saveSession() {
    Storage.saveSession({
      practiceQuestions: State.practiceQuestions,
      currentIndex: State.currentIndex,
      answers: State.answers,
      isWrongRetry: State.isWrongRetry,
      startTime: State.startTime,
    });
  },

  bindEvents() {
    document.getElementById('btn-confirm').onclick = () => this.confirmAnswer();
    document.getElementById('btn-next').onclick = () => this.nextQuestion();

    document.getElementById('practice-back').onclick = () => {
      if (confirm('Exit practice? Your progress is saved, you can resume next time.')) {
        this.stopTimer();
        Router.navigate('#/');
      }
    };
  },
};

// ════════════════════════════════════════════════════════
//  7. Result View
// ════════════════════════════════════════════════════════

const ResultView = {
  render() {
    const answers = State.answers;
    if (answers.length === 0) {
      Router.navigate('#/');
      return;
    }

    const correct = answers.filter(a => a.correct).length;
    const total = answers.length;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    const ring = document.getElementById('ring-fill');
    const circumference = 2 * Math.PI * 85;
    const offset = circumference * (1 - percent / 100);
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference;
    setTimeout(() => {
      ring.style.strokeDashoffset = offset;
    }, 100);

    document.getElementById('result-percent').textContent = percent + '%';
    document.getElementById('result-score').textContent = `${correct}/${total}`;

    let comment;
    if (percent >= 90) comment = '\uD83C\uDFC6 Excellent! You are ESAT-ready!';
    else if (percent >= 75) comment = '\uD83D\uDC4F Great work! Keep pushing forward!';
    else if (percent >= 60) comment = '\uD83D\uDCAA Good effort! Review your wrong answers!';
    else if (percent >= 40) comment = '\uD83D\uDCDA Keep practicing, focus on weak topics!';
    else comment = '\uD83E\uDDBE Don\'t give up! Practice makes perfect!';
    document.getElementById('result-comment').textContent = comment;

    document.getElementById('summary-correct').textContent = `${correct} correct`;
    document.getElementById('summary-wrong').textContent = `${total - correct} wrong`;

    const timeUsed = Math.round((Date.now() - State.startTime) / 1000);
    const min = Math.floor(timeUsed / 60);
    const sec = timeUsed % 60;
    document.getElementById('summary-time').textContent = `Time: ${min}m ${sec}s`;
    document.getElementById('summary-time-wrap').style.display = 'flex';

    this.renderReview(answers);
    this.bindEvents();
  },

  renderReview(answers) {
    const list = document.getElementById('review-list');
    list.innerHTML = '';

    answers.forEach((a, i) => {
      const topic = getTopicInfo(a.topic);
      const item = document.createElement('div');
      item.className = 'review-item ' + (a.correct ? 'correct-item' : 'wrong-item');
      item.innerHTML = `
        <div class="review-header">
          <span class="review-status ${a.correct ? 'correct' : 'wrong'}">${a.correct ? '\u2713' : '\u2717'}</span>
          <span class="review-topic">${escapeHtml(topic.en)}</span>
        </div>
        <div class="review-stem">${escapeHtml(i + 1)}. ${escapeHtml(a.stem)}</div>
        ${a.image ? `<img class="review-img" src="${escapeHtml(a.image)}" alt="${escapeHtml(a.stem)}" loading="lazy">` : ''}
        <div class="review-answers">
          <span class="your-answer ${a.correct ? '' : 'wrong'}">Your answer: ${escapeHtml(a.selected.join(', ')) || 'N/A'}</span>
          <span class="right-answer">Correct: ${escapeHtml(a.answer.join(', '))}</span>
        </div>
        <div class="review-explain">${escapeHtml(a.explain)}</div>
        <button class="review-toggle">Show Explanation</button>
      `;
      item.querySelector('.review-toggle').onclick = () => {
        item.classList.toggle('expanded');
        item.querySelector('.review-toggle').textContent =
          item.classList.contains('expanded') ? 'Hide Explanation' : 'Show Explanation';
      };
      list.appendChild(item);
    });
  },

  bindEvents() {
    document.getElementById('btn-back-home').onclick = () => Router.navigate('#/');

    document.getElementById('btn-retry-wrong').onclick = () => {
      const wrongAnswers = State.answers.filter(a => !a.correct);
      if (wrongAnswers.length === 0) {
        HomeView.toast('No wrong answers this time!');
        return;
      }
      // Clear old session so new questions aren't overwritten by restore
      Storage.clearSession();
      const wrongQuestions = wrongAnswers.map(a => ({
        id: a.questionId,
        topic: a.topic,
        type: a.type,
        stem: a.stem,
        image: a.image || null,
        options: a.options,
        answer: a.answer,
        explain: a.explain,
        source: a.source,
      }));
      State.practiceQuestions = shuffle(wrongQuestions);
      State.currentIndex = 0;
      State.selectedOptions = [];
      State.confirmed = false;
      State.answers = [];
      State.isWrongRetry = true;
      State.startTime = Date.now();
      Router.navigate('#/practice');
    };
  },
};

// ════════════════════════════════════════════════════════
//  8. Wrong Bank View
// ════════════════════════════════════════════════════════

const WrongView = {
  render() {
    this.renderFilterBar();
    this.renderList();
    this.bindEvents();
  },

  renderFilterBar() {
    const bar = document.getElementById('wrong-filter-bar');
    const wrong = Storage.getWrong();
    const topicsInWrong = [...new Set(wrong.map(w => w.topic))];

    bar.innerHTML = `<button class="filter-chip ${State.wrongFilter === 'all' ? 'active' : ''}" data-filter="all">All (${wrong.length})</button>`;

    TOPICS.filter(t => topicsInWrong.includes(t.key)).forEach(t => {
      const count = wrong.filter(w => w.topic === t.key).length;
      const chip = document.createElement('button');
      chip.className = 'filter-chip' + (State.wrongFilter === t.key ? ' active' : '');
      chip.dataset.filter = t.key;
      chip.textContent = `${t.en} (${count})`;
      bar.appendChild(chip);
    });
  },

  renderList() {
    const wrong = Storage.getWrong();
    const filtered = State.wrongFilter === 'all'
      ? wrong : wrong.filter(w => w.topic === State.wrongFilter);

    const list = document.getElementById('wrong-list');
    const empty = document.getElementById('wrong-empty');
    const actions = document.getElementById('wrong-actions');

    if (filtered.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      actions.style.display = 'none';
      return;
    }

    empty.classList.add('hidden');
    actions.style.display = 'flex';

    list.innerHTML = '';
    filtered.forEach((w, i) => {
      const topic = getTopicInfo(w.topic);
      const card = document.createElement('div');
      card.className = 'wrong-card';
      card.innerHTML = `
        <div class="wrong-card-header">
          <div class="wrong-card-tags">
            <span class="topic-tag">${escapeHtml(topic.en)}</span>
            <span class="type-tag ${w.type === 'multiple' ? '' : 'single'}">${w.type === 'multiple' ? 'Multiple' : 'Single'}</span>
          </div>
          <span class="wrong-card-meta">${escapeHtml(new Date(w.addedAt).toLocaleDateString())}</span>
        </div>
        <div class="wrong-stem">${escapeHtml(i + 1)}. ${escapeHtml(w.stem)}</div>
        ${w.image ? `<img class="wrong-img" src="${escapeHtml(w.image)}" alt="${escapeHtml(w.stem)}" loading="lazy">` : ''}
        <div class="wrong-answers">
          <span class="your-answer">Your answer: ${escapeHtml((w.yourAnswer || []).join(', ')) || 'N/A'}</span>
          <span class="right-answer">Correct: ${escapeHtml(w.answer.join(', '))}</span>
        </div>
        <div class="wrong-explain">${escapeHtml(w.explain)}</div>
        <div class="wrong-card-actions">
          <button class="btn-mini danger" data-action="remove" data-id="${escapeHtml(w.id)}">Mastered, Remove</button>
        </div>
      `;

      card.querySelector('.wrong-stem').onclick = () => {
        card.classList.toggle('expanded');
      };

      card.querySelector('[data-action="remove"]').onclick = (e) => {
        e.stopPropagation();
        Storage.removeWrong(w.id);
        this.renderFilterBar();
        this.renderList();
      };

      list.appendChild(card);
    });
  },

  bindEvents() {
    document.getElementById('wrong-back').onclick = () => Router.navigate('#/');

    document.getElementById('wrong-filter-bar').addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      State.wrongFilter = chip.dataset.filter;
      this.renderFilterBar();
      this.renderList();
    });

    document.getElementById('btn-practice-wrong').onclick = () => {
      const wrong = Storage.getWrong();
      const filtered = State.wrongFilter === 'all'
        ? wrong : wrong.filter(w => w.topic === State.wrongFilter);

      if (filtered.length === 0) {
        HomeView.toast('No wrong questions to practice');
        return;
      }

      // Clear old session so new questions aren't overwritten by restore
      Storage.clearSession();

      const wrongQuestions = filtered.map(w => ({
        id: w.id,
        topic: w.topic,
        type: w.type,
        stem: w.stem,
        image: w.image || null,
        options: w.options,
        answer: w.answer,
        explain: w.explain,
        source: w.source,
      }));
      State.practiceQuestions = shuffle(wrongQuestions);
      State.currentIndex = 0;
      State.selectedOptions = [];
      State.confirmed = false;
      State.answers = [];
      State.isWrongRetry = true;
      State.startTime = Date.now();
      Router.navigate('#/practice');
    };
  },
};

// ════════════════════════════════════════════════════════
//  9. PWA Install
// ════════════════════════════════════════════════════════

const PWA = {
  deferredPrompt: null,

  init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=8').catch(err => {
        console.log('SW registration failed:', err);
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallBanner();
    });

    const installBtn = document.getElementById('btn-install');
    if (installBtn) {
      installBtn.onclick = () => this.promptInstall();
    }

    const dismissBtn = document.getElementById('btn-dismiss');
    if (dismissBtn) {
      dismissBtn.onclick = () => this.hideInstallBanner();
    }

    window.addEventListener('appinstalled', () => {
      this.hideInstallBanner();
    });
  },

  showInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('hidden');
  },

  hideInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.add('hidden');
  },

  async promptInstall() {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.hideInstallBanner();
  },
};

// ════════════════════════════════════════════════════════
//  10. Init — wait for auth ready
// ════════════════════════════════════════════════════════

window.addEventListener('auth:ready', () => {
  Storage.setStudent(Auth.currentStudent);
  PWA.init();
  Router.init();

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      if (confirm('Are you sure you want to logout?')) {
        Auth.logout();
      }
    };
  }
});

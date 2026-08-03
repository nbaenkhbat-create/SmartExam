/**
 * SmartEXAM Security Module (plain JS — no Babel/JSX)
 * Loaded before the React app. Exposes window.SESecurity
 */
(function (global) {
  'use strict';

  const SE_AUTH_SESSION = 'se_auth_session_v1';
  const SE_TEACHER_META = 'se_teacher_meta_v1';

  const secureUid = (bytes) => {
    const n = bytes || 16;
    const arr = new Uint8Array(n);
    if (global.crypto && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < n; i++) arr[i] = (Math.random() * 256) | 0;
    }
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  const sanitizeText = (s, max) => {
    const lim = max || 500;
    return String(s == null ? '' : s)
      .replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim()
      .slice(0, lim);
  };

  const escapeHtml = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  /** Public question payload — NEVER includes correct answers */
  const packQuestionsPublic = (questions) =>
    (questions || []).map((q) => ({
      text: sanitizeText(q.text, 2000),
      options: (q.options || []).map((o) => ({
        key: String(o.key || '').slice(0, 2),
        text: sanitizeText(o.text, 500)
      })),
      type: q.type || 'mcq',
      topic: sanitizeText(q.topic, 120),
      imageUrl: sanitizeText(q.imageUrl, 500),
      sourceText: sanitizeText(q.sourceText, 4000),
      audioUrl: sanitizeText(q.audioUrl, 500),
      unit: sanitizeText(q.unit, 40)
      // no answer, no numericAnswer
    }));

  /** Teacher-only answer key */
  const packAnswerKeys = (questions) =>
    (questions || []).map((q, i) => ({
      id: i + 1,
      type: q.type || 'mcq',
      answer: q.answer ?? q.numericAnswer ?? null,
      topic: sanitizeText(q.topic, 120)
    }));

  const unpackQuestionsPublic = (questions) =>
    (questions || []).map((q, idx) => {
      const type = q?.type || 'mcq';
      let options;
      if (type === 'tf') {
        options = [
          { key: 'A', text: q?.options?.[0]?.text || 'Зөв / Үнэн' },
          { key: 'B', text: q?.options?.[1]?.text || 'Буруу / Худал' }
        ];
      } else if (type === 'grid') {
        options = [];
      } else {
        options = ['A', 'B', 'C', 'D'].map((key, oi) => {
          const hit = (q?.options || []).find((o) => o?.key === key);
          const byIndex = q?.options?.[oi];
          return { key, text: hit?.text ?? byIndex?.text ?? '' };
        });
      }
      return {
        id: idx + 1,
        text: q?.text || '',
        options,
        answer: null, // never from public payload
        type,
        topic: q?.topic || '',
        imageUrl: q?.imageUrl || '',
        sourceText: q?.sourceText || '',
        audioUrl: q?.audioUrl || '',
        unit: q?.unit || '',
        numericAnswer: null
      };
    });

  const answersEqual = (got, expected, type) => {
    if (expected == null || expected === '') return false;
    const g = String(got ?? '').trim().toUpperCase();
    const e = String(expected).trim().toUpperCase();
    if (type === 'grid') {
      const gn = String(got ?? '').replace(/[_\D]/g, '');
      const en = String(expected).replace(/\D/g, '');
      return gn.length > 0 && en.length > 0 && gn === en;
    }
    return g === e;
  };

  /** Re-grade submissions with teacher-held keys (source of truth) */
  const regradeSubmission = (sub, answerKeyList) => {
    if (!sub || !Array.isArray(answerKeyList)) return sub;
    const ans = sub.answers || {};
    let correct = 0;
    let total = 0;
    answerKeyList.forEach((q) => {
      if (q.answer == null || q.answer === '') return;
      total++;
      if (answersEqual(ans[q.id], q.answer, q.type)) correct++;
    });
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return {
      ...sub,
      score,
      correctCount: correct,
      totalCount: total || sub.totalCount || 0,
      verified: true,
      gradedBy: sub.gradedBy === 'cloud' ? 'cloud' : 'teacher-regrade'
    };
  };

  const saveTeacherMeta = (meta) => {
    try {
      localStorage.setItem(SE_TEACHER_META, JSON.stringify(meta));
    } catch (_) {}
  };

  const loadTeacherMeta = () => {
    try {
      return JSON.parse(localStorage.getItem(SE_TEACHER_META) || 'null');
    } catch {
      return null;
    }
  };

  const clearTeacherMeta = () => {
    try {
      localStorage.removeItem(SE_TEACHER_META);
      localStorage.removeItem(SE_AUTH_SESSION);
    } catch (_) {}
  };

  global.SESecurity = {
    secureUid,
    sanitizeText,
    escapeHtml,
    packQuestionsPublic,
    packAnswerKeys,
    unpackQuestionsPublic,
    answersEqual,
    regradeSubmission,
    saveTeacherMeta,
    loadTeacherMeta,
    clearTeacherMeta,
    SE_AUTH_SESSION,
    SE_TEACHER_META
  };
})(typeof window !== 'undefined' ? window : globalThis);

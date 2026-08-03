/**
 * SmartEXAM Cloud Functions — server-side grading
 * Deploy: npx firebase-tools deploy --only functions
 *
 * gradeSubmission: student submits answers only; server reads answerKeys and writes verified score.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();

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

const gradeAnswers = (answers, answerKeyList) => {
  const keyMap = {};
  (answerKeyList || []).forEach((q, i) => {
    const id = q.id || i + 1;
    keyMap[id] = q;
  });
  let correct = 0;
  let total = 0;
  Object.keys(keyMap).forEach((id) => {
    const q = keyMap[id];
    if (q.answer == null || q.answer === '') return;
    total++;
    if (answersEqual(answers[id], q.answer, q.type)) correct++;
  });
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score };
};

exports.gradeSubmission = functions
  .region('asia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Нэвтэрсэн байх ёстой');
    }
    const roomId = String(data.roomId || '').trim();
    const answers = data.answers || {};
    const studentName = String(data.studentName || '').trim().slice(0, 80);
    const studentClass = String(data.studentClass || '').trim().slice(0, 40);
    const variantLabel = String(data.variantLabel || 'A').slice(0, 2);
    const cheatLog = Array.isArray(data.cheatLog) ? data.cheatLog.slice(0, 50) : [];
    const timeSpentSec = Math.min(Math.max(0, Number(data.timeSpentSec) || 0), 86400);

    if (!roomId || roomId.length > 64) {
      throw new functions.https.HttpsError('invalid-argument', 'roomId буруу');
    }
    if (!studentName) {
      throw new functions.https.HttpsError('invalid-argument', 'Нэр шаардлагатай');
    }

    const roomSnap = await db.ref('activeRooms/' + roomId).once('value');
    if (!roomSnap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Шалгалт олдсонгүй');
    }
    const room = roomSnap.val();
    if (room.stopped) {
      throw new functions.https.HttpsError('failed-precondition', 'Шалгалт зогссон');
    }

    const keySnap = await db.ref('activeRooms/' + roomId + '/answerKeys/' + variantLabel).once('value');
    const answerKeyList = keySnap.val();
    if (!Array.isArray(answerKeyList)) {
      throw new functions.https.HttpsError('failed-precondition', 'Хариултын түлхүүр алга');
    }

    const graded = gradeAnswers(answers, answerKeyList);
    const subId = admin.database().ref().push().key;
    const submission = {
      id: subId,
      examId: roomId,
      uid: context.auth.uid,
      studentName,
      studentClass,
      answers,
      score: graded.score,
      correctCount: graded.correct,
      totalCount: graded.total,
      timeSpentSec,
      variantLabel,
      studentVersion: variantLabel,
      cheatLog,
      submittedAt: new Date().toISOString(),
      verified: true,
      gradedBy: 'cloud'
    };

    await db.ref('activeRooms/' + roomId + '/submissions/' + subId).set(submission);
    return {
      id: subId,
      score: graded.score,
      correctCount: graded.correct,
      totalCount: graded.total,
      verified: true
    };
  });

/** Teacher: re-grade all submissions from answerKeys (fixes forged scores) */
exports.regradeRoom = functions
  .region('asia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Нэвтэрсэн байх ёстой');
    }
    const roomId = String(data.roomId || '').trim();
    const roomSnap = await db.ref('activeRooms/' + roomId).once('value');
    if (!roomSnap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Шалгалт олдсонгүй');
    }
    const room = roomSnap.val();
    if (room.ownerUid !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Зөвхөн өөрийн шалгалт');
    }

    const keysSnap = await db.ref('activeRooms/' + roomId + '/answerKeys').once('value');
    const keys = keysSnap.val() || {};
    const subsSnap = await db.ref('activeRooms/' + roomId + '/submissions').once('value');
    const subs = subsSnap.val() || {};
    let updated = 0;

    const updates = {};
    Object.entries(subs).forEach(([sid, sub]) => {
      const label = sub.variantLabel || sub.studentVersion || 'A';
      const keyList = keys[label];
      if (!Array.isArray(keyList)) return;
      const graded = gradeAnswers(sub.answers || {}, keyList);
      updates[`activeRooms/${roomId}/submissions/${sid}/score`] = graded.score;
      updates[`activeRooms/${roomId}/submissions/${sid}/correctCount`] = graded.correct;
      updates[`activeRooms/${roomId}/submissions/${sid}/totalCount`] = graded.total;
      updates[`activeRooms/${roomId}/submissions/${sid}/verified`] = true;
      updates[`activeRooms/${roomId}/submissions/${sid}/gradedBy`] = 'regrade';
      updated++;
    });

    if (updated) await db.ref().update(updates);
    return { updated };
  });

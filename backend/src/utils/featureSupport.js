/**
 * featureSupport.js
 *
 * In Firestore, collections and document fields are flexible/schemaless, so all
 * feature checks (rounds, time limits, notification reads, coding judge, session locks)
 * return true by default without needing database schema migrations.
 */

async function roundsSupported() {
  return true;
}

async function questionTimeLimitSupported() {
  return true;
}

async function questionTimingSupported() {
  return true;
}

async function notificationReadsSupported() {
  return true;
}

async function roundQualificationSupported() {
  return true;
}

async function roundUpdatedAtSupported() {
  return true;
}

async function codingJudgeSupported() {
  return true;
}

async function sessionLockSupported() {
  return true;
}

function resetRoundsSupportCache() {}

module.exports = {
  roundsSupported,
  resetRoundsSupportCache,
  questionTimeLimitSupported,
  questionTimingSupported,
  notificationReadsSupported,
  roundQualificationSupported,
  roundUpdatedAtSupported,
  codingJudgeSupported,
  sessionLockSupported,
};

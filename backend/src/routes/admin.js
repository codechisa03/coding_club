const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const adminAuthController = require("../controllers/adminAuthController");
const adminQuizController = require("../controllers/adminQuizController");
const adminQuestionController = require("../controllers/adminQuestionController");
const adminRoundController = require("../controllers/adminRoundController");
const adminParticipantController = require("../controllers/adminParticipantController");
const adminAttendanceController = require("../controllers/adminAttendanceController");
const adminResultsController = require("../controllers/adminResultsController");
const adminLiveController = require("../controllers/adminLiveController");
const adminNotificationController = require("../controllers/adminNotificationController");
const adminStudentController = require("../controllers/adminStudentController");
const adminMediaController = require("../controllers/adminMediaController");
const adminLeaderboardController = require("../controllers/adminLeaderboardController");
const adminSecurityController = require("../controllers/adminSecurityController");
const { handleMediaUpload } = require("../middleware/mediaUpload");

const router = express.Router();

// Auth
router.post("/login", adminAuthController.login);

// Everything below requires a valid admin session
router.use(requireAdmin);

// Dashboard
router.get("/dashboard", adminQuizController.dashboardStats);

// Notifications
router.get("/notifications", adminNotificationController.listNotifications);
router.post("/notifications/read", adminNotificationController.markRead);
router.post("/notifications/read-all", adminNotificationController.markAllRead);

// Quizzes
router.get("/quizzes", adminQuizController.listQuizzes);
router.post("/quizzes", adminQuizController.createQuiz);
router.get("/quizzes/:id", adminQuizController.getQuiz);
router.put("/quizzes/:id", adminQuizController.updateQuiz);
router.delete("/quizzes/:id", adminQuizController.deleteQuiz);
router.patch("/quizzes/:id/status", adminQuizController.setPublishStatus);

// Rounds
router.get("/quizzes/:quizId/rounds", adminRoundController.listRounds);
router.post("/quizzes/:quizId/rounds", adminRoundController.createRound);
router.put("/quizzes/:quizId/rounds/reorder", adminRoundController.reorderRounds);
router.put("/rounds/:id", adminRoundController.updateRound);
router.delete("/rounds/:id", adminRoundController.deleteRound);

// Questions
router.get("/quizzes/:quizId/questions", adminQuestionController.listQuestions);
router.post("/quizzes/:quizId/questions", adminQuestionController.createQuestion);
router.put("/quizzes/:quizId/questions/reorder", adminQuestionController.reorderQuestions);
router.put("/questions/:id", adminQuestionController.updateQuestion);
router.delete("/questions/:id", adminQuestionController.deleteQuestion);

// Participants
router.get("/participants", adminParticipantController.listParticipants);
router.get("/quizzes/:quizId/participants", adminParticipantController.listQuizParticipation);
router.delete("/quizzes/:quizId/participants/:id", adminParticipantController.deleteQuizParticipation);

// Student search — by 12-digit register number or name
router.get("/students", adminStudentController.searchStudents);
router.get("/students/:id", adminStudentController.getStudentDetail);
router.delete("/students/:id", adminStudentController.deleteStudent);

// Attendance
router.get("/attendance", adminAttendanceController.listAttendance);

// Results
router.get("/results", adminResultsController.listResults);
router.get("/results/:attemptId", adminResultsController.getResultDetail);
router.delete("/results/:attemptId", adminResultsController.deleteResult);

// Leaderboard — cumulative percentage across every quiz, signed-in users
// ranked separately from Guest accounts.
router.get("/leaderboard", adminLeaderboardController.getLeaderboard);


// Live monitor
router.get("/live/:quizId", adminLiveController.liveSnapshot);

// Security Log — forced quiz-attempt logouts from the proctoring system
// (exact reason, details, timestamp), across every student/quiz.
router.get("/logout-events", adminSecurityController.listLogoutEvents);

// Landing Page Media — images/videos shown in a gallery on the public
// Landing Page (backend/src/controllers/adminMediaController.js).
router.get("/media", adminMediaController.listMedia);
router.post("/media", handleMediaUpload, adminMediaController.uploadMedia);
router.put("/media/reorder", adminMediaController.reorderMedia);
router.patch("/media/:id", adminMediaController.updateMedia);
router.delete("/media/:id", adminMediaController.deleteMedia);

module.exports = router;

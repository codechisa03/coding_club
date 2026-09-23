require('dotenv').config();
const { addDoc } = require('./src/config/supabaseHelpers');

async function testInsert() {
  const row = {
    title: "Test Quiz",
    description: "Testing",
    password_hash: "12345",
    duration_minutes: 30,
    max_marks: 10,
    passing_percentage: 40,
    max_attempts: 1,
    randomize_questions: true,
    randomize_options: true,
    auto_submit: true,
    allow_late_join: false,
    show_leaderboard: true,
    tab_switch_limit: 3,
    status: "draft",
    placement: "quizzes"
  };

  const res = await addDoc('quizzes', row);
  console.log(res);
}
testInsert();

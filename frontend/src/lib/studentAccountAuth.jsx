import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";

const STORAGE_KEY = "quizapp_student_account_token";
const STUDENT_INFO_KEY = "quizapp_student_account_info";

const StudentAccountAuthContext = createContext(null);

export function StudentAccountAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [student, setStudent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STUDENT_INFO_KEY) || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  }, [token]);

  useEffect(() => {
    if (student) localStorage.setItem(STUDENT_INFO_KEY, JSON.stringify(student));
    else localStorage.removeItem(STUDENT_INFO_KEY);
  }, [student]);

  /** Sign Up: email, name, max 6-digit register number, mobile number, strong password, department, section, batch. */
  const signUp = useCallback(
    async ({ email, name, registerNumber, mobileNumber, password, department, section, batch }) => {
      const data = await apiFetch("/students/register", {
        method: "POST",
        body: { email, name, registerNumber, mobileNumber, password, department, section, batch },
      });
      setToken(data.token);
      setStudent(data.student);
      return data;
    },
    []
  );

  /** Sign In: email + password. */
  const signIn = useCallback(async (email, password) => {
    const data = await apiFetch("/students/signin", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.token);
    setStudent(data.student);
    return data;
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setStudent(null);
  }, []);

  /** Profile: update name / bio / photo / department / section / mobile number / batch. */
  const updateProfile = useCallback(
    async ({ name, bio, avatarUrl, department, section, mobileNumber, batch } = {}) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (bio !== undefined) body.bio = bio;
      if (avatarUrl !== undefined) body.avatarUrl = avatarUrl;
      if (department !== undefined) body.department = department;
      if (section !== undefined) body.section = section;
      if (mobileNumber !== undefined) body.mobileNumber = mobileNumber;
      if (batch !== undefined) body.batch = batch;
      const data = await apiFetch("/students/account", { method: "PUT", token, body });
      setStudent((prev) => ({ ...prev, ...data.student }));
      return data;
    },
    [token]
  );

  /** Profile: change password */
  const changePassword = useCallback(
    async (currentPassword, newPassword, confirmPassword) => {
      await apiFetch("/students/account/password", {
        method: "PUT",
        token,
        body: { currentPassword, newPassword, confirmPassword },
      });
    },
    [token]
  );

  return (
    <StudentAccountAuthContext.Provider
      value={{
        token,
        student,
        signUp,
        signIn,
        signOut,
        updateProfile,
        changePassword,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </StudentAccountAuthContext.Provider>
  );
}

export function useStudentAccountAuth() {
  const ctx = useContext(StudentAccountAuthContext);
  if (!ctx) throw new Error("useStudentAccountAuth must be used within StudentAccountAuthProvider");
  return ctx;
}

-- Coding Club PostgreSQL Schema for Supabase
-- Run this in your Supabase SQL Editor.

-- Users / Students
create table public.students (
    id uuid default gen_random_uuid() primary key,
    name text,
    email text unique,
    register_number text unique,
    department text,
    section text,
    batch text,
    mobile_number text,
    password_hash text,
    bio text,
    avatar_url text,
    active_session_token text,
    active_session_quiz_id text,
    active_session_started_at timestamp with time zone,
    account_created_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Admin Accounts
create table public.admins (
    id uuid default gen_random_uuid() primary key,
    name text,
    email text unique,
    role text,
    password_hash text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Quizzes
create table public.quizzes (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    description text,
    duration_minutes integer,
    max_marks integer,
    status text,
    placement text,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    allow_late_join boolean,
    tab_switch_limit integer,
    password_hash text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Questions
create table public.questions (
    id uuid default gen_random_uuid() primary key,
    quiz_id text,
    question_text text not null,
    type text,
    options jsonb,
    correct_option integer,
    marks integer,
    expected_output text,
    time_limit_ms integer,
    test_cases jsonb,
    language text,
    allowed_languages jsonb,
    sort_order integer,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Quiz Attempts
create table public.quiz_attempts (
    id uuid default gen_random_uuid() primary key,
    quiz_id text,
    student_id text,
    status text,
    score integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    time_taken_seconds integer,
    violations jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Answers
create table public.answers (
    id uuid default gen_random_uuid() primary key,
    attempt_id text,
    question_id text,
    submitted_option integer,
    code text,
    language text,
    marks_awarded integer,
    is_correct boolean,
    teacher_comment text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Media
create table public.landing_media (
    id uuid default gen_random_uuid() primary key,
    media_type text,
    title text,
    caption text,
    url text,
    storage_path text,
    mime_type text,
    file_size_bytes bigint,
    sort_order integer,
    is_active boolean,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

-- Security Logs (Warnings / tab switches)
create table public.security_logs (
    id uuid default gen_random_uuid() primary key,
    student_id text,
    quiz_id text,
    event_type text,
    message text,
    metadata jsonb,
    created_at timestamp with time zone default now()
);

-- Attendance
create table public.attendance (
    id uuid default gen_random_uuid() primary key,
    quiz_id text,
    student_id text,
    status text,
    join_time timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone
);

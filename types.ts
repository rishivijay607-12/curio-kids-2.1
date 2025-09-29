export interface DiagramIdea {
  id: string;
  prompt: string;
  description: string;
}

export interface Diagram {
  id:string;
  prompt: string;
  image: string; // base64 encoded image
  description: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export enum BadgeType {
  QUIZ_NOVICE = 'QUIZ_NOVICE',
  QUIZ_ADEPT = 'QUIZ_ADEPT',
  QUIZ_MASTER = 'QUIZ_MASTER',
  TOPIC_ACE = 'TOPIC_ACE',
  PERFECT_SCORE = 'PERFECT_SCORE',
}

export interface Badge {
  id: BadgeType;
  name: string;
  description: string;
  dateEarned: string; // ISO string
}

export interface LeaderboardEntry {
    userId: string;
    username: string;
    score: number;
    profilePictureUrl?: string;
}


export interface UserStats {
    quizzesCompleted: number;
    quizzesAttempted: number;
    topicsMastered: string[];
    totalScorePoints: number;
    totalQuestionsAnswered: number;
    timeSpentLearningInSeconds: number;
    topicPerformance: Record<string, { correct: number; total: number }>;
    badges: Badge[];
    currentStreak: number;
    lastActivityDate: string; // YYYY-MM-DD
}

export interface User {
    id: string;
    username: string;
    password: string;
    isAdmin: boolean;
    profilePictureUrl?: string;
    stats: UserStats;
}

export interface ActivityLog {
    id: string;
    userId: string;
    username: string;
    timestamp: string; // ISO string
    type: string;
    details: Record<string, any>;
}

export type Language = 'English' | 'English+Hindi' | 'English+Tamil' | 'English+Telugu' | 'English+Kannada' | 'English+Malayalam';

export enum GameState {
  LOGIN_SCREEN,
  HOME_SCREEN,
  GRADE_SELECTION,
  TOPIC_SELECTION,
  DIAGRAM_IDEAS_SELECTION,
  DIAGRAM_GENERATOR,
  LANGUAGE_SELECTION,
  DOUBT_SOLVER,
  VOICE_TUTOR_SESSION,
  QUIZ_DIFFICULTY_SELECTION,
  QUIZ_COUNT_SELECTION,
  QUIZ_TIMER_SELECTION,
  QUIZ_IN_PROGRESS,
  QUIZ_SCORE,
  WORKSHEET_DIFFICULTY_SELECTION,
  WORKSHEET_COUNT_SELECTION,
  WORKSHEET_DISPLAY,
  NOTES_DISPLAY,
  CONCEPT_DEEP_DIVE,
  USER_PROFILE,
  EDIT_PROFILE_PICTURE,
  ADMIN_PANEL,
  LEADERBOARD,
  VIRTUAL_LAB_INPUT,
  VIRTUAL_LAB_DISPLAY,
  REAL_WORLD_CONNECTIONS_INPUT,
  REAL_WORLD_CONNECTIONS_DISPLAY,
  HISTORICAL_CHAT_SELECTION,
  HISTORICAL_CHAT_SESSION,
  AI_STORY_WEAVER_INPUT,
  AI_STORY_WEAVER_DISPLAY,
  SCIENCE_FAIR_BUDDY_INPUT,
  SCIENCE_FAIR_BUDDY_IDEAS,
  SCIENCE_FAIR_BUDDY_PLAN,
  SCIENCE_LENS_INPUT,
  SCIENCE_LENS_DISPLAY,
  WHAT_IF_SCENARIO_INPUT,
  WHAT_IF_SCENARIO_SESSION,
}

export type AppMode = 'diagram' | 'doubt_solver' | 'quiz' | 'worksheet' | 'notes' | 'deep_dive' | 'admin' | 'profile' | 'leaderboard' | 'voice_tutor' | 'virtual_lab' | 'real_world_connections' | 'historical_chat' | 'ai_story_weaver' | 'science_fair_buddy' | 'science_lens' | 'what_if_scenario';
export type Grade = 6 | 7 | 8 | 9 | 10;
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type QuestionType = 'MCQ' | 'True/False' | 'Q&A' | 'Assertion/Reason';

export interface QuizQuestion {
  question: string;
  reason?: string;
  options: string[];
  answer: string;
  explanation: string;
  type: QuestionType;
}

export interface NoteSection {
  title: string;
  points: string[];
}

export interface SavedQuizState {
    gameState: GameState.QUIZ_IN_PROGRESS;
    appMode: 'quiz';
    grade: Grade;
    topic: string;
    difficulty: Difficulty;
    timePerQuestion: number;
    questions: QuizQuestion[];
    userAnswers: (string | null)[];
    currentQuestionIndex: number;
}

export interface TranscriptPart {
    speaker: 'user' | 'model';
    text: string;
}

export type TutorStatus = 'CONNECTING' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export interface VirtualLabStep {
  title: string;
  description: string;
  imagePrompt: string;
  image?: string; // base64 encoded
}

export interface RealWorldExample {
  title: string;
  explanation: string;
  imagePrompt: string;
  image?: string; // base64 encoded
}

export interface ScienceFairProjectIdea {
  id: string;
  title: string;
  description: string;
}

export interface ScienceFairProjectStep {
  title: string;
  description: string;
  imagePrompt: string;
  image?: string; // base64 encoded
}

export interface HistoricalScientist {
  id: string;
  name: string;
  era: string;
  field: string;
  systemInstruction: string;
  imageUrl: string;
}
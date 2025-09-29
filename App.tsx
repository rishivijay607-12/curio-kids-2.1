import React, { useState, useRef, Suspense, useCallback, useEffect, lazy } from 'react';
import { GoogleGenAI, Chat, Modality, Blob, LiveServerMessage } from "@google/genai";
import { 
    GameState, AppMode, Grade, Difficulty, Language, QuizQuestion, NoteSection, 
    DiagramIdea, Diagram, ChatMessage, User, Badge, LeaderboardEntry, ActivityLog, 
    SavedQuizState, TranscriptPart, TutorStatus, VirtualLabStep, RealWorldExample, 
    HistoricalScientist, ScienceFairProjectIdea, ScienceFairProjectStep 
} from './types';
import { 
    USERS_KEY, CURRENT_USER_ID_KEY, LEADERBOARD_KEY, ACTIVITY_LOG_KEY, getSavedQuizKey, 
    CHAPTERS_BY_GRADE, BADGE_DEFINITIONS, DEFAULT_ADMIN_USER, HISTORICAL_SCIENTISTS 
} from './hooks/constants';
import { 
    initializeAiClient, getAiClient, generateDiagramIdeas, generateDiagramImage, generateQuizQuestions, 
    generateNotes, generateConceptExplanation, generateStudyPlan, generateVirtualLabSteps, 
    generateRealWorldExamples, generateAIStory, generateScienceFairProjectIdeas, generateScienceFairProjectPlan,
    explainImageWithPrompt,
    safetySettings
} from './services/geminiService';
import { useLocalStorage } from './hooks/useLocalStorage';
import { generateUniqueId, timeAgo, formatLogMessage, encode, decode, decodeAudioData, createBlob } from './utils/helpers';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import { ProfilePictureEditor } from './components/ProfilePictureEditor';
import { 
    LoadingSpinner, FullScreenLoader, ApiErrorDisplay, PageHeader, ActionButton, SelectionButton, 
    HomeButton, LogoutButton, HomeScreenAtomIcon, FeatureCard, Modal, MicButton 
} from './components/common';
import remarkGfm from 'remark-gfm';

const Markdown = lazy(() => import('https://esm.sh/react-markdown@9?bundle'));

const App: React.FC = () => {
    // FIX: Reordered state to initialize gameState based on whether a user is logged in.
    // User Management
    const [users, setUsers] = useLocalStorage<User[]>(USERS_KEY, []);
    const [currentUserId, setCurrentUserId] = useLocalStorage<string | null>(CURRENT_USER_ID_KEY, null);
    const currentUser = users.find(u => u.id === currentUserId) || null;

    // Game State
    const [gameState, setGameState] = useState<GameState>(currentUser ? GameState.HOME_SCREEN : GameState.LOGIN_SCREEN);
    const [appMode, setAppMode] = useState<AppMode | null>(null);

    // Selections
    const [grade, setGrade] = useState<Grade | null>(null);
    const [topic, setTopic] = useState<string | null>(null);
    const [language, setLanguage] = useState<Language>('English');
    const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
    const [questionCount, setQuestionCount] = useState<number>(10);
    const [timePerQuestion, setTimePerQuestion] = useState<number>(30); // 0 for unlimited
    
    // Data & Loading
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [apiError, setApiError] = useState<string | null>(null);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [notes, setNotes] = useState<NoteSection[]>([]);
    const [conceptExplanation, setConceptExplanation] = useState<string>('');
    const [diagramIdeas, setDiagramIdeas] = useState<DiagramIdea[]>([]);
    const [generatedDiagram, setGeneratedDiagram] = useState<Diagram | null>(null);
    const [inputPrompt, setInputPrompt] = useState('');
    
    // Quiz State
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    
    // Chat & Voice State
    const [chatInput, setChatInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const doubtSolverScrollRef = useRef<HTMLDivElement | null>(null);
    const historicalChatScrollRef = useRef<HTMLDivElement | null>(null);

    // Doubt Solver State
    const [doubtSolverChat, setDoubtSolverChat] = useState<Chat | null>(null);
    const [doubtSolverMessages, setDoubtSolverMessages] = useState<ChatMessage[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isSocraticMode, setIsSocraticMode] = useState(false);


    // Voice Tutor State
    const [tutorStatus, setTutorStatus] = useState<TutorStatus>('CONNECTING');
    const [transcript, setTranscript] = useState<TranscriptPart[]>([]);
    const [interimTranscript, setInterimTranscript] = useState<TranscriptPart | null>(null);
    const currentInputRef = useRef('');
    const currentOutputRef = useRef('');
    const liveSessionRef = useRef<any>(null); // Using `any` for the session promise/object
    const audioResourcesRef = useRef<{
        stream: MediaStream | null;
        inputAudioContext: AudioContext | null;
        outputAudioContext: AudioContext | null;
        sources: Set<AudioBufferSourceNode>;
        scriptProcessor: ScriptProcessorNode | null;
    }>({ stream: null, inputAudioContext: null, outputAudioContext: null, sources: new Set(), scriptProcessor: null });

    // New Features State
    const [studyPlan, setStudyPlan] = useState<string | null>(null);
    const [virtualLabSteps, setVirtualLabSteps] = useState<VirtualLabStep[]>([]);
    const [realWorldExamples, setRealWorldExamples] = useState<RealWorldExample[]>([]);
    const [selectedScientist, setSelectedScientist] = useState<HistoricalScientist | null>(null);
    const [historicalChat, setHistoricalChat] = useState<Chat | null>(null);
    const [historicalChatMessages, setHistoricalChatMessages] = useState<ChatMessage[]>([]);
    const [aiStory, setAiStory] = useState('');
    const [scienceFairProjectIdeas, setScienceFairProjectIdeas] = useState<ScienceFairProjectIdea[]>([]);
    const [selectedProjectIdea, setSelectedProjectIdea] = useState<ScienceFairProjectIdea | null>(null);
    const [scienceFairProjectPlan, setScienceFairProjectPlan] = useState<ScienceFairProjectStep[]>([]);
    const [scienceLensImage, setScienceLensImage] = useState<{ data: string; mimeType: string; dataUrl: string; } | null>(null);
    const [scienceLensExplanation, setScienceLensExplanation] = useState('');
    const [whatIfChat, setWhatIfChat] = useState<Chat | null>(null);
    const [whatIfChatMessages, setWhatIfChatMessages] = useState<ChatMessage[]>([]);


    // User Authentication State
    const [showRegister, setShowRegister] = useState(false);
    const [usernameInput, setUsernameInput] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');
    const [editingProfilePic, setEditingProfilePic] = useState<string | null>(null);

    // Gamification & Logging
    const [leaderboard, setLeaderboard] = useLocalStorage<LeaderboardEntry[]>(LEADERBOARD_KEY, []);
    const [newBadges, setNewBadges] = useState<Badge[]>([]);
    const [activityLog, setActivityLog] = useLocalStorage<ActivityLog[]>(ACTIVITY_LOG_KEY, []);
    const [showBadgeModal, setShowBadgeModal] = useState(false);

    // ====================================================================================
    // Effects
    // ====================================================================================

    // Initialize AI Client on startup
    useEffect(() => {
        try {
            initializeAiClient();
        } catch (error) {
            console.error("Failed to initialize AI client:", error);
            setApiError(error instanceof Error ? error.message : "An unknown error occurred during AI initialization.");
        }
    }, []);

    // Initialize default users if none exist
    useEffect(() => {
        if (users.length === 0) {
            setUsers([DEFAULT_ADMIN_USER]);
        }
    }, [users, setUsers]);

    // Save/Load Quiz State
    useEffect(() => {
        if (currentUser && gameState === GameState.QUIZ_IN_PROGRESS) {
            const stateToSave: SavedQuizState = {
                gameState, appMode: 'quiz', grade: grade!, topic: topic!, difficulty: difficulty!,
                timePerQuestion, questions, userAnswers, currentQuestionIndex,
            };
            localStorage.setItem(getSavedQuizKey(currentUser.id), JSON.stringify(stateToSave));
        }
    }, [gameState, currentQuestionIndex, userAnswers, currentUser, appMode, grade, topic, difficulty, timePerQuestion, questions]);

    useEffect(() => {
        if (currentUser) {
            const savedStateJSON = localStorage.getItem(getSavedQuizKey(currentUser.id));
            if (savedStateJSON) {
                const savedState: SavedQuizState = JSON.parse(savedStateJSON);
                if (window.confirm("You have an unfinished quiz. Would you like to resume?")) {
                    setGameState(savedState.gameState);
                    setAppMode(savedState.appMode);
                    setGrade(savedState.grade);
                    setTopic(savedState.topic);
                    setDifficulty(savedState.difficulty);
                    setTimePerQuestion(savedState.timePerQuestion);
                    setQuestions(savedState.questions);
                    setUserAnswers(savedState.userAnswers);
                    setCurrentQuestionIndex(savedState.currentQuestionIndex);
                    if(savedState.timePerQuestion > 0) {
                        setTimeLeft(savedState.timePerQuestion);
                    }
                } else {
                    localStorage.removeItem(getSavedQuizKey(currentUser.id));
                }
            }
        }
    }, [currentUserId]); // Run only when user logs in

    // Auto-scroll effects for chat windows
    useEffect(() => {
        if (doubtSolverScrollRef.current) {
            doubtSolverScrollRef.current.scrollTop = doubtSolverScrollRef.current.scrollHeight;
        }
    }, [doubtSolverMessages]);

    useEffect(() => {
        if (historicalChatScrollRef.current) {
            historicalChatScrollRef.current.scrollTop = historicalChatScrollRef.current.scrollHeight;
        }
    }, [historicalChatMessages]);

    // ====================================================================================
    // Logging and Gamification
    // ====================================================================================
    
    const updateUserStats = useCallback((updateFn: (stats: User['stats']) => User['stats']) => {
        if (!currentUserId) return;
        setUsers(prevUsers =>
            prevUsers.map(user =>
                user.id === currentUserId
                    ? { ...user, stats: updateFn(user.stats) }
                    : user
            )
        );
    }, [currentUserId, setUsers]);

    const handleActivityCompletion = useCallback(() => {
        if (!currentUser) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const lastActivityStr = currentUser.stats.lastActivityDate || '';

        if (todayStr === lastActivityStr) {
            return; // Already active today
        }

        const today = new Date(todayStr);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const newStreak = lastActivityStr === yesterdayStr
            ? (currentUser.stats.currentStreak || 0) + 1
            : 1;

        updateUserStats(stats => ({
            ...stats,
            currentStreak: newStreak,
            lastActivityDate: todayStr,
        }));
    }, [currentUser, updateUserStats]);


    const addLogEntry = useCallback((type: string, details: Record<string, any>) => {
        if (!currentUser) return;
        const newLog: ActivityLog = {
            id: generateUniqueId(),
            userId: currentUser.id,
            username: currentUser.username,
            timestamp: new Date().toISOString(),
            type,
            details,
        };
        setActivityLog(prev => [newLog, ...prev.slice(0, 49)]); // Keep last 50 entries
    }, [currentUser, setActivityLog]);

    const awardBadges = useCallback((score: number, questionCount: number, topic: string) => {
        if (!currentUser) return [];

        const earned: Badge[] = [];
        const currentStats = currentUser.stats;
        
        const updatedStats: User['stats'] = {
            ...currentStats,
            quizzesCompleted: currentStats.quizzesCompleted + 1,
            quizzesAttempted: currentStats.quizzesAttempted + 1,
            topicPerformance: {
                ...currentStats.topicPerformance,
                [topic]: {
                    correct: (currentStats.topicPerformance[topic]?.correct || 0) + score,
                    total: (currentStats.topicPerformance[topic]?.total || 0) + questionCount,
                }
            }
        };

        for (const badgeType in BADGE_DEFINITIONS) {
            const badgeKey = badgeType as keyof typeof BADGE_DEFINITIONS;
            const hasBadge = currentUser.stats.badges.some(b => b.id === badgeKey);
            if (!hasBadge) {
                const def = BADGE_DEFINITIONS[badgeKey];
                if (def.criteria(updatedStats, { score, questionCount, topic })) {
                    const newBadge: Badge = {
                        id: badgeKey,
                        name: def.name,
                        description: def.description,
                        dateEarned: new Date().toISOString(),
                    };
                    earned.push(newBadge);
                }
            }
        }
        
        if(earned.length > 0) {
            setNewBadges(earned);
            setShowBadgeModal(true);
            earned.forEach(badge => addLogEntry('BADGE_EARNED', { badgeName: badge.name }));
        }

        return earned;
    }, [currentUser, addLogEntry]);

    const updateLeaderboard = useCallback((username: string, pointsToAdd: number, profilePictureUrl?: string) => {
        setLeaderboard(prev => {
            const userIndex = prev.findIndex(e => e.username === username);
            let newLeaderboard = [...prev];
            if (userIndex > -1) {
                newLeaderboard[userIndex].score += pointsToAdd;
                if (profilePictureUrl) {
                    newLeaderboard[userIndex].profilePictureUrl = profilePictureUrl;
                }
            } else if (currentUser) {
                newLeaderboard.push({ userId: currentUser.id, username, score: pointsToAdd, profilePictureUrl });
            }
            return newLeaderboard.sort((a, b) => b.score - a.score).slice(0, 20);
        });
    }, [setLeaderboard, currentUser]);


    // ====================================================================================
    // API Call Handlers
    // ====================================================================================

    const withApiErrorHandler = async <T,>(apiCall: () => Promise<T>): Promise<T | null> => {
        try {
            const result = await apiCall();
            setApiError(null);
            return result;
        } catch (error) {
            console.error("API Error:", error);
            const message = error instanceof Error ? error.message : "An unexpected error occurred.";
            if (message.includes('API key not valid')) {
                setApiError("The provided API Key is not valid. Please check the configuration.");
            } else {
                 setApiError(message);
            }
            setIsLoading(false);
            return null;
        }
    };

    const handleGenerateDiagramIdeas = async () => {
        if (!topic || !grade) return;
        setIsLoading(true);
        setLoadingMessage(`Brainstorming diagram ideas for "${topic}"...`);
        const ideas = await withApiErrorHandler(() => generateDiagramIdeas(topic, grade));
        if (ideas) {
            setDiagramIdeas(ideas.map(idea => ({ ...idea, id: generateUniqueId() })));
            setGameState(GameState.DIAGRAM_IDEAS_SELECTION);
        }
        setIsLoading(false);
    };

    const handleGenerateDiagram = async (idea: DiagramIdea) => {
        setIsLoading(true);
        setLoadingMessage(`Generating diagram: "${idea.description}"...`);
        const image = await withApiErrorHandler(() => generateDiagramImage(idea.prompt));
        if (image) {
            setGeneratedDiagram({ ...idea, image });
            setGameState(GameState.DIAGRAM_GENERATOR);
            addLogEntry('DIAGRAM_GENERATED', { description: idea.description });
            handleActivityCompletion();
        }
        setIsLoading(false);
    };

    const handleGenerateQuiz = async (selectedDifficulty: Difficulty, selectedCount: number, selectedTime: number, mode: AppMode) => {
        if (!topic || !grade) return;
        setIsLoading(true);
        setLoadingMessage(`Generating ${selectedDifficulty} ${mode}...`);
        const questionsResult = await withApiErrorHandler(() => generateQuizQuestions(topic, grade, selectedDifficulty, selectedCount, mode));
        if (questionsResult) {
            setQuestions(questionsResult);
            setUserAnswers(new Array(questionsResult.length).fill(null));
            setCurrentQuestionIndex(0);
            setScore(0);
            
            if (mode === 'quiz') {
                setDifficulty(selectedDifficulty);
                setQuestionCount(selectedCount);
                setTimePerQuestion(selectedTime);
                if (selectedTime > 0) {
                    setTimeLeft(selectedTime);
                }
                setGameState(GameState.QUIZ_IN_PROGRESS);
                addLogEntry('QUIZ_STARTED', { topic, grade, difficulty: selectedDifficulty });
                updateUserStats(stats => ({...stats, quizzesAttempted: stats.quizzesAttempted + 1 }));

            } else { // worksheet
                setGameState(GameState.WORKSHEET_DISPLAY);
                addLogEntry('WORKSHEET_GENERATED', { topic, grade, difficulty: selectedDifficulty });
                handleActivityCompletion();
            }
        }
        setIsLoading(false);
    };

    const handleGenerateNotes = async () => {
        if (!topic || !grade) return;
        setIsLoading(true);
        setLoadingMessage(`Generating study notes for "${topic}"...`);
        const notesResult = await withApiErrorHandler(() => generateNotes(topic, grade));
        if (notesResult) {
            setNotes(notesResult);
            setGameState(GameState.NOTES_DISPLAY);
            addLogEntry('NOTES_GENERATED', { topic, grade });
            handleActivityCompletion();
        }
        setIsLoading(false);
    };

    const handleGenerateDeepDive = async () => {
        if (!topic || !grade) return;
        setIsLoading(true);
        setLoadingMessage(`Diving deep into "${topic}"...`);
        const explanation = await withApiErrorHandler(() => generateConceptExplanation(topic, grade));
        if (explanation) {
            setConceptExplanation(explanation);
            setGameState(GameState.CONCEPT_DEEP_DIVE);
            addLogEntry('DEEP_DIVE_REQUESTED', { topic, grade });
            handleActivityCompletion();
        }
        setIsLoading(false);
    };

    // ====================================================================================
    // State Transitions & App Logic
    // ====================================================================================
    
    const resetSelections = useCallback(() => {
        setGrade(null);
        setTopic(null);
        setAppMode(null);
        setDifficulty(null);
        setQuestionCount(10);
        setTimePerQuestion(30);
        setQuestions([]);
        setNotes([]);
        setConceptExplanation('');
        setDiagramIdeas([]);
        setGeneratedDiagram(null);
        setDoubtSolverMessages([]);
        setDoubtSolverChat(null);
        setIsSocraticMode(false);
        setVirtualLabSteps([]);
        setRealWorldExamples([]);
        setSelectedScientist(null);
        setHistoricalChat(null);
        setHistoricalChatMessages([]);
        setAiStory('');
        setInputPrompt('');
        setScienceFairProjectIdeas([]);
        setSelectedProjectIdea(null);
        setScienceFairProjectPlan([]);
        setScienceLensImage(null);
        setScienceLensExplanation('');
        setWhatIfChat(null);
        setWhatIfChatMessages([]);
        setChatInput('');
    }, []);

    const goToHome = useCallback(() => {
        resetSelections();
        setGameState(GameState.HOME_SCREEN);
    }, [resetSelections]);

    const selectGrade = (selectedGrade: Grade) => {
        setGrade(selectedGrade);
        setGameState(GameState.TOPIC_SELECTION);
    };

    const startAppMode = (mode: AppMode) => {
        setAppMode(mode);
        switch (mode) {
            case 'profile':
                if(currentUser?.stats && currentUser.stats.quizzesCompleted > 0) {
                    generateAndSetStudyPlan();
                }
                setGameState(GameState.USER_PROFILE);
                break;
            case 'admin':
                setGameState(GameState.ADMIN_PANEL);
                break;
            case 'leaderboard':
                setGameState(GameState.LEADERBOARD);
                break;
            case 'virtual_lab':
                setGameState(GameState.VIRTUAL_LAB_INPUT);
                break;
             case 'historical_chat':
                setGameState(GameState.HISTORICAL_CHAT_SELECTION);
                break;
            case 'ai_story_weaver':
                setGameState(GameState.AI_STORY_WEAVER_INPUT);
                break;
            case 'science_fair_buddy':
                setGameState(GameState.SCIENCE_FAIR_BUDDY_INPUT);
                break;
            case 'science_lens':
                setGameState(GameState.SCIENCE_LENS_INPUT);
                break;
            case 'what_if_scenario':
                setGameState(GameState.WHAT_IF_SCENARIO_INPUT);
                break;
            default:
                setGameState(GameState.GRADE_SELECTION);
                break;
        }
    };
    
    const handleAnswer = useCallback((answer: string | null) => {
        const newAnswers = [...userAnswers];
        newAnswers[currentQuestionIndex] = answer;
        setUserAnswers(newAnswers);

        setTimeout(() => {
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                if (timePerQuestion > 0) {
                    setTimeLeft(timePerQuestion);
                }
            } else {
                let finalScore = 0;
                newAnswers.forEach((ans, index) => {
                    if (ans === questions[index].answer) {
                        finalScore++;
                    }
                });
                setScore(finalScore);
                setGameState(GameState.QUIZ_SCORE);

                if (currentUser && topic) {
                    const earnedBadges = awardBadges(finalScore, questions.length, topic);
                    updateUserStats(stats => {
                        const topicPerf = stats.topicPerformance[topic] || { correct: 0, total: 0 };
                        return {
                            ...stats,
                            quizzesCompleted: stats.quizzesCompleted + 1,
                            totalScorePoints: stats.totalScorePoints + finalScore,
                            totalQuestionsAnswered: stats.totalQuestionsAnswered + questions.length,
                            topicPerformance: {
                                ...stats.topicPerformance,
                                [topic]: {
                                    correct: topicPerf.correct + finalScore,
                                    total: topicPerf.total + questions.length,
                                }
                            },
                            badges: [...stats.badges, ...earnedBadges],
                        };
                    });
                    updateLeaderboard(currentUser.username, finalScore, currentUser.profilePictureUrl);
                    addLogEntry('QUIZ_COMPLETED', { topic, score: finalScore, questionCount: questions.length });
                    handleActivityCompletion();
                    localStorage.removeItem(getSavedQuizKey(currentUser.id));
                }
            }
        }, 500);
    }, [userAnswers, currentQuestionIndex, questions, timePerQuestion, currentUser, topic, awardBadges, updateUserStats, updateLeaderboard, addLogEntry, handleActivityCompletion]);

    // Quiz Timer Effect
    useEffect(() => {
        if (gameState !== GameState.QUIZ_IN_PROGRESS || timePerQuestion === 0) {
            return;
        }
        if (timeLeft <= 0) {
            handleAnswer(null); 
            return;
        }
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [gameState, timeLeft, timePerQuestion, handleAnswer]);


    const selectTopic = (selectedTopic: string) => {
        setTopic(selectedTopic);
        switch (appMode) {
            case 'diagram': handleGenerateDiagramIdeas(); break;
            case 'doubt_solver': setGameState(GameState.LANGUAGE_SELECTION); break;
            case 'quiz': setGameState(GameState.QUIZ_DIFFICULTY_SELECTION); break;
            case 'worksheet': setGameState(GameState.WORKSHEET_DIFFICULTY_SELECTION); break;
            case 'notes': handleGenerateNotes(); break;
            case 'deep_dive': handleGenerateDeepDive(); break;
            case 'voice_tutor': setGameState(GameState.LANGUAGE_SELECTION); break;
            case 'real_world_connections': handleGenerateRealWorldExamples(); break;
            default: goToHome();
        }
    };
    
    const startDoubtSolver = (lang: Language) => {
        if (!topic || !grade) return;
        setLanguage(lang);
        setIsLoading(true);
        setLoadingMessage('Initializing Doubt Solver...');

        let systemInstruction = `You are a friendly and patient AI Tutor called 'Curio'. Your user is a Grade ${grade} student in India studying the chapter "${topic}". Your primary goal is to help them understand concepts and solve their doubts. Follow these rules strictly:\n1. Keep your explanations simple, clear, and directly related to the student's question and the chapter topic.\n2. Do not answer questions outside the scope of this topic.\n3. If the student asks an unrelated question, gently guide them back to the topic.\n4. Encourage the student and praise them for asking good questions.\n5. Use analogies and simple examples relevant to an Indian context.\n6. IMPORTANT: Your responses must be broken down into short, concise messages to feel like a real-time conversation. Never send a single long paragraph. Keep each message to 1-3 sentences maximum.`;

        if (isSocraticMode) {
            systemInstruction = `You are a Socratic tutor called 'Curio'. Your user is a Grade ${grade} student studying "${topic}". Your goal is to guide the student to their own answers, not to provide them directly. You must follow these rules strictly:\n1. **Never give a direct answer or explanation.**\n2. Always respond to the student's questions with another thoughtful, guiding question that helps them think critically and arrive at the solution themselves.\n3. For example, if they ask 'Why is the sky blue?', you must ask something like 'That's an excellent question. What do you think our atmosphere is made of?' or 'What happens to light when it passes through different substances?'.\n4. Keep your guiding questions simple and related to the topic.\n5. Gently steer them back to the topic if they go off-track.\n6. Your responses must be short (1-2 sentences).`;
        }

        if (lang !== 'English' && !isSocraticMode) {
            const secondLang = lang.split('+')[1];
            systemInstruction += `\n7. You must reply in a mix of English and ${secondLang} (Hinglish/Tanglish etc.). The user will type in English, but your response should be conversational and bilingual, like how a real teacher in India might speak. For example, instead of "That's a great question!", you might say "That's a great question! Chalo, let's break it down."`
        }
        
        try {
            // FIX: Moved safetySettings into the config object.
            const chat = getAiClient().chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction, safetySettings } });
            setDoubtSolverChat(chat);
            const welcomeMessage = isSocraticMode
                ? `Hello! I'm Curio. I'm here to help you explore "${topic}" by asking questions. What's on your mind?`
                : `Hello! I'm Curio, your AI Tutor for "${topic}". What would you like to ask?`;
            setDoubtSolverMessages([{ role: 'model', text: welcomeMessage }]);
            setGameState(GameState.DOUBT_SOLVER);
            addLogEntry('DOUBT_SOLVER_STARTED', { topic, grade, mode: isSocraticMode ? 'Socratic' : 'Standard' });
            handleActivityCompletion();
        } catch(e) {
            setApiError(e instanceof Error ? e.message : 'Failed to start chat.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const sendDoubtSolverMessage = async (text: string) => {
        if (!doubtSolverChat || isThinking || !text.trim()) return;
        setIsThinking(true);
        setDoubtSolverMessages(prev => [...prev, { role: 'user', text }]);
        
        try {
            const response = await doubtSolverChat.sendMessage({ message: text });
            setDoubtSolverMessages(prev => [...prev, { role: 'model', text: response.text }]);
        } catch (error) {
            console.error("Doubt Solver Error:", error);
            setDoubtSolverMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try asking again." }]);
        } finally {
            setIsThinking(false);
        }
    };
    
    // ====================================================================================
    // New Feature Handlers
    // ====================================================================================

    const generateAndSetStudyPlan = async () => {
      if (!currentUser) return;
      const plan = await withApiErrorHandler(() => generateStudyPlan(currentUser.stats));
      if (plan) {
        setStudyPlan(plan);
      }
    };

    const handleGenerateVirtualLab = async () => {
        if (!inputPrompt) return;
        setIsLoading(true);
        setLoadingMessage(`Setting up your virtual experiment for: "${inputPrompt}"...`);
        addLogEntry('VIRTUAL_LAB_STARTED', { prompt: inputPrompt });
        handleActivityCompletion();
        const steps = await withApiErrorHandler(() => generateVirtualLabSteps(inputPrompt));
        if (steps) {
            const stepsWithImages: VirtualLabStep[] = [];
            for (let i = 0; i < steps.length; i++) {
                setLoadingMessage(`Generating visual for step ${i+1}/${steps.length}...`);
                const image = await withApiErrorHandler(() => generateDiagramImage(steps[i].imagePrompt));
                stepsWithImages.push({ ...steps[i], image: image || undefined });
            }
            setVirtualLabSteps(stepsWithImages);
            setGameState(GameState.VIRTUAL_LAB_DISPLAY);
        }
        setIsLoading(false);
    };

    const handleGenerateRealWorldExamples = async () => {
        if (!topic) return;
        setIsLoading(true);
        setLoadingMessage(`Finding real-world connections for "${topic}"...`);
        addLogEntry('REAL_WORLD_EXAMPLE_GENERATED', { topic });
        handleActivityCompletion();
        const examples = await withApiErrorHandler(() => generateRealWorldExamples(topic));
        if (examples) {
             const examplesWithImages: RealWorldExample[] = [];
            for (let i = 0; i < examples.length; i++) {
                setLoadingMessage(`Generating visual for example ${i+1}/${examples.length}...`);
                const image = await withApiErrorHandler(() => generateDiagramImage(examples[i].imagePrompt));
                examplesWithImages.push({ ...examples[i], image: image || undefined });
            }
            setRealWorldExamples(examplesWithImages);
            setGameState(GameState.REAL_WORLD_CONNECTIONS_DISPLAY);
        }
        setIsLoading(false);
    };

    const startHistoricalChat = (scientist: HistoricalScientist) => {
        setIsLoading(true);
        setLoadingMessage(`Connecting with ${scientist.name}...`);
        try {
            const systemInstruction = `${scientist.systemInstruction}\nIMPORTANT: Keep your responses short and conversational, broken into 1-2 sentences at a time to simulate a real chat.`;
            // FIX: Moved safetySettings into the config object.
            const chat = getAiClient().chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction, safetySettings } });
            setHistoricalChat(chat);
            setSelectedScientist(scientist);
            setHistoricalChatMessages([{ role: 'model', text: `Greetings. I am ${scientist.name}. What great mysteries of the universe shall we ponder today?` }]);
            setGameState(GameState.HISTORICAL_CHAT_SESSION);
            addLogEntry('HISTORICAL_CHAT_STARTED', { scientistName: scientist.name });
            handleActivityCompletion();
        } catch(e) {
            setApiError(e instanceof Error ? e.message : 'Failed to start historical chat.');
        } finally {
            setIsLoading(false);
        }
    };

    const sendHistoricalChatMessage = async (text: string) => {
        if (!historicalChat || isThinking || !text.trim()) return;
        setIsThinking(true);
        setHistoricalChatMessages(prev => [...prev, { role: 'user', text }]);
        
        try {
            const response = await historicalChat.sendMessage({ message: text });
            setHistoricalChatMessages(prev => [...prev, { role: 'model', text: response.text }]);
        } catch (error) {
            console.error("Historical Chat Error:", error);
            setHistoricalChatMessages(prev => [...prev, { role: 'model', text: "I seem to be lost in thought... perhaps you could rephrase your question?" }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleGenerateAIStory = async () => {
        if(!inputPrompt) return;
        setIsLoading(true);
        setLoadingMessage(`Weaving a scientific tale about "${inputPrompt}"...`);
        addLogEntry('AI_STORY_WEAVER_USED', { prompt: inputPrompt });
        handleActivityCompletion();
        const story = await withApiErrorHandler(() => generateAIStory(inputPrompt));
        if(story) {
            setAiStory(story);
            setGameState(GameState.AI_STORY_WEAVER_DISPLAY);
        }
        setIsLoading(false);
    };

    const handleGenerateScienceFairIdeas = async () => {
        if (!inputPrompt) return;
        setIsLoading(true);
        setLoadingMessage('Brainstorming project ideas based on your interests...');
        addLogEntry('SCIENCE_FAIR_BUDDY_STARTED', { interests: inputPrompt });
        handleActivityCompletion();
        const ideas = await withApiErrorHandler(() => generateScienceFairProjectIdeas(inputPrompt));
        if (ideas) {
            setScienceFairProjectIdeas(ideas.map(idea => ({ ...idea, id: generateUniqueId() })));
            setGameState(GameState.SCIENCE_FAIR_BUDDY_IDEAS);
        }
        setIsLoading(false);
    };

    const handleGenerateScienceFairPlan = async (idea: ScienceFairProjectIdea) => {
        if (!inputPrompt) return; 
        setIsLoading(true);
        setLoadingMessage(`Creating a project plan for "${idea.title}"...`);
        setSelectedProjectIdea(idea);
        const steps = await withApiErrorHandler(() => generateScienceFairProjectPlan(idea.title, inputPrompt));
        if (steps) {
            const stepsWithImages: ScienceFairProjectStep[] = [];
            for (let i = 0; i < steps.length; i++) {
                setLoadingMessage(`Generating visual for step ${i + 1}/${steps.length}...`);
                const image = await withApiErrorHandler(() => generateDiagramImage(steps[i].imagePrompt));
                stepsWithImages.push({ ...steps[i], image: image || undefined });
            }
            setScienceFairProjectPlan(stepsWithImages);
            setGameState(GameState.SCIENCE_FAIR_BUDDY_PLAN);
        }
        setIsLoading(false);
    };

    const handleExplainImage = async () => {
        if (!scienceLensImage || !inputPrompt) return;
        setIsLoading(true);
        setLoadingMessage('Analyzing your image with the Science Lens...');
        addLogEntry('SCIENCE_LENS_USED', { prompt: inputPrompt });
        handleActivityCompletion();
        const explanation = await withApiErrorHandler(() =>
            explainImageWithPrompt(scienceLensImage.data, scienceLensImage.mimeType, inputPrompt)
        );
        if (explanation) {
            setScienceLensExplanation(explanation);
            setGameState(GameState.SCIENCE_LENS_DISPLAY);
        }
        setIsLoading(false);
    };

    const startWhatIfScenario = async () => {
        if (!inputPrompt) return;
        
        setGameState(GameState.WHAT_IF_SCENARIO_SESSION);
        setIsThinking(true);

        const systemInstruction = "You are an imaginative and brilliant scientist who loves exploring hypothetical 'What If?' scenarios. Your goal is to provide creative, engaging, and scientifically grounded explanations for the user's questions. While you should be creative, your answers must adhere to the fundamental laws of physics, chemistry, and biology. Explain the likely consequences in a clear, step-by-step manner. Use markdown for formatting.";

        try {
            // FIX: Moved safetySettings into the config object.
            const chat = getAiClient().chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction, safetySettings } });
            setWhatIfChat(chat);

            const initialUserMessage = `Let's explore this: ${inputPrompt}`;
            setWhatIfChatMessages([{ role: 'user', text: initialUserMessage }]);

            const response = await chat.sendMessage({ message: initialUserMessage });
            setWhatIfChatMessages(prev => [...prev, { role: 'model', text: response.text }]);

            addLogEntry('WHAT_IF_SCENARIO_STARTED', { prompt: inputPrompt });
            handleActivityCompletion();
        } catch(e) {
            setApiError(e instanceof Error ? e.message : 'Failed to start scenario chat.');
            goToHome();
        } finally {
            setIsThinking(false);
        }
    };

    const sendWhatIfMessage = async (text: string) => {
        if (!whatIfChat || isThinking || !text.trim()) return;
        setIsThinking(true);
        setWhatIfChatMessages(prev => [...prev, { role: 'user', text }]);
        
        try {
            const response = await whatIfChat.sendMessage({ message: text });
            setWhatIfChatMessages(prev => [...prev, { role: 'model', text: response.text }]);
        } catch (error) {
            console.error("'What If' Chat Error:", error);
            setWhatIfChatMessages(prev => [...prev, { role: 'model', text: "My imagination seems to have hit a snag. Could you rephrase that?" }]);
        } finally {
            setIsThinking(false);
        }
    };


    // ====================================================================================
    // Voice & Speech Recognition Logic
    // ====================================================================================
    
    const handleMicClick = useCallback(() => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setApiError("Speech recognition is not supported by your browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.interimResults = true;
        recognition.lang = 'en-IN'; // Default to Indian English

        let finalTranscript = '';

        recognition.onstart = () => {
            setIsListening(true);
            setChatInput(''); // Clear input on start
        };
        
        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            finalTranscript = ''; // Reset final transcript to avoid appending old results
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setChatInput(finalTranscript + interimTranscript);
        };
        
        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };
        
        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event);
            setApiError(`Speech recognition error: ${event.error}`);
            setIsListening(false);
        };
        
        recognition.start();

    }, [isListening, language]);

    const stopVoiceTutor = useCallback(() => {
        const resources = audioResourcesRef.current;
        if (liveSessionRef.current) {
            liveSessionRef.current.then((session: any) => session.close());
            liveSessionRef.current = null;
        }
        if (resources.stream) {
            resources.stream.getTracks().forEach(track => track.stop());
            resources.stream = null;
        }
        if (resources.scriptProcessor) {
            resources.scriptProcessor.disconnect();
            resources.scriptProcessor = null;
        }
        if (resources.inputAudioContext && resources.inputAudioContext.state !== 'closed') {
            resources.inputAudioContext.close();
            resources.inputAudioContext = null;
        }
        if (resources.outputAudioContext && resources.outputAudioContext.state !== 'closed') {
            resources.outputAudioContext.close();
            resources.outputAudioContext = null;
        }
        resources.sources.forEach(source => source.stop());
        resources.sources.clear();

        setTutorStatus('CONNECTING');
        setTranscript([]);
        setInterimTranscript(null);
        currentInputRef.current = '';
        currentOutputRef.current = '';
        goToHome();
    }, [goToHome]);

    const startVoiceTutor = useCallback(async (lang: Language) => {
        if (!topic || !grade) return;
        addLogEntry('VOICE_TUTOR_STARTED', { topic, grade, language: lang });
        handleActivityCompletion();
        setGameState(GameState.VOICE_TUTOR_SESSION);
        setTutorStatus('CONNECTING');
        setTranscript([]);
        setInterimTranscript(null);
        currentInputRef.current = '';
        currentOutputRef.current = '';

        let systemInstruction = `You are a friendly and encouraging AI voice tutor for a Grade ${grade} student studying the chapter "${topic}". Your goal is to be conversational and respond QUICKLY. Keep responses short (1-3 sentences). After explaining something, ask a simple question to check understanding. Be positive. If the student struggles, offer to simplify or give an analogy to build their confidence.`;
    
        if (lang !== 'English') {
            const secondLang = lang.split('+')[1];
            systemInstruction = `Your most important and non-negotiable rule is to speak in a conversational mix of English and ${secondLang} (e.g., Hinglish, Tanglish). You MUST NOT speak only in English. Every response you give must blend both languages naturally, like a teacher in India would. This is your primary function. For example: 'Bilkul sahi! That's exactly right. Now, what do you think happens next?' OR 'Don't worry, chalo let's try another way.'\n\n` + systemInstruction;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioResourcesRef.current.stream = stream;

            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioResourcesRef.current.inputAudioContext = inputAudioContext;
            audioResourcesRef.current.outputAudioContext = outputAudioContext;

            let nextStartTime = 0;
            const sources = audioResourcesRef.current.sources;

            const sessionPromise = getAiClient().live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setTutorStatus('LISTENING');
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        audioResourcesRef.current.scriptProcessor = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            setTutorStatus('LISTENING');
                            const text = message.serverContent.inputTranscription.text;
                            currentInputRef.current += text;
                            setInterimTranscript({ speaker: 'user', text: currentInputRef.current });
                        }
                        
                        if (message.serverContent?.outputTranscription) {
                            if (tutorStatus !== 'SPEAKING') setTutorStatus('THINKING');
                            const text = message.serverContent.outputTranscription.text;
                            currentOutputRef.current += text;
                            setInterimTranscript({ speaker: 'model', text: currentOutputRef.current });
                        }

                        const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64EncodedAudioString) {
                            setTutorStatus('SPEAKING');
                            nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), outputAudioContext, 24000, 1);
                            const sourceNode = outputAudioContext.createBufferSource();
                            sourceNode.buffer = audioBuffer;
                            sourceNode.connect(outputAudioContext.destination);
                            sourceNode.addEventListener('ended', () => {
                                sources.delete(sourceNode);
                                if (sources.size === 0) {
                                    setTutorStatus('LISTENING');
                                }
                            });
                            sourceNode.start(nextStartTime);
                            nextStartTime += audioBuffer.duration;
                            sources.add(sourceNode);
                        }
                        
                        if (message.serverContent?.turnComplete) {
                            const userText = currentInputRef.current.trim();
                            const modelText = currentOutputRef.current.trim();

                            setTranscript(prev => {
                                const newTranscript = [...prev];
                                if (userText) newTranscript.push({ speaker: 'user', text: userText });
                                if (modelText) newTranscript.push({ speaker: 'model', text: modelText });
                                return newTranscript;
                            });

                            currentInputRef.current = '';
                            currentOutputRef.current = '';
                            setInterimTranscript(null);
                        }
                        
                        if (message.serverContent?.interrupted) {
                           for (const source of sources.values()) {
                                source.stop();
                                sources.delete(source);
                            }
                            nextStartTime = 0;
                            currentOutputRef.current = '';
                            setInterimTranscript(null);
                            setTutorStatus('LISTENING');
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Voice Tutor Error:', e);
                        setApiError(`Voice Tutor connection error: ${e.message}`);
                        stopVoiceTutor();
                        goToHome();
                    },
                    onclose: (e: CloseEvent) => {
                       console.log('Voice Tutor session closed.');
                       stopVoiceTutor();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: systemInstruction,
                },
            });
            liveSessionRef.current = sessionPromise;
        } catch (error) {
            console.error('Failed to start voice tutor:', error);
            setApiError(error instanceof Error && error.name === 'NotAllowedError' ? 'Microphone access was denied. Please allow microphone access in your browser settings to use the Voice Tutor.' : 'Failed to access microphone.');
            setGameState(GameState.HOME_SCREEN);
        }
    }, [grade, topic, stopVoiceTutor, addLogEntry, handleActivityCompletion, goToHome]);

    useEffect(() => {
        return () => {
            if (gameState !== GameState.VOICE_TUTOR_SESSION && liveSessionRef.current) {
                stopVoiceTutor();
            }
        };
    }, [gameState, stopVoiceTutor]);

    // ====================================================================================
    // User Authentication
    // ====================================================================================

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');
        const user = users.find(u => u.username === usernameInput && u.password === passwordInput);
        if (user) {
            setCurrentUserId(user.id);
            setGameState(GameState.HOME_SCREEN);
            setUsernameInput('');
            setPasswordInput('');
            addLogEntry('USER_LOGIN', {});
        } else {
            setAuthError('Invalid username or password.');
        }
    };

    const handleRegister = (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');
        if (users.some(u => u.username === usernameInput)) {
            setAuthError('Username already exists.');
            return;
        }
        if (!usernameInput || !passwordInput) {
            setAuthError('Username and password cannot be empty.');
            return;
        }
        const newUser: User = {
            id: generateUniqueId(),
            username: usernameInput,
            password: passwordInput,
            isAdmin: false,
            stats: {
                quizzesCompleted: 0,
                quizzesAttempted: 0,
                topicsMastered: [],
                totalScorePoints: 0,
                totalQuestionsAnswered: 0,
                timeSpentLearningInSeconds: 0,
                topicPerformance: {},
                badges: [],
                currentStreak: 0,
                lastActivityDate: '',
            },
        };
        setUsers([...users, newUser]);
        setCurrentUserId(newUser.id);
        setGameState(GameState.HOME_SCREEN);
        setUsernameInput('');
        setPasswordInput('');
        addLogEntry('USER_REGISTERED', {});
    };

    const handleLogout = () => {
        addLogEntry('USER_LOGOUT', {});
        setCurrentUserId(null);
        setGameState(GameState.LOGIN_SCREEN);
        resetSelections();
    };

    const handleProfilePicUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (typeof e.target?.result === 'string') {
                    setEditingProfilePic(e.target.result);
                    setGameState(GameState.EDIT_PROFILE_PICTURE);
                }
            };
            reader.readAsDataURL(event.target.files[0]);
        }
    };
    
    const handleSaveProfilePic = (dataUrl: string) => {
        if (!currentUserId || !currentUser) return;
        setUsers(prevUsers =>
            prevUsers.map(user =>
                user.id === currentUserId ? { ...user, profilePictureUrl: dataUrl } : user
            )
        );
        updateLeaderboard(currentUser.username, 0, dataUrl);
        setEditingProfilePic(null);
        setGameState(GameState.USER_PROFILE);
    };

    const handleScienceLensImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                const [header, base64Data] = dataUrl.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || file.type;
                setScienceLensImage({ data: base64Data, mimeType, dataUrl });
            };
            reader.readAsDataURL(file);
        }
    };


    // ====================================================================================
    // RENDER LOGIC
    // ====================================================================================

    if (apiError) return <ApiErrorDisplay message={apiError} onDismiss={() => setApiError(null)} />;
    if (isLoading) return <FullScreenLoader message={loadingMessage} />;

    // FIX: Simplified condition to just check for currentUser. 
    // This fixes the type error and a bug where logged-in users saw the login screen on refresh.
    if (!currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
                <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
                    <div className="text-center mb-8">
                        <HomeScreenAtomIcon/>
                        <h1 className="text-4xl font-bold text-slate-200 mt-2">The Book of Curiosity</h1>
                        <p className="text-slate-400 mt-2">{showRegister ? 'Create a new account' : 'Welcome back, curious mind!'}</p>
                    </div>

                    <form onSubmit={showRegister ? handleRegister : handleLogin}>
                        <div className="mb-4">
                            <label className="block text-slate-400 text-sm font-bold mb-2" htmlFor="username">Username</label>
                            <input
                                id="username"
                                type="text"
                                value={usernameInput}
                                onChange={e => setUsernameInput(e.target.value)}
                                className="w-full px-3 py-2 text-slate-200 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="e.g., MarieCurieFan"
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-slate-400 text-sm font-bold mb-2" htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={passwordInput}
                                onChange={e => setPasswordInput(e.target.value)}
                                className="w-full px-3 py-2 text-slate-200 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="******************"
                            />
                        </div>
                        {authError && <p className="text-red-400 text-center mb-4">{authError}</p>}
                        <div className="flex items-center justify-between">
                            <ActionButton type="submit">{showRegister ? 'Register' : 'Login'}</ActionButton>
                            <button type="button" onClick={() => { setShowRegister(!showRegister); setAuthError(''); }} className="inline-block align-baseline font-bold text-sm text-cyan-400 hover:text-cyan-300">
                                {showRegister ? 'Already have an account?' : 'Create an account'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        const commonProps = { grade, topic };
        const mainContainerClasses = "container mx-auto max-w-5xl p-4 pt-24 md:pt-28";
        
        switch (gameState) {
            case GameState.HOME_SCREEN:
                const features = [
                    { title: 'Interactive Quiz', description: 'Test your knowledge with an endless supply of AI-generated questions.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, onClick: () => startAppMode('quiz') },
                    { title: 'AI Doubt Solver', description: 'Stuck on a concept? Ask our AI tutor for a simple explanation.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>, onClick: () => startAppMode('doubt_solver') },
                    { title: 'AI Voice Tutor', description: 'Practice concepts by having a spoken conversation with an AI tutor.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>, onClick: () => startAppMode('voice_tutor') },
                    { title: 'Diagram Generator', description: 'Visualize complex topics with custom AI-generated diagrams.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>, onClick: () => startAppMode('diagram') },
                    { title: 'Science Lens', description: 'Upload an image and ask the AI to explain the science behind it.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, onClick: () => startAppMode('science_lens') },
                    { title: 'Printable Worksheet', description: 'Generate practice worksheets to solve offline.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>, onClick: () => startAppMode('worksheet') },
                    { title: 'Quick Study Notes', description: 'Get concise, easy-to-read notes on any chapter.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>, onClick: () => startAppMode('notes') },
                    { title: 'Concept Deep Dive', description: 'Go beyond the textbook with in-depth explanations.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>, onClick: () => startAppMode('deep_dive') },
                    { title: 'Virtual Lab', description: 'Simulate experiments with step-by-step visual guidance.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547a2 2 0 00-.547 1.806l.477 2.387a6 6 0 00.517 3.86l.158.318a6 6 0 00.517 3.86l2.387.477a2 2 0 001.806-.547a2 2 0 00.547-1.806l-.477-2.387a6 6 0 00-.517-3.86l-.158-.318a6 6 0 01-.517-3.86l-2.387-.477a2 2 0 01-.547-1.806l.477-2.387a6 6 0 013.86-.517l.318.158a6 6 0 003.86-.517l2.387-.477a2 2 0 011.806.547a2 2 0 01.547 1.806l-.477 2.387a6 6 0 01-3.86.517l-.318.158a6 6 0 00-3.86.517l-2.387.477a2 2 0 00-1.806.547a2 2 0 00-.547 1.806l.477 2.387a6 6 0 00.517 3.86l.158.318a6 6 0 00.517 3.86l2.387.477a2 2 0 001.806-.547a2 2 0 00.547-1.806l-.477-2.387a6 6 0 00-.517-3.86l-.158-.318a6 6 0 01-.517-3.86l-2.387-.477a2 2 0 01-.547-1.806z" /></svg>, onClick: () => startAppMode('virtual_lab') },
                    { title: 'Real World Links', description: 'See how science applies to everyday life around you.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2h10a2 2 0 002-2v-1a2 2 0 012-2h1.945M7.757 14.757l.707-.707M16.243 14.757l-.707-.707M12 20.05V17.5M12 3.95v-2.5" /></svg>, onClick: () => startAppMode('real_world_connections') },
                    { title: 'Chat with History', description: 'Talk to simulations of science\'s greatest minds.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>, onClick: () => startAppMode('historical_chat') },
                    { title: 'AI Story Weaver', description: 'Turn any science concept into a fun, educational story.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>, onClick: () => startAppMode('ai_story_weaver') },
                    { title: 'Science Fair Buddy', description: 'Brainstorm project ideas and plan your experiment.', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>, onClick: () => startAppMode('science_fair_buddy') },
                    { title: "'What If?' Scenarios", description: "Explore wild hypothetical questions with creative, scientific answers.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 12l2.846.813a4.5 4.5 0 003.09 3.09L24 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L18.25 12zM12 2.25l-.813 2.846a4.5 4.5 0 00-3.09 3.09L5.25 9l2.846.813a4.5 4.5 0 003.09 3.09L12 15.75l.813-2.846a4.5 4.5 0 003.09-3.09L18.75 9l-2.846-.813a4.5 4.5 0 00-3.09-3.09L12 2.25z" /></svg>, onClick: () => startAppMode('what_if_scenario') },
                ];
                 const navFeatures = [
                    { title: 'Profile', onClick: () => startAppMode('profile'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
                    { title: 'Leaderboard', onClick: () => startAppMode('leaderboard'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
                ];
                if (currentUser.isAdmin) {
                    navFeatures.push({ title: 'Admin', onClick: () => startAppMode('admin'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> });
                }

                return (
                    <div className="min-h-screen p-4 pt-20">
                        <div className="text-center mb-12">
                            <div className="flex justify-center items-center gap-4">
                               <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300">Welcome, {currentUser.username}!</h1>
                               {currentUser.stats.currentStreak > 1 && (
                                   <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm border border-slate-700 px-3 py-1 rounded-full animate-fade-in shadow-md">
                                        <span className="text-xl" role="img" aria-label="Fire emoji">🔥</span>
                                        <span className="font-bold text-lg text-orange-400">{currentUser.stats.currentStreak}</span>
                                        <span className="text-xs text-slate-400 font-medium hidden sm:inline">Day Streak</span>
                                    </div>
                               )}
                            </div>
                           <p className="text-slate-400 mt-2 text-lg">What would you like to explore today?</p>
                           <div className="flex justify-center gap-4 mt-6">
                                {navFeatures.map(f => (
                                    <button key={f.title} onClick={f.onClick} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                                        {f.icon}
                                        <span className="font-semibold">{f.title}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {features.map((feature, index) => <FeatureCard key={index} {...feature} />)}
                        </div>
                    </div>
                );

            case GameState.GRADE_SELECTION:
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Select Your Grade" subtitle={`You've chosen: ${appMode?.replace('_', ' ')}`} streak={currentUser.stats.currentStreak} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                            {(Object.keys(CHAPTERS_BY_GRADE) as unknown as Grade[]).map(g => (
                                <SelectionButton key={g} onClick={() => selectGrade(g)}>
                                    <span className="text-lg font-bold">Grade {g}</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );
            
            case GameState.TOPIC_SELECTION:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Select a Chapter" grade={grade} streak={currentUser.stats.currentStreak} />
                        <div className="space-y-3 max-w-2xl mx-auto">
                            {grade && CHAPTERS_BY_GRADE[grade].map(t => (
                                <SelectionButton key={t} onClick={() => selectTopic(t)}>
                                    <span className="text-lg">{t}</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );

            case GameState.LANGUAGE_SELECTION:
                 const languages: Language[] = ['English', 'English+Hindi', 'English+Tamil', 'English+Telugu', 'English+Kannada', 'English+Malayalam'];
                 const onSelect = appMode === 'voice_tutor' ? startVoiceTutor : startDoubtSolver;
                 return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Select Conversation Language" subtitle={appMode === 'doubt_solver' ? 'This is for the AI Tutor\'s responses' : ''} {...commonProps} streak={currentUser.stats.currentStreak} />
                        {appMode === 'doubt_solver' && (
                            <div className="flex items-center justify-center mb-6 max-w-md mx-auto p-4 bg-slate-800 rounded-lg border border-slate-700">
                                <label htmlFor="socratic-toggle" className="flex items-center cursor-pointer">
                                    <div className="relative">
                                    <input id="socratic-toggle" type="checkbox" className="sr-only" checked={isSocraticMode} onChange={() => setIsSocraticMode(!isSocraticMode)} />
                                    <div className="block bg-slate-600 w-14 h-8 rounded-full"></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isSocraticMode ? 'transform translate-x-6 bg-cyan-400' : ''}`}></div>
                                    </div>
                                    <div className="ml-3 text-slate-200">
                                        <span className="font-semibold">Enable Socratic Mode?</span>
                                        <p className="text-sm text-slate-400">The AI will only ask questions to guide you to the answer.</p>
                                    </div>
                                </label>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                            {languages.map(l => (
                                <SelectionButton key={l} onClick={() => onSelect(l)} disabled={isSocraticMode && l !== 'English'}>
                                    <span className="text-lg font-bold">{l.replace('+', ' + ')}</span>
                                </SelectionButton>
                            ))}
                        </div>
                     </div>
                 );
            
            case GameState.DIAGRAM_IDEAS_SELECTION:
                 return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Choose a Diagram to Generate" {...commonProps} streak={currentUser.stats.currentStreak}/>
                        <div className="space-y-3 max-w-2xl mx-auto">
                            {diagramIdeas.map(idea => (
                                <SelectionButton key={idea.id} onClick={() => handleGenerateDiagram(idea)}>
                                     <span className="text-lg">{idea.description}</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );
            
            case GameState.DIAGRAM_GENERATOR:
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Generated Diagram" {...commonProps} streak={currentUser.stats.currentStreak} />
                        <div className="max-w-xl mx-auto bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
                            {generatedDiagram ? (
                                <>
                                    <img src={`data:image/png;base64,${generatedDiagram.image}`} alt={generatedDiagram.description} className="w-full h-auto rounded-md bg-white"/>
                                    <p className="text-center text-slate-300 mt-4 text-lg">{generatedDiagram.description}</p>
                                </>
                            ) : <LoadingSpinner />}
                        </div>
                        <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );
            
             case GameState.VOICE_TUTOR_SESSION:
                const getStatusMessage = () => {
                    switch (tutorStatus) {
                        case 'CONNECTING': return 'Connecting to AI Tutor...';
                        case 'LISTENING': return 'I\'m listening...';
                        case 'THINKING': return 'Thinking...';
                        case 'SPEAKING': return 'AI is speaking...';
                        default: return '';
                    }
                };
            
                const SmileyAvatar = () => {
                    const animationClass = {
                        'CONNECTING': 'animate-gentle-float',
                        'LISTENING': 'animate-gentle-float',
                        'THINKING': 'animate-spin',
                        'SPEAKING': 'animate-orb-speak',
                    }[tutorStatus];

                    return (
                        <div className={`relative w-48 h-48 md:w-64 md:h-64 rounded-full flex items-center justify-center transition-all duration-300 ${animationClass}`}>
                             <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                                {/* Base Circle */}
                                <circle cx="50" cy="50" r="48" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
                                
                                {/* Eyes */}
                                <circle cx="35" cy="40" r="5" fill="#94a3b8" />
                                <circle cx="65" cy="40" r="5" fill="#94a3b8" />
                                
                                {/* Mouth - smiling */}
                                <path d="M 30 65 Q 50 80, 70 65" stroke="#94a3b8" strokeWidth="4" fill="none" strokeLinecap="round" />

                                {/* Thinking/Speaking indicator */}
                                {tutorStatus === 'THINKING' && <circle cx="50" cy="50" r="10" fill="#22d3ee" className="animate-ping" />}
                                {tutorStatus === 'SPEAKING' && <circle cx="50" cy="50" r="48" stroke="#22d3ee" strokeWidth="3" fill="none" className="animate-pulse" />}
                             </svg>
                        </div>
                    )
                };

                return (
                    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
                        <HomeButton onClick={stopVoiceTutor} />
                        <div className="flex flex-col items-center justify-center flex-grow">
                             <SmileyAvatar />
                            <p className="text-slate-400 mt-6 text-xl md:text-2xl font-medium h-8">{getStatusMessage()}</p>
                            <div className="text-slate-300 mt-4 text-lg md:text-xl h-16 max-w-2xl mx-auto">
                                {interimTranscript && (
                                    <p className={`transition-opacity duration-300 ${interimTranscript.speaker === 'user' ? 'text-cyan-300' : 'text-teal-300'}`}>
                                        {interimTranscript.text}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="mb-8">
                            <button
                                onClick={stopVoiceTutor}
                                className="px-8 py-4 bg-red-600 text-white font-bold text-lg rounded-full shadow-lg hover:bg-red-700 transition-colors"
                            >
                                End Session
                            </button>
                        </div>
                    </div>
                );

            case GameState.DOUBT_SOLVER:
                 return (
                    <div className="h-screen flex flex-col">
                        <HomeButton onClick={goToHome} />
                        <div className="p-4 border-b border-slate-700 text-center sticky top-0 bg-slate-900 z-10">
                             <h1 className="text-2xl font-bold text-slate-200">{isSocraticMode ? "Socratic Mode" : "AI Doubt Solver"}</h1>
                             <p className="text-sm text-slate-400">Topic: {topic}</p>
                        </div>
                        <div ref={doubtSolverScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                             {doubtSolverMessages.map((msg, index) => (
                                <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-cyan-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">AI</div>}
                                    <div className={`max-w-sm md:max-w-md lg:max-w-lg p-3 rounded-2xl ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                                         <Suspense fallback={<div className="text-slate-400">Loading content...</div>}>
                                            <Markdown remarkPlugins={[remarkGfm]} components={{ p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} /> }}>{msg.text}</Markdown>
                                        </Suspense>
                                    </div>
                                </div>
                            ))}
                            {isThinking && (
                                <div className="flex items-end gap-2 justify-start">
                                    <div className="w-8 h-8 rounded-full bg-cyan-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">AI</div>
                                    <div className="p-3 rounded-2xl bg-slate-700 text-slate-200 flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-700 sticky bottom-0 bg-slate-900">
                            <form onSubmit={(e) => { e.preventDefault(); sendDoubtSolverMessage(chatInput); setChatInput(''); }} className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={chatInput} 
                                    onChange={e => setChatInput(e.target.value)} 
                                    placeholder="Type your doubt..."
                                    className="flex-1 w-full px-4 py-3 text-slate-200 bg-slate-800 border border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                                <MicButton isListening={isListening} onClick={handleMicClick} />
                                <button type="submit" disabled={isThinking || !chatInput.trim()} className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-cyan-500 text-white disabled:bg-slate-700 disabled:cursor-not-allowed hover:bg-cyan-600 transition-colors">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                            </form>
                        </div>
                    </div>
                );

            case GameState.QUIZ_DIFFICULTY_SELECTION:
            case GameState.WORKSHEET_DIFFICULTY_SELECTION:
                const isWorksheet = gameState === GameState.WORKSHEET_DIFFICULTY_SELECTION;
                const nextState = isWorksheet ? GameState.WORKSHEET_COUNT_SELECTION : GameState.QUIZ_COUNT_SELECTION;
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title={`Select ${isWorksheet ? 'Worksheet' : 'Quiz'} Difficulty`} {...commonProps} streak={currentUser.stats.currentStreak}/>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(d => (
                                <SelectionButton key={d} onClick={() => { setDifficulty(d); setGameState(nextState); }}>
                                    <span className="text-lg font-bold">{d}</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );
            
            case GameState.QUIZ_COUNT_SELECTION:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Number of Questions" subtitle={`Difficulty: ${difficulty}`} {...commonProps} streak={currentUser.stats.currentStreak}/>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                            {[5, 10, 15, 20].map(c => (
                                <SelectionButton key={c} onClick={() => { setQuestionCount(c); setGameState(GameState.QUIZ_TIMER_SELECTION); }}>
                                    <span className="text-lg font-bold">{c} Questions</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );

            case GameState.WORKSHEET_COUNT_SELECTION:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Number of Questions" subtitle={`Difficulty: ${difficulty}`} {...commonProps} streak={currentUser.stats.currentStreak}/>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                            {[5, 10, 15, 20].map(c => (
                                <SelectionButton key={c} onClick={() => handleGenerateQuiz(difficulty!, c, 0, 'worksheet')}>
                                    <span className="text-lg font-bold">{c} Questions</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );
            
            case GameState.QUIZ_TIMER_SELECTION:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Time Per Question" subtitle={`${difficulty} | ${questionCount} Questions`} {...commonProps} streak={currentUser.stats.currentStreak}/>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                            {[15, 30, 45, 0].map(t => (
                                <SelectionButton key={t} onClick={() => handleGenerateQuiz(difficulty!, questionCount, t, 'quiz')}>
                                     <span className="text-lg font-bold">{t === 0 ? 'Unlimited' : `${t} Seconds`}</span>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );

            case GameState.QUIZ_IN_PROGRESS:
                if (questions.length === 0) return <FullScreenLoader message="Loading quiz..." />;
                const currentQuestion = questions[currentQuestionIndex];
                const selectedAnswer = userAnswers[currentQuestionIndex];

                const getButtonClasses = (option: string) => {
                    if (selectedAnswer === null) {
                        return 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-cyan-500';
                    }
                    if (option === currentQuestion.answer) {
                        return 'bg-green-800 border-green-600';
                    }
                    if (option === selectedAnswer) {
                        return 'bg-red-800 border-red-600';
                    }
                    return 'bg-slate-800 border-slate-700 opacity-60';
                };

                return (
                    <div className="min-h-screen flex flex-col justify-center items-center p-4">
                        <HomeButton onClick={goToHome} />
                        <div className="w-full max-w-3xl">
                             <div className="flex justify-between items-center mb-4 text-slate-300">
                                <span className="text-lg font-semibold">Question {currentQuestionIndex + 1} of {questions.length}</span>
                                {timePerQuestion > 0 && <span className="text-2xl font-bold text-cyan-400">{timeLeft}s</span>}
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-2.5 mb-6">
                                <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}></div>
                            </div>

                            <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
                                {currentQuestion.type === 'Assertion/Reason' ? (
                                    <div className="text-lg text-slate-200 mb-6 space-y-4">
                                        <p><span className="font-bold">Assertion (A):</span> {currentQuestion.question}</p>
                                        <p><span className="font-bold">Reason (R):</span> {currentQuestion.reason}</p>
                                    </div>
                                ) : (
                                    <p className="text-xl font-semibold text-slate-200 mb-6">{currentQuestion.question}</p>
                                )}
                                
                                {currentQuestion.type === 'Q&A' ? (
                                    <form onSubmit={(e) => { e.preventDefault(); const answer = (e.currentTarget.elements.namedItem('answer') as HTMLInputElement).value; handleAnswer(answer); }}>
                                        <textarea name="answer" rows={4} className="w-full px-3 py-2 text-slate-200 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4" placeholder="Type your answer..."></textarea>
                                        <ActionButton type="submit">Submit</ActionButton>
                                    </form>
                                ) : (
                                    <div className={`grid grid-cols-1 ${currentQuestion.options.length > 2 ? 'md:grid-cols-2' : ''} gap-4`}>
                                        {currentQuestion.options.map((option, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleAnswer(option)}
                                                disabled={selectedAnswer !== null}
                                                className={`p-4 text-left rounded-lg border-2 transition-all duration-300 ${getButtonClasses(option)}`}
                                            >
                                                <span className="font-semibold text-slate-200">{option}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {selectedAnswer !== null && (
                                    <div className="mt-6 p-4 bg-slate-700/50 rounded-lg animate-fade-in">
                                        <h3 className="font-bold text-lg text-cyan-400">Explanation</h3>
                                        <p className="text-slate-300">{currentQuestion.explanation}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );

            case GameState.QUIZ_SCORE:
                return (
                    <div className="min-h-screen flex flex-col justify-center items-center text-center p-4">
                        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full">
                            <h1 className="text-4xl font-bold text-cyan-400 mb-4">Quiz Complete!</h1>
                            <p className="text-2xl text-slate-300 mb-2">You scored:</p>
                            <p className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300 mb-8">{score} / {questions.length}</p>
                            <div className="flex justify-center gap-4">
                                <ActionButton onClick={goToHome}>Play Again</ActionButton>
                            </div>
                        </div>
                        <Modal isOpen={showBadgeModal} onClose={() => setShowBadgeModal(false)} title="New Badge Unlocked!">
                            <div className="text-center">
                                {newBadges.map((badge, index) => (
                                    <div key={index} className="mb-4 last:mb-0">
                                        <div className="w-20 h-20 mx-auto text-yellow-400">
                                            {BADGE_DEFINITIONS[badge.id].icon}
                                        </div>
                                        <h3 className="text-2xl font-bold text-yellow-300 mt-2">{badge.name}</h3>
                                        <p className="text-slate-300">{badge.description}</p>
                                    </div>
                                ))}
                                <ActionButton onClick={() => setShowBadgeModal(false)} className="mt-6">Awesome!</ActionButton>
                            </div>
                        </Modal>
                    </div>
                );
            
            case GameState.WORKSHEET_DISPLAY:
                return (
                    <div className="p-4 pt-20">
                         <div className="max-w-4xl mx-auto printable-worksheet bg-slate-800 p-8 rounded-lg shadow-lg border border-slate-700">
                            <div className="text-center mb-8 border-b border-slate-600 pb-4">
                                <h1 className="text-3xl font-bold text-slate-200">Science Worksheet</h1>
                                <p className="text-slate-400">{topic} (Grade {grade})</p>
                                <div className="print-only hidden mt-4">
                                    <p>Name: __________________________</p>
                                    <p>Date: ___________________________</p>
                                </div>
                            </div>

                            <div className="space-y-8">
                                {questions.map((q, i) => (
                                    <div key={i} className="worksheet-question">
                                        <p className="font-semibold text-lg text-slate-200 mb-2">{i + 1}. {q.question}</p>
                                        {q.reason && <p className="text-md text-slate-300 mb-2 italic"><strong>Reason:</strong> {q.reason}</p>}
                                        {q.type === 'MCQ' && (
                                            <ul className="list-none space-y-2 pl-4">
                                                {q.options.map((opt, j) => <li key={j} className="text-slate-300">( {String.fromCharCode(97 + j)} ) {opt}</li>)}
                                            </ul>
                                        )}
                                        {q.type === 'True/False' && (
                                             <p className="text-slate-300 pl-4">(a) True (b) False</p>
                                        )}
                                        {q.type === 'Q&A' && (
                                            <div className="mt-4 border-t-2 border-dashed border-slate-600 h-20"></div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="text-center mt-8 no-print">
                            <ActionButton onClick={() => window.print()}>Print Worksheet</ActionButton>
                        </div>
                    </div>
                );

            case GameState.NOTES_DISPLAY:
                 return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Study Notes" {...commonProps} streak={currentUser.stats.currentStreak} />
                        <div className="max-w-3xl mx-auto bg-slate-800 p-6 md:p-8 rounded-lg shadow-lg border border-slate-700 space-y-6">
                            {notes.map((section, i) => (
                                <div key={i}>
                                    <h2 className="text-2xl font-bold text-cyan-400 mb-2">{section.title}</h2>
                                    <ul className="list-disc list-inside space-y-1 text-slate-300 pl-2">
                                        {section.points.map((point, j) => <li key={j}>{point}</li>)}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );

            case GameState.CONCEPT_DEEP_DIVE:
                 return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Concept Deep Dive" {...commonProps} streak={currentUser.stats.currentStreak} />
                        <div className="max-w-3xl mx-auto bg-slate-800 p-6 md:p-8 rounded-lg shadow-lg border border-slate-700">
                            <div className="prose prose-invert prose-lg max-w-none prose-h2:text-cyan-400 prose-strong:text-slate-100 prose-a:text-teal-400">
                                <Suspense fallback={<LoadingSpinner />}>
                                    <Markdown remarkPlugins={[remarkGfm]}>{conceptExplanation}</Markdown>
                                </Suspense>
                            </div>
                        </div>
                         <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                 );
            
            case GameState.USER_PROFILE:
                return (
                    <div className={mainContainerClasses}>
                         <PageHeader title={`${currentUser.username}'s Profile`} streak={currentUser.stats.currentStreak}/>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Profile & Stats */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 text-center">
                                    <div className="relative w-32 h-32 mx-auto mb-4 group">
                                         <img
                                            src={currentUser.profilePictureUrl || `https://api.dicebear.com/8.x/pixel-art/svg?seed=${currentUser.username}`}
                                            alt="Profile"
                                            className="w-full h-full rounded-full object-cover border-4 border-cyan-500"
                                        />
                                        <label htmlFor="pfp-upload" className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </label>
                                        <input type="file" id="pfp-upload" className="hidden" accept="image/*" onChange={handleProfilePicUpload} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-200">{currentUser.username}</h2>
                                </div>
                                
                                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                    <h3 className="text-xl font-bold text-cyan-400 mb-4">Stats</h3>
                                    <div className="space-y-3 text-slate-300">
                                        <p><strong>Quizzes Completed:</strong> {currentUser.stats.quizzesCompleted}</p>
                                        <p><strong>Total Score:</strong> {currentUser.stats.totalScorePoints}</p>
                                        <p><strong>Current Streak:</strong> {currentUser.stats.currentStreak} {currentUser.stats.currentStreak > 0 ? '🔥' : ''}</p>
                                    </div>
                                </div>

                                {studyPlan && (
                                     <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                         <h3 className="text-xl font-bold text-cyan-400 mb-4">Your Next Steps</h3>
                                         <div className="prose prose-sm prose-invert max-w-none">
                                            <Suspense fallback={<LoadingSpinner />}>
                                                <Markdown>{studyPlan}</Markdown>
                                            </Suspense>
                                        </div>
                                     </div>
                                )}
                            </div>
                            
                            {/* Badges */}
                            <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700">
                                 <h3 className="text-xl font-bold text-cyan-400 mb-4">Badges Earned</h3>
                                 {currentUser.stats.badges.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {currentUser.stats.badges.map(badge => (
                                            <div key={badge.id} className="flex flex-col items-center text-center p-3 bg-slate-700/50 rounded-lg" title={`${badge.description} (Earned: ${new Date(badge.dateEarned).toLocaleDateString()})`}>
                                                <div className="w-16 h-16 text-yellow-400">
                                                    {BADGE_DEFINITIONS[badge.id]?.icon}
                                                </div>
                                                <p className="text-sm font-semibold text-slate-200 mt-2">{badge.name}</p>
                                            </div>
                                        ))}
                                    </div>
                                 ) : (
                                    <p className="text-slate-400">Complete some quizzes to start earning badges!</p>
                                 )}
                            </div>
                        </div>
                    </div>
                );
            
            case GameState.EDIT_PROFILE_PICTURE:
                return (
                    <div className="min-h-screen flex flex-col justify-center items-center p-4">
                        {editingProfilePic && (
                            <ProfilePictureEditor
                                imageUrl={editingProfilePic}
                                onSave={handleSaveProfilePic}
                                onCancel={() => { setEditingProfilePic(null); setGameState(GameState.USER_PROFILE); }}
                            />
                        )}
                    </div>
                );
            
            case GameState.ADMIN_PANEL:
                if (!currentUser.isAdmin) { goToHome(); return null; }
                const clearData = (key: string, setter: (data: any) => void) => {
                    if(window.confirm(`Are you sure you want to clear all data for: ${key}? This cannot be undone.`)){
                        localStorage.removeItem(key);
                        setter([]);
                    }
                };
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Admin Panel" streak={currentUser.stats.currentStreak}/>
                        <div className="max-w-3xl mx-auto space-y-8">
                            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                <h3 className="text-xl font-bold text-cyan-400 mb-4">Data Management</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <ActionButton onClick={() => clearData(USERS_KEY, setUsers)} className="bg-red-600 hover:bg-red-700 from-red-600 to-red-700">Clear Users</ActionButton>
                                    <ActionButton onClick={() => clearData(LEADERBOARD_KEY, setLeaderboard)} className="bg-red-600 hover:bg-red-700 from-red-600 to-red-700">Clear Leaderboard</ActionButton>
                                    <ActionButton onClick={() => clearData(ACTIVITY_LOG_KEY, setActivityLog)} className="bg-red-600 hover:bg-red-700 from-red-600 to-red-700">Clear Activity Log</ActionButton>
                                </div>
                            </div>
                            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                <h3 className="text-xl font-bold text-cyan-400 mb-4">Recent Activity ({activityLog.length})</h3>
                                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                    {activityLog.length > 0 ? activityLog.map(log => (
                                        <div key={log.id} className="text-sm text-slate-400">
                                           <span className="font-mono text-xs mr-2">{timeAgo(log.timestamp)}</span>
                                           <span>{formatLogMessage(log)}</span>
                                        </div>
                                    )) : <p className="text-slate-500">No activity logged yet.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case GameState.LEADERBOARD:
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Leaderboard" subtitle="Top 20 Curious Minds" streak={currentUser.stats.currentStreak}/>
                        <div className="max-w-2xl mx-auto bg-slate-800 p-6 rounded-xl border border-slate-700">
                            <ol className="space-y-4">
                                {leaderboard.map((entry, index) => (
                                    <li key={entry.userId} className={`flex items-center gap-4 p-3 rounded-lg ${entry.userId === currentUserId ? 'bg-cyan-900/50 border border-cyan-700' : ''}`}>
                                        <span className={`text-xl font-bold w-8 text-center ${index < 3 ? 'text-yellow-300' : 'text-slate-400'}`}>{index + 1}</span>
                                        <img
                                            src={entry.profilePictureUrl || `https://api.dicebear.com/8.x/pixel-art/svg?seed=${entry.username}`}
                                            alt={entry.username}
                                            className="w-12 h-12 rounded-full object-cover border-2 border-slate-600"
                                        />
                                        <span className="text-lg font-semibold text-slate-200 flex-grow">{entry.username}</span>
                                        <span className="text-xl font-bold text-cyan-400">{entry.score} pts</span>
                                    </li>
                                ))}
                            </ol>
                            {leaderboard.length === 0 && <p className="text-center text-slate-500">The leaderboard is empty. Complete a quiz to get started!</p>}
                        </div>
                    </div>
                );

            case GameState.VIRTUAL_LAB_INPUT:
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Virtual Lab" subtitle="What experiment do you want to see?" streak={currentUser.stats.currentStreak}/>
                        <form onSubmit={(e) => { e.preventDefault(); handleGenerateVirtualLab(); }} className="max-w-xl mx-auto flex flex-col items-center gap-4">
                            <textarea
                                value={inputPrompt}
                                onChange={(e) => setInputPrompt(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 text-lg text-slate-200 bg-slate-800 border-2 border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="e.g., How a simple electric circuit works, or the process of photosynthesis..."
                            />
                            <ActionButton type="submit" disabled={!inputPrompt.trim()}>Animate Experiment</ActionButton>
                        </form>
                    </div>
                );

            case GameState.VIRTUAL_LAB_DISPLAY:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Virtual Lab" subtitle={inputPrompt} streak={currentUser.stats.currentStreak}/>
                        <div className="space-y-8 max-w-2xl mx-auto">
                            {virtualLabSteps.map((step, index) => (
                                <div key={index} className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700 animate-fade-in" style={{ animationDelay: `${index * 150}ms` }}>
                                    <h3 className="text-xl font-bold text-cyan-400 mb-2">Step {index+1}: {step.title}</h3>
                                    {step.image ? (
                                        <img src={`data:image/png;base64,${step.image}`} alt={step.title} className="w-full h-auto rounded-md mb-4 bg-white" />
                                    ) : <div className="w-full aspect-square bg-slate-700 rounded-md mb-4 flex items-center justify-center"><LoadingSpinner/></div>}
                                    <p className="text-slate-300">{step.description}</p>
                                </div>
                            ))}
                        </div>
                         <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );

            case GameState.REAL_WORLD_CONNECTIONS_DISPLAY:
                 return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Real-World Connections" {...commonProps} streak={currentUser.stats.currentStreak}/>
                        <div className="space-y-8 max-w-2xl mx-auto">
                            {realWorldExamples.map((example, index) => (
                                <div key={index} className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700 animate-fade-in" style={{ animationDelay: `${index * 150}ms` }}>
                                    <h3 className="text-xl font-bold text-cyan-400 mb-2">{example.title}</h3>
                                     {example.image ? (
                                        <img src={`data:image/png;base64,${example.image}`} alt={example.title} className="w-full h-auto rounded-md mb-4 object-cover" />
                                    ) : <div className="w-full aspect-video bg-slate-700 rounded-md mb-4 flex items-center justify-center"><LoadingSpinner/></div>}
                                    <p className="text-slate-300">{example.explanation}</p>
                                </div>
                            ))}
                        </div>
                         <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );

            case GameState.HISTORICAL_CHAT_SELECTION:
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Chat with a Legend" subtitle="Choose a scientist to talk to" streak={currentUser.stats.currentStreak}/>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
                            {HISTORICAL_SCIENTISTS.map(s => (
                                <div key={s.id} onClick={() => startHistoricalChat(s)} className="bg-slate-800 p-5 rounded-lg border border-slate-700 text-center cursor-pointer hover:bg-slate-700 hover:border-cyan-500 transition-colors">
                                    <img src={s.imageUrl} alt={s.name} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-slate-600 bg-slate-100" />
                                    <h3 className="text-xl font-bold text-slate-200">{s.name}</h3>
                                    <p className="text-sm text-cyan-400">{s.field}</p>
                                    <p className="text-xs text-slate-500 mt-1">{s.era}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case GameState.HISTORICAL_CHAT_SESSION:
                 if (!selectedScientist) { goToHome(); return null; }
                 return (
                    <div className="h-screen flex flex-col">
                        <HomeButton onClick={goToHome} />
                        <div className="p-4 border-b border-slate-700 text-center sticky top-0 bg-slate-900 z-10 flex items-center justify-center gap-4">
                            <img src={selectedScientist.imageUrl} alt={selectedScientist.name} className="w-12 h-12 rounded-full border-2 border-slate-600 bg-slate-100" />
                            <div>
                                <h1 className="text-2xl font-bold text-slate-200">Chat with {selectedScientist.name}</h1>
                                <p className="text-sm text-slate-400">{selectedScientist.field}</p>
                            </div>
                        </div>
                        <div ref={historicalChatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                             {historicalChatMessages.map((msg, index) => (
                                <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'model' && <img src={selectedScientist.imageUrl} alt={selectedScientist.name} className="w-8 h-8 rounded-full flex-shrink-0 bg-slate-100" />}
                                    <div className={`max-w-sm md:max-w-md lg:max-w-lg p-3 rounded-2xl ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                                         <Suspense fallback={<div className="text-slate-400">Loading content...</div>}>
                                            <Markdown remarkPlugins={[remarkGfm]} components={{ p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} /> }}>{msg.text}</Markdown>
                                        </Suspense>
                                    </div>
                                </div>
                            ))}
                            {isThinking && (
                                <div className="flex items-end gap-2 justify-start">
                                    <img src={selectedScientist.imageUrl} alt={selectedScientist.name} className="w-8 h-8 rounded-full flex-shrink-0 bg-slate-100" />
                                    <div className="p-3 rounded-2xl bg-slate-700 text-slate-200 flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-700 sticky bottom-0 bg-slate-900">
                            <form onSubmit={(e) => { e.preventDefault(); sendHistoricalChatMessage(chatInput); setChatInput(''); }} className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={chatInput} 
                                    onChange={e => setChatInput(e.target.value)} 
                                    placeholder={`Ask ${selectedScientist.name} a question...`}
                                    className="flex-1 w-full px-4 py-3 text-slate-200 bg-slate-800 border border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                                <MicButton isListening={isListening} onClick={handleMicClick} />
                                <button type="submit" disabled={isThinking || !chatInput.trim()} className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-cyan-500 text-white disabled:bg-slate-700 disabled:cursor-not-allowed hover:bg-cyan-600 transition-colors">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                            </form>
                        </div>
                    </div>
                );
            
            case GameState.AI_STORY_WEAVER_INPUT:
                 return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="AI Story Weaver" subtitle="What science concept should be the star of our story?" streak={currentUser.stats.currentStreak}/>
                        <form onSubmit={(e) => { e.preventDefault(); handleGenerateAIStory(); }} className="max-w-xl mx-auto flex flex-col items-center gap-4">
                            <textarea
                                value={inputPrompt}
                                onChange={(e) => setInputPrompt(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 text-lg text-slate-200 bg-slate-800 border-2 border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="e.g., A water molecule's journey through the water cycle, or a brave little electron exploring a circuit..."
                            />
                            <ActionButton type="submit" disabled={!inputPrompt.trim()}>Weave a Story</ActionButton>
                        </form>
                    </div>
                );

            case GameState.AI_STORY_WEAVER_DISPLAY:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="A Scientific Tale" subtitle={`About: ${inputPrompt}`} streak={currentUser.stats.currentStreak} />
                        <div className="max-w-3xl mx-auto bg-slate-800 p-6 md:p-8 rounded-lg shadow-lg border border-slate-700">
                            <div className="prose prose-invert prose-lg max-w-none prose-h2:text-cyan-400 prose-strong:text-slate-100 prose-a:text-teal-400">
                                <Suspense fallback={<LoadingSpinner />}>
                                    <Markdown remarkPlugins={[remarkGfm]}>{aiStory}</Markdown>
                                </Suspense>
                            </div>
                        </div>
                         <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );

            case GameState.SCIENCE_FAIR_BUDDY_INPUT:
                return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Science Fair Buddy" subtitle="What topics are you interested in?" streak={currentUser.stats.currentStreak}/>
                        <form onSubmit={(e) => { e.preventDefault(); handleGenerateScienceFairIdeas(); }} className="max-w-xl mx-auto flex flex-col items-center gap-4">
                            <textarea
                                value={inputPrompt}
                                onChange={(e) => setInputPrompt(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 text-lg text-slate-200 bg-slate-800 border-2 border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="e.g., renewable energy, chemistry, plants, electricity, robots..."
                            />
                            <ActionButton type="submit" disabled={!inputPrompt.trim()}>Get Project Ideas</ActionButton>
                        </form>
                    </div>
                );

            case GameState.SCIENCE_FAIR_BUDDY_IDEAS:
                 return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Project Ideas" subtitle={`For: ${inputPrompt}`} streak={currentUser.stats.currentStreak}/>
                        <div className="space-y-4 max-w-2xl mx-auto">
                            {scienceFairProjectIdeas.map(idea => (
                                <SelectionButton key={idea.id} onClick={() => handleGenerateScienceFairPlan(idea)}>
                                     <h3 className="text-lg font-bold text-cyan-400">{idea.title}</h3>
                                     <p className="text-slate-300 mt-1">{idea.description}</p>
                                </SelectionButton>
                            ))}
                        </div>
                    </div>
                );
            
            case GameState.SCIENCE_FAIR_BUDDY_PLAN:
                if (!selectedProjectIdea) { goToHome(); return null; }
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title={selectedProjectIdea.title} subtitle="Your Step-by-Step Project Plan" streak={currentUser.stats.currentStreak}/>
                        <div className="space-y-8 max-w-2xl mx-auto">
                            {scienceFairProjectPlan.map((step, index) => (
                                <div key={index} className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700 animate-fade-in" style={{ animationDelay: `${index * 150}ms` }}>
                                    <h3 className="text-xl font-bold text-cyan-400 mb-2">Step {index+1}: {step.title}</h3>
                                    {step.image ? (
                                        <img src={`data:image/png;base64,${step.image}`} alt={step.title} className="w-full h-auto rounded-md mb-4 bg-white" />
                                    ) : <div className="w-full aspect-square bg-slate-700 rounded-md mb-4 flex items-center justify-center"><LoadingSpinner/></div>}
                                     <div className="prose prose-sm prose-invert max-w-none">
                                        <Suspense fallback={<LoadingSpinner />}>
                                            <Markdown>{step.description}</Markdown>
                                        </Suspense>
                                    </div>
                                </div>
                            ))}
                        </div>
                         <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );
            
            case GameState.SCIENCE_LENS_INPUT:
                 return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="Science Lens" subtitle="Upload an image and ask a question about it" streak={currentUser.stats.currentStreak}/>
                        <div className="max-w-xl mx-auto flex flex-col items-center gap-6">
                            <label htmlFor="science-lens-upload" className="w-full aspect-video border-4 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors cursor-pointer">
                                {scienceLensImage ? (
                                    <img src={scienceLensImage.dataUrl} alt="Uploaded for analysis" className="w-full h-full object-contain rounded-md" />
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span className="mt-2 font-semibold">Click to upload image</span>
                                    </>
                                )}
                            </label>
                            <input type="file" id="science-lens-upload" className="hidden" accept="image/*" onChange={handleScienceLensImageUpload} />
                            
                            <textarea
                                value={inputPrompt}
                                onChange={(e) => setInputPrompt(e.target.value)}
                                rows={2}
                                className="w-full px-4 py-3 text-lg text-slate-200 bg-slate-800 border-2 border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="e.g., Why is this leaf green? or What kind of rock is this?"
                            />
                            <ActionButton onClick={handleExplainImage} disabled={!inputPrompt.trim() || !scienceLensImage}>Analyze Image</ActionButton>
                        </div>
                    </div>
                );

            case GameState.SCIENCE_LENS_DISPLAY:
                return (
                     <div className={mainContainerClasses}>
                        <PageHeader title="Science Lens Analysis" streak={currentUser.stats.currentStreak}/>
                        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                {scienceLensImage && <img src={scienceLensImage.dataUrl} alt="Analyzed" className="w-full h-auto rounded-md" />}
                                <p className="text-center italic text-slate-400 mt-2 text-sm">{inputPrompt}</p>
                            </div>
                            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                                 <div className="prose prose-invert prose-lg max-w-none prose-h2:text-cyan-400 prose-strong:text-slate-100 prose-a:text-teal-400">
                                    <Suspense fallback={<LoadingSpinner />}>
                                        <Markdown remarkPlugins={[remarkGfm]}>{scienceLensExplanation}</Markdown>
                                    </Suspense>
                                </div>
                            </div>
                        </div>
                         <div className="text-center mt-8">
                            <ActionButton onClick={goToHome}>Done</ActionButton>
                        </div>
                    </div>
                );
            
            case GameState.WHAT_IF_SCENARIO_INPUT:
                 return (
                    <div className={mainContainerClasses}>
                        <PageHeader title="'What If?' Scenario" subtitle="Ask a hypothetical science question" streak={currentUser.stats.currentStreak}/>
                        <form onSubmit={(e) => { e.preventDefault(); startWhatIfScenario(); }} className="max-w-xl mx-auto flex flex-col items-center gap-4">
                            <textarea
                                value={inputPrompt}
                                onChange={(e) => setInputPrompt(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 text-lg text-slate-200 bg-slate-800 border-2 border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="e.g., What if the Earth stopped spinning? or What if humans could photosynthesize?"
                            />
                            <ActionButton type="submit" disabled={!inputPrompt.trim()}>Explore Scenario</ActionButton>
                        </form>
                    </div>
                );
            
             case GameState.WHAT_IF_SCENARIO_SESSION:
                 return (
                    <div className="h-screen flex flex-col">
                        <HomeButton onClick={goToHome} />
                        <div className="p-4 border-b border-slate-700 text-center sticky top-0 bg-slate-900 z-10">
                             <h1 className="text-2xl font-bold text-slate-200">'What If?' Scenario</h1>
                             <p className="text-sm text-slate-400 truncate px-4">{inputPrompt}</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                             {whatIfChatMessages.map((msg, index) => (
                                <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-cyan-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">AI</div>}
                                    <div className={`max-w-sm md:max-w-md lg:max-w-2xl p-4 rounded-2xl ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                                         <div className="prose prose-sm prose-invert max-w-none">
                                            <Suspense fallback={<div className="text-slate-400">Loading content...</div>}>
                                                <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                                            </Suspense>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isThinking && (
                                <div className="flex items-end gap-2 justify-start">
                                    <div className="w-8 h-8 rounded-full bg-cyan-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">AI</div>
                                    <div className="p-3 rounded-2xl bg-slate-700 text-slate-200 flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-700 sticky bottom-0 bg-slate-900">
                            <form onSubmit={(e) => { e.preventDefault(); sendWhatIfMessage(chatInput); setChatInput(''); }} className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={chatInput} 
                                    onChange={e => setChatInput(e.target.value)} 
                                    placeholder="Ask a follow-up question..."
                                    className="flex-1 w-full px-4 py-3 text-slate-200 bg-slate-800 border border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                                <button type="submit" disabled={isThinking || !chatInput.trim()} className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-cyan-500 text-white disabled:bg-slate-700 disabled:cursor-not-allowed hover:bg-cyan-600 transition-colors">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                            </form>
                        </div>
                    </div>
                );

            default:
                return <p>Unknown game state</p>;
        }
    };

    return (
        <GlobalErrorBoundary>
            <main className="min-h-screen bg-slate-900 text-slate-200 font-sans">
                {gameState !== GameState.LOGIN_SCREEN && gameState !== GameState.VOICE_TUTOR_SESSION && <HomeButton onClick={goToHome} />}
                {gameState !== GameState.LOGIN_SCREEN && gameState !== GameState.VOICE_TUTOR_SESSION && <LogoutButton onClick={handleLogout} />}
                {renderContent()}
            </main>
        </GlobalErrorBoundary>
    );
};

export default App;
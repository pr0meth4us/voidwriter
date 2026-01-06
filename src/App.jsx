import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    addDoc,
    onSnapshot,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore';
import {
    Trash2,
    Plus,
    EyeOff,
    Eye,
    ChevronLeft,
    Bold,
    Indent,
    FileText,
    Search,
    Tag as TagIcon,
    Layout,
    Clock,
    Calendar,
    Sun,
    Moon,
    Zap,
    BookOpen
} from 'lucide-react';

// --- Configuration ---
const getFirebaseConfig = () => {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
        try { return JSON.parse(__firebase_config); } catch (e) { console.error("Config parse failed", e); }
    }
    const env = (typeof process !== 'undefined' && process.env) || {};
    return {
        apiKey: env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
        projectId: env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "...",
        appId: env.VITE_FIREBASE_APP_ID || "..."
    };
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'void-writer-pro-v1';

// --- Assets & Templates ---
const Logo = ({ size = 24, color = "#3f3f46" }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
        <path d="M10 10H40V14H14V86H86V60H90V90H10V10Z" fill={color} />
        <rect x="60" y="10" width="30" height="30" fill={color} />
        <rect x="25" y="45" width="2" height="10" fill={color} />
        <rect x="30" y="45" width="2" height="10" fill={color} />
    </svg>
);

const THEMES = {
    void: {
        name: "Void",
        bg: "bg-black",
        sidebar: "bg-[#020202]",
        editor: "bg-black",
        text: "text-zinc-400",
        border: "border-zinc-900",
        accent: "text-zinc-600",
        caret: "#555",
        logo: "#3f3f46"
    },
    lume: {
        name: "Lume",
        bg: "bg-stone-50",
        sidebar: "bg-stone-100",
        editor: "bg-white",
        text: "text-stone-800",
        border: "border-stone-200",
        accent: "text-stone-400",
        caret: "#a8a29e",
        logo: "#78716c"
    },
    amber: {
        name: "Terminal",
        bg: "bg-[#0c0800]",
        sidebar: "bg-[#140d00]",
        editor: "bg-[#0c0800]",
        text: "text-amber-500",
        border: "border-amber-900/30",
        accent: "text-amber-800",
        caret: "#78350f",
        logo: "#92400e"
    },
    paper: {
        name: "Paper",
        bg: "bg-[#f4f1ea]",
        sidebar: "bg-[#ebe7df]",
        editor: "bg-[#fdfcf9]",
        text: "text-slate-800",
        border: "border-slate-300",
        accent: "text-slate-500",
        caret: "#64748b",
        logo: "#475569"
    }
};

const TEMPLATES = {
    blank: { title: "untitled_fragment", content: "<div><br></div>" },
    meeting: {
        title: "meeting_minutes",
        content: "<b>PARTICIPANTS:</b><div>...</div><br><b>AGENDA:</b><div>1. </div><div>2. </div><br><b>ACTION ITEMS:</b><div>[ ] </div>"
    },
    journal: {
        title: "daily_log",
        content: "<b>DATE:</b> " + new Date().toLocaleDateString() + "<div><br></div><b>REFLECTIONS:</b><div>...</div><br><b>PRIORITIES:</b><div>- </div>"
    },
    project: {
        title: "project_brief",
        content: "<b>OBJECTIVE:</b><div>...</div><br><b>TIMELINE:</b><div>Phase 1: </div><br><b>RESOURCES:</b><div>- </div>"
    }
};

export default function App() {
    const [user, setUser] = useState(null);
    const [notes, setNotes] = useState([]);
    const [activeNoteId, setActiveNoteId] = useState(null);
    const [isEclipse, setIsEclipse] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showTemplates, setShowTemplates] = useState(false);
    const [themeKey, setThemeKey] = useState('void');

    const [textSize, setTextSize] = useState(14);
    const [textBrightness, setTextBrightness] = useState(70);

    const editorRef = useRef(null);
    const theme = THEMES[themeKey];

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
                    setAuthError("Configuration Error: API Keys missing."); return;
                }
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else { await signInAnonymously(auth); }
            } catch (e) { setAuthError(`Connection Failed: ${e.message}`); }
        };
        initAuth();
        return onAuthStateChanged(auth, setUser);
    }, []);

    useEffect(() => {
        if (!user) return;
        const elegiesRef = collection(db, 'artifacts', appId, 'public', 'data', 'elegies');
        return onSnapshot(elegiesRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const sorted = data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
            setNotes(sorted);
            if (!activeNoteId && sorted.length > 0) setActiveNoteId(sorted[0].id);
        });
    }, [user, activeNoteId]);

    const filteredNotes = useMemo(() => {
        return notes.filter(n =>
            n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.content?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [notes, searchQuery]);

    const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId]);

    useEffect(() => {
        if (editorRef.current && activeNote) {
            if (editorRef.current.innerHTML !== activeNote.content) {
                editorRef.current.innerHTML = activeNote.content || "";
            }
        }
    }, [activeNoteId]);

    const createNote = async (templateKey = 'blank') => {
        if (!user) return;
        const template = TEMPLATES[templateKey];
        try {
            const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'elegies'), {
                title: template.title,
                content: template.content,
                author: user.uid,
                updatedAt: serverTimestamp(),
                tags: []
            });
            setActiveNoteId(docRef.id);
            setIsEclipse(false);
            setShowTemplates(false);
        } catch (e) { console.error(e); }
    };

    const deleteNote = async (id, e) => {
        e.stopPropagation();
        if (!user) return;
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'elegies', id));
        if (activeNoteId === id) setActiveNoteId(null);
    };

    const updateNote = async (updates) => {
        if (!user || !activeNoteId) return;
        setIsSyncing(true);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'elegies', activeNoteId), {
            ...activeNote, ...updates, updatedAt: serverTimestamp()
        }, { merge: true });
        setTimeout(() => setIsSyncing(false), 400);
    };

    const handleTextAction = (command) => {
        document.execCommand(command, false, null);
        if (editorRef.current) updateNote({ content: editorRef.current.innerHTML });
    };

    const exportPDF = () => window.print();

    if (authError) return (
        <div className={`h-screen ${theme.bg} ${theme.text} font-mono flex items-center justify-center p-10 text-center uppercase text-[10px] tracking-widest`}>
            {authError}
        </div>
    );

    if (!user) return (
        <div className={`h-screen ${theme.bg} flex items-center justify-center transition-colors duration-500`}>
            <Logo size={32} color={theme.logo} />
        </div>
    );

    return (
        <div className={`h-screen ${theme.bg} ${theme.text} font-mono selection:bg-zinc-800 selection:text-white flex overflow-hidden transition-colors duration-500`}>

            {/* Structural Sidebar */}
            <aside className={`${theme.sidebar} border-r ${theme.border} transition-all duration-500 flex flex-col z-20 print:hidden
        ${sidebarOpen && !isEclipse ? 'w-64' : 'w-0 opacity-0 pointer-events-none'}`}>
                <div className="p-4 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Logo size={16} color={theme.logo} />
                            <span className={`text-[10px] tracking-[0.3em] uppercase ${theme.accent} font-bold`}>VW_WS</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowTemplates(!showTemplates)} className={`${theme.accent} hover:text-inherit`}><Layout size={14}/></button>
                            <button onClick={() => createNote()} className={`${theme.accent} hover:text-inherit`}><Plus size={14}/></button>
                        </div>
                    </div>

                    {/* Search Box */}
                    <div className="relative mb-6">
                        <Search className={`absolute left-2 top-1.5 opacity-30`} size={12} />
                        <input
                            type="text"
                            placeholder="SEARCH"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full bg-transparent border-b ${theme.border} py-1 pl-7 pr-2 text-[10px] outline-none transition-colors placeholder:opacity-20`}
                        />
                    </div>

                    {/* Template Picker */}
                    {showTemplates && (
                        <div className="mb-6 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                            {Object.keys(TEMPLATES).map(key => (
                                <button
                                    key={key}
                                    onClick={() => createNote(key)}
                                    className={`p-2 text-[9px] uppercase border ${theme.border} rounded-sm text-left opacity-60 hover:opacity-100 transition-opacity`}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Note List */}
                    <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                        {filteredNotes.map(note => (
                            <div key={note.id} onClick={() => setActiveNoteId(note.id)}
                                 className={`group py-2 px-3 cursor-pointer transition-all rounded-sm border ${activeNoteId === note.id ? `bg-zinc-500/5 ${theme.border} text-inherit` : `border-transparent opacity-40 hover:opacity-100`}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <div className="truncate text-[10px] uppercase font-medium">{note.title || "untitled"}</div>
                                    <button onClick={(e) => deleteNote(note.id, e)} className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"><Trash2 size={10}/></button>
                                </div>
                                <div className="text-[8px] opacity-40 flex items-center gap-1">
                                    <Clock size={8}/> {note.updatedAt ? new Date(note.updatedAt.seconds * 1000).toLocaleDateString() : '..'}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Spectral Controls (Themes) */}
                    <div className="mt-auto pt-4 space-y-4 border-t border-zinc-900/30">
                        <div className="flex justify-between items-center gap-1">
                            {Object.keys(THEMES).map(k => (
                                <button
                                    key={k}
                                    onClick={() => setThemeKey(k)}
                                    className={`flex-1 p-2 border ${themeKey === k ? theme.border : 'border-transparent'} rounded-sm flex justify-center items-center transition-all`}
                                    title={THEMES[k].name}
                                >
                                    {k === 'void' && <Moon size={12} className={themeKey === k ? 'opacity-100' : 'opacity-20'}/>}
                                    {k === 'lume' && <Sun size={12} className={themeKey === k ? 'opacity-100' : 'opacity-20'}/>}
                                    {k === 'amber' && <Zap size={12} className={themeKey === k ? 'opacity-100' : 'opacity-20'}/>}
                                    {k === 'paper' && <BookOpen size={12} className={themeKey === k ? 'opacity-100' : 'opacity-20'}/>}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-1">
                            <div className={`text-[7px] ${theme.accent} uppercase tracking-widest flex justify-between`}>S_SIZE <span>{textSize}PX</span></div>
                            <input type="range" min="12" max="24" value={textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} className={`w-full h-0.5 ${theme.bg} appearance-none outline-none accent-zinc-500`} />
                        </div>
                        <div className={`text-[7px] ${theme.accent} tracking-tighter uppercase flex justify-between items-center`}>
                            <span className={isSyncing ? "animate-pulse" : ""}>{isSyncing ? "SYNC_ACT" : "CLOUD_IDL"}</span>
                            <span>v1.3.0</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Workspace */}
            <main className={`flex-1 relative flex flex-col items-center overflow-y-auto custom-scrollbar ${theme.editor} print:bg-white`}>

                {/* Controls Overlay */}
                <div className={`fixed top-4 right-4 z-40 flex items-center gap-2 transition-opacity duration-500 print:hidden ${isEclipse ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                    <button onClick={() => setIsEclipse(!isEclipse)} className={`p-2 border ${theme.border} ${theme.sidebar} hover:opacity-70 transition-opacity`}>
                        {isEclipse ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    {!isEclipse && (
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2 border ${theme.border} ${theme.sidebar} hover:opacity-70 transition-opacity`}>
                            <ChevronLeft className={`transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} size={14} />
                        </button>
                    )}
                </div>

                {activeNote ? (
                    <div className="w-full max-w-2xl px-8 py-0 h-full flex flex-col print:max-w-none print:px-0">
                        {/* Note Header */}
                        <div className={`mt-10 mb-8 flex flex-col gap-2 transition-opacity duration-500 ${isEclipse ? 'opacity-0' : 'opacity-100'}`}>
                            <input
                                type="text"
                                value={activeNote.title}
                                onChange={(e) => updateNote({ title: e.target.value })}
                                className={`bg-transparent border-none outline-none text-xs font-bold uppercase tracking-[0.5em] text-inherit placeholder:opacity-20 w-full`}
                                placeholder="LABEL"
                            />
                            <div className="flex gap-4 items-center opacity-40">
                                <div className="text-[8px] uppercase flex items-center gap-1 tracking-widest">
                                    <Calendar size={10}/> {activeNote.updatedAt ? new Date(activeNote.updatedAt.seconds * 1000).toDateString() : '..'}
                                </div>
                                <div className="text-[8px] uppercase flex items-center gap-1 tracking-widest">
                                    <TagIcon size={10}/> {activeNote.tags?.length || 0} TAGS
                                </div>
                            </div>
                        </div>

                        {/* Rich Editor */}
                        <div
                            ref={editorRef}
                            contentEditable
                            onInput={(e) => updateNote({ content: e.currentTarget.innerHTML })}
                            className={`flex-1 outline-none leading-relaxed transition-all print:text-black selection:bg-zinc-500/20`}
                            style={{ fontSize: `${textSize}px`, minHeight: '60vh', caretColor: theme.caret }}
                            spellCheck="false"
                        />

                        {/* Formatting Footer */}
                        <footer className={`pb-10 pt-6 border-t ${theme.border} flex justify-between items-center transition-opacity duration-500 print:hidden ${isEclipse ? 'opacity-0' : 'opacity-100'}`}>
                            <div className="flex items-center gap-6">
                                <div className="flex gap-4">
                                    <button onClick={() => handleTextAction('bold')} className={`opacity-40 hover:opacity-100`}><Bold size={14}/></button>
                                    <button onClick={() => handleTextAction('indent')} className={`opacity-40 hover:opacity-100`}><Indent size={14}/></button>
                                    <button onClick={exportPDF} className={`opacity-40 hover:opacity-100 ml-4 border-l ${theme.border} pl-6`}><FileText size={14}/></button>
                                </div>
                            </div>
                            <div className="text-[9px] opacity-40 tracking-tighter tabular-nums uppercase">
                                {activeNote.content?.replace(/<[^>]*>/g, '').length || 0} CH
                            </div>
                        </footer>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                        <Logo size={48} color={theme.logo} />
                        <button onClick={() => createNote()} className="text-[10px] tracking-[1em] uppercase mt-4">EMPTY</button>
                    </div>
                )}
            </main>

            <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body, html { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          [contenteditable] { border: none !important; font-size: 11pt !important; line-height: 1.5 !important; color: black !important; }
          [contenteditable] b { font-weight: bold !important; color: black !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 1px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; }
        [contenteditable] { white-space: pre-wrap; overflow-wrap: break-word; outline: none; }
        [contenteditable] b { font-weight: 700; color: inherit; }
        [contenteditable]:empty:before { content: "..."; opacity: 0.1; }
        body { margin: 0; overflow: hidden; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 6px; width: 6px; background: #666; cursor: pointer; }
        
        /* Terminal scanline effect for Amber theme */
        ${themeKey === 'amber' ? `
          main::after {
            content: " ";
            display: block;
            position: absolute;
            top: 0; left: 0; bottom: 0; right: 0;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
            z-index: 10;
            background-size: 100% 2px, 3px 100%;
            pointer-events: none;
          }
        ` : ''}
      `}} />
        </div>
    );
}
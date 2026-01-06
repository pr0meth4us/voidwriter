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
    FileText
} from 'lucide-react';

// --- Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT.appspot.com",
        messagingSenderId: "...",
        appId: "..."
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'void-writer-v1';

// --- Logo Component ---
const Logo = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
        <path d="M10 10H40V14H14V86H86V60H90V90H10V10Z" fill="#3f3f46" />
        <rect x="60" y="10" width="30" height="30" fill="#e4e4e7" />
        <rect x="25" y="45" width="2" height="10" fill="#71717a" />
        <rect x="30" y="45" width="2" height="10" fill="#71717a" />
    </svg>
);

export default function App() {
    const [user, setUser] = useState(null);
    const [notes, setNotes] = useState([]);
    const [activeNoteId, setActiveNoteId] = useState(null);
    const [isEclipse, setIsEclipse] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [authError, setAuthError] = useState(null);

    const [textSize, setTextSize] = useState(14);
    const [textBrightness, setTextBrightness] = useState(70);

    const editorRef = useRef(null);

    // Favicon Injection
    useEffect(() => {
        const svgString = `<svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 10H40V14H14V86H86V60H90V90H10V10Z" fill="#3f3f46" /><rect x="60" y="10" width="30" height="30" fill="#e4e4e7" /><rect x="25" y="45" width="2" height="10" fill="#71717a" /><rect x="30" y="45" width="2" height="10" fill="#71717a" /></svg>`;
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/svg+xml';
        link.rel = 'shortcut icon';
        link.href = url;
        document.getElementsByTagName('head')[0].appendChild(link);
    }, []);

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (firebaseConfig.apiKey === "YOUR_API_KEY") {
                    setAuthError("Configuration Error: Please paste your Firebase API keys into App.jsx");
                    return;
                }
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (e) {
                console.error("Firebase Auth Error:", e);
                setAuthError(`Connection Failed: ${e.message}`);
            }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            if (u) {
                setUser(u);
                setAuthError(null);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        const elegiesRef = collection(db, 'artifacts', appId, 'public', 'data', 'elegies');
        const unsubscribe = onSnapshot(elegiesRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const sorted = data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
            setNotes(sorted);
            if (!activeNoteId && sorted.length > 0) setActiveNoteId(sorted[0].id);
        }, (err) => {
            console.error("Firestore Snapshot Error:", err);
        });
        return () => unsubscribe();
    }, [user, activeNoteId]);

    const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId]);

    useEffect(() => {
        if (editorRef.current && activeNote) {
            if (editorRef.current.innerHTML !== activeNote.content) {
                editorRef.current.innerHTML = activeNote.content || "";
            }
        }
    }, [activeNoteId]);

    const createNote = async () => {
        if (!user) return;
        try {
            const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'elegies'), {
                title: "fragment",
                content: "",
                author: user.uid,
                updatedAt: serverTimestamp()
            });
            setActiveNoteId(docRef.id);
            setIsEclipse(false);
        } catch (e) { console.error("Create Error:", e); }
    };

    const deleteNote = async (id, e) => {
        e.stopPropagation();
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'elegies', id));
            if (activeNoteId === id) setActiveNoteId(null);
        } catch (e) { console.error("Delete Error:", e); }
    };

    const updateNote = async (updates) => {
        if (!user || !activeNoteId) return;
        setIsSyncing(true);
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'elegies', activeNoteId), {
                ...activeNote, ...updates, updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (e) { console.error("Update Error:", e); }
        setTimeout(() => setIsSyncing(false), 400);
    };

    const handleTextAction = (command) => {
        document.execCommand(command, false, null);
        if (editorRef.current) {
            updateNote({ content: editorRef.current.innerHTML });
        }
    };

    const exportPDF = () => { window.print(); };

    const wordCount = activeNote?.content
        ? activeNote.content.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(w => w.length > 0).length
        : 0;

    if (authError) return (
        <div className="h-screen bg-black text-red-900 font-mono flex items-center justify-center p-10 text-center">
            <div className="max-w-md">
                <Logo size={40} />
                <div className="text-[10px] tracking-[0.5em] mt-6 mb-4 uppercase">System_Failure</div>
                <div className="text-xs text-zinc-600 leading-relaxed uppercase">{authError}</div>
            </div>
        </div>
    );

    if (!user) return (
        <div className="h-screen bg-black text-zinc-600 font-mono flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Logo size={32} />
                <div className="animate-pulse text-[10px] tracking-[0.5em]">RESTORING_SIGNAL...</div>
            </div>
        </div>
    );

    return (
        <div className="h-screen bg-black text-zinc-400 font-mono selection:bg-zinc-800 selection:text-white flex overflow-hidden">

            {/* Sidebar */}
            <aside className={`bg-black border-r border-zinc-900 transition-all duration-300 ease-in-out flex flex-col z-20 print:hidden
        ${sidebarOpen && !isEclipse ? 'w-52 opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}>
                <div className="p-4 flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <Logo size={18} />
                            <span className="text-[10px] tracking-[0.4em] uppercase text-zinc-500 font-bold">VW_SYSTEM</span>
                        </div>
                        <button onClick={createNote} className="text-zinc-500 hover:text-white transition-colors">
                            <Plus size={14} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
                        {notes.map(note => (
                            <div key={note.id} onClick={() => setActiveNoteId(note.id)}
                                 className={`group flex items-center justify-between py-2 px-3 cursor-pointer transition-all rounded-sm
                ${activeNoteId === note.id ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}>
                                <div className="truncate text-[10px] tracking-tight">{note.title || "untitled"}</div>
                                <button onClick={(e) => deleteNote(note.id, e)} className="opacity-0 group-hover:opacity-100 hover:text-red-800 p-0.5 transition-opacity">
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-auto pt-6 space-y-4 border-t border-zinc-900/50">
                        <div className="space-y-2">
                            <div className="text-[8px] text-zinc-600 uppercase tracking-widest flex justify-between">
                                S_SIZE <span>{textSize}px</span>
                            </div>
                            <input type="range" min="12" max="28" value={textSize} onChange={(e) => setTextSize(parseInt(e.target.value))}
                                   className="w-full h-1 bg-zinc-900 appearance-none outline-none accent-zinc-500" />
                        </div>
                        <div className="space-y-2">
                            <div className="text-[8px] text-zinc-600 uppercase tracking-widest flex justify-between">
                                S_SIGNAL <span>{textBrightness}%</span>
                            </div>
                            <input type="range" min="30" max="100" value={textBrightness} onChange={(e) => setTextBrightness(parseInt(e.target.value))}
                                   className="w-full h-1 bg-zinc-900 appearance-none outline-none accent-zinc-500" />
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Workspace */}
            <main className="flex-1 relative flex flex-col items-center overflow-y-auto custom-scrollbar bg-[#050505] print:bg-white print:overflow-visible">

                <div className={`fixed top-4 right-4 z-40 flex items-center gap-2 transition-opacity duration-500 print:hidden ${isEclipse ? 'opacity-5 hover:opacity-100' : 'opacity-100'}`}>
                    <button onClick={() => setIsEclipse(!isEclipse)} className="text-zinc-600 hover:text-white p-2 border border-zinc-900 bg-black transition-colors">
                        {isEclipse ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    {!isEclipse && (
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-600 hover:text-white p-2 border border-zinc-900 bg-black transition-colors">
                            <ChevronLeft className={`transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} size={16} />
                        </button>
                    )}
                </div>

                {activeNote ? (
                    <div className="w-full max-w-2xl px-8 py-0 h-full flex flex-col print:max-w-none print:px-0">
                        <input type="text" value={activeNote.title} onChange={(e) => updateNote({ title: e.target.value })}
                               className={`bg-transparent border-none outline-none text-[12px] font-bold uppercase tracking-[0.4em] text-zinc-400 placeholder:text-zinc-800 transition-opacity mt-8 mb-6 print:text-black print:opacity-100
              ${isEclipse ? 'opacity-0' : 'opacity-100'}`} placeholder="FRAGMENT_LABEL" />

                        <div ref={editorRef} contentEditable onInput={(e) => updateNote({ content: e.currentTarget.innerHTML })}
                             className="flex-1 outline-none leading-relaxed transition-all print:text-black print:opacity-100"
                             style={{
                                 fontSize: `${textSize}px`,
                                 color: `rgba(228, 228, 231, ${textBrightness / 100})`,
                                 minHeight: '75vh'
                             }}
                             spellCheck="false" />

                        <footer className={`pb-8 pt-6 border-t border-zinc-900/40 flex justify-between items-center transition-opacity duration-500 print:hidden
              ${isEclipse ? 'opacity-0' : 'opacity-100'}`}>
                            <div className="flex items-center gap-6">
                                <div className="text-[10px] text-zinc-500 tracking-[0.2em] uppercase">{wordCount} W</div>
                                <div className="flex gap-4">
                                    <button onClick={() => handleTextAction('bold')} className="text-zinc-500 hover:text-zinc-200"><Bold size={14} /></button>
                                    <button onClick={() => handleTextAction('indent')} className="text-zinc-500 hover:text-zinc-200"><Indent size={14} /></button>
                                    <button onClick={exportPDF} className="text-zinc-500 hover:text-zinc-200 ml-4 border-l border-zinc-800 pl-6"><FileText size={14} /></button>
                                </div>
                            </div>
                            <div className="text-[9px] text-zinc-600 tracking-widest text-right tabular-nums">
                                {activeNote.updatedAt ? new Date(activeNote.updatedAt.seconds * 1000).toISOString().replace('T', ' ').split('.')[0] : "TX_PENDING"}
                            </div>
                        </footer>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-30">
                        <Logo size={40} />
                        <button onClick={createNote} className="text-[10px] tracking-[0.8em] uppercase hover:text-white transition-all">INITIALIZE_FRAGMENT</button>
                    </div>
                )}
            </main>

            <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body, html { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .print\\:text-black { color: black !important; opacity: 1 !important; }
          [contenteditable] b { color: black !important; font-weight: bold; }
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #18181b; }
        
        input { border: none !important; box-shadow: none !important; padding: 0 !important; }
        [contenteditable] { white-space: pre-wrap; overflow-wrap: break-word; }
        [contenteditable] b { color: #fff; font-weight: 700; }
        
        body { background-color: black; margin: 0; overflow: hidden; }
        
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 10px; width: 10px;
          background: #52525b; border-radius: 0;
          cursor: pointer;
        }
      `}} />
        </div>
    );
}
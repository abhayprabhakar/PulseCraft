import { useState, useEffect, useCallback } from 'react';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    toolsUsed?: string[];
    mcpActive?: boolean;
    mcpTools?: string[];
}

export interface ChatSession {
    id: string;
    name: string;
    createdAt: number;
    messages: ChatMessage[];
}

const STORAGE_KEY_PREFIX = 'ts_chat_sessions_';

function loadSessions(rideId: string): ChatSession[] {
    try {
        const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${rideId}`);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveSessions(rideId: string, sessions: ChatSession[]) {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${rideId}`, JSON.stringify(sessions));
}

function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaultSession(): ChatSession {
    return {
        id: generateId(),
        name: `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        createdAt: Date.now(),
        messages: [{
            role: 'assistant',
            content: "Select a range of data on the chart using the **brush slider**, then ask me anything about your performance in that specific section!",
            timestamp: Date.now()
        }]
    };
}

export function useChatSessions(rideId: string | undefined) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Load sessions when rideId changes
    useEffect(() => {
        if (!rideId) return;
        const stored = loadSessions(rideId);
        if (stored.length === 0) {
            const initial = makeDefaultSession();
            setSessions([initial]);
            setActiveSessionId(initial.id);
            saveSessions(rideId, [initial]);
        } else {
            setSessions(stored);
            setActiveSessionId(stored[stored.length - 1].id);
        }
    }, [rideId]);

    const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

    const createSession = useCallback(() => {
        if (!rideId) return;
        const newSession = makeDefaultSession();
        setSessions(prev => {
            const updated = [...prev, newSession];
            saveSessions(rideId, updated);
            return updated;
        });
        setActiveSessionId(newSession.id);
    }, [rideId]);

    const selectSession = useCallback((sessionId: string) => {
        setActiveSessionId(sessionId);
    }, []);

    const deleteSession = useCallback((sessionId: string) => {
        if (!rideId) return;
        setSessions(prev => {
            const updated = prev.filter(s => s.id !== sessionId);
            saveSessions(rideId, updated);
            // If deleted the active session, switch to last one or create new
            if (sessionId === activeSessionId) {
                if (updated.length > 0) {
                    setActiveSessionId(updated[updated.length - 1].id);
                } else {
                    const fresh = makeDefaultSession();
                    const withFresh = [fresh];
                    saveSessions(rideId, withFresh);
                    setActiveSessionId(fresh.id);
                    return withFresh;
                }
            }
            return updated;
        });
    }, [rideId, activeSessionId]);

    const addMessage = useCallback((message: ChatMessage) => {
        if (!rideId || !activeSessionId) return;
        setSessions(prev => {
            const updated = prev.map(s => {
                if (s.id !== activeSessionId) return s;
                // Auto-name the session from the first user message
                const shouldRename = s.messages.filter(m => m.role === 'user').length === 0 && message.role === 'user';
                return {
                    ...s,
                    name: shouldRename ? message.content.slice(0, 32) + (message.content.length > 32 ? '…' : '') : s.name,
                    messages: [...s.messages, message]
                };
            });
            saveSessions(rideId, updated);
            return updated;
        });
    }, [rideId, activeSessionId]);

    return { sessions, activeSession, activeSessionId, createSession, selectSession, deleteSession, addMessage };
}

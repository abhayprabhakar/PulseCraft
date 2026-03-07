import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User as UserIcon } from 'lucide-react';
import { ridesApi, RideAnalysis } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
}

const ChatbotPage: React.FC = () => {
    const THINKING_FLOW = [
        'Reading your question',
        'Checking latest ride analytics',
        'Selecting relevant insight tools',
        'Preparing coaching response',
    ];

    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: "Hi! I'm your AI Riding Coach. Ask me about your latest session's braking, throttle, speed, or segment time loss.", sender: 'bot' }
    ]);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [analysis, setAnalysis] = useState<RideAnalysis | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
    const [thinkingStepTimes, setThinkingStepTimes] = useState<(number | null)[]>([]);
    const [lastToolsUsed, setLastToolsUsed] = useState<string[]>([]);
    const [lastProgressUpdates, setLastProgressUpdates] = useState<string[]>([]);
    const [lastProgressStepTimes, setLastProgressStepTimes] = useState<number[]>([]);
    const [showTracePanel, setShowTracePanel] = useState(true);
    const { currentBike } = useAuth();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const formatStepTime = (timestamp?: number | null) => {
        if (!timestamp) return '—';
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                if (currentBike) {
                    const rides = await ridesApi.list(currentBike.id);
                    if (rides.length > 0) {
                        const data = await ridesApi.getAnalysis(rides[0].id);
                        setAnalysis(data);
                    } else {
                        setAnalysis(null);
                    }
                }
            } catch (err) {
                console.error("Failed to load context", err);
            }
        };
        loadData();
    }, [currentBike]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    useEffect(() => {
        if (!isThinking) return;

        const startedAt = Date.now();
        setThinkingStepIndex(0);
        setThinkingStepTimes(THINKING_FLOW.map((_, idx) => (idx === 0 ? startedAt : null)));
        const intervalId = window.setInterval(() => {
            setThinkingStepIndex((current) => {
                if (current >= THINKING_FLOW.length - 1) return current;
                const next = current + 1;
                setThinkingStepTimes((prev) => {
                    const copy = [...prev];
                    if (copy[next] == null) copy[next] = Date.now();
                    return copy;
                });
                return next;
            });
        }, 850);

        return () => window.clearInterval(intervalId);
    }, [isThinking]);

    const handleSend = () => {
        const rawInput = inputRef.current?.value ?? '';
        if (!rawInput.trim()) return;

        const userMsg: Message = { id: Date.now(), text: rawInput.trim(), sender: 'user' };
        setMessages(prev => [...prev, userMsg]);
        if (inputRef.current) inputRef.current.value = '';
        setLastToolsUsed([]);
        setLastProgressUpdates([]);
        setLastProgressStepTimes([]);
        setIsThinking(true);

        // Simple Rule-Based Response Logic
        setTimeout(() => {
            let reply = "I'm analyzing your telemetry...";
            const query = userMsg.text.toLowerCase();
            let toolsUsed = ['Ride Summary Reader', 'Event Risk Analyzer', 'Segment Delta Inspector', 'Coaching Response Builder'];
            let progressUpdates = THINKING_FLOW;

            if (!analysis) {
                reply = "I don't have any ride data loaded yet. Please record a ride first.";
                toolsUsed = ['Ride Data Availability Check'];
                progressUpdates = ['Checked active ride context', 'No ride telemetry available'];
            } else {
                const m = analysis.metrics;
                const scorecards = analysis.scorecards;
                const segments = analysis.segment_analytics || [];
                const events = analysis.events || [];
                const topLossSegment = [...segments].sort((a, b) => b.time_delta_vs_best_s - a.time_delta_vs_best_s)[0];

                if (query.includes('brake') || query.includes('braking')) {
                    const risk = scorecards?.risk_index ?? Math.min(100, events.length * 8);
                    const msg = risk < 35 ? "Braking control looks stable." : "Try earlier and more progressive brake release.";
                    reply = `Braking risk index is ${risk}/100 based on event intensity and segment stability. ${msg}`;
                    toolsUsed = ['Braking Risk Analyzer', 'Event Timeline Scanner', 'Coaching Recommendation Builder'];
                    progressUpdates = ['Loaded braking events', 'Computed braking risk index', 'Generated braking coaching tip'];
                } else if (query.includes('throttle') || query.includes('acceleration')) {
                    if (topLossSegment) {
                        const jerk = topLossSegment.throttle_jerk_score;
                        const delay = topLossSegment.throttle_delay_ms;
                        reply = `In ${topLossSegment.segment_id}, throttle jerk is ${jerk.toFixed(1)} with ${delay} ms post-apex throttle delay. ${jerk < 10 ? "Power delivery is smooth." : "Try a more progressive roll-on at corner exit."}`;
                        toolsUsed = ['Throttle Smoothness Analyzer', 'Segment Delta Inspector', 'Corner Exit Coach'];
                        progressUpdates = ['Inspected throttle jerk profile', 'Compared post-apex delay', 'Prepared throttle coaching advice'];
                    } else {
                        reply = "Throttle diagnostics are limited for this ride, but keeping throttle roll-on progressive after apex will improve exits.";
                        toolsUsed = ['Throttle Availability Check', 'Corner Exit Coach'];
                        progressUpdates = ['Checked throttle telemetry availability', 'Generated fallback coaching guidance'];
                    }
                } else if (query.includes('lean') || query.includes('angle')) {
                    reply = "Lean-angle metrics are not being used in this setup. Ask me about braking, throttle, speed, consistency, or segment time loss.";
                    toolsUsed = ['Question Intent Classifier'];
                    progressUpdates = ['Classified request as lean-angle query', 'Returned supported-metrics guidance'];
                } else if (query.includes('speed') || query.includes('fast')) {
                    const consistency = scorecards?.consistency_score ?? Math.max(0, Math.min(100, Math.round((m.smoothness_score ?? 70) * 0.65 + (m.efficiency_score ?? 70) * 0.35)));
                    reply = `Top speed was ${analysis.max_speed.toFixed(0)} km/h. Consistency score is ${consistency}/100, which reflects how repeatable your pace is across segments.`;
                    toolsUsed = ['Speed Profile Analyzer', 'Consistency Score Estimator', 'Performance Summary Writer'];
                    progressUpdates = ['Loaded speed profile', 'Calculated consistency score', 'Generated pace consistency summary'];
                } else if (query.includes('segment') || query.includes('delta') || query.includes('loss')) {
                    if (topLossSegment) {
                        reply = `${topLossSegment.segment_id} is currently your highest time-loss section at +${topLossSegment.time_delta_vs_best_s.toFixed(2)}s, mainly due to ${topLossSegment.primary_issue.replace(/_/g, ' ')}.`;
                        toolsUsed = ['Segment Delta Inspector', 'Primary Issue Identifier', 'Coaching Response Builder'];
                        progressUpdates = ['Ranked segments by time loss', 'Detected primary issue', 'Summarized top problem segment'];
                    } else {
                        reply = "I don't have enough segment-level data for this ride yet.";
                        toolsUsed = ['Segment Data Availability Check'];
                        progressUpdates = ['Checked segment analytics payload', 'No segment-level insight available'];
                    }
                } else {
                    reply = "I can tell you about braking, throttle, speed, consistency, or segment time loss. What would you like to know?";
                    toolsUsed = ['Question Intent Classifier', 'Coaching Scope Helper'];
                    progressUpdates = ['Classified user intent', 'Returned supported analysis categories'];
                }
            }

            setMessages(prev => [...prev, { id: Date.now() + 1, text: reply, sender: 'bot' }]);
            const baseTime = Date.now();
            const progressTimes = progressUpdates.map((_, idx) => baseTime + idx * 120);
            setLastToolsUsed(toolsUsed);
            setLastProgressUpdates(progressUpdates);
            setLastProgressStepTimes(progressTimes);
            setIsThinking(false);
        }, 600);
    };

    return (
        <div className="chatbot-page">
            <div className="chat-window">
                <div className="messages-area">
                    {messages.map(msg => (
                        <div key={msg.id} className={`message-bubble ${msg.sender}`}>
                            <div className="avatar">
                                {msg.sender === 'bot' ? <Bot size={20} /> : <UserIcon size={20} />}
                            </div>
                            <div className="text">{msg.text}</div>
                        </div>
                    ))}
                    {isThinking && (
                        <div className="message-bubble bot">
                            <div className="avatar"><Bot size={20} /></div>
                            <div className="text thinking-card">
                                <div className="thinking-title">Thinking...</div>
                                <div className="thinking-steps">
                                    {THINKING_FLOW.map((step, idx) => {
                                        const done = idx < thinkingStepIndex;
                                        const active = idx === thinkingStepIndex;
                                        return (
                                            <div key={step} className={`thinking-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                                                <span className="thinking-dot" />
                                                <span>{step}</span>
                                                <span className="thinking-step-time">{formatStepTime(thinkingStepTimes[idx])}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="input-area">
                    {!!lastToolsUsed.length && (
                        <div className="tools-panel">
                            <div className="tools-heading-row">
                                <div className="tools-heading">Tools used & progress</div>
                                <button type="button" className="collapse-btn" onClick={() => setShowTracePanel((prev) => !prev)}>
                                    {showTracePanel ? 'Collapse' : 'Expand'}
                                </button>
                            </div>
                            {showTracePanel && (
                                <>
                                    <div className="tool-chips">
                                        {lastToolsUsed.map((tool) => <span key={tool} className="tool-chip">{tool}</span>)}
                                    </div>
                                    {!!lastProgressUpdates.length && (
                                        <div className="progress-list">
                                            {lastProgressUpdates.map((update, idx) => (
                                                <div key={`${update}-${idx}`} className="progress-item">
                                                    <span className="progress-index">{idx + 1}</span>
                                                    <span>{update}</span>
                                                    <span className="progress-time">{formatStepTime(lastProgressStepTimes[idx])}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        type="text"
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about your riding..."
                    />
                    <button onClick={handleSend} disabled={isThinking}><Send size={20} /></button>
                </div>
            </div>
            <style>{`
                .chatbot-page { height: calc(100vh - 140px); display: flex; flex-direction: column; }
                .chat-window { flex: 1; display: flex; flex-direction: column; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden; }
                .messages-area { flex: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; }
                .message-bubble { display: flex; gap: 0.8rem; max-width: 80%; }
                .message-bubble.user { align-self: flex-end; flex-direction: row-reverse; }
                .message-bubble .text { padding: 0.8rem 1rem; border-radius: 12px; line-height: 1.4; }
                .message-bubble.bot .text { background: var(--bg-secondary); color: var(--text-primary); border-top-left-radius: 2px; }
                .message-bubble.user .text { background: var(--accent-primary); color: white; border-top-right-radius: 2px; }
                .avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); }
                .thinking-card { min-width: 250px; }
                .thinking-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: var(--accent-primary); margin-bottom: 0.5rem; }
                .thinking-steps { display: grid; gap: 0.35rem; }
                .thinking-step { display: flex; align-items: center; gap: 0.45rem; font-size: 0.78rem; color: var(--text-muted); }
                .thinking-step.done { color: #22c55e; }
                .thinking-step.active { color: var(--text-primary); }
                .thinking-step-time { margin-left: auto; font-size: 0.68rem; color: var(--text-muted); font-family: monospace; }
                .thinking-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(148,163,184,0.9); box-shadow: 0 0 0 0 rgba(0,182,212,0.5); }
                .thinking-step.done .thinking-dot { background: #22c55e; }
                .thinking-step.active .thinking-dot { background: #00b6d4; animation: thinkingPulse 1.2s infinite; }
                @keyframes thinkingPulse { 0% { box-shadow: 0 0 0 0 rgba(0,182,212,0.45); } 70% { box-shadow: 0 0 0 8px rgba(0,182,212,0); } 100% { box-shadow: 0 0 0 0 rgba(0,182,212,0); } }
                .input-area { padding: 1rem; border-top: 1px solid var(--border-color); display: flex; gap: 0.8rem; flex-wrap: wrap; }
                .tools-panel { width: 100%; border: 1px solid var(--border-color); background: var(--bg-secondary); border-radius: 8px; padding: 0.55rem 0.65rem; display: grid; gap: 0.45rem; }
                .tools-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
                .tools-heading { font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.45px; }
                .collapse-btn { border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); border-radius: 6px; padding: 0.14rem 0.5rem; font-size: 0.68rem; cursor: pointer; }
                .collapse-btn:hover { color: var(--text-primary); border-color: var(--accent-primary); }
                .tool-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
                .tool-chip { font-size: 0.72rem; color: var(--text-primary); border: 1px solid rgba(0,182,212,0.35); background: rgba(0,182,212,0.08); padding: 0.16rem 0.45rem; border-radius: 999px; }
                .progress-list { display: grid; gap: 0.28rem; }
                .progress-item { display: flex; align-items: flex-start; gap: 0.45rem; font-size: 0.74rem; color: var(--text-muted); }
                .progress-index { display: inline-flex; align-items: center; justify-content: center; min-width: 15px; height: 15px; font-size: 0.66rem; border-radius: 50%; background: rgba(220,0,0,0.2); color: var(--accent-primary); font-weight: 700; }
                .progress-time { margin-left: auto; font-size: 0.68rem; color: var(--text-muted); font-family: monospace; }
                .input-area input { flex: 1; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.8rem; border-radius: 8px; color: white; font-family: var(--font-body); outline: none; }
                .input-area input:focus { border-color: var(--accent-primary); }
                .input-area button { background: var(--accent-primary); color: white; width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
                .input-area button:hover { background: var(--accent-secondary); }
                .input-area button:disabled { opacity: 0.6; cursor: not-allowed; }
            `}</style>
        </div>
    );
};

export default ChatbotPage;

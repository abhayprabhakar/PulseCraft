import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Cpu, AlertCircle, RefreshCcw, LayoutPanelLeft, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine
} from 'recharts';
import { ridesApi, AiPersona, LlmProviderOption } from '../services/api';
import { CustomSelect } from '../components/Controls/CustomSelect';

interface TelemetryPoint {
    timestamp_ms: number;
    speed_kph: number;
    rpm: number;
    throttle: number;
    engine_rpm?: number;
    calculated_gear?: number;
    coolant_temp_c?: number;
    timeLabel: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    toolsUsed?: string[];
    mcpActive?: boolean;
    mcpTools?: string[];
}

const hasMcpToolTrace = (tools?: string[]) => (tools || []).some((tool) => /\bmcp\b/i.test(tool));
const extractMcpToolNames = (tools?: string[]) => (tools || []).filter((tool) => /\bmcp\b/i.test(tool));

function buildChatHistoryForRequest(messages: ChatMessage[], maxItems: number = 12) {
    const starterHint = 'select a range of data on the chart using the **brush slider**';

    return messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .filter((message) => {
            const content = (message.content || '').trim();
            if (!content) return false;
            const normalized = content.toLowerCase();
            if (message.role === 'assistant' && normalized.includes(starterHint)) return false;
            return true;
        })
        .slice(-maxItems)
        .map((message) => ({
            role: message.role,
            content: (message.content || '').trim(),
            timestamp: Date.now(),
        }));
}

function parseElapsedTokenToSeconds(token: string): number | null {
    const match = token.match(/^\+?(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return hours * 3600 + minutes * 60 + seconds;
}

function normalizeElapsedToken(token: string): string {
    const match = token.match(/^\+?(\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
    if (!match) return token;
    return `+${match[1]}`;
}

function normalizeExplicitTimeLinks(markdown: string): string {
    const backtickedTimeLinkRegex = /`\s*(\[\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\]\(time:\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\))\s*`/g;
    const explicitTimeLinkRegex = /\[(\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\(time:(\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?)\)/g;

    const unwrapped = markdown.replace(backtickedTimeLinkRegex, '$1');
    return unwrapped.replace(explicitTimeLinkRegex, (_full, label, target) => {
        const normalizedLabel = normalizeElapsedToken(label);
        const normalizedTarget = normalizeElapsedToken(target);
        return `[${normalizedLabel}](time:${normalizedTarget})`;
    });
}

function enrichMessageWithTimeLinks(markdown: string): string {
    const normalizedInput = normalizeExplicitTimeLinks(markdown);
    const protectedTimeLinks: string[] = [];

    const placeholderInput = normalizedInput.replace(
        /\[\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\]\(time:\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\)/g,
        (match) => {
            const index = protectedTimeLinks.push(match) - 1;
            return `__TIME_LINK_${index}__`;
        },
    );

    const timeRegex = /(^|[^\w])(\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?=$|[^\w])/g;
    const enriched = placeholderInput.replace(timeRegex, (_full, prefix, timeToken) => {
        const normalized = normalizeElapsedToken(timeToken);
        return `${prefix}[${normalized}](time:${normalized})`;
    });

    return enriched.replace(/__TIME_LINK_(\d+)__/g, (_full, idx) => {
        return protectedTimeLinks[Number(idx)] || _full;
    });
}

function extractElapsedTokenFromMarkdownLink(href: string | undefined, children: React.ReactNode): string | null {
    const fromHref = href?.startsWith('time:') ? href.slice('time:'.length) : null;

    const rawChildrenText = Array.isArray(children)
        ? children.map((item) => (typeof item === 'string' ? item : '')).join('')
        : (typeof children === 'string' ? children : '');

    const fromText = /^\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(rawChildrenText)
        ? rawChildrenText
        : null;

    const token = fromHref ?? fromText;
    return token ? normalizeElapsedToken(token) : null;
}

// 'chart' = chart takes 2/3, 'chat' = chat takes 2/3
type LayoutMode = 'chart' | 'chat';

export default function TimeSeriesChatPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [layout, setLayout] = useState<LayoutMode>('chart');

    const [telemetryData, setTelemetryData] = useState<TelemetryPoint[]>([]);
    const [timeRange, setTimeRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
    const [focusedPoint, setFocusedPoint] = useState<TelemetryPoint | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([{
        role: 'assistant',
        content: "Select a range of data on the chart using the **brush slider**, then ask me anything about your performance in that specific section!"
    }]);
    const [inputMessage, setInputMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [personas] = useState<AiPersona[]>(() => {
        try {
            const stored = localStorage.getItem('ts_llm_personas');
            if (stored) return JSON.parse(stored);
        } catch (e) { }
        return [];
    });
    const [activePersonaId, setActivePersonaId] = useState<string>(
        localStorage.getItem('ts_llm_active_persona_id') || ''
    );

    // LLM provider / model (always-visible selectors)
    const [providers, setProviders] = useState<LlmProviderOption[]>([]);
    const [selectedProviderId, setSelectedProviderId] = useState<string>(
        localStorage.getItem('chat_llm_provider') || ''
    );
    const [selectedModel, setSelectedModel] = useState<string>(
        localStorage.getItem('chat_llm_model') || ''
    );

    const [llmNotification, setLlmNotification] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const conversationIdRef = useRef(`ts-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const fetchTelemetry = async () => {
            if (!id) return;
            try {
                setLoading(true);
                const rideDetail = await ridesApi.getDetail(id);

                if (!rideDetail.telemetry_blob || rideDetail.telemetry_blob.length === 0) {
                    setError("No telemetry data found for this ride.");
                    setLoading(false);
                    return;
                }

                const formattedData: TelemetryPoint[] = rideDetail.telemetry_blob.map((point: any) => {
                    const date = new Date(point.timestamp_ms);
                    const min = date.getMinutes().toString().padStart(2, '0');
                    const sec = date.getSeconds().toString().padStart(2, '0');
                    return {
                        ...point,
                        speed_kph: point.speed_kph || point.vehicle_speed_kph || 0,
                        rpm: point.engine_rpm || point.rpm || 0,
                        timeLabel: `${min}:${sec}`
                    };
                });

                setTelemetryData(formattedData);
                setTimeRange({ startIndex: 0, endIndex: formattedData.length - 1 });
            } catch (err: any) {
                setError(err.message || 'Failed to load telemetry data');
            } finally {
                setLoading(false);
            }
        };
        fetchTelemetry();
    }, [id]);

    const activePersona = React.useMemo(() => {
        return personas.find(p => p.id === activePersonaId) || personas[0] || null;
    }, [personas, activePersonaId]);

    useEffect(() => {
        if (activePersonaId) localStorage.setItem('ts_llm_active_persona_id', activePersonaId);
    }, [activePersonaId]);

    // Persist provider / model
    useEffect(() => {
        if (selectedProviderId) localStorage.setItem('chat_llm_provider', selectedProviderId);
    }, [selectedProviderId]);
    useEffect(() => {
        if (selectedModel) localStorage.setItem('chat_llm_model', selectedModel);
    }, [selectedModel]);

    // Fetch providers from server
    useEffect(() => {
        ridesApi.getLlmProviders().then(res => {
            const list = res.providers || [];
            setProviders(list);
            if (!selectedProviderId && res.default_provider_id) {
                setSelectedProviderId(res.default_provider_id);
                const defProv = list.find(p => p.id === res.default_provider_id);
                if (defProv && !selectedModel) setSelectedModel(defProv.default_model);
            }
        }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleBrushChange = (newRange: any) => {
        if (newRange && newRange.startIndex !== undefined && newRange.endIndex !== undefined) {
            setTimeRange({ startIndex: newRange.startIndex, endIndex: newRange.endIndex });
        }
    };

    const focusFromElapsedToken = useCallback((elapsedToken: string) => {
        const elapsedSec = parseElapsedTokenToSeconds(elapsedToken);
        if (elapsedSec === null || telemetryData.length === 0) return;

        const baseTimestampMs = telemetryData[0].timestamp_ms;
        const targetTimestampMs = baseTimestampMs + elapsedSec * 1000;

        let nearestIndex = 0;
        let nearestDiff = Math.abs(telemetryData[0].timestamp_ms - targetTimestampMs);
        for (let index = 1; index < telemetryData.length; index++) {
            const diff = Math.abs(telemetryData[index].timestamp_ms - targetTimestampMs);
            if (diff < nearestDiff) {
                nearestDiff = diff;
                nearestIndex = index;
            }
        }

        const nearestPoint = telemetryData[nearestIndex];
        setFocusedPoint(nearestPoint);

        if (!timeRange || nearestIndex < timeRange.startIndex || nearestIndex > timeRange.endIndex) {
            const windowSize = 120;
            const startIndex = Math.max(0, nearestIndex - windowSize);
            const endIndex = Math.min(telemetryData.length - 1, nearestIndex + windowSize);
            setTimeRange({ startIndex, endIndex });
        }
    }, [telemetryData, timeRange]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputMessage.trim() || !id || !timeRange || !telemetryData.length) return;

        const userQuery = inputMessage.trim();
        const history = buildChatHistoryForRequest(messages, 12);
        setInputMessage('');
        setLlmNotification(null);
        setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
        setIsTyping(true);

        try {
            const startPoint = telemetryData[timeRange.startIndex].timestamp_ms;
            const endPoint = telemetryData[timeRange.endIndex].timestamp_ms;
            const lowQuotaMode = localStorage.getItem('low_quota_mode') === '1';
            // provider/model from explicit selectors; fall back to persona
            const resolvedProvider = selectedProviderId || activePersona?.providerId || undefined;
            const resolvedModel = selectedModel || activePersona?.modelId || undefined;
            
            // Read global provider API keys from Settings page
            let globalApiKeys: Record<string, string> = {};
            try {
                const storedKeys = localStorage.getItem('ts_api_keys');
                if (storedKeys) globalApiKeys = JSON.parse(storedKeys);
            } catch (e) {
                console.error("Failed to parse ts_api_keys");
            }
            
            const apiKey = activePersona?.apiKey || (resolvedProvider ? globalApiKeys[resolvedProvider] : undefined) || undefined;

            const response = await ridesApi.chatWithTelemetry(id, {
                prompt: userQuery,
                start_time_ms: startPoint,
                end_time_ms: endPoint,
                llm_provider: resolvedProvider,
                llm_model: resolvedModel,
                system_prompt: activePersona?.rolePrompt || undefined,
                api_key: apiKey,
                low_quota_mode: lowQuotaMode,
                conversation_id: conversationIdRef.current,
                history,
            });
            const toolsUsed = response.tools_used || [];
            const mcpTools = extractMcpToolNames(toolsUsed);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.answer,
                toolsUsed,
                mcpActive: hasMcpToolTrace(toolsUsed),
                mcpTools,
            }]);
        } catch (err: any) {
            const retryAfter = err?.info?.retry_after_seconds;
            const provider = err?.info?.provider;
            const model = err?.info?.model;
            const baseMessage = err?.message || 'Failed to analyze data.';

            const parts = [baseMessage];
            if (provider || model) {
                parts.push(`Provider: ${provider || 'unknown'}${model ? ` · Model: ${model}` : ''}`);
            }
            if (retryAfter) {
                parts.push(`Retry after ~${retryAfter}s or switch provider/model.`);
            }
            setLlmNotification(parts.join(' '));

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ ${baseMessage}${retryAfter ? `\n\nTip: wait ~${retryAfter}s or switch model/provider from the selector.` : ''}`
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const chartFlex = layout === 'chart' ? 2 : 1;
    const chatFlex = layout === 'chat' ? 2 : 1;

    if (loading) {
        return (
            <div className="ts-layout-center">
                <div className="ts-loading-state">
                    <RefreshCcw className="ts-icon-spin" size={32} />
                    <p>Loading Telemetry Matrix...</p>
                </div>
            </div>
        );
    }

    if (error || telemetryData.length === 0) {
        return (
            <div className="ts-layout-center">
                <div className="ts-error-card">
                    <AlertCircle size={48} className="ts-error-icon" />
                    <h2>Analysis Unavailable</h2>
                    <p>{error || "No telemetry recordings found."}</p>
                    <button className="ts-btn-primary" onClick={() => navigate(-1)}>Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="ts-page">
            {/* Header */}
            <header className="ts-header">
                <button className="ts-btn-icon" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div className="ts-header-titles">
                    <h1><Cpu size={20} className="ts-accent" /> Time Series & AI Analysis</h1>
                    <p>Brush over the chart to select a time slice, then ask the AI to analyze it.</p>
                </div>

                {!!personas.length && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginRight: '0.8rem' }}>
                        <CustomSelect
                            value={activePersonaId || personas[0]?.id || ''}
                            options={personas.map(p => ({ value: p.id, label: p.name, subtitle: `${p.providerId} · ${p.modelId}` }))}
                            onChange={(nextPersonaId) => setActivePersonaId(nextPersonaId)}
                            className="ts-header-select"
                        />
                    </div>
                )}

                {/* Layout Toggle */}
                <div className="ts-layout-toggle">
                    <button
                        className={`ts-toggle-btn ${layout === 'chart' ? 'active' : ''}`}
                        onClick={() => setLayout('chart')}
                        title="Chart Dominant"
                    >
                        <LayoutPanelLeft size={16} />
                        Chart
                    </button>
                    <button
                        className={`ts-toggle-btn ${layout === 'chat' ? 'active' : ''}`}
                        onClick={() => setLayout('chat')}
                        title="Chat Dominant"
                    >
                        <MessageSquare size={16} />
                        Chat
                    </button>
                </div>
            </header>

            {/* Main content */}
            <div className="ts-main">
                {/* Chart Section */}
                <div className="ts-chart-section" style={{ flex: chartFlex }}>
                    <div className="ts-chart-card">
                        <div className="ts-card-header">
                            <h3>Telemetry Timeline</h3>
                            {timeRange && (
                                <span className="ts-badge">
                                    Selected: {telemetryData[timeRange.startIndex]?.timeLabel} – {telemetryData[timeRange.endIndex]?.timeLabel}
                                </span>
                            )}
                        </div>
                        <div className="ts-chart-wrapper">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={telemetryData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                    <XAxis dataKey="timeLabel" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickMargin={8} />
                                    <YAxis yAxisId="left" stroke="var(--accent-primary)" tick={{ fill: 'var(--accent-primary)', fontSize: 11 }} domain={['auto', 'auto']} />
                                    <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tick={{ fill: '#f59e0b', fontSize: 11 }} domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} labelStyle={{ color: 'var(--text-secondary)' }} />
                                    <Legend wrapperStyle={{ paddingTop: '12px' }} />
                                    <Line yAxisId="left" type="monotone" dataKey="speed_kph" name="Speed (km/h)" stroke="var(--accent-primary)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                                    <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                                    {focusedPoint && (
                                        <ReferenceLine
                                            x={focusedPoint.timeLabel}
                                            stroke="var(--accent-primary)"
                                            strokeOpacity={0.9}
                                            strokeDasharray="5 4"
                                        />
                                    )}
                                    <Brush
                                        dataKey="timeLabel"
                                        height={36}
                                        stroke="var(--border-color)"
                                        fill="var(--bg-secondary)"
                                        travellerWidth={10}
                                        onChange={handleBrushChange}
                                        startIndex={timeRange?.startIndex}
                                        endIndex={timeRange?.endIndex}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Chat Section */}
                <div className="ts-chat-section" style={{ flex: chatFlex }}>
                    {/* Messages */}
                    <div className="ts-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`ts-msg-row ts-msg-${msg.role}`}>
                                <div className={`ts-bubble ts-bubble-${msg.role}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="ts-bubble-author">
                                            <span className="ts-bubble-author-main"><Cpu size={11} /> Raptor AI</span>
                                            {msg.mcpActive && (
                                                <span
                                                    className="ts-mcp-indicator"
                                                    title={msg.mcpTools?.length
                                                        ? `MCP tools: ${msg.mcpTools.join(', ')}`
                                                        : 'MCP tools were called for this response'}
                                                >
                                                    MCP Active
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="ts-bubble-content">
                                        <ReactMarkdown
                                            components={{
                                                a: ({ href, children }) => {
                                                    const elapsedToken = extractElapsedTokenFromMarkdownLink(href, children);
                                                    if (elapsedToken) {
                                                        return (
                                                            <button
                                                                type="button"
                                                                className="ts-time-link"
                                                                onClick={() => focusFromElapsedToken(elapsedToken)}
                                                                title={`Jump to ${elapsedToken}`}
                                                            >
                                                                {elapsedToken}
                                                            </button>
                                                        );
                                                    }
                                                    if (!href) return <span>{children}</span>;
                                                    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                                                }
                                            }}
                                        >
                                            {msg.role === 'assistant' ? enrichMessageWithTimeLinks(msg.content) : msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="ts-msg-row ts-msg-assistant">
                                <div className="ts-bubble ts-bubble-assistant ts-typing">
                                    <span /><span /><span />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* LLM selector row */}
                    <div className="ts-llm-row">
                        <span className="ts-llm-label">Model:</span>
                        {providers.length > 0 ? (
                            <>
                                <select
                                    className="ts-llm-select"
                                    value={selectedProviderId}
                                    onChange={e => {
                                        const pid = e.target.value;
                                        setSelectedProviderId(pid);
                                        const prov = providers.find(p => p.id === pid);
                                        setSelectedModel(prov?.default_model || '');
                                    }}
                                >
                                    {providers.map(p => (
                                        <option key={p.id} value={p.id}>{p.label}</option>
                                    ))}
                                </select>
                                <span className="ts-llm-divider" />
                                <select
                                    className="ts-llm-select ts-llm-select-model"
                                    value={selectedModel}
                                    onChange={e => setSelectedModel(e.target.value)}
                                >
                                    {(providers.find(p => p.id === selectedProviderId)?.models || []).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <span className="ts-llm-loading">Loading…</span>
                        )}
                    </div>

                    {/* Input */}
                    <div className="ts-input-area">
                        {llmNotification && (
                            <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.5)', background: 'rgba(245, 158, 11, 0.12)', color: '#fcd34d', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
                                <span>{llmNotification}</span>
                                <button type="button" onClick={() => setLlmNotification(null)} style={{ background: 'transparent', border: 'none', color: '#fcd34d', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
                            </div>
                        )}
                        <form onSubmit={handleSendMessage} className="ts-form">
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                placeholder="Ask about this specific data range..."
                                disabled={isTyping}
                                className="ts-input"
                            />
                            <button type="submit" disabled={isTyping || !inputMessage.trim()} className="ts-send-btn">
                                <Send size={15} />
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <style>{`
                /* Page shell */
                .ts-page { display:flex; flex-direction:column; height:100vh; width:100vw; position:fixed; top:0; left:0; overflow:hidden; background:var(--bg-primary); color:var(--text-primary); z-index:1000; }

                /* Header */
                .ts-header { flex:none; display:flex; align-items:center; gap:1rem; padding:0.85rem 1.5rem; border-bottom:1px solid var(--border-color); background:var(--bg-secondary); }
                .ts-btn-icon { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0.4rem; border-radius:8px; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
                .ts-btn-icon:hover { background:var(--bg-card); color:var(--text-primary); }
                .ts-header-titles { flex:1; }
                .ts-header-titles h1 { font-size:1.15rem; font-weight:600; display:flex; align-items:center; gap:0.5rem; margin:0; color:var(--text-primary); }
                .ts-header-titles p { font-size:0.8rem; color:var(--text-muted); margin:0.15rem 0 0; }
                .ts-accent { color:var(--accent-primary); }

                /* Layout toggle */
                .ts-layout-toggle { display:flex; gap:4px; background:var(--bg-card); padding:4px; border-radius:10px; border:1px solid var(--border-color); flex-shrink:0; }
                .ts-toggle-btn { display:flex; align-items:center; gap:6px; padding:0.4rem 0.8rem; border:none; border-radius:7px; background:transparent; color:var(--text-muted); cursor:pointer; font-size:0.82rem; font-weight:500; transition:all 0.2s; }
                .ts-toggle-btn.active { background:var(--accent-primary); color:white; }
                .ts-toggle-btn:not(.active):hover { background:var(--bg-secondary); color:var(--text-primary); }

                /* Main split */
                .ts-main { flex:1; display:flex; overflow:hidden; transition:all 0.3s ease; }

                /* Chart section */
                .ts-chart-section { display:flex; flex-direction:column; padding:1.25rem; border-right:1px solid var(--border-color); transition:flex 0.3s ease; overflow:hidden; }
                .ts-chart-card { flex:1; background:var(--bg-card); border-radius:12px; border:1px solid var(--border-color); display:flex; flex-direction:column; padding:1.25rem; overflow:hidden; }
                .ts-card-header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:0.85rem; margin-bottom:1.1rem; }
                .ts-card-header h3 { margin:0; font-size:1rem; color:var(--text-secondary); }
                .ts-badge { background:rgba(0,182,212,0.1); color:var(--accent-primary); border:1px solid rgba(0,182,212,0.2); padding:0.2rem 0.65rem; border-radius:9999px; font-size:0.73rem; font-family:monospace; }
                .ts-chart-wrapper { flex:1; min-height:0; }

                /* Chat section */
                .ts-chat-section { display:flex; flex-direction:column; background:var(--bg-secondary); transition:flex 0.3s ease; overflow:hidden; }
                .ts-messages { flex:1; overflow-y:auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; }
                .ts-msg-row { display:flex; width:100%; }
                .ts-msg-user { justify-content:flex-end; }
                .ts-msg-assistant { justify-content:flex-start; }

                /* Bubbles */
                .ts-bubble { max-width:88%; padding:0.85rem 1rem; border-radius:14px; font-size:0.88rem; line-height:1.6; }
                .ts-bubble-user { background:rgba(0,182,212,0.12); border:1px solid rgba(0,182,212,0.25); color:white; border-bottom-right-radius:3px; }
                .ts-bubble-assistant { background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-secondary); border-bottom-left-radius:3px; }
                .ts-bubble-author { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:0.7rem; font-weight:700; color:var(--accent-primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.5rem; }
                .ts-bubble-author-main { display:inline-flex; align-items:center; gap:5px; }
                .ts-mcp-indicator { font-size:0.62rem; font-weight:700; letter-spacing:0.35px; text-transform:uppercase; color:#fca5a5; border:1px solid rgba(220,0,0,0.45); background:rgba(220,0,0,0.14); border-radius:999px; padding:0.08rem 0.38rem; white-space:nowrap; cursor:help; }

                /* Markdown styles inside bubbles */
                .ts-bubble-content p { margin:0 0 0.6em; }
                .ts-bubble-content p:last-child { margin:0; }
                .ts-bubble-content strong { color:var(--text-primary); font-weight:600; }
                .ts-bubble-content em { color:var(--text-secondary); font-style:italic; }
                .ts-bubble-content code { background:rgba(255,255,255,0.08); padding:0.1em 0.35em; border-radius:4px; font-family:monospace; font-size:0.85em; color:#e2e8f0; }
                .ts-bubble-content pre { background:rgba(0,0,0,0.3); border:1px solid var(--border-color); padding:0.75rem; border-radius:8px; overflow-x:auto; margin:0.6em 0; }
                .ts-bubble-content pre code { background:none; padding:0; }
                .ts-bubble-content ul, .ts-bubble-content ol { margin:0.4em 0 0.6em 1.2em; padding:0; }
                .ts-bubble-content li { margin:0.25em 0; }
                .ts-bubble-content h1,.ts-bubble-content h2,.ts-bubble-content h3 { color:var(--text-primary); margin:0.5em 0 0.3em; font-weight:600; }
                .ts-bubble-content h3 { font-size:0.95em; }
                .ts-bubble-content blockquote { border-left:3px solid var(--accent-primary); margin:0.5em 0; padding:0.3em 0.7em; font-style:italic; color:var(--text-muted); }
                .ts-time-link { display:inline-flex; align-items:center; margin:0 0.1rem; border:1px solid var(--accent-primary); background:rgba(0,182,212,0.12); color:var(--accent-primary); border-radius:999px; padding:0.04rem 0.45rem; font-size:0.8em; font-weight:600; cursor:pointer; }
                .ts-time-link:hover { filter:brightness(1.08); }

                /* Typing indicator */
                .ts-typing { display:flex; gap:4px; align-items:center; justify-content:center; padding:0.85rem 1.25rem; }
                .ts-typing span { width:6px; height:6px; background:var(--text-muted); border-radius:50%; animation:ts-bounce 1.3s infinite ease-in-out both; }
                .ts-typing span:nth-child(1) { animation-delay:-0.32s; }
                .ts-typing span:nth-child(2) { animation-delay:-0.16s; }
                @keyframes ts-bounce { 0%,80%,100% { transform:scale(0); } 40% { transform:scale(1); } }

                /* Input area */
                .ts-input-area { padding:0.9rem 1.25rem; background:var(--bg-card); border-top:1px solid var(--border-color); }
                .ts-form { position:relative; display:flex; align-items:center; }
                .ts-input { width:100%; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); padding:0.8rem 2.75rem 0.8rem 1rem; border-radius:10px; font-size:0.92rem; outline:none; transition:border-color 0.2s; }
                .ts-input:focus { border-color:var(--accent-primary); }
                .ts-input:disabled { opacity:0.5; cursor:not-allowed; }
                .ts-send-btn { position:absolute; right:0.4rem; background:var(--accent-primary); color:white; border:none; width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background 0.2s; }
                .ts-send-btn:hover:not(:disabled) { opacity:0.85; }
                .ts-send-btn:disabled { background:var(--border-color); color:var(--text-muted); cursor:not-allowed; }

                /* Loading / Error states */
                .ts-layout-center { display:flex; height:100vh; align-items:center; justify-content:center; background:var(--bg-primary); color:var(--text-primary); }
                .ts-loading-state { display:flex; flex-direction:column; align-items:center; color:var(--text-muted); gap:1rem; }
                .ts-icon-spin { animation:ts-spin 1.8s linear infinite; color:var(--accent-primary); }
                @keyframes ts-spin { 100% { transform:rotate(360deg); } }
                .ts-error-card { background:var(--bg-card); border:1px solid rgba(220,0,0,0.3); padding:2rem; border-radius:16px; text-align:center; max-width:400px; }
                .ts-error-icon { color:#dc0000; margin:0 auto 1rem; }
                .ts-error-card h2 { margin:0 0 0.5rem; font-size:1.25rem; color:white; }
                .ts-error-card p { color:var(--text-muted); margin-bottom:1.5rem; }
                .ts-btn-primary { background:var(--bg-secondary); border:1px solid var(--border-color); color:white; padding:0.75rem 1.5rem; border-radius:8px; cursor:pointer; transition:all 0.2s; font-weight:500; }
                .ts-btn-primary:hover { border-color:var(--accent-primary); color:var(--accent-primary); }

                /* LLM selector row */
                .ts-llm-row { display:flex; align-items:center; gap:0.5rem; background:#111118; border-top:1px solid var(--border-color); padding:0.4rem 1rem; flex-shrink:0; min-height:36px; }
                .ts-llm-label { font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:#71717a; white-space:nowrap; flex-shrink:0; }
                .ts-llm-select { background:#1c1c26; border:1px solid #2e2e40; color:#d4d4d8; font-size:0.78rem; cursor:pointer; outline:none; font-family:inherit; padding:0.25rem 0.5rem; border-radius:6px; }
                .ts-llm-select:hover { border-color:var(--accent-primary); color:#fff; }
                .ts-llm-select-model { max-width:220px; }
                .ts-llm-select option { background:#1c1c26; color:#fff; }
                .ts-llm-divider { width:1px; height:16px; background:#2e2e40; flex-shrink:0; }
                .ts-llm-loading { font-size:0.74rem; color:#71717a; font-style:italic; }
            `}</style>
        </div>
    );
}

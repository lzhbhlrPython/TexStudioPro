export interface AiSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export async function aiChat(settings: AiSettings, system: string, user: string): Promise<string> {
  if (!settings.enabled) throw new Error('AI is disabled in Settings');
  if (!settings.apiKey.trim()) throw new Error('Add an API key in Settings');
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI request failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ''}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('AI returned an empty response');
  return content.trim();
}

export interface AgentAction {
  type: 'insert' | 'replace-selection' | 'replace-document';
  text: string;
  reason?: string;
}

export function parseAgentActions(text: string): AgentAction[] {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      const actions = Array.isArray(parsed) ? parsed : parsed?.actions;
      if (!Array.isArray(actions)) continue;
      return actions
        .filter((action) => action && typeof action.text === 'string' && ['insert', 'replace-selection', 'replace-document'].includes(action.type))
        .map((action) => ({ type: action.type, text: action.text, reason: typeof action.reason === 'string' ? action.reason : undefined }));
    } catch {
      // try the next candidate
    }
  }
  return [];
}

export async function aiChatStream(
  settings: AiSettings,
  system: string,
  user: string,
  onDelta: (delta: string, full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!settings.enabled) throw new Error('AI is disabled in Settings');
  if (!settings.apiKey.trim()) throw new Error('Add an API key in Settings');
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      temperature: 0.2,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI request failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ''}`);
  }
  if (!response.body) {
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI returned an empty response');
    onDelta(content, content);
    return content;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
          if (delta) {
            full += delta;
            onDelta(delta, full);
          }
        } catch {
          // ignore keepalive/partial events
        }
      }
    }
  }
  if (!full) throw new Error('AI returned an empty stream');
  return full;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export interface Session {
  session_id: string;
  user_id?: string;
  started_at: string;
  ended_at?: string;
  last_activity_at: string;
  page_url: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  viewport_width?: number;
  viewport_height?: number;
  duration_seconds?: number;
  pages_visited?: number;
  click_count?: number;
  input_count?: number;
  scroll_count?: number;
  mousemove_count?: number;
  navigation_count?: number;
  screenshot_count?: number;
}

export interface SessionEvent {
  event_id: number;
  session_id: string;
  timestamp: string;
  event_type: string;
  target_element?: string;
  target_selector?: string;
  target_tag?: string;
  target_id?: string;
  target_class?: string;
  page_url: string;
  viewport_x?: number;
  viewport_y?: number;
  screen_x?: number;
  screen_y?: number;
  scroll_x?: number;
  scroll_y?: number;
  input_value?: string;
  input_masked?: boolean;
  key_pressed?: string;
  mouse_button?: number;
  click_count?: number;
  event_data?: Record<string, any>;
}

export interface Screenshot {
  screenshot_id: number;
  session_id: string;
  page_url: string;
  timestamp: string;
  image_format: string;
  image_width?: number;
  image_height?: number;
  file_size?: number;
  data_url?: string;
}

export async function fetchSessions(limit = 50, offset = 0): Promise<{ data: Session[]; total: number }> {
  const response = await fetch(`${API_URL}/sessions?limit=${limit}&offset=${offset}`);
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

export async function fetchSession(sessionId: string): Promise<Session> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}`);
  if (!response.ok) throw new Error('Failed to fetch session');
  return response.json();
}

export async function fetchSessionEvents(sessionId: string): Promise<{ data: SessionEvent[]; total: number }> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/events?limit=10000`);
  if (!response.ok) throw new Error('Failed to fetch events');
  return response.json();
}

export async function fetchSessionScreenshots(sessionId: string, includeData = true): Promise<{ data: Screenshot[] }> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/screenshots?include_data=${includeData}`);
  if (!response.ok) throw new Error('Failed to fetch screenshots');
  return response.json();
}

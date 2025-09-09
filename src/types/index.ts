export interface Client {
  id: string;
  phone: string;
  name?: string;
  last_message?: string;
  last_message_at?: string;
  status: 'bot' | 'operator' | 'closed';
  client_type?: 'existing' | 'prospect';
  conversation_state?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  client: Client;
  operator_id?: string;
  operator?: Operator;
  status: 'active' | 'waiting' | 'assigned' | 'closed';
  started_at: string;
  ended_at?: string;
  last_message_at: string;
  unread_count: number;
  last_activity?: string;
  inactivity_timer?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'client' | 'operator' | 'bot';
  sender_id?: string;
  content: string;
  message_type: 'text' | 'image' | 'document' | 'audio';
  timestamp: string;
  is_read: boolean;
  file_url?: string;
 // created_at: string;
}

export interface Operator {
  id: string;
  name: string;
  email: string;
  status: 'online' | 'offline' | 'busy';
  last_activity?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppStatus {
  is_connected: boolean;
  qr_code: string | null;
  phone_number: string | null;
  last_connected: string | null;
}
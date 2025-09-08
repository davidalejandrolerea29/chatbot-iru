export interface Operator {
  id: string;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  is_online: boolean;
  created_at: string;
  last_login: string | null;
}

export interface Client {
  id: string;
  phone: string;
  name: string | null;
  last_message: string | null;
  last_message_at: string;
  status: 'initial' | 'choosing_type' | 'client_menu' | 'non_client_menu' | 'waiting_operator' | 'bot' | 'operator' | 'closed';
  assigned_operator_id: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'client' | 'operator' | 'bot';
  sender_id: string | null;
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'document';
  timestamp: string;
  is_read: boolean;
}

export interface Conversation {
  id: string;
  client_id: string;
  operator_id: string | null;
  status: 'active' | 'waiting' | 'closed';
  started_at: string;
  ended_at: string | null;
  last_message_at: string;
  client: Client;
  operator: Operator | null;
  unread_count: number;
}

export interface WhatsAppStatus {
  is_connected: boolean;
  qr_code: string | null;
  phone_number: string | null;
  last_connected: string | null;
}
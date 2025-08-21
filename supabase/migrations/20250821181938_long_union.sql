/*
# Create messages table

1. New Tables
   - `messages`
     - `id` (uuid, primary key)
     - `conversation_id` (uuid, not null, foreign key to conversations)
     - `sender_type` ('client' | 'operator' | 'bot', not null)
     - `sender_id` (uuid, nullable - null for bot messages)
     - `content` (text, not null)
     - `message_type` ('text' | 'image' | 'audio' | 'document', default 'text')
     - `timestamp` (timestamp with timezone, default now())
     - `is_read` (boolean, default false)

2. Security
   - Enable RLS on `messages` table
   - Add policies for operators to read messages in conversations
   - Add policies for operators to insert messages
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client', 'operator', 'bot')),
  sender_id uuid, -- References either clients.id or operators.id based on sender_type
  content text NOT NULL,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'document')),
  timestamp timestampz DEFAULT now(),
  is_read boolean DEFAULT false
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Operators can read all messages
CREATE POLICY "Operators can read all messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Operators can insert messages
CREATE POLICY "Operators can insert messages"
  ON messages
  FOR INSERT
  TO authenticated
  USING (true);

-- Allow inserting messages from server (for bot and client messages)
CREATE POLICY "Allow message insertion from server"
  ON messages
  FOR INSERT
  TO service_role
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp 
  ON messages(conversation_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_messages_sender 
  ON messages(sender_type, sender_id);
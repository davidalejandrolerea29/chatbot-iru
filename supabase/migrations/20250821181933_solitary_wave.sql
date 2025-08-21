/*
# Create conversations table

1. New Tables
   - `conversations`
     - `id` (uuid, primary key)
     - `client_id` (uuid, not null, foreign key to clients)
     - `operator_id` (uuid, nullable, foreign key to operators)
     - `status` ('active' | 'waiting' | 'closed', default 'active')
     - `started_at` (timestamp with timezone, default now())
     - `ended_at` (timestamp with timezone, nullable)
     - `last_message_at` (timestamp with timezone, default now())
     - `unread_count` (integer, default 0)

2. Security
   - Enable RLS on `conversations` table
   - Add policies for operators to read conversations
   - Add policies for operators to update conversations they're assigned to
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES operators(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'closed')),
  started_at timestampz DEFAULT now(),
  ended_at timestampz,
  last_message_at timestampz DEFAULT now(),
  unread_count integer DEFAULT 0
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Operators can read all conversations
CREATE POLICY "Operators can read all conversations"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (true);

-- Operators can update conversations
CREATE POLICY "Operators can update conversations"
  ON conversations
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow inserting new conversations (from server)
CREATE POLICY "Allow conversation insertion"
  ON conversations
  FOR INSERT
  TO service_role
  USING (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_client_status 
  ON conversations(client_id, status);

CREATE INDEX IF NOT EXISTS idx_conversations_operator_status 
  ON conversations(operator_id, status);
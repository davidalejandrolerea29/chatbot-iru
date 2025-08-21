/*
# Create clients table

1. New Tables
   - `clients`
     - `id` (uuid, primary key)
     - `phone` (text, unique, not null)
     - `name` (text, nullable)
     - `last_message` (text, nullable)
     - `last_message_at` (timestamp with timezone, default now())
     - `status` ('bot' | 'operator' | 'closed', default 'bot')
     - `assigned_operator_id` (uuid, nullable, foreign key to operators)

2. Security
   - Enable RLS on `clients` table
   - Add policies for operators to read all clients
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text,
  last_message text,
  last_message_at timestampz DEFAULT now(),
  status text DEFAULT 'bot' CHECK (status IN ('bot', 'operator', 'closed')),
  assigned_operator_id uuid REFERENCES operators(id) ON DELETE SET NULL,
  created_at timestampz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Operators can read all clients
CREATE POLICY "Operators can read all clients"
  ON clients
  FOR SELECT
  TO authenticated
  USING (true);

-- Operators can update client assignments and status
CREATE POLICY "Operators can update clients"
  ON clients
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow inserting new clients (from server)
CREATE POLICY "Allow client insertion"
  ON clients
  FOR INSERT
  TO service_role
  USING (true);
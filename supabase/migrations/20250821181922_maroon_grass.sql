/*
# Create operators table

1. New Tables
   - `operators`
     - `id` (uuid, primary key) - matches auth.users.id
     - `name` (text, not null)
     - `email` (text, unique, not null)
     - `phone` (text, not null)
     - `is_active` (boolean, default true)
     - `is_online` (boolean, default false)
     - `created_at` (timestamp with timezone, default now())
     - `last_login` (timestamp with timezone, nullable)

2. Security
   - Enable RLS on `operators` table
   - Add policy for operators to read their own data
   - Add policy for operators to update their own status
*/

CREATE TABLE IF NOT EXISTS operators (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  is_active boolean DEFAULT true,
  is_online boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  last_login timestamptz
);

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

-- Operators can read their own data
CREATE POLICY "Operators can read own data"
  ON operators
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Operators can update their own status
CREATE POLICY "Operators can update own status"
  ON operators
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Allow operators to read other operators (for the operators view)
CREATE POLICY "Operators can read all operators"
  ON operators
  FOR SELECT
  TO authenticated
  USING (true);
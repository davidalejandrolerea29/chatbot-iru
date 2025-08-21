import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Operator } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  operator: Operator | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, name: string, phone: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  operator: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchOperator(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchOperator(session.user.id);
      } else {
        setOperator(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchOperator = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('operators')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setOperator(data);

      // Update last login and online status
      await supabase
        .from('operators')
        .update({ 
          last_login: new Date().toISOString(),
          is_online: true 
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error fetching operator:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

const signUp = async (email: string, password: string, name: string, phone: string) => {
  // 1️⃣ Crear usuario
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone },
    },
  });

  if (signUpError) return { error: signUpError };

  const userId = signUpData.user?.id;
  if (!userId) return { error: 'No se pudo obtener el ID del usuario' };

  // 2️⃣ Crear operador manualmente
  const { data: operatorData, error: operatorError } = await supabase
    .from('operators')
    .insert([
      {
        id: userId,
        name,
        email,
        phone,
        is_active: true,
        is_online: false,
        created_at: new Date().toISOString(),
      },
    ]);

  return { user: signUpData.user, operatorData, error: operatorError };
};



  const signOut = async () => {
    if (operator) {
      // Set operator offline
      await supabase
        .from('operators')
        .update({ is_online: false })
        .eq('id', operator.id);
    }
    
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    session,
    operator,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
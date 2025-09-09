import { useEffect, useState } from 'react';
import { supabase, Client, Conversation, Message } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const useSupabaseRealtime = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let clientsChannel: RealtimeChannel;
    let conversationsChannel: RealtimeChannel;
    let messagesChannel: RealtimeChannel;

    const fetchInitialData = async () => {
      try {
        const [clientsRes, conversationsRes, messagesRes] = await Promise.all([
          supabase.from('clients').select('*').order('last_message_at', { ascending: false }),
          supabase.from('conversations').select('*').order('last_message_at', { ascending: false }),
          supabase.from('messages').select('*').order('timestamp', { ascending: true })
        ]);

        if (clientsRes.data) setClients(clientsRes.data);
        if (conversationsRes.data) setConversations(conversationsRes.data);
        if (messagesRes.data) setMessages(messagesRes.data);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // --- Realtime subscriptions ---
    clientsChannel = supabase
      .channel('realtime_clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, payload => {
        if (payload.eventType === 'INSERT') setClients(prev => [payload.new as Client, ...prev]);
        else if (payload.eventType === 'UPDATE') setClients(prev => prev.map(c => c.id === payload.new.id ? payload.new as Client : c));
        else if (payload.eventType === 'DELETE') setClients(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();

    conversationsChannel = supabase
      .channel('realtime_conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, payload => {
        if (payload.eventType === 'INSERT') setConversations(prev => [payload.new as Conversation, ...prev]);
        else if (payload.eventType === 'UPDATE') setConversations(prev => prev.map(c => c.id === payload.new.id ? payload.new as Conversation : c));
        else if (payload.eventType === 'DELETE') setConversations(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();

    messagesChannel = supabase
      .channel('realtime_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
        if (payload.eventType === 'INSERT') setMessages(prev => [...prev, payload.new as Message]);
        else if (payload.eventType === 'UPDATE') setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m));
        else if (payload.eventType === 'DELETE') setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      clientsChannel.unsubscribe();
      conversationsChannel.unsubscribe();
      messagesChannel.unsubscribe();
    };
  }, []);

  return {
    clients,
    conversations,
    messages,
    loading
  };
};

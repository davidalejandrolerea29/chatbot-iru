import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Client, Conversation, Message } from '../types';

export const useChatRealtime = (conversationId?: string) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let clientsChannel: any;
    let convChannel: any;
    let messagesChannel: any;

    const fetchInitialData = async () => {
      try {
        const [clientsRes, convRes] = await Promise.all([
          supabase.from('clients').select('*').order('created_at', { ascending: false }),
          supabase
            .from('conversations')
            .select(`
              *,
              client:clients(*),
              assigned_operator:operators!conversations_operator_id_fkey(*),
              closed_by_operator:operators!conversations_closed_by_fkey(*)
            `)
            .order('last_message_at', { ascending: false }),
        ]);

        if (clientsRes.data) setClients(clientsRes.data);
        if (convRes.data) setConversations(convRes.data);

        if (conversationId) {
          const messagesRes = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true });

          if (messagesRes.data) setMessages(messagesRes.data);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // 🔹 Realtime: Clients
    clientsChannel = supabase
      .channel('clients_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setClients((prev) => [payload.new as Client, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setClients((prev) =>
              prev.map((c) => (c.id === payload.new.id ? (payload.new as Client) : c))
            );
          } else if (payload.eventType === 'DELETE') {
            setClients((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // 🔹 Realtime: Conversations
    convChannel = supabase
      .channel('conversations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch complete conversation data with relations
            const { data } = await supabase
              .from('conversations')
              .select(`
                *,
                client:clients(*),
                assigned_operator:operators!conversations_operator_id_fkey(*),
                closed_by_operator:operators!conversations_closed_by_fkey(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (data) {
              setConversations((prev) => [data, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            // Fetch complete updated conversation data
            const { data } = await supabase
              .from('conversations')
              .select(`
                *,
                client:clients(*),
                assigned_operator:operators!conversations_operator_id_fkey(*),
                closed_by_operator:operators!conversations_closed_by_fkey(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (data) {
              setConversations((prev) =>
                prev.map((c) => (c.id === data.id ? data : c))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // 🔹 Realtime: Messages (solo si estoy en un chat)
    if (conversationId) {
      messagesChannel = supabase
        .channel(`messages_${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setMessages((prev) => [...prev, payload.new as Message]);
            } else if (payload.eventType === 'UPDATE') {
              setMessages((prev) =>
                prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
              );
            } else if (payload.eventType === 'DELETE') {
              setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
            }
          }
        )
        .subscribe();
    }

    // Cleanup
    return () => {
      if (clientsChannel) supabase.removeChannel(clientsChannel);
      if (convChannel) supabase.removeChannel(convChannel);
      if (messagesChannel) supabase.removeChannel(messagesChannel);
    };
  }, [conversationId]);

  return {
    clients,
    conversations,
    messages,
    loading,
  };
};
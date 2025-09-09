import React, { useEffect, useState, useRef } from 'react';
import { Send, MoreVertical, User, Bot, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { Message, Conversation } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

interface ChatAreaProps {
  conversation: Conversation | null;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ conversation }) => {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inactivityWarning, setInactivityWarning] = useState(false);

  const { operator } = useAuth();
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesChannelRef = useRef<any>(null);

  // --- Obtener mensajes iniciales ---
  const fetchMessages = async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('timestamp', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Error cargando mensajes');
    } finally {
      setLoading(false);
    }
  };

  // --- Realtime subscription ---
  useEffect(() => {
    if (!conversation) return;

    fetchMessages();

    // Unsubscribe previo
    if (messagesChannelRef.current) {
      messagesChannelRef.current.unsubscribe();
      messagesChannelRef.current = null;
    }

    const channel = supabase
      .channel(`conversation_messages_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => [...prev, payload.new as Message]);
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? payload.new as Message : m))
            );
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    messagesChannelRef.current = channel;

    return () => channel.unsubscribe();
  }, [conversation]);

  // --- Scroll automático ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Inactividad ---
  useEffect(() => {
    if (!conversation) return;

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        if (conversation.status === 'active' && conversation.operator_id === operator?.id) {
          toast.warning('La conversación se cerrará en 5 minutos por inactividad', { duration: 5000 });
        }
      }, 10 * 60 * 1000);
    };
    resetInactivityTimer();

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [conversation, operator]);

  if (!conversation || !conversation.client) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-800">
        <p className="text-gray-400">Selecciona una conversación...</p>
      </div>
    );
  }

  const client = conversation.client;

  const getSenderIcon = (msg: Message) => {
    switch (msg.sender_type) {
      case 'operator': return <User className="w-4 h-4 text-blue-500" />;
      case 'bot': return <Bot className="w-4 h-4 text-purple-500" />;
      default: return <div className="w-4 h-4 bg-green-500 rounded-full" />;
    }
  };

  const getSenderName = (msg: Message) => {
    switch (msg.sender_type) {
      case 'operator': return 'Tú';
      case 'bot': return 'Bot IRU NET';
      default: return 'Cliente';
    }
  };

  // --- Enviar mensaje ---
  const sendMessage = async () => {
    if (!newMessage.trim() || !conversation || !operator || sending) return;
    setSending(true);
    try {
      const message = {
        conversation_id: conversation.id,
        sender_type: 'operator' as const,
        sender_id: operator.id,
        content: newMessage.trim(),
        message_type: 'text' as const,
        timestamp: new Date().toISOString(),
        is_read: false,
      };

      const { error } = await supabase.from('messages').insert([message]);
      if (error) throw error;

      // Actualizar last_message_at en la conversación
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString()
      }).eq('id', conversation.id);

      // Emitir evento de WhatsApp
      socket?.emit('send_whatsapp_message', {
        to: client.phone,
        message: newMessage.trim(),
        conversation_id: conversation.id,
        operator_id: operator.id,
      });

      setNewMessage('');
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  // --- Tomar y cerrar chat ---
  const takeChatControl = async () => {
    if (!conversation || !operator) return;
    try {
      await supabase.from('conversations').update({
        operator_id: operator.id,
        status: 'active',
        last_message_at: new Date().toISOString()
      }).eq('id', conversation.id);

      toast.success('Chat tomado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al tomar chat');
    }
  };

  const closeConversation = async () => {
    if (!conversation || !operator) return;
    if (!window.confirm('¿Cerrar conversación?')) return;
    try {
      await supabase.from('conversations').update({
        status: 'closed',
        ended_at: new Date().toISOString()
      }).eq('id', conversation.id);

      toast.success('Conversación cerrada');
    } catch (err) {
      console.error(err);
      toast.error('Error al cerrar conversación');
    }
  };

  // --- Render ---
  return (
    <div className="flex-1 flex flex-col bg-gray-800">
      {inactivityWarning && (
        <div className="bg-yellow-600 text-white px-4 py-2 text-sm flex items-center space-x-2">
          <Clock className="w-4 h-4" />
          <span>Esta conversación se cerrará automáticamente por inactividad</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-700 p-4 border-b border-gray-600 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center relative">
            <span className="text-sm font-semibold text-white">{client.name?.charAt(0) || 'C'}</span>
          </div>
          <div>
            <p className="font-medium text-white">{client.name || `+${client.phone}`}</p>
            <p className="text-sm text-gray-400">
              {client.client_type === 'existing' ? 'Cliente' :
               client.client_type === 'prospect' ? 'Prospecto' : 'Nuevo contacto'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {conversation.status === 'waiting' && (
            <button
              onClick={takeChatControl}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >Tomar Chat</button>
          )}
          {conversation.status === 'active' && conversation.operator_id === operator?.id && (
            <button
              onClick={closeConversation}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >Cerrar Chat</button>
          )}
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'operator' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.sender_type === 'operator' ? 'bg-green-600 text-white' :
                  msg.sender_type === 'bot' ? 'bg-purple-600 text-white' : 'bg-gray-600 text-white'
                }`}>
                  <div className="flex items-center space-x-2 mb-1">
                    {getSenderIcon(msg)}
                    <span className="text-xs opacity-75">{getSenderName(msg)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {format(new Date(msg.timestamp), 'HH:mm', { locale: es })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      {conversation.status === 'active' && conversation.operator_id === operator?.id && (
        <div className="bg-gray-700 p-4 border-t border-gray-600 flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-gray-600 border border-gray-500 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded-lg transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
};

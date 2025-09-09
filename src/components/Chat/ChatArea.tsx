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
  onConversationUpdate?: (updatedConversation: Conversation) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ 
  conversation: initialConversation, 
  onConversationUpdate 
}) => {
  const [conversation, setConversation] = useState<Conversation | null>(initialConversation);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inactivityWarning, setInactivityWarning] = useState(false);

  const { operator } = useAuth();
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Actualizar estado local cuando cambia la prop
  useEffect(() => {
    setConversation(initialConversation);
  }, [initialConversation]);

  // --- Suscripción realtime para la conversación actual ---
  useEffect(() => {
    if (!conversation?.id) return;

    let conversationChannel: any;

    // Suscribirse a cambios en la conversación actual
    conversationChannel = supabase
      .channel(`conversation_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversation.id}`,
        },
        async (payload) => {
          console.log('Conversation realtime update in ChatArea:', payload);
          
          // Obtener los datos completos de la conversación actualizada
          const { data, error } = await supabase
            .from('conversations')
            .select(`
              *,
              client:clients(*),
              assigned_operator:operators!conversations_operator_id_fkey(*),
              closed_by_operator:operators!conversations_closed_by_fkey(*)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data && !error) {
            setConversation(data);
            
            // Notificar al componente padre
            if (onConversationUpdate) {
              onConversationUpdate(data);
            }

            // Mostrar notificaciones apropiadas
            if (payload.new.status === 'active' && payload.old.status === 'waiting') {
              if (payload.new.operator_id === operator?.id) {
                toast.success('Has tomado el control del chat');
              } else {
                toast.info('Otro operador tomó el control del chat');
              }
            } else if (payload.new.status === 'closed' && payload.old.status === 'active') {
              if (payload.new.closed_by === operator?.id) {
                toast.success('Chat cerrado correctamente');
              } else {
                toast.info('El chat fue cerrado por otro operador');
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (conversationChannel) supabase.removeChannel(conversationChannel);
    };
  }, [conversation?.id, operator?.id, onConversationUpdate]);

  // --- Cargar mensajes y suscripción realtime ---
  useEffect(() => {
    if (!conversation?.id) {
      setMessages([]);
      return;
    }

    let messagesChannel: any;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('timestamp', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Suscripción realtime para mensajes
    messagesChannel = supabase
      .channel(`messages_chat_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          console.log('Message realtime update:', payload);
          
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

    return () => {
      if (messagesChannel) supabase.removeChannel(messagesChannel);
    };
  }, [conversation?.id]);

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
          setInactivityWarning(true);
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

      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString()
      }).eq('id', conversation.id);

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

  // --- Tomar chat ---
  const takeChatControl = async () => {
    if (!conversation || !operator) return;
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          operator_id: operator.id,
          status: 'active',
          last_message_at: new Date().toISOString()
        })
        .eq('id', conversation.id);

      if (error) throw error;
      
      // El estado se actualizará automáticamente via realtime
    } catch (err) {
      console.error(err);
      toast.error('Error al tomar chat');
    }
  };

  // --- Cerrar conversación ---
const closeConversation = async () => {
  if (!conversation || !operator) return;
  if (!window.confirm('¿Cerrar conversación?')) return;
  
  try {
    // 1. Actualizar estado de la conversación
    const { error: convError } = await supabase
      .from('conversations')
      .update({
        status: 'closed',
        ended_at: new Date().toISOString(),
        closed_by: operator.id
      })
      .eq('id', conversation.id);

    if (convError) throw convError;

    // 2. Insertar mensaje de sistema
    const systemMessage = {
      conversation_id: conversation.id,
      sender_type: 'system' as const, // Nuevo tipo: "system"
      sender_id: operator.id,        // opcional, puede ser null
      content: 'El chat ha sido cerrado por el operador.',
      message_type: 'system' as const,
      timestamp: new Date().toISOString(),
      is_read: true,
    };

    const { error: msgError } = await supabase
      .from('messages')
      .insert([systemMessage]);

    if (msgError) throw msgError;

    // 3. Emitir también a WhatsApp si querés notificar al cliente
    socket?.emit('send_whatsapp_message', {
      to: client.phone,
      message: 'La conversación ha sido cerrada. ¡Gracias por comunicarte!',
      conversation_id: conversation.id,
      operator_id: operator.id,
    });

    // El estado se actualizará automáticamente via realtime
  } catch (err) {
    console.error(err);
    toast.error('Error al cerrar conversación');
  }
};

  // Verificar si el operador actual puede interactuar con el chat
  const canInteract = conversation.status === 'active' && conversation.operator_id === operator?.id;
  const canTakeChat = conversation.status === 'waiting';
  const canCloseChat = conversation.status === 'active' && conversation.operator_id === operator?.id;

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
          {/* Indicador de estado */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              conversation.status === 'active' ? 'bg-green-500' :
              conversation.status === 'waiting' ? 'bg-yellow-500' : 'bg-gray-500'
            }`} />
            <span className="text-xs text-gray-400">
              {conversation.status === 'active' ? 
                (conversation.operator_id === operator?.id ? 'Controlado por ti' : 'Controlado por otro operador') :
                conversation.status === 'waiting' ? 'Esperando operador' : 'Cerrado'
              }
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {canTakeChat && (
            <button
              onClick={takeChatControl}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Tomar Chat
            </button>
          )}
          {canCloseChat && (
            <button
              onClick={closeConversation}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cerrar Chat
            </button>
          )}
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors">
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

      {/* Chat no disponible */}
      {!canInteract && conversation.status !== 'closed' && (
        <div className="bg-gray-700 p-4 border-t border-gray-600 flex items-center justify-center">
          <div className="text-center text-gray-400">
            {conversation.status === 'waiting' ? (
              <p>Haz clic en "Tomar Chat" para comenzar a escribir mensajes</p>
            ) : (
              <p>Este chat está siendo manejado por otro operador</p>
            )}
          </div>
        </div>
      )}

      {/* Input de mensaje */}
      {canInteract && (
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

      {/* Mensaje para chat cerrado */}
      {conversation.status === 'closed' && (
        <div className="bg-gray-700 p-4 border-t border-gray-600 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <p>Esta conversación está cerrada</p>
          </div>
        </div>
      )}
    </div>
  );
};
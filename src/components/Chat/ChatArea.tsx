import React, { useEffect, useState, useRef } from 'react';
import { Send, Paperclip, MoreVertical, User, Bot, X, Plus } from 'lucide-react';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { operator } = useAuth();
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation) {
      fetchMessages();
      
      // Subscribe to real-time messages via Supabase
      const messageSubscription = supabase
        .channel(`messages_${conversation.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`
        }, (payload) => {
          const newMessage = payload.new as Message;
          setMessages(prev => {
            // Avoid duplicates
            if (prev.find(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        })
        .subscribe();

      // Subscribe to socket events for real-time updates
      if (socket) {
        socket.on('new_message', (data) => {
          if (data.conversation_id === conversation.id) {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.find(m => m.id === data.id)) return prev;
              return [...prev, data];
            });
          }
        });
      }

      return () => {
        messageSubscription.unsubscribe();
        if (socket) {
          socket.off('new_message');
        }
      };
    }
  }, [conversation, socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

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

      const { error } = await supabase
        .from('messages')
        .insert([message]);

      if (error) throw error;

      // Send via WhatsApp through socket
      if (socket) {
        socket.emit('send_whatsapp_message', {
          to: conversation.client.phone,
          message: newMessage.trim(),
        });
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  const sendMessageToNewNumber = async () => {
    if (!newPhoneNumber.trim() || !newMessage.trim() || !operator || sending) return;

    setSending(true);
    try {
      // Send via WhatsApp through socket
      if (socket) {
        socket.emit('send_whatsapp_message', {
          to: newPhoneNumber.trim(),
          message: newMessage.trim(),
        });

        socket.on('message_sent', (response) => {
          if (response.success) {
            toast.success('Mensaje enviado correctamente');
            setNewMessage('');
            setNewPhoneNumber('');
            setShowNewChat(false);
          } else {
            toast.error('Error al enviar mensaje: ' + response.error);
          }
          socket.off('message_sent');
        });
      }
    } catch (error) {
      console.error('Error sending message to new number:', error);
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  const closeConversation = async () => {
    if (!conversation || !operator) return;

    if (window.confirm('¿Estás seguro de que quieres cerrar esta conversación?')) {
      if (socket) {
        socket.emit('close_conversation', {
          conversationId: conversation.id,
          operatorId: operator.id
        });

        socket.on('conversation_closed_success', () => {
          toast.success('Conversación cerrada correctamente');
          socket.off('conversation_closed_success');
        });

        socket.on('conversation_closed_error', (data) => {
          toast.error('Error al cerrar conversación: ' + data.error);
          socket.off('conversation_closed_error');
        });
      }
    }
  };
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showNewChat) {
        sendMessageToNewNumber();
      } else {
        sendMessage();
      }
    }
  };

  const takeChatControl = async () => {
    if (!conversation || !operator) return;

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ 
          operator_id: operator.id,
          status: 'active'
        })
        .eq('id', conversation.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error taking chat control:', error);
    }
  };

  const getSenderIcon = (message: Message) => {
    switch (message.sender_type) {
      case 'operator':
        return <User className="w-4 h-4 text-blue-500" />;
      case 'bot':
        return <Bot className="w-4 h-4 text-purple-500" />;
      default:
        return <div className="w-4 h-4 bg-green-500 rounded-full" />;
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-800">
        <div className="text-center text-gray-400 max-w-md">
          <p className="text-lg mb-4">Selecciona una conversación</p>
          <p className="text-sm mb-6">Elige una conversación de la lista para comenzar a chatear</p>
          
          <button
            onClick={() => setShowNewChat(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center space-x-2 mx-auto"
          >
            <Plus className="w-5 h-5" />
            <span>Nuevo Chat</span>
          </button>
          
          {/* New Chat Modal */}
          {showNewChat && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 p-6 rounded-2xl max-w-md w-full mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Nuevo Chat</h3>
                  <button
                    onClick={() => setShowNewChat(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Número de teléfono
                    </label>
                    <input
                      type="tel"
                      value={newPhoneNumber}
                      onChange={(e) => setNewPhoneNumber(e.target.value)}
                      placeholder="Ej: 1234567890"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Mensaje
                    </label>
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Escribe tu mensaje..."
                      rows={3}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    />
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowNewChat(false)}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={sendMessageToNewNumber}
                      disabled={!newPhoneNumber.trim() || !newMessage.trim() || sending}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg font-medium transition-colors"
                    >
                      {sending ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-800">
      {/* Chat Header */}
      <div className="bg-gray-700 p-4 border-b border-gray-600 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-white">
              {conversation.client.name?.charAt(0).toUpperCase() || 'C'}
            </span>
          </div>
          <div>
            <p className="font-medium text-white">
              {conversation.client.name || conversation.client.phone}
            </p>
            <p className="text-sm text-gray-400">
              {conversation.client.phone}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {conversation.status === 'waiting' && (
            <button
              onClick={takeChatControl}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Tomar Chat
            </button>
          )}
          {conversation.status === 'active' && conversation.operator_id === operator?.id && (
            <button
              onClick={closeConversation}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cerrar Chat
            </button>
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
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender_type === 'operator' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.sender_type === 'operator'
                      ? 'bg-green-600 text-white'
                      : message.sender_type === 'bot'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-600 text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    {getSenderIcon(message)}
                    <span className="text-xs opacity-75">
                      {message.sender_type === 'operator' ? 'Tú' : 
                       message.sender_type === 'bot' ? 'Bot' : 'Cliente'}
                    </span>
                  </div>
                  <p className="text-sm">{message.content}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {format(new Date(message.timestamp), 'HH:mm', { locale: es })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      {conversation.status === 'active' && conversation.operator_id === operator?.id && (
        <div className="bg-gray-700 p-4 border-t border-gray-600">
          <div className="flex items-center space-x-2">
            <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg">
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
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
          </div>
        </div>
      )}
    </div>
  );
};
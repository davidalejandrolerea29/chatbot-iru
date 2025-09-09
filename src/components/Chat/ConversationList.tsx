import React, { useEffect, useState } from 'react';
import { Search, Clock, Bot, Filter, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Conversation, Message } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConversationListProps {
  selectedConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  selectedConversationId,
  onSelectConversation,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Obtener cantidad de mensajes no leídos de la conversación
  const getUnreadCount = async (conversationId: string) => {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false)
      .neq('sender_type', 'operator');
    return count || 0;
  };

  useEffect(() => {
    let conversationChannel: any;
    let messageChannel: any;

    const fetchInitialData = async () => {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select(`
            *,
            client:clients(*),
            assigned_operator:operators!conversations_operator_id_fkey(*),
            closed_by_operator:operators!conversations_closed_by_fkey(*)
          `)
          .order('last_message_at', { ascending: false });

        if (error) throw error;

        const conversationsWithUnread = await Promise.all(
          (data || []).map(async (conv) => ({
            ...conv,
            unread_count: await getUnreadCount(conv.id),
          }))
        );

        setConversations(conversationsWithUnread);
      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // --- SUSCRIPCIÓN REALTIME CONVERSATIONS ---
    conversationChannel = supabase
      .channel('realtime_conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        async (payload) => {
          const newConv = payload.new as Conversation;

          if (payload.type === 'INSERT') {
            newConv.unread_count = 1;
            setConversations((prev) => [newConv, ...prev]);
          } else if (payload.type === 'UPDATE') {
            newConv.unread_count = await getUnreadCount(newConv.id);
            setConversations((prev) =>
              prev.map((c) => (c.id === newConv.id ? newConv : c))
            );
          } else if (payload.type === 'DELETE') {
            setConversations((prev) =>
              prev.filter((c) => c.id !== (payload.old as Conversation).id)
            );
          }
        }
      )
      .subscribe();

    // --- SUSCRIPCIÓN REALTIME MESSAGES para actualizar unread_count ---
    messageChannel = supabase
      .channel('realtime_messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.type === 'INSERT') {
            const msg = payload.new as Message;
            if (msg.sender_type !== 'operator') {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === msg.conversation_id
                    ? { ...c, unread_count: (c.unread_count || 0) + 1 }
                    : c
                )
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      conversationChannel.unsubscribe();
      messageChannel.unsubscribe();
    };
  }, [selectedConversationId]);

  const filteredConversations = conversations.filter(
    (conv) =>
      (conv.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.client?.phone?.includes(searchTerm)) &&
      (statusFilter === 'all' || conv.status === statusFilter)
  );

  const getStatusIcon = (conversation: Conversation) => {
    switch (conversation.status) {
      case 'active':
        return conversation.operator_id ? (
          <Users className="w-4 h-4 text-green-500" />
        ) : (
          <Bot className="w-4 h-4 text-blue-500" />
        );
      case 'waiting':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'closed':
        return <X className="w-4 h-4 text-gray-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusText = (conversation: Conversation) => {
    switch (conversation.status) {
      case 'active':
        return conversation.operator_id ? 'En chat' : 'Bot activo';
      case 'waiting':
        return 'Esperando operador';
      case 'closed':
        return 'Cerrada';
      default:
        return 'Desconocido';
    }
  };

  const getClientTypeIndicator = (clientType?: string) => {
    if (clientType === 'existing') {
      return <div className="w-2 h-2 bg-blue-500 rounded-full" title="Cliente existente" />;
    } else if (clientType === 'prospect') {
      return <div className="w-2 h-2 bg-orange-500 rounded-full" title="Prospecto" />;
    }
    return <div className="w-2 h-2 bg-gray-500 rounded-full" title="Nuevo contacto" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Search and Filter */}
      <div className="p-4 border-b border-gray-700">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar conversaciones..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="waiting">Esperando operador</option>
            <option value="closed">Cerradas</option>
          </select>
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Bot className="mx-auto mb-3 text-gray-500" size={48} />
            <p>{searchTerm ? 'No se encontraron conversaciones' : 'No hay conversaciones activas'}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={`p-4 cursor-pointer border-b border-gray-700 hover:bg-gray-800 transition-colors ${
                  selectedConversationId === conversation.id ? 'bg-gray-700' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center relative">
                      <span className="text-sm font-semibold text-white">
                        {conversation.client?.name?.charAt(0).toUpperCase() || 'C'}
                      </span>
                      <div className="absolute -bottom-1 -right-1">
                        {getClientTypeIndicator(conversation.client?.client_type)}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {conversation.client?.name || `+${conversation.client?.phone}`}
                      </p>
                      <p className="text-sm text-gray-400">{conversation.client?.phone}</p>
                    </div>
                  </div>
                  {conversation.unread_count > 0 && (
                    <div className="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {conversation.unread_count}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(conversation)}
                    <span className="text-gray-300">{getStatusText(conversation)}</span>
                  </div>
                  <span className="text-gray-400">
                    {formatDistanceToNow(new Date(conversation.last_message_at), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ConversationList } from '../Chat/ConversationList';
import { ChatArea } from '../Chat/ChatArea';
import { Conversation } from '../../types';

export const ChatView: React.FC = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  return (
    <div className="flex h-full">
      <div className="w-1/3 bg-gray-900 border-r border-gray-700">
        <ConversationList
          selectedConversationId={selectedConversation?.id || null}
          onSelectConversation={setSelectedConversation}
        />
      </div>
      <ChatArea conversation={selectedConversation} />
    </div>
  );
};
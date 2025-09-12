import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import { LoginForm } from './components/Auth/LoginForm';
import { RegisterForm } from './components/Auth/RegisterForm';
import { Sidebar } from './components/Layout/Sidebar';
import { ChatView } from './components/Views/ChatView';
import { OperatorsView } from './components/Views/OperatorsView';
import { AnalyticsView } from './components/Views/AnalyticsView';
import { WhatsAppView } from './components/Views/WhatsAppView';

const AppContent: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [activeView, setActiveView] = useState('chat');
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {isLogin ? (
          <LoginForm onToggleMode={() => setIsLogin(false)} />
        ) : (
          <RegisterForm onToggleMode={() => setIsLogin(true)} />
        )}
      </>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'chat':
        return <ChatView />;
      case 'operators':
        return <OperatorsView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'whatsapp':
        return <WhatsAppView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <SocketProvider>
      <div className={`flex h-screen transition-colors ${
        document.documentElement.classList.contains('dark') ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-hidden">
          {renderView()}
        </main>
      </div>
    </SocketProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#374151',
              color: '#fff',
            },
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
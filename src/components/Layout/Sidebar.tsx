import React from 'react';
import { 
  MessageCircle, 
  Users, 
  BarChart3, 
  Settings, 
  Phone,
  LogOut,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const { operator, signOut } = useAuth();
  const { connected } = useSocket();

  const menuItems = [
    { id: 'chat', label: 'Conversaciones', icon: MessageCircle },
    { id: 'operators', label: 'Operadores', icon: Users },
    { id: 'analytics', label: 'Estadísticas', icon: BarChart3 },
    { id: 'whatsapp', label: 'WhatsApp', icon: Phone },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="bg-gray-900 text-white w-64 flex flex-col h-screen">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-green-400">IRU NET</h1>
        <p className="text-sm text-gray-400 mt-1">Sistema de Chat WhatsApp</p>
      </div>

      {/* Connection Status */}
      <div className="px-6 py-3 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          {connected ? (
            <>
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Conectado</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-400">Desconectado</span>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeView === item.id
                    ? 'bg-green-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold">
                {operator?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium">{operator?.name || 'Usuario'}</p>
              <p className="text-xs text-gray-400">
                {operator?.is_online ? 'En línea' : 'Desconectado'}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
import React, { useEffect, useState } from 'react';
import { 
  MessageCircle, 
  Users, 
  Clock, 
  TrendingUp,
  BarChart3,
  Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Stats {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  averageResponseTime: number;
  operatorsOnline: number;
  todayConversations: number;
}

export const AnalyticsView: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalConversations: 0,
    activeConversations: 0,
    totalMessages: 0,
    averageResponseTime: 0,
    operatorsOnline: 0,
    todayConversations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);

      // Total conversations
      const { count: totalConversations } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

      // Active conversations
      const { count: activeConversations } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Total messages
      const { count: totalMessages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });

      // Operators online
      const { count: operatorsOnline } = await supabase
        .from('operators')
        .select('*', { count: 'exact', head: true })
        .eq('is_online', true);

      // Today's conversations
      const today = new Date().toISOString().split('T')[0];
      const { count: todayConversations } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', `${today}T00:00:00.000Z`)
        .lt('started_at', `${today}T23:59:59.999Z`);

      setStats({
        totalConversations: totalConversations || 0,
        activeConversations: activeConversations || 0,
        totalMessages: totalMessages || 0,
        averageResponseTime: 0, // Placeholder
        operatorsOnline: operatorsOnline || 0,
        todayConversations: todayConversations || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Conversaciones',
      value: stats.totalConversations,
      icon: MessageCircle,
      color: 'bg-blue-600',
      change: '+12%',
    },
    {
      title: 'Conversaciones Activas',
      value: stats.activeConversations,
      icon: TrendingUp,
      color: 'bg-green-600',
      change: '+5%',
    },
    {
      title: 'Mensajes Totales',
      value: stats.totalMessages,
      icon: BarChart3,
      color: 'bg-purple-600',
      change: '+18%',
    },
    {
      title: 'Operadores en Línea',
      value: stats.operatorsOnline,
      icon: Users,
      color: 'bg-yellow-600',
      change: '0%',
    },
    {
      title: 'Conversaciones Hoy',
      value: stats.todayConversations,
      icon: Calendar,
      color: 'bg-red-600',
      change: '+25%',
    },
    {
      title: 'Tiempo Promedio',
      value: `${Math.round(stats.averageResponseTime)}m`,
      icon: Clock,
      color: 'bg-indigo-600',
      change: '-8%',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Estadísticas</h1>
        <p className="text-gray-400">
          Panel de análisis y métricas del sistema de chat
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <div key={index} className="bg-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.color} p-3 rounded-full`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm text-green-400 font-medium">
                {stat.change}
              </span>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">{stat.title}</p>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations Chart Placeholder */}
        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">
              Conversaciones por Día
            </h2>
            <select className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              <option>Últimos 7 días</option>
              <option>Último mes</option>
              <option>Últimos 3 meses</option>
            </select>
          </div>
          
          <div className="h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Gráfico de conversaciones</p>
              <p className="text-sm mt-1">(Funcionalidad en desarrollo)</p>
            </div>
          </div>
        </div>

        {/* Response Time Chart Placeholder */}
        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">
              Tiempo de Respuesta
            </h2>
            <select className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              <option>Por hora</option>
              <option>Por día</option>
              <option>Por semana</option>
            </select>
          </div>
          
          <div className="h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Gráfico de tiempos de respuesta</p>
              <p className="text-sm mt-1">(Funcionalidad en desarrollo)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
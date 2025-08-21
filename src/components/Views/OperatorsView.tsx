import React, { useEffect, useState } from 'react';
import { User, UserPlus, Circle, Phone, Mail, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Operator } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const OperatorsView: React.FC = () => {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOperators();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel('operators')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'operators' },
        () => {
          fetchOperators();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchOperators = async () => {
    try {
      const { data, error } = await supabase
        .from('operators')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOperators(data || []);
    } catch (error) {
      console.error('Error fetching operators:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleOperatorStatus = async (operatorId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('operators')
        .update({ is_active: !currentStatus })
        .eq('id', operatorId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating operator status:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Operadores</h1>
          <p className="text-gray-400">
            Gestiona los operadores del sistema de chat
          </p>
        </div>
        
        <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2">
          <UserPlus className="w-4 h-4" />
          <span>Invitar Operador</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="flex items-center space-x-3">
            <div className="bg-green-600 p-3 rounded-full">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Operadores</p>
              <p className="text-2xl font-bold text-white">{operators.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-3 rounded-full">
              <Circle className="w-6 h-6 text-white fill-current" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">En Línea</p>
              <p className="text-2xl font-bold text-white">
                {operators.filter(op => op.is_online).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-600 p-3 rounded-full">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Activos</p>
              <p className="text-2xl font-bold text-white">
                {operators.filter(op => op.is_active).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Operators List */}
      <div className="bg-gray-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Lista de Operadores</h2>
        </div>

        {operators.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay operadores registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {operators.map((operator) => (
              <div key={operator.id} className="p-6 hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                        <span className="text-lg font-semibold text-white">
                          {operator.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div
                        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-800 ${
                          operator.is_online ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                      />
                    </div>

                    <div>
                      <h3 className="text-lg font-medium text-white">
                        {operator.name}
                      </h3>
                      <div className="flex items-center space-x-4 mt-1">
                        <div className="flex items-center space-x-1 text-gray-400 text-sm">
                          <Mail className="w-4 h-4" />
                          <span>{operator.email}</span>
                        </div>
                        <div className="flex items-center space-x-1 text-gray-400 text-sm">
                          <Phone className="w-4 h-4" />
                          <span>{operator.phone}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 text-gray-400 text-sm mt-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                          Registrado el {format(new Date(operator.created_at), 'dd/MM/yyyy', { locale: es })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          operator.is_online ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                      />
                      <span className="text-sm text-gray-400">
                        {operator.is_online ? 'En línea' : 'Desconectado'}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleOperatorStatus(operator.id, operator.is_active)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        operator.is_active
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {operator.is_active ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, CheckCircle } from 'lucide-react';
import { useSocket } from '../../contexts/SocketContext';
import { WhatsAppStatus } from '../../types';

export const WhatsAppView: React.FC = () => {
  const [status, setStatus] = useState<WhatsAppStatus>({
    is_connected: false,
    qr_code: null,
    phone_number: null,
    last_connected: null,
  });
  const [loading, setLoading] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    if (socket) {
      // Listen for WhatsApp status updates
      socket.on('whatsapp_status', (data: WhatsAppStatus) => {
        setStatus(data);
      });

      // Request current status
      socket.emit('get_whatsapp_status');

      return () => {
        socket.off('whatsapp_status');
      };
    }
  }, [socket]);

  const handleConnect = () => {
    if (socket) {
      setLoading(true);
      socket.emit('connect_whatsapp');
      setTimeout(() => setLoading(false), 3000);
    }
  };

  const handleDisconnect = () => {
    if (socket) {
      socket.emit('disconnect_whatsapp');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          Configuración de WhatsApp
        </h1>
        <p className="text-gray-400">
          Gestiona la conexión con WhatsApp Web para recibir y enviar mensajes
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-full ${status.is_connected ? 'bg-green-600' : 'bg-red-600'}`}>
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Estado de WhatsApp
              </h2>
              <div className="flex items-center space-x-2 mt-1">
                {status.is_connected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 text-sm">Conectado</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 text-sm">Desconectado</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!status.is_connected && (
              <button
                onClick={handleConnect}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4" />
                    <span>Conectar</span>
                  </>
                )}
              </button>
            )}
            
            {status.is_connected && (
              <button
                onClick={handleDisconnect}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <WifiOff className="w-4 h-4" />
                <span>Desconectar</span>
              </button>
            )}
          </div>
        </div>

        {/* Connection Details */}
        {status.is_connected && status.phone_number && (
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white font-medium">
                WhatsApp conectado: {status.phone_number}
              </span>
            </div>
            {status.last_connected && (
              <p className="text-gray-400 text-sm mt-1">
                Última conexión: {new Date(status.last_connected).toLocaleString('es-ES')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* QR Code Section */}
      {!status.is_connected && status.qr_code && (
        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <QrCode className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Escanea el código QR
            </h2>
            <p className="text-gray-400 mb-6">
              Abre WhatsApp en tu teléfono y escanea este código QR para conectar
            </p>
            
            <div className="bg-white p-4 rounded-lg inline-block">
  <img
  src={status.qr_code}
  alt="QR Code"
  className="w-64 h-64 mx-auto"
/>

            </div>
            
            <div className="mt-6 bg-blue-900/50 border border-blue-700 rounded-lg p-4">
              <p className="text-blue-300 text-sm">
                <strong>Instrucciones:</strong>
                <br />
                1. Abre WhatsApp en tu teléfono
                <br />
                2. Ve a Configuración → WhatsApp Web/Desktop
                <br />
                3. Toca "Vincular un dispositivo"
                <br />
                4. Escanea este código QR
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No QR Code and Not Connected */}
      {!status.is_connected && !status.qr_code && !loading && (
        <div className="bg-gray-800 rounded-2xl p-6">
          <div className="text-center">
            <Smartphone className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">
              WhatsApp no conectado
            </h2>
            <p className="text-gray-400 mb-4">
              Haz clic en "Conectar" para generar el código QR y vincular tu WhatsApp
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
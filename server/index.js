import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from 'baileys';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// WhatsApp socket
let sock = null;
let qrCodeData = null;
let isConnected = false;
let phoneNumber = null;

// Auth state directory
const authDir = path.join(__dirname, 'auth_info');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir);
}

// Bot responses - Flujo principal
const botResponses = {
  welcome: "¡Hola! 👋 Bienvenido a IRU NET. Soy tu asistente virtual.\n\n" +
           "Por favor selecciona una opción:\n\n" +
           "🔵 *SOY CLIENTE*\n" +
           "🔴 *NO SOY CLIENTE*\n\n" +
           "Escribe 'CLIENTE' o 'NO CLIENTE' según corresponda:",

  // Flujo para clientes existentes
  clientWelcome: "¡Estamos encantados de poder hablar contigo! 😊\n\n" +
                 "Como cliente de IRU NET, puedo ayudarte con:\n\n" +
                 "1️⃣ Información general\n" +
                 "2️⃣ Reclamos\n" +
                 "3️⃣ Hablar con un operador\n" +
                 "4️⃣ Instructivo para pagar por la app IRUNET\n\n" +
                 "Escribe el número de la opción que necesitas:",

  clientOption1: "📋 **Información General para Clientes**\n\n" +
                 "✅ Tu servicio está activo\n" +
                 "📞 Soporte: 24/7\n" +
                 "💻 Portal cliente: www.irunet.com\n" +
                 "📱 App móvil disponible\n\n" +
                 "¿Te puedo ayudar con algo más?\n" +
                 "Escribe '0' para volver al menú principal o '3' para hablar con un operador.",

  clientOption2: "⚠️ **Gestión de Reclamos**\n\n" +
                 "Entiendo que tienes un reclamo. Te conectaré con nuestro departamento especializado.\n" +
                 "Por favor describe brevemente tu problema y un operador te atenderá en breve.\n\n" +
                 "Un momento por favor...",

  clientOption3: "👨‍💼 **Conectando con operador**\n\n" +
                 "Te estoy conectando con uno de nuestros operadores especializados para clientes.\n" +
                 "Por favor espera un momento...",

  clientOption4: "📱 **Instructivo IRUNET App - Pagos**\n\n" +
                 "Para pagar a través de nuestra app IRUNET:\n\n" +
                 "1️⃣ Descarga la app desde Play Store o App Store\n" +
                 "2️⃣ Inicia sesión con tu número de cliente\n" +
                 "3️⃣ Ve a la sección 'Pagos'\n" +
                 "4️⃣ Selecciona el método de pago\n" +
                 "5️⃣ Confirma el monto y procede\n\n" +
                 "💡 También puedes pagar con:\n" +
                 "• Mercado Pago\n" +
                 "• Transferencia bancaria\n" +
                 "• Efectivo en puntos de pago\n\n" +
                 "¿Necesitas más ayuda? Escribe '3' para hablar con un operador.",

  // Flujo para no clientes
  nonClientWelcome: "¡Hola! Gracias por tu interés en IRU NET 🚀\n\n" +
                    "Como potencial cliente, puedo ayudarte con:\n\n" +
                    "1️⃣ Información general para nuevos clientes\n" +
                    "2️⃣ Hablar con un operador\n\n" +
                    "Escribe el número de la opción que necesitas:",

  nonClientOption1: "🏢 **Información General - IRU NET**\n\n" +
                    "📍 **Ubicación:**\n" +
                    "• Central: Av. Principal 123, Centro\n" +
                    "• Sucursal Norte: Barrio Norte, Calle 45 #67\n" +
                    "• Sucursal Sur: Zona Sur, Av. Industrial 89\n\n" +
                    "🏘️ **Barrios que abarcamos:**\n" +
                    "• Centro y microcentro\n" +
                    "• Barrio Norte y alrededores\n" +
                    "• Zona Sur Industrial\n" +
                    "• Barrio Residencial Este\n" +
                    "• Zona Oeste Comercial\n\n" +
                    "📋 **Requisitos para contratar:**\n" +
                    "• DNI del titular\n" +
                    "• Comprobante de ingresos\n" +
                    "• Comprobante de domicilio\n" +
                    "• Foto del frente de la propiedad\n\n" +
                    "💰 **Planes disponibles:**\n" +
                    "• Plan Básico: 50 Mbps - $15.000/mes\n" +
                    "• Plan Premium: 100 Mbps - $25.000/mes\n" +
                    "• Plan Ultra: 300 Mbps - $35.000/mes\n\n" +
                    "¿Quieres más información? Escribe '2' para hablar con un operador.",

  nonClientOption2: "👨‍💼 **Conectando con operador comercial**\n\n" +
                    "Te estoy conectando con uno de nuestros asesores comerciales.\n" +
                    "Te ayudará con planes, precios y contratación.\n\n" +
                    "Un momento por favor...",

  default: "❓ No entiendo tu mensaje.\n\n" +
           "Por favor selecciona una opción:\n" +
           "🔵 *SOY CLIENTE* - Escribe 'CLIENTE'\n" +
           "🔴 *NO SOY CLIENTE* - Escribe 'NO CLIENTE'\n" +
           "0️⃣ Volver al menú principal"
};

// Initialize WhatsApp connection
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['IRU NET', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('QR Code generated');
        try {
          const qrBase64 = await qrcode.toDataURL(qr);
          qrCodeData = qrBase64; 

          io.emit('whatsapp_status', {
            is_connected: false,
            qr_code: qrCodeData,
            phone_number: null,
            last_connected: null
          });
          console.log('QR Code sent to frontend successfully.');

        } catch (err) {
          console.error('Error generating QR code image:', err);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
        
        isConnected = false;
        phoneNumber = null;
        qrCodeData = null;
        
        io.emit('whatsapp_status', {
          is_connected: false,
          qr_code: null,
          phone_number: null,
          last_connected: null
        });

        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connected successfully');
        isConnected = true;
        phoneNumber = sock.user?.id?.split(':')[0] || null;
        qrCodeData = null;
        
        io.emit('whatsapp_status', {
          is_connected: true,
          qr_code: null,
          phone_number: phoneNumber,
          last_connected: new Date().toISOString()
        });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.key.fromMe && msg.message) {
            await handleIncomingMessage(msg);
          }
        }
      }
    });

  } catch (error) {
    console.error('Error connecting to WhatsApp:', error);
    setTimeout(connectToWhatsApp, 5000);
  }
}

// Handle incoming WhatsApp messages
async function handleIncomingMessage(msg) {
  const phoneNumber = msg.key.remoteJid?.replace('@s.whatsapp.net', '');
  const messageText = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || '';

  if (!phoneNumber || !messageText) return;

  console.log(`Message from ${phoneNumber}: ${messageText}`);

  try {
    // Find or create client
    let { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('phone', phoneNumber)
      .single();

    if (!client) {
      const { data: newClient } = await supabase
        .from('clients')
        .insert([{
          phone: phoneNumber,
          name: null,
          last_message: messageText,
          last_message_at: new Date().toISOString(),
          status: 'bot',
          client_type: null,
          conversation_state: 'initial'
        }])
        .select()
        .single();
      client = newClient;
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', client.id)
      .eq('status', 'active')
      .single();

    if (!conversation) {
      const { data: newConversation } = await supabase
        .from('conversations')
        .insert([{
          client_id: client.id,
          operator_id: null,
          status: 'active',
          started_at: new Date().toISOString(),
          last_message_at: new Date().toISOString()
        }])
        .select()
        .single();
      conversation = newConversation;
    }

    // Save message to database
    await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        sender_type: 'client',
        sender_id: client.id,
        content: messageText,
        message_type: 'text',
        timestamp: new Date().toISOString(),
        is_read: false
      }]);

    // Update client last message
    await supabase
      .from('clients')
      .update({ 
        last_message: messageText,
        last_message_at: new Date().toISOString()
      })
      .eq('id', client.id);

    // Process bot response if not assigned to operator
    if (!conversation.operator_id) {
      await processBotResponse(client, conversation, messageText);
    }

    // Emit to connected operators via realtime
    io.emit('new_message', {
      conversation_id: conversation.id,
      client_phone: phoneNumber,
      message: messageText
    });

  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

// Process bot responses with new flow
async function processBotResponse(client, conversation, messageText) {
  let responseText = '';
  let shouldTransferToOperator = false;
  let newClientType = client.client_type;
  let newConversationState = client.conversation_state;

  const normalizedMessage = messageText.toLowerCase().trim();

  // Estado inicial - Determinar si es cliente o no
  if (client.conversation_state === 'initial' || normalizedMessage === '0') {
    if (normalizedMessage.includes('cliente') && !normalizedMessage.includes('no')) {
      responseText = botResponses.clientWelcome;
      newClientType = 'existing';
      newConversationState = 'client_menu';
    } else if (normalizedMessage.includes('no cliente') || normalizedMessage === 'no cliente') {
      responseText = botResponses.nonClientWelcome;
      newClientType = 'prospect';
      newConversationState = 'prospect_menu';
    } else {
      responseText = botResponses.welcome;
    }
  }
  // Menú para clientes existentes
  else if (client.conversation_state === 'client_menu' && client.client_type === 'existing') {
    switch (normalizedMessage) {
      case '1':
        responseText = botResponses.clientOption1;
        break;
      case '2':
        responseText = botResponses.clientOption2;
        shouldTransferToOperator = true;
        break;
      case '3':
        responseText = botResponses.clientOption3;
        shouldTransferToOperator = true;
        break;
      case '4':
        responseText = botResponses.clientOption4;
        break;
      case '0':
        responseText = botResponses.welcome;
        newConversationState = 'initial';
        break;
      default:
        responseText = botResponses.clientWelcome + "\n\n❓ Por favor elige una opción válida (1-4):";
    }
  }
  // Menú para no clientes/prospectos
  else if (client.conversation_state === 'prospect_menu' && client.client_type === 'prospect') {
    switch (normalizedMessage) {
      case '1':
        responseText = botResponses.nonClientOption1;
        break;
      case '2':
        responseText = botResponses.nonClientOption2;
        shouldTransferToOperator = true;
        break;
      case '0':
        responseText = botResponses.welcome;
        newConversationState = 'initial';
        break;
      default:
        responseText = botResponses.nonClientWelcome + "\n\n❓ Por favor elige una opción válida (1-2):";
    }
  }
  // Fallback
  else {
    responseText = botResponses.default;
  }

  // Update client state
  if (newClientType !== client.client_type || newConversationState !== client.conversation_state) {
    await supabase
      .from('clients')
      .update({ 
        client_type: newClientType,
        conversation_state: newConversationState
      })
      .eq('id', client.id);
  }

  // Send bot response
  if (sock && responseText) {
    try {
      await sock.sendMessage(`${client.phone}@s.whatsapp.net`, { text: responseText });
      
      // Save bot message to database
      await supabase
        .from('messages')
        .insert([{
          conversation_id: conversation.id,
          sender_type: 'bot',
          sender_id: null,
          content: responseText,
          message_type: 'text',
          timestamp: new Date().toISOString(),
          is_read: true
        }]);

    } catch (error) {
      console.error('Error sending bot response:', error);
    }
  }

  // Transfer to operator if needed
  if (shouldTransferToOperator) {
    await supabase
      .from('conversations')
      .update({ 
        status: 'waiting',
        operator_id: null 
      })
      .eq('id', conversation.id);

    await supabase
      .from('clients')
      .update({ status: 'operator' })
      .eq('id', client.id);

    // Notify operators
    io.emit('operator_needed', {
      conversation_id: conversation.id,
      client_phone: client.phone,
      client_type: newClientType
    });
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  if (!sock || !isConnected) {
    throw new Error('WhatsApp not connected');
  }

  try {
    const jid = `${to}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current WhatsApp status
  socket.emit('whatsapp_status', {
    is_connected: isConnected,
    qr_code: qrCodeData,
    phone_number: phoneNumber,
    last_connected: isConnected ? new Date().toISOString() : null
  });

  // Handle WhatsApp connection request
  socket.on('connect_whatsapp', () => {
    if (!isConnected && !sock) {
      connectToWhatsApp();
    }
  });

  // Handle WhatsApp disconnection request
  socket.on('disconnect_whatsapp', async () => {
    if (sock) {
      await sock.logout();
      sock = null;
      isConnected = false;
      phoneNumber = null;
      qrCodeData = null;
    }
  });

  // Get WhatsApp status
  socket.on('get_whatsapp_status', () => {
    socket.emit('whatsapp_status', {
      is_connected: isConnected,
      qr_code: qrCodeData,
      phone_number: phoneNumber,
      last_connected: isConnected ? new Date().toISOString() : null
    });
  });

  // Send WhatsApp message
  socket.on('send_whatsapp_message', async (data) => {
    try {
      await sendWhatsAppMessage(data.to, data.message);
      
      // Save operator message to database
      if (data.conversation_id) {
        await supabase
          .from('messages')
          .insert([{
            conversation_id: data.conversation_id,
            sender_type: 'operator',
            sender_id: data.operator_id || null,
            content: data.message,
            message_type: 'text',
            timestamp: new Date().toISOString(),
            is_read: true
          }]);
      }
      
      socket.emit('message_sent', { success: true });
    } catch (error) {
      socket.emit('message_sent', { success: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`IRU NET Server running on port ${PORT}`);
  
  // Auto-connect to WhatsApp on startup
  setTimeout(connectToWhatsApp, 2000);
});
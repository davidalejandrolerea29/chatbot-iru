const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
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
  process.env.SUPABASE_URL,
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

// Inactivity timeout (30 minutes)
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
const inactivityTimers = new Map();

// Bot responses
const botResponses = {
  welcome: "¡Hola! 👋 Bienvenido a IRU NET.\n\n" +
           "Para brindarte la mejor atención, necesito saber:\n\n" +
           "1️⃣ SOY CLIENTE\n" +
           "2️⃣ NO SOY CLIENTE\n\n" +
           "Por favor responde con el número de tu opción:",

  // Cliente responses
  clientWelcome: "¡Estamos encantados de poder hablar contigo! 😊\n\n" +
                 "Como cliente de IRU NET, puedo ayudarte con:\n\n" +
                 "1️⃣ Información general\n" +
                 "2️⃣ Reclamos\n" +
                 "3️⃣ Hablar with un operador\n" +
                 "4️⃣ Instructivo para pagar por la app IRUNET\n\n" +
                 "Escribe el número de la opción que necesitas:",

  clientOption1: "📋 **Información General para Clientes**\n\n" +
                 "• Horarios de atención: Lunes a Viernes 8:00 - 20:00, Sábados 8:00 - 14:00\n" +
                 "• Soporte técnico 24/7\n" +
                 "• Portal web: www.irunet.com\n" +
                 "• App móvil disponible en Play Store y App Store\n\n" +
                 "¿Necesitas algo más?\n" +
                 "Escribe '0' para volver al menú o '3' para hablar con un operador.",

  clientOption2: "📞 **Reclamos**\n\n" +
                 "Lamentamos cualquier inconveniente. Para procesar tu reclamo de manera eficiente, te conectaré con un operador especializado.\n\n" +
                 "Un momento por favor...",

  clientOption3: "👨‍💼 **Conectando con operador**\n\n" +
                 "Te estoy conectando con uno de nuestros operadores especializados para clientes.\n" +
                 "Por favor espera un momento...",

  clientOption4: "💳 **Instructivo para Pagar por la App IRUNET**\n\n" +
                 "📱 **Pasos para pagar:**\n" +
                 "1. Abre la app IRUNET\n" +
                 "2. Ve a 'Mi Cuenta' → 'Pagos'\n" +
                 "3. Selecciona tu método de pago preferido\n" +
                 "4. Confirma el monto y procesa el pago\n\n" +
                 "💡 **Métodos disponibles:**\n" +
                 "• Tarjeta de crédito/débito\n" +
                 "• Transferencia bancaria\n" +
                 "• Pago móvil\n\n" +
                 "¿Necesitas ayuda adicional?\n" +
                 "Escribe '0' para volver al menú o '3' para hablar con un operador.",

  // No cliente responses
  nonClientWelcome: "¡Gracias por tu interés en IRU NET! 🌐\n\n" +
                    "Como futuro cliente, puedo ayudarte con:\n\n" +
                    "1️⃣ Información general para nuevos clientes\n" +
                    "2️⃣ Hablar con un operador\n\n" +
                    "Escribe el número de la opción que necesitas:",

  nonClientOption1: "🏢 **Información General para Nuevos Clientes**\n\n" +
                    "📍 **Ubicación:**\n" +
                    "Oficina principal: Av. Principal #123, Centro\n" +
                    "Horarios: Lunes a Viernes 8:00 - 18:00\n\n" +
                    "🏘️ **Barrios que abarcamos:**\n" +
                    "• Centro, Norte, Sur\n" +
                    "• Zona Industrial\n" +
                    "• Urbanizaciones: Los Pinos, El Recreo, Vista Hermosa\n" +
                    "• Sectores rurales cercanos\n\n" +
                    "📋 **Requisitos para contratar:**\n" +
                    "• Cédula de identidad\n" +
                    "• Comprobante de domicilio\n" +
                    "• Depósito de garantía\n\n" +
                    "¿Te interesa conocer nuestros planes?\n" +
                    "Escribe '2' para hablar con un operador o '0' para volver al menú.",

  nonClientOption2: "👨‍💼 **Conectando con operador de ventas**\n\n" +
                    "Te estoy conectando con uno de nuestros asesores comerciales.\n" +
                    "Por favor espera un momento...",

  default: "❓ No entiendo tu mensaje.\n\n" +
           "Por favor elige una opción válida o escribe '0' para volver al menú principal."
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
        qrCodeData = `data:image/png;base64,${qr}`;
        io.emit('whatsapp_status', {
          is_connected: false,
          qr_code: qrCodeData,
          phone_number: null,
          last_connected: null
        });
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
          status: 'bot'
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
    const { data: savedMessage } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        sender_type: 'client',
        sender_id: client.id,
        content: messageText,
        message_type: 'text',
        timestamp: new Date().toISOString(),
        is_read: false
      }])
      .select()
      .single();

    // Update client last message
    await supabase
      .from('clients')
      .update({ 
        last_message: messageText,
        last_message_at: new Date().toISOString()
      })
      .eq('id', client.id);

    // Update conversation last message time
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    // Reset inactivity timer
    resetInactivityTimer(conversation.id);

    // Process bot response if not assigned to operator
    if (!conversation.operator_id) {
      await processBotResponse(client, conversation, messageText);
    }

    // Emit real-time message to connected operators
    io.emit('new_message', {
      ...savedMessage,
      conversation_id: conversation.id,
      client_phone: phoneNumber,
      client_name: client.name
    });

  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

// Process bot responses with new flow
async function processBotResponse(client, conversation, messageText) {
  const normalizedMessage = messageText.toLowerCase().trim();
  let responseText = '';
  let shouldTransferToOperator = false;

  // Expresiones regulares para detectar variantes
  const isClientRegex = /(soy\s+cliente|1)/i;
  const nonClientRegex = /(no\s+soy\s+cliente|2)/i;

  const clientState = client.status || 'initial';

  // ---------- ESTADO INICIAL ----------
  if (clientState === 'initial') {
    responseText = botResponses.welcome;
    await updateClientStatus(client.id, 'choosing_type');

    if (sock && responseText) {
      await sock.sendMessage(`${client.phone}@s.whatsapp.net`, { text: responseText });

      // Guardar mensaje del bot en DB
      const { data: botMessage } = await supabase
        .from('messages')
        .insert([{
          conversation_id: conversation.id,
          sender_type: 'bot',
          sender_id: null,
          content: responseText,
          message_type: 'text',
          timestamp: new Date().toISOString(),
          is_read: true
        }])
        .select()
        .single();

      io.emit('new_message', {
        ...botMessage,
        conversation_id: conversation.id,
        client_phone: client.phone,
        client_name: client.name
      });
    }

    return; // no procesamos la respuesta inicial todavía
  }

  // ---------- ELECCIÓN TIPO CLIENTE ----------
  if (clientState === 'choosing_type') {
    if (isClientRegex.test(normalizedMessage)) {
      responseText = botResponses.clientWelcome;
      await updateClientStatus(client.id, 'client_menu');
      await supabase.from('clients').update({ is_client: 1 }).eq('id', client.id);

    } else if (nonClientRegex.test(normalizedMessage)) {
      responseText = botResponses.nonClientWelcome;
      await updateClientStatus(client.id, 'non_client_menu');
      await supabase.from('clients').update({ is_client: 2 }).eq('id', client.id);

    } else {
      responseText = botResponses.default;
    }
  }

  // ---------- MENÚ CLIENTE ----------
  else if (clientState === 'client_menu') {
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
        await updateClientStatus(client.id, 'choosing_type');
        break;
      default:
        responseText = botResponses.default;
    }
  }

  // ---------- MENÚ NO CLIENTE ----------
  else if (clientState === 'non_client_menu') {
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
        await updateClientStatus(client.id, 'choosing_type');
        break;
      default:
        responseText = botResponses.default;
    }
  }

  // ---------- RESPONDER Y GUARDAR MENSAJE ----------
  if (sock && responseText) {
    try {
      await sock.sendMessage(`${client.phone}@s.whatsapp.net`, { text: responseText });

      const { data: botMessage } = await supabase
        .from('messages')
        .insert([{
          conversation_id: conversation.id,
          sender_type: 'bot',
          sender_id: null,
          content: responseText,
          message_type: 'text',
          timestamp: new Date().toISOString(),
          is_read: true
        }])
        .select()
        .single();

      io.emit('new_message', {
        ...botMessage,
        conversation_id: conversation.id,
        client_phone: client.phone,
        client_name: client.name
      });

    } catch (error) {
      console.error('Error sending bot response:', error);
    }
  }

  // ---------- TRANSFERIR A OPERADOR SI CORRESPONDE ----------
  if (shouldTransferToOperator) {
    await supabase
      .from('conversations')
      .update({ status: 'waiting', operator_id: null })
      .eq('id', conversation.id);

    await updateClientStatus(client.id, 'waiting_operator');

    io.emit('operator_needed', {
      conversation_id: conversation.id,
      client_phone: client.phone,
      client_name: client.name
    });
  }
}



// Update client status
async function updateClientStatus(clientId, status) {
  await supabase
    .from('clients')
    .update({ status })
    .eq('id', clientId);
}

// Inactivity timer management
function resetInactivityTimer(conversationId) {
  // Clear existing timer
  if (inactivityTimers.has(conversationId)) {
    clearTimeout(inactivityTimers.get(conversationId));
  }

  // Set new timer
  const timer = setTimeout(async () => {
    await closeConversationByInactivity(conversationId);
  }, INACTIVITY_TIMEOUT);

  inactivityTimers.set(conversationId, timer);
}

// Close conversation by inactivity
async function closeConversationByInactivity(conversationId) {
  try {
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*, client:clients(*)')
      .eq('id', conversationId)
      .single();

    if (conversation && conversation.status === 'active') {
      // Close conversation
      await supabase
        .from('conversations')
        .update({ 
          status: 'closed',
          ended_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      // Update client status
      await updateClientStatus(conversation.client.id, 'bot');

      // Send closure message
      if (sock && isConnected) {
        const closureMessage = "⏰ Esta conversación ha sido cerrada por inactividad.\n\nSi necesitas ayuda nuevamente, envía cualquier mensaje para comenzar una nueva conversación.";
        
        await sock.sendMessage(`${conversation.client.phone}@s.whatsapp.net`, { 
          text: closureMessage 
        });

        // Save closure message
        await supabase
          .from('messages')
          .insert([{
            conversation_id: conversationId,
            sender_type: 'bot',
            sender_id: null,
            content: closureMessage,
            message_type: 'text',
            timestamp: new Date().toISOString(),
            is_read: true
          }]);
      }

      // Notify operators
      io.emit('conversation_closed', {
        conversation_id: conversationId,
        reason: 'inactivity'
      });

      // Remove timer
      inactivityTimers.delete(conversationId);
    }
  } catch (error) {
    console.error('Error closing conversation by inactivity:', error);
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

  // Send WhatsApp message to any number
  socket.on('send_whatsapp_message', async (data) => {
    try {
      await sendWhatsAppMessage(data.to, data.message);
      socket.emit('message_sent', { success: true });
    } catch (error) {
      socket.emit('message_sent', { success: false, error: error.message });
    }
  });

  // Close conversation manually
  socket.on('close_conversation', async (data) => {
    try {
      const { conversationId, operatorId } = data;
      
      // Close conversation
      await supabase
        .from('conversations')
        .update({ 
          status: 'closed',
          ended_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      // Get conversation details
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*, client:clients(*)')
        .eq('id', conversationId)
        .single();

      if (conversation) {
        // Update client status
        await updateClientStatus(conversation.client.id, 'bot');

        // Send closure message
        if (sock && isConnected) {
          const closureMessage = "✅ Esta conversación ha sido cerrada por nuestro operador.\n\nGracias por contactarnos. Si necesitas ayuda nuevamente, envía cualquier mensaje.";
          
          await sock.sendMessage(`${conversation.client.phone}@s.whatsapp.net`, { 
            text: closureMessage 
          });

          // Save closure message
          await supabase
            .from('messages')
            .insert([{
              conversation_id: conversationId,
              sender_type: 'bot',
              sender_id: null,
              content: closureMessage,
              message_type: 'text',
              timestamp: new Date().toISOString(),
              is_read: true
            }]);
        }

        // Clear inactivity timer
        if (inactivityTimers.has(conversationId)) {
          clearTimeout(inactivityTimers.get(conversationId));
          inactivityTimers.delete(conversationId);
        }

        // Notify all operators
        io.emit('conversation_closed', {
          conversation_id: conversationId,
          reason: 'manual',
          operator_id: operatorId
        });
      }

      socket.emit('conversation_closed_success', { conversationId });
    } catch (error) {
      console.error('Error closing conversation:', error);
      socket.emit('conversation_closed_error', { error: error.message });
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
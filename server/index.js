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

// Bot responses
const botResponses = {
  welcome: "¡Hola! 👋 Bienvenido a IRU NET. Soy tu asistente virtual.\n\n" +
           "Para brindarte la mejor atención, necesito saber:\n\n" +
           "1️⃣ SOY CLIENTE\n" +
           "2️⃣ NO SOY CLIENTE\n\n" +
           "Escribe el número de la opción que corresponde:",

  // Menú para clientes existentes
  clientMenu: "¡Estamos encantados de poder hablar contigo! 😊\n\n" +
              "Como cliente de IRU NET, puedo ayudarte con:\n\n" +
              "1️⃣ Información general\n" +
              "2️⃣ Reclamos\n" +
              "3️⃣ Hablar con un operador\n" +
              "4️⃣ Instructivo para pagar por la app IRUNET\n\n" +
              "Escribe el número de la opción que necesitas:",

  // Opciones para clientes
  clientOption1: "📋 **Información General - Clientes**\n\n" +
                 "Como cliente de IRU NET tienes acceso a:\n" +
                 "• Soporte técnico 24/7\n" +
                 "• App IRUNET para gestionar tu cuenta\n" +
                 "• Múltiples formas de pago\n" +
                 "• Atención personalizada\n\n" +
                 "Horario de atención: Lunes a Viernes 9:00 - 18:00\n\n" +
                 "¿Te puedo ayudar con algo más?\n" +
                 "Escribe '0' para volver al menú principal o '3' para hablar con un operador.",

  clientOption2: "📞 **Reclamos**\n\n" +
                 "Lamento que tengas un inconveniente. Te conectaré inmediatamente con uno de nuestros operadores especializados en reclamos.\n\n" +
                 "Un momento por favor...",

  clientOption3: "👨‍💼 **Conectando con operador**\n\n" +
                 "Te estoy conectando con uno de nuestros operadores.\n" +
                 "Por favor espera un momento...",

  clientOption4: "📱 **Instructivo App IRUNET**\n\n" +
                 "Para pagar a través de nuestra app:\n\n" +
                 "1️⃣ Descarga la app 'IRUNET' desde Play Store o App Store\n" +
                 "2️⃣ Ingresa con tu número de cliente\n" +
                 "3️⃣ Ve a la sección 'Pagos'\n" +
                 "4️⃣ Selecciona el método de pago (tarjeta, transferencia, etc.)\n" +
                 "5️⃣ Confirma el pago\n\n" +
                 "¿Necesitas ayuda con algún paso específico?\n" +
                 "Escribe '0' para volver al menú o '3' para hablar con un operador.",

  // Menú para no clientes
  nonClientMenu: "¡Gracias por tu interés en IRU NET! 🌐\n\n" +
                 "Como futuro cliente, puedo ayudarte con:\n\n" +
                 "1️⃣ Información general\n" +
                 "2️⃣ Hablar con un operador\n\n" +
                 "Escribe el número de la opción que necesitas:",

  // Opciones para no clientes
  nonClientOption1: "📍 **Información General - Nuevos Clientes**\n\n" +
                    "**🏢 Ubicación:**\n" +
                    "Nos encontramos en [Dirección de IRU NET]\n\n" +
                    "**🏘️ Barrios que abarcamos:**\n" +
                    "• Centro\n" +
                    "• Barrio Norte\n" +
                    "• Villa Nueva\n" +
                    "• San Martín\n" +
                    "• [Otros barrios]\n\n" +
                    "**📋 Requisitos para ser cliente:**\n" +
                    "• DNI del titular\n" +
                    "• Comprobante de domicilio\n" +
                    "• Depósito de garantía\n\n" +
                    "¿Te interesa contratar nuestros servicios?\n" +
                    "Escribe '2' para hablar con un operador o '0' para volver al menú principal.",

  nonClientOption2: "👨‍💼 **Conectando con operador de ventas**\n\n" +
                    "Te estoy conectando con uno de nuestros asesores comerciales.\n" +
                    "Podrán brindarte información detallada sobre nuestros planes y servicios.\n\n" +
                    "Por favor espera un momento...",

  default: "❓ No entiendo tu mensaje.\n\n" +
           "Por favor elige una opción válida escribiendo el número correspondiente.\n\n" +
           "Escribe '0' para volver al menú principal."
};

// User session states
const userSessions = new Map();

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
      await processBotResponse(client, conversation, messageText, phoneNumber);
    }

    // Emit to connected operators
    io.emit('new_message', {
      conversation_id: conversation.id,
      client_phone: phoneNumber,
      message: messageText
    });

  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

// Process bot responses
async function processBotResponse(client, conversation, messageText, phoneNumber) {
  let responseText = '';
  let shouldTransferToOperator = false;

  const normalizedMessage = messageText.toLowerCase().trim();
  
  // Get or initialize user session
  let userSession = userSessions.get(phoneNumber) || { state: 'welcome', clientType: null };

  // Handle different states
  switch (userSession.state) {
    case 'welcome':
      if (normalizedMessage === '1') {
        // SOY CLIENTE
        userSession.clientType = 'client';
        userSession.state = 'client_menu';
        responseText = botResponses.clientMenu;
      } else if (normalizedMessage === '2') {
        // NO SOY CLIENTE
        userSession.clientType = 'non_client';
        userSession.state = 'non_client_menu';
        responseText = botResponses.nonClientMenu;
      } else if (normalizedMessage === '0') {
        responseText = botResponses.welcome;
      } else {
        responseText = botResponses.welcome;
      }
      break;

    case 'client_menu':
      if (normalizedMessage === '1') {
        responseText = botResponses.clientOption1;
        userSession.state = 'client_option1';
      } else if (normalizedMessage === '2') {
        responseText = botResponses.clientOption2;
        shouldTransferToOperator = true;
      } else if (normalizedMessage === '3') {
        responseText = botResponses.clientOption3;
        shouldTransferToOperator = true;
      } else if (normalizedMessage === '4') {
        responseText = botResponses.clientOption4;
        userSession.state = 'client_option4';
      } else if (normalizedMessage === '0') {
        userSession.state = 'welcome';
        responseText = botResponses.welcome;
      } else {
        responseText = botResponses.default + "\n\n" + botResponses.clientMenu;
      }
      break;

    case 'non_client_menu':
      if (normalizedMessage === '1') {
        responseText = botResponses.nonClientOption1;
        userSession.state = 'non_client_option1';
      } else if (normalizedMessage === '2') {
        responseText = botResponses.nonClientOption2;
        shouldTransferToOperator = true;
      } else if (normalizedMessage === '0') {
        userSession.state = 'welcome';
        responseText = botResponses.welcome;
      } else {
        responseText = botResponses.default + "\n\n" + botResponses.nonClientMenu;
      }
      break;

    case 'client_option1':
    case 'client_option4':
      if (normalizedMessage === '0') {
        userSession.state = 'welcome';
        responseText = botResponses.welcome;
      } else if (normalizedMessage === '3') {
        responseText = botResponses.clientOption3;
        shouldTransferToOperator = true;
      } else {
        responseText = botResponses.default + "\n\nEscribe '0' para volver al menú principal o '3' para hablar con un operador.";
      }
      break;

    case 'non_client_option1':
      if (normalizedMessage === '0') {
        userSession.state = 'welcome';
        responseText = botResponses.welcome;
      } else if (normalizedMessage === '2') {
        responseText = botResponses.nonClientOption2;
        shouldTransferToOperator = true;
      } else {
        responseText = botResponses.default + "\n\nEscribe '2' para hablar con un operador o '0' para volver al menú principal.";
      }
      break;

    default:
      userSession.state = 'welcome';
      responseText = botResponses.welcome;
      break;
  }

  // Update user session
  userSessions.set(phoneNumber, userSession);

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

    // Clear user session when transferring to operator
    userSessions.delete(phoneNumber);

    // Notify operators
    io.emit('operator_needed', {
      conversation_id: conversation.id,
      client_phone: client.phone,
      client_type: userSession.clientType
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
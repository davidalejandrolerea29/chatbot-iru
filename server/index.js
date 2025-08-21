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
           "Puedo ayudarte con:\n" +
           "1️⃣ Información general\n" +
           "2️⃣ Soporte técnico\n" +
           "3️⃣ Hablar con un operador\n\n" +
           "Escribe el número de la opción que necesitas:",
  
  option1: "📋 **Información General**\n\n" +
           "Somos IRU NET, tu solución en comunicaciones.\n" +
           "Horario: Lunes a Viernes 9:00 - 18:00\n\n" +
           "¿Te puedo ayudar con algo más?\n" +
           "Escribe '0' para volver al menú principal o '3' para hablar con un operador.",
  
  option2: "🔧 **Soporte Técnico**\n\n" +
           "Para soporte técnico especializado, te conectaré con uno de nuestros operadores.\n" +
           "Un momento por favor...",
  
  option3: "👨‍💼 **Conectando con operador**\n\n" +
           "Te estoy conectando con uno de nuestros operadores humanos.\n" +
           "Por favor espera un momento...",
  
  default: "❓ No entiendo tu mensaje.\n\n" +
           "Por favor elige una opción:\n" +
           "1️⃣ Información general\n" +
           "2️⃣ Soporte técnico\n" +
           "3️⃣ Hablar con un operador\n" +
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
            // Convierte el texto del QR en una imagen en formato data URL (Base64)
            const qrBase64 = await qrcode.toDataURL(qr);
            
            // Asigna la imagen Base64 a la variable global
            qrCodeData = qrBase64; 

            // Emite el estado con la imagen Base64 para el frontend
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
      await processBotResponse(client, conversation, messageText);
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
async function processBotResponse(client, conversation, messageText) {
  let responseText = '';
  let shouldTransferToOperator = false;

  const normalizedMessage = messageText.toLowerCase().trim();

  // Check for specific responses
  if (normalizedMessage === '1') {
    responseText = botResponses.option1;
  } else if (normalizedMessage === '2' || normalizedMessage === '3') {
    responseText = normalizedMessage === '2' ? botResponses.option2 : botResponses.option3;
    shouldTransferToOperator = true;
  } else if (normalizedMessage === '0') {
    responseText = botResponses.welcome;
  } else if (!client.last_message || client.status === 'bot') {
    // First message or returning to bot
    responseText = botResponses.welcome;
  } else {
    responseText = botResponses.default;
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
      client_phone: client.phone
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
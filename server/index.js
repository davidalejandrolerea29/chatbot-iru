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
const io = socketIo(server, { cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let sock = null;
let qrCodeData = null;
let isConnected = false;
let phoneNumber = null;

const authDir = path.join(__dirname, 'auth_info');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir);

// --- Bot Responses ---
const botResponses = {
  welcome: "¡Hola! 👋 Bienvenido a IRU NET. Soy tu asistente virtual.\n\n1️⃣ SOY CLIENTE\n2️⃣ NO SOY CLIENTE\n\nEscribe el número de la opción que corresponde:",
  askName: "¡Hola! Para atenderte mejor, ¿puedes decirme tu nombre completo?",
  clientMenu: "¡Estamos encantados de poder hablar contigo! 😊\n\n1️⃣ Información general\n2️⃣ Reclamos\n3️⃣ Hablar con un operador\n4️⃣ Instructivo para pagar por la app IRUNET\n\nEscribe el número de la opción que necesitas:",
  clientOption1: "📋 **Información General - Clientes**\nComo cliente de IRU NET tienes acceso a:\n• Soporte técnico 24/7\n• App IRUNET para gestionar tu cuenta\n• Múltiples formas de pago\n• Atención personalizada\n\nHorario: Lunes a Viernes 9:00 - 18:00\n\n¿Te puedo ayudar con algo más?\nEscribe '0' para volver al menú principal o '3' para hablar con un operador.",
  clientOption2: "📞 **Reclamos**\nTe conectaré con un operador especializado en reclamos. Un momento...",
  clientOption3: "👨‍💼 **Conectando con operador**\nPor favor espera un momento...",
  clientOption4: "📱 **Instructivo App IRUNET**\n1️⃣ Descarga la app 'IRUNET'\n2️⃣ Ingresa con tu número de cliente\n3️⃣ Ve a 'Pagos'\n4️⃣ Selecciona método de pago\n5️⃣ Confirma el pago\n\nEscribe '0' para volver al menú o '3' para hablar con un operador.",
  nonClientMenu: "¡Gracias por tu interés en IRU NET! 🌐\n\n1️⃣ Información general\n2️⃣ Hablar con un operador\n\nEscribe el número de la opción que necesitas:",
  nonClientOption1: "📍 **Información General - Nuevos Clientes**\n🏢 Ubicación: [Dirección]\n🏘️ Barrios: Centro, Barrio Norte, Villa Nueva, San Martín...\n📋 Requisitos: DNI del titular, comprobante de domicilio, depósito de garantía.\n\n¿Te interesa contratar nuestros servicios?\nEscribe '2' para hablar con un operador o '0' para volver al menú.",
  nonClientOption2: "👨‍💼 **Conectando con operador de ventas**\nUn momento, te conecto con un asesor comercial.",
  default: "❓ No entiendo tu mensaje. Escribe '0' para volver al menú principal."
};

// --- User session states ---
const userSessions = new Map();

// --- WhatsApp Connection ---
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ['IRU NET', 'Chrome', '1.0.0'] });

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        const qrBase64 = await qrcode.toDataURL(qr);
        qrCodeData = qrBase64;
        io.emit('whatsapp_status', { is_connected: false, qr_code: qrBase64, phone_number: null, last_connected: null });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        isConnected = false; phoneNumber = null; qrCodeData = null;
        io.emit('whatsapp_status', { is_connected: false, qr_code: null, phone_number: null, last_connected: null });
        if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
      } else if (connection === 'open') {
        isConnected = true;
        phoneNumber = sock.user?.id?.split(':')[0] || null;
        qrCodeData = null;
        io.emit('whatsapp_status', { is_connected: true, qr_code: null, phone_number: phoneNumber, last_connected: new Date().toISOString() });

      }
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) if (!msg.key.fromMe && msg.message) await handleIncomingMessage(msg);
      }
    });

  } catch (error) {
    console.error('Error connecting to WhatsApp:', error);
    setTimeout(connectToWhatsApp, 5000);
  }
}

// --- Handle Incoming Messages ---
// Manejo de mensajes entrantes
async function handleIncomingMessage(msg) {
  const phoneNumber = msg.key.remoteJid?.replace('@s.whatsapp.net', '');
  const messageText = msg.message?.conversation ||
                     msg.message?.extendedTextMessage?.text || '';

  if (!phoneNumber || !messageText) return;

  console.log(`Message from ${phoneNumber}: ${messageText}`);

  try {
    // Buscar o crear cliente
    let { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('phone', phoneNumber)
      .maybeSingle();

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

    // Si no tiene nombre, pedimos nombre primero
    let userSession = userSessions.get(phoneNumber) || { state: 'welcome', clientType: null };
    if (!client.name && userSession.state !== 'awaiting_name') {
      userSessions.set(phoneNumber, { state: 'awaiting_name', clientType: null });
      await sock.sendMessage(`${phoneNumber}@s.whatsapp.net`, { 
        text: "¡Hola! Para comenzar, por favor dime tu nombre completo:" 
      });
      return; // no procesamos nada más hasta que responda el nombre
    }

    // Si estamos esperando nombre
    if (userSession.state === 'awaiting_name') {
      const name = messageText.trim();
      await supabase
        .from('clients')
        .update({ name })
        .eq('phone', phoneNumber);

      userSessions.set(phoneNumber, { state: 'welcome', clientType: null });
      await sock.sendMessage(`${phoneNumber}@s.whatsapp.net`, { 
        text: `¡Gracias, ${name}! Ahora puedes elegir una opción:\n\n1️⃣ Soy cliente\n2️⃣ No soy cliente` 
      });
      return;
    }

    // Buscar o crear conversación activa
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', client.id)
      .eq('status', 'active')
      .maybeSingle(); // evita error si no hay

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

    // Guardar mensaje en DB
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

    // Actualizar último mensaje
    await supabase
      .from('clients')
      .update({ 
        last_message: messageText,
        last_message_at: new Date().toISOString()
      })
      .eq('id', client.id);

    // Procesar respuesta bot si no tiene operador asignado
    if (!conversation.operator_id) {
      await processBotResponse(client, conversation, messageText, phoneNumber);
    }

    // Emitir a operadores conectados
    io.emit('new_message', {
      conversation_id: conversation.id,
      client_phone: phoneNumber,
      message: messageText
    });

  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

// Procesar respuesta del bot
async function processBotResponse(client, conversation, messageText, phoneNumber) {
  let responseText = '';
  let shouldTransferToOperator = false;

  const normalizedMessage = messageText.toLowerCase().trim();

  // Obtener o inicializar sesión
  let session = userSessions.get(phoneNumber) || { state: 'welcome', clientType: null };

  switch (session.state) {
    case 'welcome':
      if (normalizedMessage === '1') {
        session.clientType = 'client';
        session.state = 'client_menu';
        responseText = botResponses.clientMenu;
      } else if (normalizedMessage === '2') {
        session.clientType = 'non_client';
        session.state = 'non_client_menu';
        responseText = botResponses.nonClientMenu;
      } else if (normalizedMessage === '0') {
        responseText = botResponses.welcome;
      } else {
        responseText = botResponses.welcome;
      }
      break;

    case 'client_menu':
      if (normalizedMessage === '1') {
        session.state = 'client_option1';
        responseText = botResponses.clientOption1;
      } else if (normalizedMessage === '2') {
        responseText = botResponses.clientOption2;
        shouldTransferToOperator = true;
      } else if (normalizedMessage === '3') {
        responseText = botResponses.clientOption3;
        shouldTransferToOperator = true;
      } else if (normalizedMessage === '4') {
        session.state = 'client_option4';
        responseText = botResponses.clientOption4;
      } else if (normalizedMessage === '0') {
        session.state = 'welcome';
        responseText = botResponses.welcome;
      } else {
        responseText = botResponses.default + "\n\n" + botResponses.clientMenu;
      }
      break;

    case 'non_client_menu':
      if (normalizedMessage === '1') {
        session.state = 'non_client_option1';
        responseText = botResponses.nonClientOption1;
      } else if (normalizedMessage === '2') {
        responseText = botResponses.nonClientOption2;
        shouldTransferToOperator = true;
      } else if (normalizedMessage === '0') {
        session.state = 'welcome';
        responseText = botResponses.welcome;
      } else {
        responseText = botResponses.default + "\n\n" + botResponses.nonClientMenu;
      }
      break;

    case 'client_option1':
    case 'client_option4':
      if (normalizedMessage === '0') {
        session.state = 'welcome';
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
        session.state = 'welcome';
        responseText = botResponses.welcome;
      } else if (normalizedMessage === '2') {
        responseText = botResponses.nonClientOption2;
        shouldTransferToOperator = true;
      } else {
        responseText = botResponses.default + "\n\nEscribe '2' para hablar con un operador o '0' para volver al menú principal.";
      }
      break;

    default:
      session.state = 'welcome';
      responseText = botResponses.welcome;
      break;
  }

  // Guardar sesión
  userSessions.set(phoneNumber, session);

  // Enviar respuesta del bot
  if (sock && responseText) {
    try {
      await sock.sendMessage(`${client.phone}@s.whatsapp.net`, { text: responseText });
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

  // Transferir a operador si aplica
  if (shouldTransferToOperator) {
    await supabase
      .from('conversations')
      .update({ status: 'waiting', operator_id: null })
      .eq('id', conversation.id);

    await supabase
      .from('clients')
      .update({ status: 'operator' })
      .eq('id', client.id);

    userSessions.delete(phoneNumber);

    io.emit('operator_needed', {
      conversation_id: conversation.id,
      client_phone: client.phone,
      client_type: session.clientType
    });
  }
}



// --- Send WhatsApp Message ---
async function sendWhatsAppMessage(to, message) {
  if (!sock || !isConnected) throw new Error('WhatsApp not connected');
  await sock.sendMessage(`${to}@s.whatsapp.net`, { text: message });
}

// --- Socket.IO ---
io.on('connection', (socket) => {
  socket.emit('whatsapp_status', { is_connected: isConnected, qr_code: qrCodeData, phone_number: phoneNumber, last_connected: isConnected ? new Date().toISOString() : null });

  socket.on('connect_whatsapp', () => { if (!isConnected && !sock) connectToWhatsApp(); });
  socket.on('disconnect_whatsapp', async () => { if (sock) { await sock.logout(); sock = null; isConnected = false; phoneNumber = null; qrCodeData = null; } });
  socket.on('send_whatsapp_message', async (data) => {
    try { await sendWhatsAppMessage(data.to, data.message); socket.emit('message_sent', { success: true }); } 
    catch (error) { socket.emit('message_sent', { success: false, error: error.message }); }
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`IRU NET Server running on port ${PORT}`); setTimeout(connectToWhatsApp, 2000); });

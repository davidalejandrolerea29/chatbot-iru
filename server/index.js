const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Estado de WhatsApp (con Cloud API siempre está "conectado")
let isConnected = true;
let phoneNumber = null;

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

// Función para enviar mensaje por Cloud API
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.response?.data || error.message);
    throw error;
  }
}

// Webhook de verificación (Meta lo pide)
app.get('/webhook/whatsapp', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "iru-net-verify";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("Webhook verificado ✅");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook para recibir mensajes
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const data = req.body;

    if (data.object === "whatsapp_business_account") {
      const entry = data.entry?.[0];
      const changes = entry?.changes?.[0];
      const messages = changes?.value?.messages;

      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from; // número de teléfono del cliente
        const text = msg.text?.body;

        console.log(`📩 Mensaje entrante de ${from}: ${text}`);

        await handleIncomingMessage(from, text);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook:", err.message);
    res.sendStatus(500);
  }
});

// Procesar mensaje entrante
async function handleIncomingMessage(phoneNumber, messageText) {
  if (!phoneNumber || !messageText) return;

  try {
    // Buscar o crear cliente
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

    // Buscar o crear conversación
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

    // Guardar mensaje del cliente
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

    // Actualizar cliente
    await supabase
      .from('clients')
      .update({
        last_message: messageText,
        last_message_at: new Date().toISOString()
      })
      .eq('id', client.id);

    // Procesar respuesta del bot
    if (!conversation.operator_id) {
      await processBotResponse(client, conversation, messageText);
    }

    // Emitir a operadores conectados
    io.emit('new_message', {
      conversation_id: conversation.id,
      client_phone: phoneNumber,
      message: messageText
    });

  } catch (error) {
    console.error('Error manejando mensaje:', error);
  }
}

// Respuestas automáticas
async function processBotResponse(client, conversation, messageText) {
  let responseText = '';
  let shouldTransferToOperator = false;

  const normalizedMessage = messageText.toLowerCase().trim();

  if (normalizedMessage === '1') {
    responseText = botResponses.option1;
  } else if (normalizedMessage === '2' || normalizedMessage === '3') {
    responseText = normalizedMessage === '2' ? botResponses.option2 : botResponses.option3;
    shouldTransferToOperator = true;
  } else if (normalizedMessage === '0') {
    responseText = botResponses.welcome;
  } else if (!client.last_message || client.status === 'bot') {
    responseText = botResponses.welcome;
  } else {
    responseText = botResponses.default;
  }

  if (responseText) {
    await sendWhatsAppMessage(client.phone, responseText);

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
  }

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

    io.emit('operator_needed', {
      conversation_id: conversation.id,
      client_phone: client.phone
    });
  }
}

// Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.emit('whatsapp_status', {
    is_connected: isConnected,
    phone_number: phoneNumber,
    last_connected: new Date().toISOString()
  });

  socket.on('send_whatsapp_message', async (data) => {
    try {
      await sendWhatsAppMessage(data.to, data.message);
      socket.emit('message_sent', { success: true });
    } catch (error) {
      socket.emit('message_sent', { success: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`IRU NET Server (Cloud API) corriendo en puerto ${PORT}`);
});

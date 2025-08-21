# IRU NET - Sistema de Chatbot WhatsApp con Panel de Operadores

Sistema completo de gestión de chat WhatsApp con chatbot automático y panel de operadores.

## 🚀 Características

- **Panel de Operadores**: Interfaz web para que los operadores gestionen conversaciones
- **Chatbot Automático**: Bot inteligente con opciones predefinidas
- **WhatsApp Integration**: Conexión directa con WhatsApp usando Baileys
- **Chat en Tiempo Real**: WebSockets para comunicación instantánea
- **Gestión de Usuarios**: Sistema de autenticación y roles
- **Dashboard Analytics**: Estadísticas y métricas del sistema
- **Base de Datos**: Supabase para almacenamiento seguro

## 📋 Requisitos Previos

1. **Supabase Account**: Crear cuenta en [supabase.com](https://supabase.com)
2. **Node.js**: Versión 16 o superior
3. **WhatsApp**: Número de teléfono para conectar

## 🛠️ Configuración

### 1. Configurar Supabase

1. Haz clic en **"Connect to Supabase"** en la parte superior derecha
2. Crea un nuevo proyecto en Supabase
3. Ve a Settings → API y copia:
   - Project URL
   - Service Role Key (secret)

### 2. Configurar Variables de Entorno

Edita el archivo `server/.env`:

```env
SUPABASE_URL=tu_supabase_url_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_key_aqui
PORT=3001
```

### 3. Inicializar Base de Datos

Las migraciones se ejecutarán automáticamente cuando conectes Supabase.

### 4. Iniciar el Sistema

```bash
# Terminal 1: Frontend (ya ejecutándose)
npm run dev

# Terminal 2: Backend
cd server
npm start
```

## 📱 Conectar WhatsApp

1. Ve a la sección **"WhatsApp"** en el panel
2. Haz clic en **"Conectar"**
3. Escanea el código QR con WhatsApp Web
4. ¡Listo! El sistema está conectado

## 👥 Uso del Sistema

### Para Operadores:
1. **Registro**: Crear cuenta de operador
2. **Login**: Iniciar sesión en el panel
3. **Chat**: Gestionar conversaciones desde la interfaz
4. **Estadísticas**: Ver métricas en tiempo real

### Para Clientes (WhatsApp):
1. Enviar mensaje al número conectado
2. Interactuar con el chatbot automático
3. Solicitar operador humano cuando sea necesario

## 🤖 Flujo del Chatbot

```
Cliente envía mensaje
    ↓
Chatbot responde con opciones:
1️⃣ Información general
2️⃣ Soporte técnico  
3️⃣ Hablar con operador
    ↓
Si elige 2 o 3 → Transfiere a operador
Si elige 1 → Información automática
```

## 🔧 Estructura del Proyecto

```
iru-net/
├── src/                    # Frontend React
│   ├── components/         # Componentes UI
│   ├── contexts/          # Context providers
│   ├── lib/               # Utilidades
│   └── types/             # TypeScript types
├── server/                # Backend Node.js
│   ├── index.js           # Servidor principal
│   └── package.json       # Dependencias backend
└── supabase/
    └── migrations/        # Migraciones DB
```

## 🚨 Solución de Problemas

### WhatsApp no conecta:
- Verificar que el número no esté conectado en otro dispositivo
- Reiniciar el servidor backend
- Generar nuevo código QR

### Base de datos:
- Verificar configuración de Supabase
- Comprobar variables de entorno
- Revisar permisos de RLS

### Operadores no pueden chatear:
- Verificar que estén autenticados
- Comprobar conexión WebSocket
- Revisar estado de la conversación

## 📞 Soporte

Para soporte técnico, contacta al equipo de desarrollo de IRU NET.

---

**IRU NET** - Tu solución completa para gestión de chat WhatsApp
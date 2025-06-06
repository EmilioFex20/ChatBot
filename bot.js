import {
  makeWASocket,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import express from "express";
import cors from 'cors';
import { useMongoAuthState } from "./mongoAuth.js"; 
import { borrarSesionMongo } from "./mongoAuth.js";
import excluirContactos from "./contactos_excluir.json" with { type: "json" };
import respuestas from "./respuestas.json" with { type: "json" };
import dotenv from "dotenv";
import bodyParser from "body-parser";
import fs from "fs";

const EXCLUIR_PATH = "./contactos_excluir.json";
dotenv.config();

function leerContactosExcluidos() {
  try {
    return JSON.parse(fs.readFileSync(EXCLUIR_PATH, "utf-8"));
  } catch (err) {
    console.error("Error leyendo el archivo de exclusión:", err);
    return [];
  }
}

function guardarContactosExcluidos(nuevaLista) {
  fs.writeFileSync(EXCLUIR_PATH, JSON.stringify(nuevaLista, null, 2), "utf-8");
}

let QRactual = null;
let sock = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMongoAuthState();
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr  } = update;
    const error = lastDisconnect?.error;
    if (qr) {
      QRactual = qr;
    }

    if (connection === "open") {
      console.log("Conectado a WhatsApp correctamente.");
      QRactual = null;
      return;
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason == DisconnectReason.loggedOut) {
        console.log("Sesión cerrada en todos los dispositivos");
        await borrarSesionMongo();
        console.log(
          "Se borraron los datos de autenticación. Se dará un nuevo QR en la próxima ejecución"
        );
      } else if (reason === DisconnectReason.badSession) {
        console.log("Sesión inválida. Eliminando credenciales");
        await borrarSesionMongo();
      } else {
        console.log(`Error (${reason}). Intentando reconectar`);
      }

      setTimeout(() => {
        console.log("Reconectando...");
        connectToWhatsApp();
      }, 3000);      
    } 
  });


  const estadoConversacion = {};

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        const sender = msg.key.remoteJid;
        const excluirContactos = leerContactosExcluidos();

        if (excluirContactos.includes(sender)) {
          console.log(`Mensaje ignorado de: ${sender}`);
          continue;
        }
        if (estadoConversacion[sender] === "esperando") {
          console.log(`Esperando respuesta de ${sender}, no se responde.`);
          continue;
        }

        const messageContent =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "";

        console.log(`Mensaje recibido: ${messageContent} de ${sender}`);

        let respuesta = "No entendí tu pregunta. ¿Puedes reformularla?";
        for (const palabra in respuestas) {
          if (messageContent.toLowerCase().includes(palabra)) {
            respuesta = respuestas[palabra];
            break;
          }
        }
        await sock.sendMessage(sender, {
          text: respuesta,
        });
        estadoConversacion[sender] = "esperando";
      }
      if (msg.key.fromMe) {
        const sender = msg.key.remoteJid;
        estadoConversacion[sender] = null;
        console.log(`Se restablece estado de ${sender}`);
      }
    }
  });
}

connectToWhatsApp();

const app = express();
const corsOptions = {
  origin: ["https://chat-bot-landin.vercel.app"],
  methods: ["GET", "POST"],
  credentials: true,
};
app.use(cors(corsOptions), bodyParser.json(), express.json()); 
const PORT = process.env.PORT;


app.get("/qr", (req, res) => {
  if (!QRactual) {
    return res.json({ status: "fallo", message: "No hay QR :|" });
  }
  return res.json({ status: "ok", qr: QRactual });
});

app.post("/excluir-grupos", (req, res) => {
  const { grupos } = req.body;

  if (!Array.isArray(grupos)) {
    return res.status(400).json({ status: "error", message: "Formato inválido" });
  }

  const actuales = leerContactosExcluidos();
  const nuevos = [...new Set([...actuales, ...grupos])];

  guardarContactosExcluidos(nuevos);

  res.json({ status: "ok", excluidos: nuevos });
});

app.post("/excluir", (req, res) => {
  const { numero } = req.body;

  if (!numero || typeof numero !== "string") {
    return res.status(400).json({ message: "Número inválido" });
  }

  let contactos = [];
  if (fs.existsSync(EXCLUIR_PATH)) {
    contactos = JSON.parse(fs.readFileSync(EXCLUIR_PATH));
  }

  if (!contactos.includes(numero)) {
    contactos.push(numero);
    fs.writeFileSync(EXCLUIR_PATH, JSON.stringify(contactos, null, 2));
    return res.json({ message: "Número excluido exitosamente" });
  }

  res.json({ message: "Ese número ya estaba excluido" });
});

app.get("/grupos", async (req, res) => {
    if (!sock || sock.user === undefined) {
    return res.status(503).json({ error: "WhatsApp no está conectado aún" });
  }
  const chats = await sock.groupFetchAllParticipating();
  const grupos = Object.entries(chats).map(([id, chat]) => ({
    id,
    subject: chat.subject,
  }));
  res.json(grupos);
});

app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});
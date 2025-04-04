import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Boom,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import excluirContactos from "./contactos_excluir.json" with { type: "json" };
import respuestas from "./respuestas.json" with { type: "json" };
import crypto from "crypto";
globalThis.crypto = crypto.webcrypto;


async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    logger: {
      level: "debug",
      stream: "console",
    },
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    const error = lastDisconnect?.error;
    const statusCode = error instanceof Boom ? error.output?.statusCode : null;

    if (connection === "open") {
      console.log("Conectado a WhatsApp correctamente.");
      return;
    }

    if (connection === "close") {
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("⚠️ Sesión cerrada en todos los dispositivos.");
        fs.rmSync("auth_info_baileys", { recursive: true, force: true });
        console.log("🔄 Se borraron las credenciales. Se requerirá un nuevo QR.");
      } else if (statusCode === DisconnectReason.badSession) {
        console.log("❌ Sesión inválida. Eliminando credenciales...");
        fs.rmSync("auth_info_baileys", { recursive: true, force: true });
      } else if (statusCode === DisconnectReason.connectionClosed) {
        console.log("🔌 Conexión cerrada. Intentando reconectar...");
      } else if (statusCode === DisconnectReason.connectionLost) {
        console.log("⚠️ Conexión perdida. Intentando reconectar...");
      } else {
        console.log(`⚠️ Error desconocido (${statusCode}). Intentando reconectar...`);
      }

      // Espera 5 segundos antes de reconectar para evitar bucle infinito
      await new Promise((res) => setTimeout(res, 5000));
      connectToWhatsApp();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) {
        const sender = msg.key.remoteJid;
        if (excluirContactos.includes(sender)) {
          console.log(`Mensaje ignorado de: ${sender}`);
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
      }
    }
  });
}

connectToWhatsApp();

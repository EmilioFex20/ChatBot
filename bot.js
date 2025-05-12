import {
  makeWASocket,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import express from "express";
import { useMongoAuthState } from "./mongoAuth.js"; 
import { borrarSesionMongo } from "./mongoAuth.js";
import excluirContactos from "./contactos_excluir.json" with { type: "json" };
import respuestas from "./respuestas.json" with { type: "json" };

let QRactual = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMongoAuthState();
  const sock = makeWASocket({
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

const app = express();
const PORT = 3000;

app.get("/qr", (req, res) => {
  if (!QRactual) {
    return res.json({ status: "fallo", message: "No hay QR :|" });
  }
  return res.json({ status: "ok", qr: QRactual });
});

app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});
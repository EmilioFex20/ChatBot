import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import excluirContactos from "./contactos_excluir.json" with { type: "json" };
import respuestas from "./respuestas.json" with { type: "json" };

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    const error = lastDisconnect?.error;

    if (connection === "open") {
      console.log("Conectado a WhatsApp correctamente.");
      return;
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason == DisconnectReason.loggedOut) {
        console.log("Sesión cerrada en todos los dispositivos");
        fs.rmSync("auth_info_baileys", { recursive: true, force: true });
        console.log(
          "Se borraron los datos de autenticación. Se dará un nuevo QR en la próxima ejecución"
        );
      } else if (statusCode === DisconnectReason.badSession) {
        console.log("Sesión inválida. Eliminando credenciales");
        fs.rmSync("auth_info_baileys", { recursive: true, force: true });
      } else {
        console.log(`Error (${statusCode}). Intentando reconectar`);
      }

      console.log("Reconectando...");
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

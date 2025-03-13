import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import * as fs from "fs";

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason == DisconnectReason.loggedOut) {
        console.log("Sesión cerrada en todos los dispositivos.");
        fs.rmSync("auth_info_baileys", { recursive: true, force: true });
        console.log(
          "Se borraron los datos de autenticación. Se dará un nuevo QR en la próxima ejecución."
        );
      }

      console.log("Reconectando...");
      connectToWhatsApp();
    } else if (connection === "open") {
      console.log("Conectado a WhatsApp");
    }
  });

  const excluirContactos = [
    "521XXXXXXXXXX@s.whatsapp.net",
    "YYYYYYYYYYYYYYYYYY@g.us",
  ];

  const respuestas = {
    "doble grado":
      "El programa de doble grado te permite obtener dos títulos universitarios simultáneamente en dos universidades.",
    becas:
      "Para información sobre becas, consulta la página oficial de becas de Cetys Universidad.",
    inscripción:
      "Las inscripciones se realizan en línea en el portal de estudiantes micampus.",
    horarios:
      "Los horarios de clase se publican en el portal micampus antes de cada semestre. A su vez, se encuentra disponible en la app de Cetys Universidad.",
  };

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

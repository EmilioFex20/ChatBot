import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { useMongoAuthState } from "./mongoAuth.js"; 

async function obtenerGrupos() {
  const { state, saveCreds } = await useMongoAuthState();
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    if (update.connection === "open") {
      console.log("Conectado a WhatsApp");
      listarGrupos(sock);
    }
  });
}

async function listarGrupos(sock) {
  const chats = await sock.groupFetchAllParticipating();
  console.log("Lista de grupos:");
  for (const id in chats) {
    console.log(`Grupo: ${chats[id].subject} - ID: ${id}`);
  }
}

obtenerGrupos();

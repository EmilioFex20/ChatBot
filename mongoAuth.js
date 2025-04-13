import Auth from "./models/Auth.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";

dotenv.config({ path: ".env.local" });

const uri = process.env.MONGODB_URI;

export const useMongoAuth = async () => {
  if (!uri) {
    throw new Error("No se encontró MONGODB_URI en las variables de entorno");
  }

  await mongoose.connect(uri);
  let auth = await Auth.findOne({ id: "default" });

  if (!auth) {
    auth = new Auth({
      id: "default",
      creds: initAuthCreds(),
      keys: {},
    });
    await auth.save();
  }

  const state = {
    creds: auth.creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          const value = auth.keys?.[type]?.[id];
          if (value) {
            data[id] = BufferJSON.toObject(value);
          }
        }
        return data;
      },
      set: async (data) => {
        for (const type in data) {
          if (!auth.keys[type]) auth.keys[type] = {};
          for (const id in data[type]) {
            auth.keys[type][id] = BufferJSON.fromObject(data[type][id]);
          }
        }
        await auth.save();
      },
    },
  };

  const saveCreds = async () => {
    await Auth.updateOne(
      { id: "default" },
      { $set: { creds: state.creds, keys: auth.keys } },
      { upsert: true }
    );
  };

  const clearCreds = async () => {
    await Auth.deleteOne({ id: "default" });
  };

  return { state, saveCreds, clearCreds };
};

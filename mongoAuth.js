import { MongoClient } from "mongodb";
import {
  initAuthCreds,
  WAProto,
  BufferJSON
} from "@whiskeysockets/baileys";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "baileys_auth";
const COLLECTION_NAME = "auth_state";

export const useMongoAuthState = async () => {
  const client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  const readData = async (id) => {
    const doc = await collection.findOne({ _id: id });
    return doc?.data ? JSON.parse(doc.data, BufferJSON.reviver) : null;
  };

  const writeData = async (id, value) => {
    await collection.updateOne(
      { _id: id },
      { $set: { data: JSON.stringify(value, BufferJSON.replacer) } },
      { upsert: true }
    );
  };

  const removeData = async (id) => {
    await collection.deleteOne({ _id: id });
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = WAProto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value;
            })
          );
          return result;
        },
        set: async (data) => {
          const tasks = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }

          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData("creds", creds)
  };
};


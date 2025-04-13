import mongoose from "mongoose";

const AuthSchema = new mongoose.Schema({
  id: { type: String, default: "default" },
  creds: mongoose.Schema.Types.Mixed,
  keys: mongoose.Schema.Types.Mixed,
});

export default mongoose.model("Auth", AuthSchema);

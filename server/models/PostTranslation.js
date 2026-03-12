const mongoose = require("mongoose");

const PostTranslationSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    lang: { type: String, required: true },
    title: { type: String, default: "" },
    excerpt: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    contentBlocks: { type: Array, default: [] },
    sourceHash: { type: String, default: "" }
  },
  { timestamps: true }
);

PostTranslationSchema.index({ postId: 1, lang: 1 }, { unique: true });

module.exports = mongoose.model("PostTranslation", PostTranslationSchema);

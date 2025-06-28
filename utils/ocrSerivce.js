const axios = require("axios");
const FormData = require("form-data");

async function ocrTranslateImage(
  buffer,
  srcLang = "english",
  targetLang = "arabic"
) {
  try {
    const form = new FormData();

    form.append("file", buffer, {
      filename: "image.jpg",
      contentType: "image/png",
    });

    form.append("srcLang", srcLang);
    form.append("targetLang", targetLang);

    const res = await axios.post(
      "https://turjuman-ocr-production.up.railway.app/ocr-translate",
      form,
      {
        headers: form.getHeaders(),
      }
    );

    const data = res.data;

    console.log("🔍 RAW OCR RESPONSE:", data);

    if (!data.english_text || !data.translated_text) {
      throw new Error("OCR translation failed - missing text fields");
    }

    return {
      originalText: data.english_text.replace(/\n/g, " "),
      translation: data.translated_text.replace(/\n/g, " "),
    };
  } catch (error) {
    console.error("❌ OCR API error:", error.message);
    throw new Error("OCR translation failed");
  }
}

module.exports = ocrTranslateImage;

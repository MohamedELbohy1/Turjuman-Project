const axios = require("axios");

async function translateWordExternally(
  word,
  context,
  srcLang = "english",
  targetLang = "arabic"
) {
  try {
    const res = await axios.post(
      "https://turjumanmainfeature-production.up.railway.app/translate",
      {
        word,
        context,
        srcLang,
        targetLang,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = res.data;
    console.log("🔍 Raw response:", data);

    const result = data.success === false && data.details ? data.details : data;

    const examples =
      result.examples || (result.example_usage ? [result.example_usage] : []);

    if (
      !result.translated_word ||
      !result.definition ||
      examples.length === 0
    ) {
      console.log("⚠️ Incomplete result:", result);
      throw new Error("Translation failed - missing fields");
    }

    return {
      word: result.word || word,
      translation: result.translated_word,
      definition: result.definition,
      examples: examples,
      synonymsSrc: result.synonymsSrc || result.source_synonyms || [],
      synonymsTarget: result.synonymsTarget || result.target_synonyms || [],
    };
  } catch (err) {
    console.error("❌ Final catch error:", err.message);
    throw new Error("Translation failed");
  }
}

module.exports = translateWordExternally;

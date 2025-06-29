const axios = require("axios");

async function translateWordExternally(
  word,
  context,
  srcLang = "english",
  targetLang = "arabic"
) {
  if (!context || context.trim() === "") {
    context = word;
  }
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
    if (data.status === "Error") {
      throw new Error(`Translation failed: ${data.message}`);
    }

    const result = data.success === false && data.details ? data.details : data;

    const examples = Array.isArray(result.examples)
      ? result.examples
      : result.example_usage
        ? [result.example_usage]
        : [];

    const translation = result.translation || result.translated_word || "";
    const definition = result.definition || "";
    if (!translation || !definition || examples.length === 0) {
      console.log("⚠️ Incomplete result:", result);
      throw new Error("Translation failed - missing fields");
    }

    return {
      original: result.word || word,
      translation,
      definition,
      examples,
      synonyms_src: result.synonyms_src || result.source_synonyms || [],
      synonyms_target: result.synonyms_target || result.target_synonyms || [],
    };
  } catch (err) {
    console.error("❌ Final catch error:", err.message);
    throw new Error("Translation failed");
  }
}

module.exports = translateWordExternally;

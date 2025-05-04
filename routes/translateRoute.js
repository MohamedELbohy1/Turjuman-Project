const express = require("express");
const authController = require("./../Controllers/authController");
const translateController = require("./../Controllers/translateController");
const cardController = require("./../Controllers/flashCardController");

const router = express.Router();

// router.post("/translate", translateController.translateAndSave);

router.post(
  "/translate",
  authController.protectUserTranslate,
  translateController.checkTranslationLimit,
  translateController.translateAndSave
);

router.use(authController.protect);

router.get("/Home", translateController.userTanslations);
router.get("/alltranslations", translateController.getalltranslations);
router.get("/getTranslationsById/:id", translateController.getUserTranslation);
router.get("/favorites/translates", translateController.getFavorites);
router.get("/translations-History", translateController.getTranslationHistory);
router.get("/favorite/:id", translateController.markAsFavoriteById);
router.delete("/deletefavorite/:id", translateController.deleteFavoriteById);
router.patch("/level/:id", cardController.ChooseDifficulty);
router.get("/level/test/:id", cardController.HardTransMode);
//FlashCard Route 📝📝
router.get("/flashcards/generate", cardController.generateFlashcards);
router.get("/favoriteOrder", translateController.getSorting);
router.get(
  "/translate/search",
  translateController.searchAndFilterTranslations
);

router.delete("/deleteTrans/:id", translateController.deleteTranslationById);

module.exports = router;

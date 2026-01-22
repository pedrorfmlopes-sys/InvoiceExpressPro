const express = require('express');
const router = express.Router();
const controller = require('./controller');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });

// CRUD
router.get('/profiles', controller.list);
router.get('/profiles/:id', controller.get);
router.post('/profiles', controller.create);
router.put('/profiles/:id', controller.update);
router.delete('/profiles/:id', controller.delete);

// Logic
router.post('/match', upload.single('file'), controller.match);
router.post('/extract', upload.single('file'), controller.testExtraction);

module.exports = router;

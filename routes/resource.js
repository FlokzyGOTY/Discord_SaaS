const express = require('express');
const router = express.Router();
const multer = require('multer');
const Resource = require('../models/Resource');
const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

// Multer-Setup für File-Uploads (mit Original-Endung)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/files'));
  },
  filename: function (req, file, cb) {
    // Erzeuge einen eindeutigen Dateinamen mit Original-Endung
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Ressourcen auflisten
router.get('/admin/product/:productId/resources', async (req, res) => {
  const resources = await Resource.find({ productId: req.params.productId });
  res.json(resources);
});

// Key/Account(s) hinzufügen (Bulk oder einzeln)
router.post('/admin/product/:productId/resource', async (req, res) => {
  const { type, values } = req.body; // values: Array oder String
  if (!['key', 'account'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const items = Array.isArray(values) ? values : [values];
  const docs = await Resource.insertMany(items.map(value => ({
    productId: req.params.productId,
    type,
    value,
  })));
  res.json({ added: docs.length });
});

// File hinzufügen (Upload)
router.post('/admin/product/:productId/resource/file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/files/${req.file.filename}`;
  const doc = await Resource.create({
    productId: req.params.productId,
    type: 'file',
    value: req.file.originalname,
    fileUrl,
  });
  res.json({ added: 1, resource: doc });
});

// Ressource löschen
router.delete('/admin/resource/:resourceId', async (req, res) => {
  console.log(`[RESOURCE DELETE] Versuch, Ressource zu löschen: ${req.params.resourceId}`);
  const resource = await Resource.findById(req.params.resourceId);
  if (!resource) {
    console.warn(`[RESOURCE DELETE] Ressource nicht gefunden: ${req.params.resourceId}`);
    return res.status(404).json({ error: 'Not found' });
  }
  if (resource.type === 'file' && resource.fileUrl) {
    const absPath = path.join(__dirname, '..', resource.fileUrl);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  }
  await resource.deleteOne();
  console.log(`[RESOURCE DELETE] Ressource gelöscht: ${req.params.resourceId}`);
  res.json({ deleted: true });
});

// Download-Route für Dateien mit Originalnamen
router.get('/download/:resourceId', async (req, res) => {
  const resource = await Resource.findById(req.params.resourceId);
  if (!resource || resource.type !== 'file' || !resource.fileUrl) {
    return res.status(404).send('Datei nicht gefunden');
  }
  const absPath = path.join(__dirname, '..', resource.fileUrl);
  if (!fs.existsSync(absPath)) {
    return res.status(404).send('Datei nicht gefunden');
  }
  res.download(absPath, resource.value);
});

module.exports = router; 
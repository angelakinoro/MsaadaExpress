const express = require('express');
const router = express.Router();

// Import all route files
const authRoutes = require('./authRoutes');
const providerRoutes = require('./providerRoutes');
const ambulanceRoutes = require('./ambulanceRoutes');
const tripRoutes = require('./tripRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/providers', providerRoutes);
router.use('/ambulances', ambulanceRoutes);
router.use('/trips', tripRoutes);

module.exports = router;
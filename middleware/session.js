const session = require('express-session');

/**
 * Middleware de session très simple, basé sur la mémoire.
 * - Usage pédagogique uniquement (à ne pas utiliser tel quel en production).
 */
module.exports = session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60, // 1h
  },
});


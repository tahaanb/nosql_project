const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');

// Load env vars early
dotenv.config();

const sessionMiddleware = require('./middleware/session');
const accessControlMiddleware = require('./middleware/accessControl');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

// Routers
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const rolesRoutes = require('./routes/roles.routes');
const permissionsRoutes = require('./routes/permissions.routes');
const resourcesRoutes = require('./routes/resources.routes');
const ipRoutes = require('./routes/ip.routes');
const accessRoutes = require('./routes/access.routes');
const graphRoutes = require('./routes/graph.routes');

const app = express();

// Configuration CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim());

const corsOptions = {
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origine (comme les applications mobiles ou Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.warn('Origine non autorisée:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-Session-ID',
    'X-Requested-With',
    'X-XSRF-TOKEN'
  ],
  exposedHeaders: [
    'Content-Range',
    'X-Total-Count',
    'X-Request-Id',
    'X-Powered-By'
  ],
  maxAge: 86400, // 24 heures
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Middlewares de base
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Gestion des pré-vols OPTIONS
app.options('*', cors(corsOptions));

// Configuration CORS pour les autres requêtes
app.use(cors(corsOptions));

// Sécurité de base
app.disable('x-powered-by');
app.use((req, res, next) => {
  // Protection contre le clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Protection XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Politique de sécurité du contenu
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});

// Logging des requêtes
app.use(requestLogger);

// Session management (in-memory, pédagogique)
app.use(sessionMiddleware);

// Routes publiques (pas de contrôle d'accès)
app.use('/auth', authRoutes);

// Middleware central de décision d'accès
// Il s'applique à toutes les routes suivantes (API métier)
app.use(accessControlMiddleware);

// Routes protégées
app.use('/users', usersRoutes);
app.use('/roles', rolesRoutes);
app.use('/permissions', permissionsRoutes);
app.use('/resources', resourcesRoutes);
app.use('/ips', ipRoutes);
app.use('/access', accessRoutes);
app.use('/graph', graphRoutes);

// Healthcheck simple
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Gestion d'erreurs finale
app.use(errorHandler);

module.exports = app;


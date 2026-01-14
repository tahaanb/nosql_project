const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');

// Load env vars early
dotenv.config();

const sessionMiddleware = require('./middleware/session');
const accessControlMiddleware = require('./middleware/accessControl');
const errorHandler = require('./middleware/errorHandler');

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

// Basic middlewares
app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

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


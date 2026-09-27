// Opt-in LAN access for Expo Go; the normal API command remains local-only.
process.env.HOST = '0.0.0.0';
require('../backend/server');

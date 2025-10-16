// middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Limit untuk login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 5, // max 5 percobaan per IP
    message: 'Terlalu banyak percobaan login, coba lagi nanti.',
});

// Limit untuk registrasi
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 10, // lebih longgar dari login
    message: 'Terlalu banyak percobaan registrasi, coba lagi nanti.',
});

module.exports = { loginLimiter, registerLimiter };

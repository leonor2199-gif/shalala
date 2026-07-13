// Simple session-based authentication middleware
const authMiddleware = (req, res, next) => {
  // Check if user is logged in
  if (req.session && req.session.isLoggedIn) {
    return next();
  }
  
  // If accessing API, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Redirect to login page
  res.redirect('/login');
};

// Login handler
const login = (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password === adminPassword) {
    req.session.isLoggedIn = true;
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: 'Invalid password!' });
  }
};

// Logout handler
const logout = (req, res) => {
  req.session.destroy();
  res.redirect('/login');
};

module.exports = { authMiddleware, login, logout };
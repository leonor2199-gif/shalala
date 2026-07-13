// Simple authentication middleware
const authMiddleware = (req, res, next) => {
  console.log('🔍 Auth check - Session:', req.session ? 'exists' : 'missing');
  console.log('🔍 Auth check - isLoggedIn:', req.session?.isLoggedIn);
  
  if (req.session && req.session.isLoggedIn === true) {
    return next();
  }
  
  // If accessing API, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Redirect to login
  res.redirect('/login');
};

// Login handler
const login = (req, res) => {
  console.log('🔐 Login attempt');
  console.log('📝 Request body:', req.body);
  
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  console.log('📝 Admin password from env:', adminPassword);
  console.log('📝 Password provided:', password);
  
  if (!password) {
    return res.render('login', { error: 'Please enter a password' });
  }
  
  if (password === adminPassword) {
    // Set session
    req.session.isLoggedIn = true;
    req.session.user = 'Admin';
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.render('login', { error: 'Session error. Please try again.' });
      }
      console.log('✅ Login successful! Session saved.');
      console.log('📝 Session ID:', req.sessionID);
      console.log('📝 Session data:', req.session);
      return res.redirect('/dashboard');
    });
  } else {
    console.log('❌ Login failed: Invalid password');
    res.render('login', { error: 'Invalid password! Please try again.' });
  }
};

// Logout handler
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
};

module.exports = { authMiddleware, login, logout };

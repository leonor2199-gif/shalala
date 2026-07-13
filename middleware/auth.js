// Session-based authentication middleware
const authMiddleware = (req, res, next) => {
  // Check if session exists
  if (!req.session) {
    console.log('❌ No session object');
    return res.redirect('/login?error=session_error');
  }
  
  // Check if user is logged in
  if (req.session.isLoggedIn) {
    return next();
  }
  
  // If accessing API, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized - Please login first' });
  }
  
  // Redirect to login page
  res.redirect('/login');
};

// Login handler
const login = (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    console.log('🔐 Login attempt');
    console.log('📝 Admin password from env:', adminPassword ? 'Set' : 'Not set');
    console.log('📝 Password provided:', password ? 'Yes' : 'No');
    
    if (!password) {
      return res.render('login', { error: 'Please enter a password' });
    }
    
    if (password === adminPassword) {
      // Regenerate session to prevent fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.render('login', { error: 'Session error. Please try again.' });
        }
        
        req.session.isLoggedIn = true;
        req.session.user = 'Admin';
        
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return res.render('login', { error: 'Session error. Please try again.' });
          }
          console.log('✅ Login successful');
          res.redirect('/dashboard');
        });
      });
    } else {
      console.log('❌ Login failed: Invalid password');
      res.render('login', { error: 'Invalid password! Please try again.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Login error: ' + error.message });
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

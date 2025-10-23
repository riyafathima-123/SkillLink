export async function requireAuth(req, res, next) {
  // For demo, just set a default user if no token
  if (!req.user) {
    req.user = {
      id: '83eaa959-ed83-48be-8cbf-a80ba272b585',
      email: 'user@demo.com'
    };
  }
  next();
}
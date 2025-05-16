const validateProviderRegistration = (req, res, next) => {
    const { name, email, phone, address, firebaseId } = req.body;
    
    const errors = [];
    
    if (!name || name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long');
    }
    
    if (!email || !email.includes('@')) {
      errors.push('Valid email is required');
    }
    
    if (!phone || phone.trim().length < 10) {
      errors.push('Valid phone number is required');
    }
    
    if (!address || address.trim().length < 5) {
      errors.push('Valid address is required');
    }
    
    if (!firebaseId || firebaseId.trim().length < 10) {
      errors.push('Invalid Firebase ID');
    }
    
    if (errors.length > 0) {
      res.status(400);
      throw new Error(errors.join(', '));
    }
    
    next();
  };
  
  module.exports = {
    validateProviderRegistration
  };
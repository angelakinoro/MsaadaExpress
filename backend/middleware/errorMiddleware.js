const errorHandler = (err, req, res, next) => {
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    code: err.code
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 2) {
      return res.status(400).json({
        message: 'Invalid query parameters',
        error: err.message
      });
    }
    if (err.code === 13) {
      return res.status(500).json({
        message: 'Database permission error',
        error: err.message
      });
    }
  }

  // Default error
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
};

module.exports = { errorHandler };
/**
 * Custom error handler middleware
 */
const errorHandler = (err, req, res, next) => {
    // Log error for debugging
    console.error(err.stack);
    
    // Get status code
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    
    // Send error response
    res.status(statusCode).json({
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
  };
  
  /**
   * Not found middleware
   */
  const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
  };
  
  module.exports = { errorHandler, notFound };
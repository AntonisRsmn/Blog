/**
 * Middleware: allows only users whose resolved role is "admin".
 * Must be used AFTER the requireStaff middleware so that req.userRole is set.
 */
module.exports = function requireAdmin(req, res, next) {
  if (req.userRole === "admin") return next();
  return res.status(403).json({ error: "Admin access required." });
};

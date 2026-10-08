const { COOKIE, cookie } = require("./_auth");
module.exports = (req, res) => {
  res.statusCode = 302;
  res.setHeader("Set-Cookie", cookie(COOKIE, "", 0));
  res.setHeader("Location", "/");
  res.end();
};

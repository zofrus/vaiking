const facilities = require("../data/facilities.json");

// Served from the file so the quiet room answer never depends on the cluster.
// Hours stay null until someone verifies them.
module.exports = async function facilitiesRoute(app) {
  app.get("/api/facilities", async () => ({ facilities }));
};

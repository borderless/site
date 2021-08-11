import express from "express";
import { URL } from "node:url";
import { server } from "./dist/server/server.js";

server().then((siteServer) => {
  const app = express();

  app.use(express.static("dist/client"));

  app.get("*", async (req, res, next) => {
    try {
      const url = new URL(req.url, "http://localhost");

      const response = await siteServer({
        pathname: url.pathname,
        search: new Map(url.searchParams),
      });

      res.type(response.type);
      res.send(response.text);
    } catch (err) {
      next(err);
    }
  });

  app.listen(3000, () =>
    console.log(`Server running at http://localhost:3000`)
  );
});

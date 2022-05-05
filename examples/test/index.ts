import express from "express";
import { URL } from "node:url";
import { server } from "./dist/server/server.js";

const app = express();

app.use(express.static("dist/client"));

app.get("*", async (req, res, next) => {
  try {
    const url = new URL(req.url, "http://localhost");

    const response = await server({
      pathname: url.pathname,
      search: new Map(url.searchParams),
      headers: new Map(Object.entries(req.headers)),
    }, {});

    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    if (response.body) {
      const stream = await response.body.nodeStream();
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

app.listen(3000, () =>
  console.log(`Server running at http://localhost:3000`)
);

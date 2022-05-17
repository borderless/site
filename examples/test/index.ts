import express from "express";
import { fromNodeRequest } from "@borderless/site/node";
import { server } from "./dist/server/server.js";

const app = express();

app.use(express.static("dist/client"));

app.get("*", async (req, res, next) => {
  try {
    const response = await server(fromNodeRequest(req), {});

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

app.listen(3000, () => console.log(`Server running at http://localhost:3000`));

import express from "express";
import { createHandler } from "@borderless/site/adapters/node";
import { server } from "./dist/server/server.js";

const app = express();

app.use(express.static("dist/client"));
app.use(createHandler(server, () => undefined));

app.listen(3000, () => console.log(`Server running at http://localhost:3000`));

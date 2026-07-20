import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

export const app = express();

app.use(morgan("dev"));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/api", apiRouter);

app.use(errorHandler);

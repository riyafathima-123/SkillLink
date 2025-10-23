import matchmakingRouter from "./routes/matchmaking.js";
app.use("/api/matchmaking", matchmakingRouter);
import creditsRouter from "./routes/credits.js";
app.use("/api/credits", creditsRouter);

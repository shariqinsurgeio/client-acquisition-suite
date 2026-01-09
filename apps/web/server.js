const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  // Initialize Socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // Allow all for MVP, restrict to Extension ID later
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("EXTENSION_CONNECT", (data) => {
      console.log("Extension connected:", data);
      socket.emit("STATUS_UPDATE", { status: "CONNECTED" });
    });

    socket.on("DATA_INGEST", async (data) => {
      console.log("Received data ingest:", data);
      try {
        // Upsert: update if URL exists, create if not
        const existing = await prisma.job.findUnique({
          where: { url: data.url }
        });

        let job;
        let isNew = false;

        if (existing) {
          // Update existing job
          job = await prisma.job.update({
            where: { id: existing.id },
            data: {
              title: data.title || existing.title,
              description: data.description || existing.description,
            }
          });
          console.log("Updated existing job:", job.id);
        } else {
          // Create new job
          job = await prisma.job.create({
            data: {
              platform: data.platform || "UNKNOWN",
              title: data.title || "No Title",
              description: data.description || "",
              url: data.url,
              status: "NEW",
              fitScore: 0
            }
          });
          isNew = true;
          console.log("Created new job:", job.id);
        }

        // Only broadcast new jobs to dashboard
        if (isNew) {
          io.emit("JOB_UPDATE", job);
        }

        // Send ack back to extension
        socket.emit("DATA_ACK", { url: data.url, isNew, jobId: job.id });
      } catch (err) {
        console.error("Failed to save job:", err);
        socket.emit("ERROR", { message: "Failed to save job", url: data.url });
      }
    });

    // Forward CMD_EXECUTE from dashboard to extension
    socket.on("CMD_EXECUTE", (data) => {
      console.log("Forwarding CMD_EXECUTE:", data);
      // Broadcast to all connected clients (extension will handle it)
      io.emit("CMD_EXECUTE", data);
    });

    // Handle TASK_UPDATE from extension
    socket.on("TASK_UPDATE", async (data) => {
      console.log("Task update received:", data);
      if (data.jobId && data.status) {
        try {
          await prisma.job.update({
            where: { id: data.jobId },
            data: { status: data.status }
          });
        } catch (err) {
          console.error("Failed to update job status:", err);
        }
      }
      // Broadcast to dashboard
      io.emit("TASK_UPDATE", data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

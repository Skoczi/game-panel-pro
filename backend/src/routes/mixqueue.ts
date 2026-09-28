import { Router } from "express";
import { rootOnly, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  mixqueueStatus,
  changeMixqueue,
  safeError,
} from "../services/mixqueue.js";
import {
  mixqueueNodeStatus,
  installMixqueueNode,
} from "../services/mixqueueNode.js";

export const mixqueueNodeRoutes = Router();
mixqueueNodeRoutes.use(rootOnly);
mixqueueNodeRoutes.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
mixqueueNodeRoutes.get("/", async (_req, res) => {
  try {
    res.json(await mixqueueNodeStatus());
  } catch {
    res.status(503).json({ error: "operation_failed" });
  }
});
mixqueueNodeRoutes.post("/", async (req, res) => {
  if (req.body?.action !== "install") {
    res.status(400).json({ error: "invalid_import" });
    return;
  }
  installMixqueueNode();
  try {
    res.status(202).json(await mixqueueNodeStatus());
  } catch {
    res.status(503).json({ error: "operation_failed" });
  }
});

export const mixqueueServerRoutes = Router({ mergeParams: true });
mixqueueServerRoutes.use((req: AuthenticatedRequest, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.user?.isRoot && req.user?.delegation?.mixqueueOperator !== true) {
    res.status(403).json({ error: "operator_required" });
    return;
  }
  next();
});
mixqueueServerRoutes.get("/", async (req, res) => {
  try {
    res.json(
      await mixqueueStatus(Number((req.params as Record<string, string>).id)),
    );
  } catch (error: any) {
    res.status(error.statusCode || 503).json({ error: safeError(error) });
  }
});
mixqueueServerRoutes.post("/", async (req, res) => {
  try {
    res.json(
      await changeMixqueue(
        Number((req.params as Record<string, string>).id),
        req.body,
      ),
    );
  } catch (error: any) {
    res.status(error.statusCode || 503).json({ error: safeError(error) });
  }
});

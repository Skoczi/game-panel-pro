import { Router } from "express";
import {
  requireServerPermission,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { PERMISSIONS } from "../permissions.js";
import { requirePositiveInt } from "../utils/httpValidation.js";
import { sendRouteError } from "../utils/routeErrors.js";
import {
  sourceAddonPreview,
  changeSourceAddon,
} from "../services/sourceAddons.js";
import { startBackupJob, listBackupJobs } from "../services/backupJobs.js";
export const sourceAddonRoutes = Router({ mergeParams: true });
sourceAddonRoutes.get(
  "/",
  requireServerPermission(PERMISSIONS.fs.read),
  async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(
        await sourceAddonPreview(
          requirePositiveInt(req.params.id, "Invalid server"),
          typeof req.query.module === "string" ? [req.query.module] : undefined,
          typeof req.query.action === "string" ? req.query.action : "install",
        ),
      );
    } catch (e) {
      sendRouteError(res, e, {
        route: "SOURCE:PREVIEW",
        fallbackMessage: "Cannot load frameworks",
      });
    }
  },
);
sourceAddonRoutes.get(
  "/jobs",
  requireServerPermission(PERMISSIONS.fs.read),
  async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({
        jobs: (
          await listBackupJobs(
            requirePositiveInt(req.params.id, "Invalid server"),
          )
        ).filter((j) => j.kind === "addon"),
      });
    } catch (e) {
      sendRouteError(res, e, {
        route: "SOURCE:JOBS",
        fallbackMessage: "Cannot load progress",
      });
    }
  },
);
sourceAddonRoutes.post(
  "/",
  requireServerPermission(PERMISSIONS.fs.read),
  requireServerPermission(PERMISSIONS.fs.write),
  requireServerPermission(PERMISSIONS.backups.create),
  requireServerPermission(PERMISSIONS.backups.restore),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = requirePositiveInt(req.params.id, "Invalid server"),
        selection = [req.body?.module],
        action = req.body?.action;
      const p = await sourceAddonPreview(id, selection, action);
      if (!p.stopped || p.fingerprint !== req.body?.fingerprint)
        return res
          .status(409)
          .json({ error: "Stop the server and refresh the preview" });
      res
        .status(202)
        .json({
          job: await startBackupJob(
            id,
            "addon",
            req.user?.username || "Operator",
            (report) =>
              changeSourceAddon(id, selection, p.fingerprint, action, report),
          ),
        });
    } catch (e) {
      sendRouteError(res, e, {
        route: "SOURCE:CHANGE",
        fallbackMessage: "Cannot change framework",
      });
    }
  },
);

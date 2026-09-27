import { Router } from 'express';
import { rootOnly } from '../middleware/auth.js';
import { signedWebhooks } from '../services/signedWebhooks.js';
export const signedWebhookRoutes = Router();
signedWebhookRoutes.use(rootOnly, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
signedWebhookRoutes.get('/', async (_req, res) => { try { res.json(await (await signedWebhooks()).view()); } catch { res.status(503).json({ error: 'Webhook settings unavailable' }); } });
signedWebhookRoutes.put('/', async (req, res) => { try { res.json(await (await signedWebhooks()).save(req.body)); } catch (e: any) { res.status(e.statusCode || 400).json({ error: e.message }); } });
signedWebhookRoutes.post('/test', async (_req, res) => { try { const s = await signedWebhooks(); if (!(await s.config())?.enabled) return res.status(409).json({ error: 'Enable the webhook first' }); await s.enqueue('webhook.test', { message: 'eserv signed webhook test' }); res.status(202).json({ queued: true }); } catch { res.status(503).json({ error: 'Test could not be queued' }); } });

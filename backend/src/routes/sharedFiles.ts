import { Router } from 'express';
import { rootOnly } from '../middleware/auth.js';
import { getDatabase } from '../database/init.js';
import { listSharedPackages, sharedUploads, beginSharedUpload, sharedUploadChunk, finishSharedUpload, cancelSharedUpload } from '../services/sharedFiles.js';

export const sharedFilesRoutes = Router();
sharedFilesRoutes.use(rootOnly);
const action = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any) => {
  void fn(req, res).catch(e => res.status(e.statusCode || 400).json({error:e.message}));
};
sharedFilesRoutes.get('/', action(async (_req, res) => {
  if (!process.env.GAMEPANEL_SHARED_FILES_ROOT) return res.json({available:false,packages:[],uploads:[]});
  const packages = await listSharedPackages();
  const servers = await (await getDatabase()).all('SELECT id,name,mounts_json FROM game_servers');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ available:true, packages: packages.map(p => ({...p, servers:servers.filter(s => JSON.parse(s.mounts_json || '[]').some((m:any) => m.shared?.package === p.id)).map(s => ({id:s.id,name:s.name}))})), uploads:sharedUploads() });
}));
sharedFilesRoutes.post('/uploads', action(async (req,res) => res.status(201).json(await beginSharedUpload(req.body))));
sharedFilesRoutes.put('/uploads/:id', action(async (req,res) => res.json(await sharedUploadChunk(req.params.id,req.body?.offset,req.body?.data))));
sharedFilesRoutes.post('/uploads/:id/finish', action(async (req,res) => res.status(202).json(finishSharedUpload(req.params.id))));
sharedFilesRoutes.delete('/uploads/:id', action(async (req,res) => res.json(await cancelSharedUpload(req.params.id))));

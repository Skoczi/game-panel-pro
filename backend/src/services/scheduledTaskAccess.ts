import { userHasServerPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import type { ScheduledTaskType, ScheduledTaskPayload } from './scheduledTasks.js';

// Scheduling an operation must require the same authority as performing it now.
export function authorizeScheduledTask(user: AuthenticatedRequest['user'], serverId: number) {
  return async (type: ScheduledTaskType, payload: ScheduledTaskPayload) => {
    const required = new Set<string>();
    if (type === 'custom') required.add('container.terminal');
    if (type === 'restart') required.add('server.power');
    if (type === 'backup') required.add('backups.create');
    if (type === 'game_command' || [payload.pre, payload.post, payload.cleanup].some(
      steps => steps?.some(step => step.type === 'game_command'),
    ) || payload.maintenance?.saveCommand) required.add('server.command.send');
    if (payload.maintenance) {
      required.add('backups.create');
      // Native update's direct endpoint is root-only too.
      if (payload.maintenance.update && !user?.isRoot) {
        throw Object.assign(new Error('Scheduled game updates require Super Admin'), { statusCode: 403 });
      }
    }
    for (const permission of required) {
      if (!await userHasServerPermission(user, serverId, permission)) {
        throw Object.assign(new Error(`Scheduled action requires ${permission}`), { statusCode: 403 });
      }
    }
  };
}

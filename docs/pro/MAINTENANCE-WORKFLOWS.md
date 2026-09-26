# Scheduled maintenance

For a Native server, open Scheduled Tasks, choose Restart and enable **Maintenance workflow**. Game query monitoring must be enabled with an allocated A2S port. The UI waits up to 120 seconds for the game query; the API permits 15–600 seconds.

The sequence is fixed:

1. Deliver an optional game save command. Delivery does not prove the game flushed its state.
2. Gracefully stop the game and check that its container stopped.
3. Create and verify an offline native backup.
4. Optionally run the template's existing native update recipe, using its pinned installer image.
5. Start the game.
6. Require an A2S response before reporting success.

The scheduler holds the server mutation lock across the sequence. Each native backup/update also uses its existing operation lock. Separate pre/post/cleanup lists cannot be combined with this workflow. The existing scheduled-task permission controls configuration of the sequence.

The latest run's step results and backup filename are stored in SQLite and displayed under the task. A failure prevents subsequent steps, leaves the game stopped, and disables the schedule. An agent restart marks unfinished work interrupted and disables the schedule; commands and updates are not replayed automatically. Inspect the last completed step and the worker/container state, restore the named pre-maintenance backup if needed, then deliberately restart and re-enable the schedule.

An update worker can run for up to two hours before the workflow reports a timeout. Its own operation lock remains in force until it exits or startup recovery reconciles it. Do not manually start the game while that worker is still changing files.

The workflow is stored as `type: "restart"` with `payload.maintenance: { version: 1, update: boolean, saveCommand?: string, healthTimeoutSeconds: number }`. The task-list endpoint advertises `maintenanceWorkflow: true` and returns durable `maintenanceRuns`. Agents predating this capability do not implement the sequence: do not roll an agent back below this version while enabled maintenance schedules exist.

The WAW2 rehearsal restores the external game backup into an isolated internal Docker network without published ports, seeds a separate database, and runs the actual scheduler through stop → verified backup → start → query. It does not execute the template update recipe; update success/failure ordering is covered by injected unit tests. Source game identity and configuration are asserted unchanged.

import { stripAnsi } from './ansi';
export function consoleView<T extends { message: string; type: string }>(logs: T[], search: string, level: string, group: boolean): Array<T & { repeats: number }> {
  const needle = search.toLocaleLowerCase();
  const result: Array<T & { repeats: number }> = [];
  for (const log of logs) {
    if ((level !== 'all' && log.type !== level) || !stripAnsi(log.message).toLocaleLowerCase().includes(needle)) continue;
    const previous = result[result.length - 1];
    if (group && previous && previous.message === log.message && previous.type === log.type) previous.repeats++;
    else result.push({ ...log, repeats: 1 });
  }
  return result;
}

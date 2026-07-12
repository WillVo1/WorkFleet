import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import type { FeedEvent, Task, Worker } from "../types";

/** Central live state: tasks + per-task events + workers, fed by one WebSocket. */
export function useFleet() {
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [events, setEvents] = useState<Record<string, FeedEvent[]>>({});
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadTaskDetail = useCallback(async (id: string) => {
    const { task, events: evs } = await api.task(id);
    setTasks((t) => ({ ...t, [id]: task }));
    setEvents((e) => ({ ...e, [id]: evs }));
  }, []);

  const resync = useCallback(() => {
    // authoritative refresh — clears tasks orphaned by a backend restart
    api.tasks().then((list) => setTasks(Object.fromEntries(list.map((t) => [t.id, t]))));
    api.workers().then(setWorkers);
  }, []);

  useEffect(() => {
    resync();
    api.config().then((c) => setDemoMode(c.demo_mode)).catch(() => {});

    let closed = false;
    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => resync(); // reconnect after a backend restart -> resync truth
      ws.onmessage = (msg) => {
        const { type, payload } = JSON.parse(msg.data);
        if (type === "task") {
          setTasks((t) => ({ ...t, [payload.id]: payload }));
        } else if (type === "workers") {
          setWorkers(payload);
        } else if (type === "event") {
          setEvents((e) => {
            const list = e[payload.task_id] ?? [];
            if (list.some((x) => x.seq === payload.seq)) return e;
            return { ...e, [payload.task_id]: [...list, payload] };
          });
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 1500); // auto-reconnect
      };
    }
    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  return { tasks, events, workers, demoMode, setWorkers, loadTaskDetail, resync };
}

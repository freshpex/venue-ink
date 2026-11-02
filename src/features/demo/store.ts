import { create } from "zustand";
import { persist } from "zustand/middleware";
export type DemoRequest = {
  id: string;
  design: string;
  artist: string;
  day: number;
  time: string;
  status: "New request" | "Approved" | "Declined";
  service: string;
};
type DemoStore = {
  requests: DemoRequest[];
  add: (request: Omit<DemoRequest, "id" | "status">) => void;
  update: (id: string, status: DemoRequest["status"]) => void;
  reset: () => void;
};
const initial: DemoRequest[] = [
  {
    id: "example-1",
    design: "Botanical sleeve",
    artist: "Alex",
    day: 12,
    time: "10:00",
    status: "New request",
    service: "Custom tattoo",
  },
  {
    id: "example-2",
    design: "Ornamental detail",
    artist: "River",
    day: 14,
    time: "14:00",
    status: "Approved",
    service: "Flash tattoo",
  },
  {
    id: "example-3",
    design: "Fine-line study",
    artist: "Alex",
    day: 18,
    time: "11:00",
    status: "New request",
    service: "Custom tattoo",
  },
];
export const useDemo = create<DemoStore>()(
  persist(
    (set) => ({
      requests: initial,
      add: (r) =>
        set((s) => ({
          requests: [
            { ...r, id: crypto.randomUUID(), status: "New request" },
            ...s.requests,
          ],
        })),
      update: (id, status) =>
        set((s) => ({
          requests: s.requests.map((r) => (r.id === id ? { ...r, status } : r)),
        })),
      reset: () => set({ requests: initial }),
    }),
    { name: "venue-example-workspace-v1" },
  ),
);

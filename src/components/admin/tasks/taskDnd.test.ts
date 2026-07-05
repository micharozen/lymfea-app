import { describe, it, expect } from "vitest";
import { sortColumn, groupByStatus, resolveTaskDrop, type DnDTask } from "./taskDnd";

const task = (id: string, status: string, position: number, created_at = "2026-01-01"): DnDTask => ({
  id,
  status,
  position,
  created_at,
});

describe("sortColumn", () => {
  it("orders by position ascending", () => {
    const sorted = sortColumn([task("a", "todo", 2), task("b", "todo", 0), task("c", "todo", 1)]);
    expect(sorted.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks position ties by most recent created_at first", () => {
    const sorted = sortColumn([
      task("old", "todo", 0, "2026-01-01"),
      task("new", "todo", 0, "2026-02-01"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the input array", () => {
    const input = [task("a", "todo", 2), task("b", "todo", 0)];
    const snapshot = input.map((t) => t.id);
    sortColumn(input);
    expect(input.map((t) => t.id)).toEqual(snapshot);
  });
});

describe("groupByStatus", () => {
  it("buckets tasks into the three columns, each sorted", () => {
    const grouped = groupByStatus([
      task("a", "todo", 1),
      task("b", "todo", 0),
      task("c", "in_progress", 0),
      task("d", "done", 0),
    ]);
    expect(grouped.todo.map((t) => t.id)).toEqual(["b", "a"]);
    expect(grouped.in_progress.map((t) => t.id)).toEqual(["c"]);
    expect(grouped.done.map((t) => t.id)).toEqual(["d"]);
  });

  it("falls back unknown statuses to the todo column", () => {
    const grouped = groupByStatus([task("x", "archived", 0)]);
    expect(grouped.todo.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("resolveTaskDrop", () => {
  it("returns null when the dragged task is unknown", () => {
    expect(
      resolveTaskDrop({ tasks: [task("a", "todo", 0)], activeId: "ghost", overId: "todo" }),
    ).toBeNull();
  });

  it("returns null for a no-op drop (same column, same position)", () => {
    expect(
      resolveTaskDrop({ tasks: [task("a", "todo", 0)], activeId: "a", overId: "todo" }),
    ).toBeNull();
  });

  it("moves a card to an empty column at position 0", () => {
    const result = resolveTaskDrop({
      tasks: [task("a", "todo", 0)],
      activeId: "a",
      overId: "done",
    });
    expect(result).toEqual({ id: "a", status: "done", position: 0 });
  });

  it("appends to the end when dropped on a non-empty column", () => {
    const tasks = [task("a", "todo", 0), task("c", "in_progress", 5)];
    const result = resolveTaskDrop({ tasks, activeId: "a", overId: "in_progress" });
    expect(result).toEqual({ id: "a", status: "in_progress", position: 6 });
  });

  it("adopts the target card's status when dropped over another card", () => {
    const tasks = [task("a", "todo", 0), task("c", "in_progress", 0)];
    const result = resolveTaskDrop({ tasks, activeId: "a", overId: "c" });
    expect(result?.status).toBe("in_progress");
    // inserted before the only card (position 0) => 0 - 1
    expect(result?.position).toBe(-1);
  });

  it("computes a fractional midpoint when inserting between two cards", () => {
    const tasks = [
      task("c", "in_progress", 0),
      task("d", "in_progress", 2),
      task("e", "in_progress", 4),
    ];
    // drop e over d => between c(0) and d(2) => 1
    const result = resolveTaskDrop({ tasks, activeId: "e", overId: "d" });
    expect(result).toEqual({ id: "e", status: "in_progress", position: 1 });
  });

  it("reorders within the same column", () => {
    const tasks = [task("a", "todo", 0), task("b", "todo", 1)];
    // drop b over a => before a(0) => -1
    const result = resolveTaskDrop({ tasks, activeId: "b", overId: "a" });
    expect(result).toEqual({ id: "b", status: "todo", position: -1 });
  });
});

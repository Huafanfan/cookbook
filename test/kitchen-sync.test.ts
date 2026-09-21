import { describe, expect, it } from "vitest";

import { createKitchenSync, type KitchenSyncDeps } from "../src/client/lib/kitchen-sync.js";
import type { KitchenState } from "../src/shared/types.js";

/**
 * 「我的厨具」同步器的**时序**测试（CB-008 并发修复）。
 *
 * 每个用例都新建一份同步器（不依赖模块级单例、不依赖用例执行顺序），
 * 用 deferred promise 精确控制"谁先回、谁后回"。
 * 背景与复核意见：docs/verification/current-review/REVIEW.md P1-1。
 *
 * 注意：入队后任务在**下一个微任务**才真正启动，所以断言"谁已经发出去了"之前
 * 要先 `await flush()`（否则看到的是"还没发"）。
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 让排队的任务有机会启动 */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function kitchen(...tools: string[]): KitchenState {
  return { tools, updatedAt: "2026-09-21T00:00:00.000Z" };
}

/** 假依赖：把请求挂起，由测试手动 resolve/reject；同时统计在飞数量 */
function makeDepsWithQueues() {
  const replaceCalls: string[][] = [];
  const initCalls: string[][] = [];
  const replaceQueue: Deferred<KitchenState>[] = [];
  const initQueue: Deferred<{ kitchen: KitchenState; created: boolean }>[] = [];
  let inFlight = 0;
  let max = 0;

  const deps: KitchenSyncDeps = {
    replace: (tools) => {
      replaceCalls.push(tools);
      const next = deferred<KitchenState>();
      replaceQueue.push(next);
      inFlight += 1;
      max = Math.max(max, inFlight);
      return next.promise.finally(() => {
        inFlight -= 1;
      });
    },
    initialize: (tools) => {
      initCalls.push(tools);
      const next = deferred<{ kitchen: KitchenState; created: boolean }>();
      initQueue.push(next);
      inFlight += 1;
      max = Math.max(max, inFlight);
      return next.promise.finally(() => {
        inFlight -= 1;
      });
    }
  };

  return { deps, replaceCalls, initCalls, replaceQueue, initQueue, maxInFlight: () => max };
}

describe("createKitchenSync · 并发与时序（CB-008）", () => {
  it("连续两次修改：串行发出（同一时刻只有一个在飞），最终是第二次的值", async () => {
    const fake = makeDepsWithQueues();
    const sync = createKitchenSync(fake.deps);

    const first = sync.save(["炒锅"]);
    const second = sync.save(["炒锅", "烤箱"]);
    await flush();

    // 第二次必须等第一次结束才发出
    expect(fake.replaceCalls).toHaveLength(1);
    expect(fake.maxInFlight()).toBe(1);
    // 界面上先显示最后一个意图
    expect(sync.getSnapshot().kitchen?.tools).toEqual(["炒锅", "烤箱"]);

    fake.replaceQueue[0].resolve(kitchen("炒锅"));
    await first;
    await flush();

    expect(fake.replaceCalls).toHaveLength(2);
    fake.replaceQueue[1].resolve(kitchen("炒锅", "烤箱"));
    await second;

    expect(fake.maxInFlight()).toBe(1);
    expect(sync.getSnapshot().kitchen?.tools).toEqual(["炒锅", "烤箱"]);
    expect(sync.getSnapshot().saving).toBe(false);
  });

  it("两次都失败：回滚到已确认值（从未成功过 → null）", async () => {
    const fake = makeDepsWithQueues();
    const sync = createKitchenSync(fake.deps);

    const first = sync.save(["炒锅"]);
    const second = sync.save(["烤箱"]);
    await flush();

    fake.replaceQueue[0].reject(new Error("503"));
    await first;
    await flush();
    fake.replaceQueue[1].reject(new Error("503"));
    await second;

    expect(sync.getSnapshot().kitchen).toBeNull();
    expect(sync.getSnapshot().saving).toBe(false);
  });

  it("前失败后成功：失败的回滚不能把后来的成功值抹掉", async () => {
    const fake = makeDepsWithQueues();
    const sync = createKitchenSync(fake.deps);

    const first = sync.save(["炒锅"]);
    const second = sync.save(["炒锅", "烤箱"]);
    await flush();

    fake.replaceQueue[0].reject(new Error("503"));
    await first;

    // 第一个失败时，后面还排着更新的意图 → 显示它，而不是闪回旧值
    expect(sync.getSnapshot().kitchen?.tools).toEqual(["炒锅", "烤箱"]);

    await flush();
    fake.replaceQueue[1].resolve(kitchen("炒锅", "烤箱"));
    await second;

    expect(sync.getSnapshot().kitchen?.tools).toEqual(["炒锅", "烤箱"]);
  });

  it("陈旧拉取（GET 晚于 POST）被丢弃：不会把新值回退成旧数据", async () => {
    const fake = makeDepsWithQueues();
    const sync = createKitchenSync(fake.deps);

    const revisionBeforeSave = sync.revision(); // 模拟"发起 GET 时的修订号"
    const save = sync.save(["炒锅", "烤箱"]);
    await flush();
    fake.replaceQueue[0].resolve(kitchen("炒锅", "烤箱"));
    await save;

    // 迟到的 GET（内容是旧的"没设置过"）落地 → 必须被丢弃
    sync.hydrate(null, revisionBeforeSave);

    expect(sync.getSnapshot().kitchen?.tools).toEqual(["炒锅", "烤箱"]);
  });

  it("没有并发写入时，正常拉取会落地（hydrate 基本路径）", () => {
    const fake = makeDepsWithQueues();
    const sync = createKitchenSync(fake.deps);

    const revision = sync.revision();
    sync.hydrate(kitchen("砂锅"), revision);

    expect(sync.getSnapshot().kitchen?.tools).toEqual(["砂锅"]);
  });

  it("迁移与保存共用同一条队列（迁移不会插队）", async () => {
    const fake = makeDepsWithQueues();
    const sync = createKitchenSync(fake.deps);

    const save = sync.save(["炒锅"]);
    const migrate = sync.migrate(["烤箱"]);
    await flush();

    expect(fake.replaceCalls).toHaveLength(1);
    expect(fake.initCalls).toHaveLength(0);
    expect(fake.maxInFlight()).toBe(1);

    fake.replaceQueue[0].resolve(kitchen("炒锅"));
    await save;
    await flush();

    expect(fake.initCalls).toHaveLength(1);
    fake.initQueue[0].resolve({ kitchen: kitchen("炒锅"), created: false });
    await migrate;

    // created:false → 采用服务端现有的（不覆盖）
    expect(sync.getSnapshot().kitchen?.tools).toEqual(["炒锅"]);
  });

  it("迁移：created=true 时采用新值；failed 时不动当前值并返回 failed", async () => {
    const ok = makeDepsWithQueues();
    const syncOk = createKitchenSync(ok.deps);
    const created = syncOk.migrate(["烤箱"]);
    await flush();
    ok.initQueue[0].resolve({ kitchen: kitchen("烤箱"), created: true });
    await expect(created).resolves.toBe("created");
    expect(syncOk.getSnapshot().kitchen?.tools).toEqual(["烤箱"]);

    const bad = makeDepsWithQueues();
    const syncBad = createKitchenSync(bad.deps);
    const failed = syncBad.migrate(["烤箱"]);
    await flush();
    bad.initQueue[0].reject(new Error("offline"));
    await expect(failed).resolves.toBe("failed");
    expect(syncBad.getSnapshot().kitchen).toBeNull();
  });
});

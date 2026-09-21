// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EquipmentRow } from "../src/client/components/EquipmentRow.js";
import { KitchenToolsPanel } from "../src/client/components/KitchenToolsPanel.js";
import { RecipeCard } from "../src/client/components/RecipeCard.js";
import { ensureLocalStorage, makeRecipe, makeSummary } from "./helpers.js";

beforeEach(() => {
  ensureLocalStorage();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(cleanup);

describe("KitchenToolsPanel（勾选式，无自由输入）", () => {
  it("列出词表全部条目，且没有输入框", () => {
    render(
      <KitchenToolsPanel
        available={["炒锅", "烤箱"]}
        tools={["炒锅"]}
        problem={null}
        apply={async () => true}
      />
    );

    expect(document.querySelectorAll(".kitchen-check")).toHaveLength(2);
    expect(document.querySelector("input[type=text]")).toBeNull();
  });

  it("**保存失败时明确提示**（P1-5 回归：不能静默失效）", async () => {
    render(
      <KitchenToolsPanel
        available={["炒锅", "烤箱"]}
        tools={["炒锅"]}
        problem={null}
        apply={async () => false}
      />
    );

    fireEvent.click(screen.getByLabelText("烤箱"));

    expect(await screen.findByText(/没能保存/)).toBeTruthy();
  });

  it("服务端状态没同步上时说清楚（而不是静默用默认清单）", () => {
    render(
      <KitchenToolsPanel
        available={["炒锅", "烤箱"]}
        tools={["炒锅"]}
        problem={null}
        syncFailed
        apply={async () => true}
      />
    );

    expect(screen.getByText(/没从服务器同步上/)).toBeTruthy();
  });

  it("保存成功时不出现失败提示", async () => {
    render(
      <KitchenToolsPanel
        available={["炒锅", "烤箱"]}
        tools={["炒锅"]}
        problem={null}
        apply={async () => true}
      />
    );

    fireEvent.click(screen.getByLabelText("烤箱"));

    await Promise.resolve();
    expect(screen.queryByText(/没能保存/)).toBeNull();
  });

  it("词表未载入时给出说明而不是空列表", () => {
    render(
      <KitchenToolsPanel
        available={[]}
        tools={[]}
        problem={"厨具清单未载入"}
        apply={async () => true}
      />
    );

    // problem 提示与面板空状态都会提到"未载入"，这里用完整句子精确定位面板自己的那条
    expect(screen.getByText("厨具清单未载入，无法勾选。")).toBeTruthy();
    expect(document.querySelectorAll(".kitchen-check")).toHaveLength(0);
  });

  it("全选 / 全不选按词表提交", () => {
    const apply = vi.fn(async (updater: (tools: string[]) => string[]) => {
      void updater;
      return true;
    });
    render(
      <KitchenToolsPanel available={["炒锅", "烤箱"]} tools={[]} problem={null} apply={apply} />
    );

    fireEvent.click(screen.getByText("全选"));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0]([])).toEqual(["炒锅", "烤箱"]);
  });
});

describe("EquipmentRow（三种状态 + 词表未载入）", () => {
  const recipe = makeRecipe();

  it("厨具齐全 → 厨具齐了", () => {
    render(
      <EquipmentRow
        recipe={recipe}
        myTools={["炒锅"]}
        kitchenConfigured
        catalogReady
        onOpenPanel={() => undefined}
      />
    );

    expect(document.querySelector(".equipment-ready")).toBeTruthy();
    expect(screen.getByText(/厨具齐了/)).toBeTruthy();
  });

  it("只有替代品 → 说出用谁代替谁", () => {
    render(
      <EquipmentRow
        recipe={recipe}
        myTools={["空气炸锅"]}
        kitchenConfigured
        catalogReady
        onOpenPanel={() => undefined}
      />
    );

    expect(document.querySelector(".equipment-substituted")).toBeTruthy();
    expect(screen.getByText(/用空气炸锅代替炒锅/)).toBeTruthy();
  });

  it("一件都没有 → 暂时做不了", () => {
    render(
      <EquipmentRow
        recipe={recipe}
        myTools={["蒸锅"]}
        kitchenConfigured
        catalogReady
        onOpenPanel={() => undefined}
      />
    );

    expect(screen.getByText(/暂时做不了/)).toBeTruthy();
  });

  it("**词表未载入 → 不给任何结论**（P1-3 回归：不能拿旧清单给出假确定）", () => {
    render(
      <EquipmentRow
        recipe={recipe}
        myTools={["空气炸锅"]}
        kitchenConfigured
        catalogReady={false}
        onOpenPanel={() => undefined}
      />
    );

    expect(screen.getByText(/无法判断/)).toBeTruthy();
    expect(document.querySelector(".equipment-verdict")).toBeNull();
    expect(document.querySelector(".equipment-unknown")).toBeTruthy();
  });

  it("菜谱没声明厨具 → 整行不渲染", () => {
    const { container } = render(
      <EquipmentRow
        recipe={makeRecipe({ equipmentAlternatives: undefined })}
        myTools={["炒锅"]}
        kitchenConfigured
        catalogReady
        onOpenPanel={() => undefined}
      />
    );

    expect(container.querySelector(".equipment-row")).toBeNull();
  });
});

describe("RecipeCard（列表页的厨具标记）", () => {
  it("缺件时给出标记", () => {
    render(
      <RecipeCard recipe={makeSummary()} myTools={["蒸锅"]} catalogReady keyword={undefined} />
    );

    expect(document.querySelector(".badge-kitchen")?.textContent).toBe("缺炒锅");
  });

  it("**词表未载入时不给标记**（避免假结论）", () => {
    render(
      <RecipeCard
        recipe={makeSummary()}
        myTools={["蒸锅"]}
        catalogReady={false}
        keyword={undefined}
      />
    );

    expect(document.querySelector(".badge-kitchen")).toBeNull();
  });

  it("厨具齐全时不显示标记（不制造噪音）", () => {
    render(
      <RecipeCard recipe={makeSummary()} myTools={["炒锅"]} catalogReady keyword={undefined} />
    );

    expect(document.querySelector(".badge-kitchen")).toBeNull();
  });
});

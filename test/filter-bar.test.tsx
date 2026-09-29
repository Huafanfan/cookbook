// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterBar } from "../src/client/components/FilterBar.js";
import type { RecipeMetaResponse } from "../src/shared/types.js";

const META: RecipeMetaResponse = {
  categories: ["家常菜", "汤羹"],
  tags: ["快手", "下饭"],
  total: 2,
  equipment: [],
  defaultOwned: [],
  equipmentProblem: null
};

afterEach(cleanup);

describe("分类与标签筛选", () => {
  it("标签默认收起，可展开选择；分类仍常显", () => {
    const onSelectCategory = vi.fn();
    const onSelectTag = vi.fn();
    render(
      <FilterBar
        meta={META}
        onSelectCategory={onSelectCategory}
        onSelectTag={onSelectTag}
      />
    );

    expect(screen.getByRole("button", { name: "筛选标签" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "快手" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "家常菜" }));
    expect(onSelectCategory).toHaveBeenCalledWith("家常菜");

    fireEvent.click(screen.getByRole("button", { name: "筛选标签" }));
    expect(screen.getByRole("button", { name: "快手" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "快手" }));
    expect(onSelectTag).toHaveBeenCalledWith("快手");
  });

  it("已有筛选显示清除入口，并分别清空分类和标签", () => {
    const onSelectCategory = vi.fn();
    const onSelectTag = vi.fn();
    render(
      <FilterBar
        meta={META}
        category="家常菜"
        tag="下饭"
        onSelectCategory={onSelectCategory}
        onSelectTag={onSelectTag}
      />
    );

    expect(screen.getByRole("button", { name: /标签：下饭/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(onSelectCategory).toHaveBeenCalledWith(undefined);
    expect(onSelectTag).toHaveBeenCalledWith(undefined);
  });
});

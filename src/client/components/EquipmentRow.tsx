import type { Recipe } from "../../shared/types";
import {
  checkEquipment,
  formatToolGroup,
  kitchenVerdict,
  type EquipmentCheck
} from "../lib/kitchen";

interface EquipmentRowProps {
  recipe: Recipe;
  myTools: string[];
  /** 用户是否设置过我的厨具（false = 用默认值） */
  kitchenConfigured: boolean;
  /** 厨具词表是否已载入；未载入时不给任何结论 */
  catalogReady: boolean;
  onOpenPanel: () => void;
}

function requiredLabel(check: EquipmentCheck): string {
  return check.requirements.map((requirement) => requirement.tools[0]).join("、");
}

/**
 * 厨具行：告诉用户"这道菜我能不能做"。
 *
 * 三种状态（见 docs/features/CB-002-kitchen-tools.md §3.1）：
 * ① 直接满足 → 厨具齐了
 * ② 靠替代满足 → 可以做，用 X 代替 Y
 * ③ 有组完全不满足 → 暂时做不了，缺 X
 */
export function EquipmentRow({
  recipe,
  myTools,
  kitchenConfigured,
  catalogReady,
  onOpenPanel
}: EquipmentRowProps): React.JSX.Element | null {
  const check = checkEquipment(recipe.equipment, recipe.equipmentAlternatives, myTools);

  // 菜谱没声明厨具：整行不显示
  if (!check.declared) return null;

  const verdict = kitchenVerdict(check);

  // 词表没载入：**不给结论**（拿本地旧清单判定会得出"厨具齐了/暂时做不了"这种假确定结论）
  if (!catalogReady) {
    return (
      <div className="equipment-row equipment-unknown">
        <p className="recipe-equipment">
          厨具：这道菜需要 {requiredLabel(check)}，但厨具清单未载入，暂时无法判断
          <button type="button" className="link-button link-button-sm" onClick={onOpenPanel}>
            我的厨具
          </button>
        </p>
      </div>
    );
  }

  // 我的厨具是空的：不判定"什么都缺"，而是提示先设置
  if (myTools.length === 0) {
    return (
      <div className="equipment-row">
        <p className="recipe-equipment">
          厨具：需要 {requiredLabel(check)}
          <button type="button" className="link-button link-button-sm" onClick={onOpenPanel}>
            还没有添加我的厨具
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className={`equipment-row equipment-${verdict}`}>
      <p className="recipe-equipment">
        <span className="equipment-title">厨具：</span>
        {check.requirements.map((requirement) => (
          <span
            key={requirement.tools.join("|")}
            className={`equipment-item equipment-${requirement.state}`}
          >
            {requirement.state === "missing"
              ? `缺 ${formatToolGroup(requirement.tools)}`
              : requirement.state === "substituted"
                ? `${requirement.tools[0]}（没有）· 用${requirement.using}代替`
                : `${requirement.using} ✓`}
          </span>
        ))}

        <button type="button" className="link-button link-button-sm" onClick={onOpenPanel}>
          我的厨具
        </button>
      </p>

      <p className="equipment-verdict">
        {verdict === "ready" && "厨具齐了"}
        {verdict === "substituted" &&
          check.substitutions.map((sub) => `可以做，用${sub.using}代替${sub.required}`).join("；")}
        {verdict === "blocked" && `暂时做不了：缺 ${formatToolGroup(check.missingGroups[0])}`}
        {!kitchenConfigured && <span className="equipment-hint">（按默认厨具判断）</span>}
      </p>
    </div>
  );
}

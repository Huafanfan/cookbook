import type {
  Ingredient,
  RecipeMetaResponse,
  Step,
  WorkshopEvidence,
  WorkshopRecipeInput,
  WorkshopSource,
  WorkshopRecipeFormProps as Props
} from "../../shared/types";

const evidenceLabels: Record<WorkshopEvidence["status"], string> = {
  source: "来自材料",
  user: "你补充的",
  suggested: "整理建议",
  unknown: "还不知道"
};

function statusFor(evidence: WorkshopEvidence[], field: string): string | null {
  const item = [...evidence].reverse().find((entry) => entry.field === field || entry.field.endsWith(`.${field}`));
  return item ? evidenceLabels[item.status] : null;
}

function withField(
  candidate: WorkshopRecipeInput,
  onChange: Props["onChange"],
  patch: Partial<WorkshopRecipeInput>
): void {
  onChange({ ...candidate, ...patch });
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseAmount(value: string): number | string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : text;
}

function listFromText(value: string): string[] | undefined {
  const items = value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function textFromList(values: string[] | undefined): string {
  return values?.join("，") ?? "";
}

export function WorkshopRecipeForm({ candidate, meta, evidence, stepSourceIds, photos, onChange }: Props): React.JSX.Element {
  const ingredients = candidate.ingredients ?? [];
  const steps = candidate.steps ?? [];
  const selectedTags = candidate.tags ?? [];
  const selectedEquipment = candidate.equipment ?? [];
  const alternatives = candidate.equipmentAlternatives ?? [];
  const change = (patch: Partial<WorkshopRecipeInput>): void => withField(candidate, onChange, patch);

  const updateIngredient = (index: number, patch: Partial<Ingredient>): void => {
    const next = ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    change({ ingredients: next });
  };

  const updateStep = (index: number, patch: Partial<Step>): void => {
    const next = steps.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    change({ steps: next });
  };

  const toggleWord = (words: string[], value: string, checked: boolean): string[] => {
    if (checked) return words.includes(value) ? words : [...words, value];
    return words.filter((word) => word !== value);
  };

  return (
    <div className="workshop-form">
      <section className="workshop-card" aria-labelledby="workshop-basic-title">
        <div className="workshop-section-heading">
          <div>
            <p className="workshop-eyebrow">先把菜谱说清楚</p>
            <h2 id="workshop-basic-title">这道菜</h2>
          </div>
        </div>
        <div className="workshop-field-grid">
          <label className="workshop-field workshop-field-wide">
            <span>菜名 <FieldStatus evidence={evidence} field="name" /></span>
            <input
              value={candidate.name ?? ""}
              onChange={(event) => change({ name: event.target.value })}
              placeholder="例如：番茄炖牛腩"
              autoComplete="off"
            />
          </label>
          <label className="workshop-field">
            <span>分类 <FieldStatus evidence={evidence} field="category" /></span>
            <input
              value={candidate.category ?? ""}
              onChange={(event) => change({ category: event.target.value })}
              list="workshop-categories"
              placeholder="请补充分类"
            />
            <datalist id="workshop-categories">
              {(meta?.categories ?? []).map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>
          <label className="workshop-field">
            <span>难度 <FieldStatus evidence={evidence} field="difficulty" /></span>
            <select
              value={candidate.difficulty ?? ""}
              onChange={(event) => change({
                difficulty: event.target.value ? Number(event.target.value) as 1 | 2 | 3 : undefined
              })}
            >
              <option value="">请选择难度</option>
              <option value="1">简单</option>
              <option value="2">适中</option>
              <option value="3">有点挑战</option>
            </select>
          </label>
          <label className="workshop-field">
            <span>份量（几人份） <FieldStatus evidence={evidence} field="servings" /></span>
            <input
              type="number"
              min="0.1"
              step="any"
              value={candidate.servings ?? ""}
              onChange={(event) => change({ servings: parseOptionalNumber(event.target.value) })}
              placeholder="材料没有说明时请自行确认"
            />
          </label>
          <label className="workshop-field workshop-field-wide">
            <span>一句介绍 <FieldStatus evidence={evidence} field="summary" /></span>
            <textarea
              rows={2}
              value={candidate.summary ?? ""}
              onChange={(event) => change({ summary: event.target.value })}
              placeholder="可留空"
            />
          </label>
          <label className="workshop-field workshop-field-wide">
            <span>别名</span>
            <input
              value={textFromList(candidate.aliases)}
              onChange={(event) => change({ aliases: listFromText(event.target.value) })}
              placeholder="可用逗号分开，可留空"
            />
          </label>
        </div>
      </section>

      <section className="workshop-card" aria-labelledby="workshop-ingredients-title">
        <div className="workshop-section-heading">
          <div>
            <p className="workshop-eyebrow">保留材料里的数量和说法</p>
            <h2 id="workshop-ingredients-title">食材 <FieldStatus evidence={evidence} field="ingredients" /></h2>
          </div>
          <button
            className="workshop-button workshop-button-light"
            type="button"
            onClick={() => change({ ingredients: [...ingredients, { name: "" }] })}
          >
            + 加食材
          </button>
        </div>
        {ingredients.length === 0 && <p className="workshop-empty-inline">还没有食材。材料没有写到的用量可以先留空。</p>}
        <div className="workshop-rows">
          {ingredients.map((ingredient, index) => (
            <div className="workshop-ingredient-row" key={`ingredient-${index}`}>
              <div className="workshop-row-index">{index + 1}</div>
              <div className="workshop-field-grid workshop-ingredient-fields">
                <label className="workshop-field">
                  <span>食材</span>
                  <input value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} placeholder="食材名" />
                </label>
                <label className="workshop-field">
                  <span>数量</span>
                  <input
                    value={ingredient.amount ?? ""}
                    onChange={(event) => updateIngredient(index, { amount: parseAmount(event.target.value) })}
                    placeholder="如 300、适量"
                  />
                </label>
                <label className="workshop-field">
                  <span>单位</span>
                  <input value={ingredient.unit ?? ""} onChange={(event) => updateIngredient(index, { unit: event.target.value || undefined })} placeholder="g、个" />
                </label>
                <label className="workshop-field">
                  <span>分组</span>
                  <input value={ingredient.group ?? ""} onChange={(event) => updateIngredient(index, { group: event.target.value || undefined })} placeholder="主料、调味料" />
                </label>
                <label className="workshop-field workshop-field-wide">
                  <span>处理说明</span>
                  <input value={ingredient.note ?? ""} onChange={(event) => updateIngredient(index, { note: event.target.value || undefined })} placeholder="如：提前泡发，可留空" />
                </label>
              </div>
              <button
                className="workshop-icon-button"
                type="button"
                aria-label={`删除第 ${index + 1} 个食材`}
                onClick={() => change({ ingredients: ingredients.filter((_, itemIndex) => itemIndex !== index) })}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="workshop-card" aria-labelledby="workshop-steps-title">
        <div className="workshop-section-heading">
          <div>
            <p className="workshop-eyebrow">按实际操作顺序整理</p>
            <h2 id="workshop-steps-title">做法 <FieldStatus evidence={evidence} field="steps" /></h2>
          </div>
          <button
            className="workshop-button workshop-button-light"
            type="button"
            onClick={() => onChange({ ...candidate, steps: [...steps, { text: "" }] }, [...stepSourceIds, null])}
          >
            + 加步骤
          </button>
        </div>
        {steps.length === 0 && <p className="workshop-empty-inline">还没有步骤。可以从空白步骤开始手动写。</p>}
        <div className="workshop-rows">
          {steps.map((step, index) => (
            <div className="workshop-step-row" key={`step-${index}`}>
              <div className="workshop-step-heading">
                <span className="workshop-row-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="workshop-order-controls">
                  <button type="button" className="workshop-icon-button" aria-label={`第 ${index + 1} 步上移`} disabled={index === 0} onClick={() => {
                    const next = [...steps];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    const nextImages = [...stepSourceIds];
                    [nextImages[index - 1], nextImages[index]] = [nextImages[index], nextImages[index - 1]];
                    onChange({ ...candidate, steps: next }, nextImages);
                  }}>上移</button>
                  <button type="button" className="workshop-icon-button" aria-label={`第 ${index + 1} 步下移`} disabled={index === steps.length - 1} onClick={() => {
                    const next = [...steps];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    const nextImages = [...stepSourceIds];
                    [nextImages[index + 1], nextImages[index]] = [nextImages[index], nextImages[index + 1]];
                    onChange({ ...candidate, steps: next }, nextImages);
                  }}>下移</button>
                  <button type="button" className="workshop-icon-button" aria-label={`删除第 ${index + 1} 步`} onClick={() => onChange({ ...candidate, steps: steps.filter((_, itemIndex) => itemIndex !== index) }, stepSourceIds.filter((_, itemIndex) => itemIndex !== index))}>删除</button>
                </div>
              </div>
              <div className="workshop-field-grid">
                <label className="workshop-field workshop-field-wide">
                  <span>操作</span>
                  <textarea rows={3} value={step.text} onChange={(event) => updateStep(index, { text: event.target.value })} placeholder="写清楚这一步要做什么" />
                </label>
                <label className="workshop-field">
                  <span>小标题</span>
                  <input value={step.title ?? ""} onChange={(event) => updateStep(index, { title: event.target.value || undefined })} placeholder="可留空" />
                </label>
                <label className="workshop-field">
                  <span>时长（分钟）</span>
                  <input type="number" min="0" step="any" value={step.minutes ?? ""} onChange={(event) => updateStep(index, { minutes: parseOptionalNumber(event.target.value) })} placeholder="材料未说明时留空" />
                </label>
                <label className="workshop-field">
                  <span>火候</span>
                  <input value={step.heat ?? ""} onChange={(event) => updateStep(index, { heat: event.target.value || undefined })} placeholder="大火、中火等" />
                </label>
                <label className="workshop-field">
                  <span>小提醒</span>
                  <input value={step.tip ?? ""} onChange={(event) => updateStep(index, { tip: event.target.value || undefined })} placeholder="可留空" />
                </label>
                <label className="workshop-field">
                  <span>这一步的自有照片</span>
                  <select
                    value={stepSourceIds[index] ?? ""}
                    onChange={(event) => {
                      const next = [...stepSourceIds];
                      next[index] = event.target.value || null;
                      onChange(candidate, next);
                    }}
                  >
                    <option value="">不添加配图</option>
                    {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.name}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="workshop-card" aria-labelledby="workshop-prep-title">
        <div className="workshop-section-heading">
          <div>
            <p className="workshop-eyebrow">按需补充</p>
            <h2 id="workshop-prep-title">口味与准备</h2>
          </div>
        </div>
        <div className="workshop-field-grid">
          <label className="workshop-field">
            <span>准备时间（分钟）</span>
            <input type="number" min="0" step="any" value={candidate.prepMinutes ?? ""} onChange={(event) => change({ prepMinutes: parseOptionalNumber(event.target.value) })} placeholder="可留空" />
          </label>
          <label className="workshop-field">
            <span>烹饪时间（分钟）</span>
            <input type="number" min="0" step="any" value={candidate.cookMinutes ?? ""} onChange={(event) => change({ cookMinutes: parseOptionalNumber(event.target.value) })} placeholder="可留空" />
          </label>
          <label className="workshop-field workshop-field-wide">
            <span>小贴士（一行一条）</span>
            <textarea rows={3} value={candidate.tips?.join("\n") ?? ""} onChange={(event) => change({ tips: listFromText(event.target.value) })} placeholder="可留空" />
          </label>
          <label className="workshop-field workshop-field-wide">
            <span>来源或补充说明</span>
            <textarea rows={2} value={candidate.source ?? ""} onChange={(event) => change({ source: event.target.value || undefined })} placeholder="可留空" />
          </label>
        </div>
      </section>

      <section className="workshop-card" aria-labelledby="workshop-tags-title">
        <div className="workshop-section-heading">
          <div>
            <p className="workshop-eyebrow">只从现有词表选择</p>
            <h2 id="workshop-tags-title">标签与厨具</h2>
          </div>
        </div>
        <div className="workshop-vocabulary-group">
          <h3>标签</h3>
          <ChoiceList
            values={meta?.tags ?? []}
            selected={selectedTags}
            disabled={!meta}
            vocabularyReady={Boolean(meta)}
            onToggle={(value, checked) => change({ tags: toggleWord(selectedTags, value, checked) })}
          />
          {!meta && <p className="workshop-hint">词表载入后可选择标签。</p>}
        </div>
        <div className="workshop-vocabulary-group">
          <h3>需要的厨具</h3>
          <ChoiceList
            values={meta?.equipment ?? []}
            selected={selectedEquipment}
            disabled={!meta}
            vocabularyReady={Boolean(meta)}
            onToggle={(value, checked) => change({ equipment: toggleWord(selectedEquipment, value, checked) })}
          />
          {!meta && <p className="workshop-hint">词表载入后可选择厨具。</p>}
        </div>
        {alternatives.map((group, groupIndex) => (
          <div className="workshop-vocabulary-group" key={`alternative-${groupIndex}`}>
            <div className="workshop-inline-heading">
              <h3>可替代的一组厨具</h3>
              <button type="button" className="workshop-icon-button" onClick={() => change({ equipmentAlternatives: alternatives.filter((_, index) => index !== groupIndex) })}>移除这一组</button>
            </div>
            <ChoiceList
              values={meta?.equipment ?? []}
              selected={group}
              disabled={!meta}
              vocabularyReady={Boolean(meta)}
              onToggle={(value, checked) => {
                const next = alternatives.map((item, index) => index === groupIndex ? toggleWord(item, value, checked) : item);
                change({ equipmentAlternatives: next });
              }}
            />
          </div>
        ))}
        <button type="button" className="workshop-button workshop-button-light" disabled={!meta} onClick={() => change({ equipmentAlternatives: [...alternatives, []] })}>+ 加一组可替代厨具</button>
      </section>
    </div>
  );
}

function FieldStatus({ evidence, field }: { evidence: WorkshopEvidence[]; field: string }): React.JSX.Element | null {
  const status = statusFor(evidence, field);
  return status ? <span className="workshop-field-status">{status}</span> : null;
}

function ChoiceList({
  values,
  selected,
  disabled,
  vocabularyReady,
  onToggle
}: {
  values: string[];
  selected: string[];
  disabled: boolean;
  vocabularyReady: boolean;
  onToggle: (value: string, checked: boolean) => void;
}): React.JSX.Element {
  const available = [...new Set([...values, ...selected])];
  if (available.length === 0) return <p className="workshop-hint">当前没有可选项。</p>;
  return (
    <div className="workshop-choice-list">
      {available.map((value) => (
        <label className={`workshop-choice${vocabularyReady && !values.includes(value) ? " is-out-of-vocabulary" : ""}`} key={value}>
          <input
            type="checkbox"
            checked={selected.includes(value)}
            disabled={disabled && !selected.includes(value)}
            onChange={(event) => onToggle(value, event.target.checked)}
          />
          <span>{value}</span>
          {vocabularyReady && !values.includes(value) && (
            <span className="workshop-choice-warning">未在词表中 · 可取消</span>
          )}
        </label>
      ))}
    </div>
  );
}

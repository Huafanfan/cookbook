/**
 * 离线校验 data/recipes/ 下的全部菜谱文件。
 * 用法：npm run check:data
 *
 * 复用后端同一份 zod 校验规则，避免"文档一套、代码一套"。
 */
import {
  formatContentIssues,
  hasBlockingIssues,
  lintRecipeContent
} from "../src/server/lib/content-lint.js";
import { loadEquipmentList } from "../src/server/lib/equipment.js";
import { loadTagVocabulary } from "../src/server/lib/tags.js";
import { loadRecipesFromDir } from "../src/server/services/recipe-repository.js";

const dataDir = new URL("../data/", import.meta.url).pathname;
const recipesDir = new URL("../data/recipes/", import.meta.url).pathname;

// 先读厨具词表：菜谱里的厨具只能是词表里的值，写错要在这里就被拦下来
const equipment = await loadEquipmentList(dataDir);
// 词表本身无效时必须整体失败：否则菜谱的厨具字段根本不校验，"全绿"是假绿
const catalogBroken = equipment.problem !== null;
if (catalogBroken) {
  console.error(`✗ ${equipment.problem}`);
} else {
  console.log(`厨具词表：${equipment.tools.length} 件（默认勾选 ${equipment.defaultOwned.length} 件）`);
  for (const warning of equipment.warnings) console.error(`! ${warning}`);
}

const tagVocabulary = await loadTagVocabulary(dataDir);
const tagCatalogBroken = tagVocabulary.problem !== null;
if (tagCatalogBroken) console.error(`✗ ${tagVocabulary.problem}`);
else console.log(`tag 词表：${tagVocabulary.names.length} 个`);

const { recipes, failures } = await loadRecipesFromDir(
  recipesDir,
  equipment.tools,
  tagVocabulary.names
);

const contentIssues: string[] = [];
const blockingIssues: string[] = [];
let warned = 0;

for (const recipe of recipes) {
  const steps = recipe.steps.length;
  const ingredients = recipe.ingredients.length;
  const issues = lintRecipeContent(recipe);
  const lines = formatContentIssues(recipe.id, issues);
  contentIssues.push(...lines);

  if (hasBlockingIssues(issues)) blockingIssues.push(...lines);
  else if (issues.length > 0) warned += 1;

  const mark = hasBlockingIssues(issues) ? "✗" : issues.length > 0 ? "⚠" : "✓";
  console.log(`${mark} ${recipe.id.padEnd(28)} ${recipe.name}  （${ingredients} 项食材 / ${steps} 步）`);
}

if (contentIssues.length > 0) {
  const label = blockingIssues.length > 0 ? "内容检查未通过" : "内容检查有提示（不阻止）";
  console.error(`\n${label}：`);
  for (const issue of contentIssues) console.error(`  ${issue}`);
}
if (warned > 0) console.error(`\n（${warned} 道菜只有警告，没有阻止性问题）`);

for (const failure of failures) {
  console.error(`✗ ${failure.file}\n    ${failure.reason}`);
}

console.log(`\n共 ${recipes.length} 个文件通过，${failures.length} 个失败。`);

process.exit(
  catalogBroken || tagCatalogBroken || failures.length > 0 || blockingIssues.length > 0 ? 1 : 0
);

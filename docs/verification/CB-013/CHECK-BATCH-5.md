# CB-013 第五批：全部剩余75张封面

日期：2026-09-30。状态：`implemented`（全部素材与本地技术验证完成，观感待用户确认）。范围实施前已在[规格 §17](../../features/CB-013-open-license-cover-batch.md#17-第五批完整补齐范围2026-09-30)登记为accepted，用户明确要求“把剩下的70多张图都补齐”。

## 范围与结果

新增75个封面：7个采用6份开放许可实拍文件（青菜照片用于2道相同主食材的菜），68个为永久标有“AI 示意图”的生成素材。补图前本地296/371、缺75；补图后371/371、缺0。仅追加原先不存在的 `data/images/<id>/cover.jpg`，不修改菜谱JSON、原图、应用代码、接口或部署配置。署名新增7行、累计98行；原91行保留。未部署或推送，本地完成不表示线上更新。

本批实拍候选先对照既有第四批拒绝记录，再补查Commons文件页/API及网页索引；没有可核验许可、主食材和成品形态匹配的候选时才生成。检索是有限范围复查，不宣称穷尽整个互联网。完整查询与拒绝原因见下节；原有决策和既有素材证据不回写。

## 资产基线与编码

写入前基线：371个菜谱JSON及297个既有图片目录文件（296个封面和.gitkeep）。对相对路径按localeCompare排序后，记录每文件SHA256，再对JSON序列取SHA256：菜谱集合 `113bafabd31041388aa9be36fca02180e226ced9233c23b6523f0d9f91c8eac9`；图片集合 `13da2628bd73c8cba07a5eabbc7125ee749e7c79076fa612209259c91a11bf2a`。基线原记录 `/private/tmp/cb013-b5-parent/baseline.json`。

全部新素材先在临时目录解码并等比例缩放，再检查75个目标均不存在后复制；JPEG质量80，长边不超过1200px、不放大低分辨率原图。75张总计22,896,962B，单张最大406,984B，均低于500KiB。导入后逐文件核对：原371份菜谱与原297个图片目录文件SHA256均未变。

## 实拍视觉复核与来源身份

- **奥尔良风味烤鸡腿**（`ao-er-liang-feng-wei-kao-ji-tui`）：实拍手枪腿的熟制皮色与形态吻合；通用烤鸡腿代表图，不证明奥尔良腌料比例。
  - 原文件身份：[Roasted chicken leg.jpg](https://commons.wikimedia.org/wiki/File:Roasted_chicken_leg.jpg)；原始 SHA1 `be18eac6688ffb35497a0fb48efc28fd4ea72958`，版本时间 `2021-02-23T08:44:28Z`。
  - 下载路径：`https://upload.wikimedia.org/wikipedia/commons/2/2b/Roasted_chicken_leg.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original`；临时原图 `/private/tmp/cb013-b5-a/01-ao-er-liang-feng-wei-kao-ji-tui.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#ao-er-liang-feng-wei-kao-ji-tui)为权威。

- **炒茄子**（`chao-qie-zi`）：炒软紫茄与肉末吻合；照片少量红绿辣椒碎为额外配饰，不属于此菜谱配料要求。
  - 原文件身份：[Chinese Stir-Fry Eggplant with Pork at 一代佳人海鮮碳烤 in Taipei.jpg](https://commons.wikimedia.org/wiki/File:Chinese_Stir-Fry_Eggplant_with_Pork_at_%E4%B8%80%E4%BB%A3%E4%BD%B3%E4%BA%BA%E6%B5%B7%E9%AE%AE%E7%A2%B3%E7%83%A4_in_Taipei.jpg)；原始 SHA1 `f15251325db21f9e66d40ebfb10097b4d4129c73`，版本时间 `2022-09-29T21:14:48Z`。
  - 下载路径：`https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0a/Chinese_Stir-Fry_Eggplant_with_Pork_at_%E4%B8%80%E4%BB%A3%E4%BD%B3%E4%BA%BA%E6%B5%B7%E9%AE%AE%E7%A2%B3%E7%83%A4_in_Taipei.jpg/1280px-Chinese_Stir-Fry_Eggplant_with_Pork_at_%E4%B8%80%E4%BB%A3%E4%BD%B3%E4%BA%BA%E6%B5%B7%E9%AE%AE%E7%A2%B3%E7%83%A4_in_Taipei.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`；临时原图 `/private/tmp/cb013-b5-parent/chao-qie-zi.source.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#chao-qie-zi)为权威。

- **炒青菜**（`chao-qing-cai`）：熟青菜叶和嫩梗、薄汁油光吻合；通用炒青菜代表图，不证明调味比例。
  - 原文件身份：[Stir Fried Bok Choy, Aug 2025.jpg](https://commons.wikimedia.org/wiki/File:Stir_Fried_Bok_Choy,_Aug_2025.jpg)；原始 SHA1 `fd6c6d37132be28f61728d847d2f7e2c6cfd8fe9`，版本时间 `2025-08-30T08:54:43Z`。
  - 下载路径：`https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Stir_Fried_Bok_Choy%2C_Aug_2025.jpg/1280px-Stir_Fried_Bok_Choy%2C_Aug_2025.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`；临时原图 `/private/tmp/cb013-b5-parent/chao-qing-cai.source.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#chao-qing-cai)为权威。

- **腐乳肉**（`fu-ru-rou`）：原文件明确腐乳红烧肉，带皮五花肉块与红腐乳浓汁吻合。
  - 原文件身份：[Red Braised Pork with Fermented Bean Curd.jpg](https://commons.wikimedia.org/wiki/File:Red_Braised_Pork_with_Fermented_Bean_Curd.jpg)；原始 SHA1 `952dacd90f6bdfa0ca725a3ff5f2cef7ea5d7b20`，版本时间 `2017-08-20T11:12:34Z`。
  - 下载路径：`https://upload.wikimedia.org/wikipedia/commons/f/ff/Red_Braised_Pork_with_Fermented_Bean_Curd.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original`；临时原图 `/private/tmp/cb013-b5-a/16-fu-ru-rou.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#fu-ru-rou)为权威。

- **尖椒炒牛肉**（`jian-jiao-chao-niu-rou`）：牛肉条与青尖椒的主要配料及炒制形态吻合；切条长短有差异。
  - 原文件身份：[杭椒牛柳.jpg](https://commons.wikimedia.org/wiki/File:%E6%9D%AD%E6%A4%92%E7%89%9B%E6%9F%B3.jpg)；原始 SHA1 `fa99b551215903d6946ecfb21ff479ac14cd969e`，版本时间 `2014-03-05T08:15:46Z`。
  - 下载路径：`https://upload.wikimedia.org/wikipedia/commons/d/d6/%E6%9D%AD%E6%A4%92%E7%89%9B%E6%9F%B3.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original`；临时原图 `/private/tmp/cb013-b5-a/24-jian-jiao-chao-niu-rou.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#jian-jiao-chao-niu-rou)为权威。

- **水油焖蔬菜**（`shui-you-men-shu-cai`）：叶菜熟软、清淡薄汁吻合；复用青菜成品代表照片，照片不能证明水油焖的器具和时长，可能有少量蒜粒。
  - 原文件身份：[Stir Fried Bok Choy, Aug 2025.jpg](https://commons.wikimedia.org/wiki/File:Stir_Fried_Bok_Choy,_Aug_2025.jpg)；原始 SHA1 `fd6c6d37132be28f61728d847d2f7e2c6cfd8fe9`，版本时间 `2025-08-30T08:54:43Z`。
  - 下载路径：`https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Stir_Fried_Bok_Choy%2C_Aug_2025.jpg/1280px-Stir_Fried_Bok_Choy%2C_Aug_2025.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`；临时原图 `/private/tmp/cb013-b5-parent/chao-qing-cai.source.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#shui-you-men-shu-cai)为权威。

- **汤面**（`tang-mian`）：通用汤面允许自行选择面和配菜；照片香菇与素浇头属于此开放选择，代表苏式汤面外观，不宣称具体上游试做。
  - 原文件身份：[苏式汤面.JPG](https://commons.wikimedia.org/wiki/File:%E8%8B%8F%E5%BC%8F%E6%B1%A4%E9%9D%A2.JPG)；原始 SHA1 `05bd60a82e284d3f9ff9b9fc1db821e8e08b9c6a`，版本时间 `2015-01-12T02:40:02Z`。
  - 下载路径：`https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/%E8%8B%8F%E5%BC%8F%E6%B1%A4%E9%9D%A2.JPG/1280px-%E8%8B%8F%E5%BC%8F%E6%B1%A4%E9%9D%A2.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`；临时原图 `/private/tmp/cb013-b5-b/tang-mian/candidate-1.jpg`。许可作者仅以[署名页](../../../public/image-credits.html#tang-mian)为权威。

通用代表照片不证明该菜谱的实际试做、调味比例、器具或时长；照片局部配饰差异逐项写明。照片没有语义编辑，仅缩放与JPEG编码，页面自行裁切；文件延续原开放许可。

## 逐菜检索与拒绝记录

第一组38道：Commons API尝试38次，前10次完成（包含0命中），后28次HTTP429未完成；网页索引搜索实际38条、覆盖37道，B52没有独立网页搜索但有API候选及文件页复核。一次网页查询记录错位经审计修正：白菜粉条多一次网页查询，不把API限流当作搜索无结果。第二组37道通过Commons网页索引检索，保留1个汤面候选，其余记录有限查询及前批排除项。主代理另查炒青菜、蒸南瓜、蚝油生菜、金针菇汤，以及4道具体点心配方等；找到单独青菜成品照片，南瓜混合餐/南瓜叶/马来椰奶糕和蘑菇面汤均不对应。本轮没有去爬未经许可的菜谱网站照片。

查询文本是实际检索证据；`HTTP429`、`incomplete`等表示未完成，不能据此宣称不存在照片。结合已有第三/四批记录及本轮可复用源复核，才选择AI兜底。授权与署名仍遵循原ADR。

| 菜谱 / ID | 本轮查询 | 主代理最终处理 |
| --- | --- | --- |
| 奥尔良风味烤鸡腿 / `ao-er-liang-feng-wei-kao-ji-tui` | New Orleans roast chicken leg [completed_zero_hits]；site:commons.wikimedia.org/wiki/File "chicken leg" roasted [completed] | 采用实拍，对应关系与限制见上节。 |
| B52轰炸机 / `b-5-2-hong-zha-ji` | B-52 layered cocktail shot [completed_with_hits] | Commons file describes layered Kahlua, Bailey's Irish Cream, and Grand Marnier; recipe calls for clear vodka on top and a small blue flame. 近似/前批排除：B-52 Splash.jpg 采用带标识示意图。 |
| 白菜猪肉炖粉条 / `bai-cai-zhu-rou-dun-fen-tiao` | Chinese pork belly napa cabbage vermicelli stew [completed_zero_hits]；site:commons.wikimedia.org/wiki/File "Bai Cai Zhu Rou Dun Fen Tiao" OR "Chinese cabbage pork vermicelli" [completed]；site:commons.wikimedia.org/wiki/File "Chinese cabbage" pork vermicelli stew [completed] | No exact Chinese pork belly, napa cabbage, and potato vermicelli stew photo found. 采用带标识示意图。 |
| 炒馍 / `chao-mo` | fried mantou Chinese bread [completed_with_hits]；site:commons.wikimedia.org/wiki/File "stir fried mantou" OR "炒馍" [completed] | Search results were historical illustrations or unrelated bread; no finished fried mantou photo with an accepted license verified. 采用带标识示意图。 |
| 炒年糕 / `chao-nian-gao` | stir fried Chinese rice cake nian gao [completed_zero_hits]；site:commons.wikimedia.org/wiki/File "fried rice cake" tteokbokki stir fried [completed] | Closest result was Malaysian Char Koay Kak fried rice cake, a different dish from this Chinese nian gao stir-fry. 近似/前批排除：Fried Rice Cake.jpg 采用带标识示意图。 |
| 炒茄子 / `chao-qie-zi` | Chinese stir fried eggplant minced pork [completed_with_hits]；site:commons.wikimedia.org/wiki/File Chinese stir fried eggplant pork minced eggplant [completed] | 采用实拍，对应关系与限制见上节。 |
| 炒青菜 / `chao-qing-cai` | Chinese stir fried leafy greens bok choy [completed_zero_hits]；site:commons.wikimedia.org/wiki/File "stir fried bok choy" OR "stir fried greens" [completed] | 采用实拍，对应关系与限制见上节。 |
| 陈皮排骨汤 / `chen-pi-pai-gu-tang` | pork rib soup tangerine peel [completed_zero_hits]；site:commons.wikimedia.org/wiki/File "pork rib soup" "tangerine peel" [completed] | No pork rib soup image matching tangerine peel/ginseng style found. 采用带标识示意图。 |
| 葱煎豆腐 / `cong-jian-dou-fu` | Chinese pan fried tofu scallion [completed_zero_hits]；site:commons.wikimedia.org/wiki/File Chinese scallion pan fried tofu dish [completed] | Closest results show generic fried/stir-fried tofu; scallion-topped pan-fried tofu was not confirmed. 近似/前批排除：Stir-Fried Tofu.jpg 采用带标识示意图。 |
| 葱烧鸡腿 / `cong-shao-ji-tui` | chicken drumsticks braised scallion [completed_zero_hits]；site:commons.wikimedia.org/wiki/File "scallion chicken" braised chicken legs [completed] | No finished scallion-braised chicken-leg photo found; a nearby ginger-scallion chicken-rice image belongs to recipe 26 and includes rice. 采用带标识示意图。 |
| 葱油 / `cong-you` | scallion oil sauce [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "scallion oil" condiment onions [completed] | Closest result was scallion-oil noodles, not scallion oil as the recipe product. 近似/前批排除：ChineseNoodles.jpg 采用带标识示意图。 |
| 带把肘子 / `dai-ba-zhou-zi` | braised pork knuckle fermented bean curd [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "braised pork knuckle" fermented bean curd [completed] | 下载的Braised Pork Knuckle是切开普通肘肉，无附脚爪的带把整肘形态，拒绝。 近似/前批排除：Braised Pork Knuckle (52643670268).jpg 采用带标识示意图。 |
| 蛋煎糍粑 / `dan-jian-ci-ba` | fried glutinous rice cake egg [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese fried glutinous rice cake egg [completed] | Commons has ordinary fried ciba, but metadata does not show the recipe's egg-coated rectangular pieces. 近似/前批排除：Fried glutinous rice cake.jpg 采用带标识示意图。 |
| 冬瓜桑拿鸡 / `dong-gua-sang-na-ji` | steamed chicken winter melon cordyceps [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "winter melon chicken" steamed chicken [completed] | No winter-melon/cordyceps steamed chicken result; ginger-steamed chicken lacks the recipe's main vegetable. 采用带标识示意图。 |
| 番茄牛肉蛋花汤 / `fan-qie-niu-rou-dan-hua-tang` | tomato beef egg drop soup [not_completed_http_429]；site:commons.wikimedia.org/wiki/File tomato beef egg drop soup [completed] | Closest tomato/beef/egg soup photo is a noodle soup; noodles are absent from this recipe. 近似/前批排除：Beef & Scrambled eggs Noodles in Tomato Soup.jpg 采用带标识示意图。 |
| 腐乳肉 / `fu-ru-rou` | red fermented bean curd pork belly [not_completed_http_429]；site:commons.wikimedia.org/wiki/File fermented bean curd pork belly red cooked [completed] | 采用实拍，对应关系与限制见上节。 |
| 蚝油生菜 / `hao-you-sheng-cai` | lettuce oyster sauce Chinese [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "lettuce with oyster sauce" Chinese [completed] | No lettuce with oyster sauce photo with a verified accepted license found. 采用带标识示意图。 |
| 红烧鱼头 / `hong-shao-yu-tou` | braised fish head Chinese [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "braised fish head" Chinese dish [completed] | 候选Braised fish head in pot含明显蘑菇及其他配料，复核仍不对应，拒绝。 采用带标识示意图。 |
| 红柚蛋糕 / `hong-you-dan-gao` | pomelo cake grapefruit cake [not_completed_http_429]；site:commons.wikimedia.org/wiki/File pomelo cake grapefruit cake [completed] | No real pomelo cake photo found; the search returned pomelo fruit only. Parent has generated an image for review. 采用带标识示意图。 |
| 黄瓜炒肉 / `huang-gua-chao-rou` | cucumber stir fried pork [not_completed_http_429]；site:commons.wikimedia.org/wiki/File cucumber pork stir fry Chinese [completed] | No cucumber-and-pork stir-fry image found. 采用带标识示意图。 |
| 黄瓜皮蛋汤 / `huang-gua-pi-dan-tang` | cucumber century egg soup [not_completed_http_429]；site:commons.wikimedia.org/wiki/File cucumber century egg soup Chinese [completed] | No cucumber and century-egg soup image found. 采用带标识示意图。 |
| 鸡蛋火腿炒黄瓜 / `ji-dan-huo-tui-chao-huang-gua` | cucumber egg ham stir fry [not_completed_http_429]；site:commons.wikimedia.org/wiki/File cucumber egg ham stir fry [completed] | Cucumber-and-egg photo is missing the recipe's ham/sausage ingredient. 近似/前批排除：Hunan cuisine, Cucumber fried with Eggs.jpg 采用带标识示意图。 |
| 家常日本豆腐 / `jia-chang-ri-ben-dou-fu` | Japanese egg tofu casserole ham black fungus [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Japanese egg tofu casserole ham black fungus [completed] | No Japanese egg-tofu casserole matching ham, carrot, and black fungus found. 采用带标识示意图。 |
| 尖椒炒牛肉 / `jian-jiao-chao-niu-rou` | Chinese stir fried beef green chili pepper [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese beef green pepper stir fry [completed] | 采用实拍，对应关系与限制见上节。 |
| 简易版炒糖色 / `jian-yi-ban-chao-tang-se` | Chinese caramel color sugar syrup wok [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese caramel color sugar syrup caramelized sugar for cooking [completed] | Only caramel-syrup process thumbnail found was 200×150 and BSD-3 licensed, outside the allowed license set; not a finished dish photo. 采用带标识示意图。 |
| 姜葱捞鸡 / `jiang-cong-lao-ji` | ginger scallion chicken boiled [not_completed_http_429]；site:commons.wikimedia.org/wiki/File ginger scallion chicken Chinese boiled chicken [completed] | 候选薑蔥霸王雞飯是多菜整餐照片，鸡饭不对应本菜粗鸡丝主体，拒绝。 近似/前批排除：薑蔥霸王雞飯.jpg 采用带标识示意图。 |
| 酱炖蟹 / `jiang-dun-xie` | crab stewed bean paste Chinese [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese crab stewed bean paste [completed] | No crab stewed with bean paste image matching this recipe found. 采用带标识示意图。 |
| 椒盐排条 / `jiao-yan-pai-tiao` | salt pepper pork strips [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese salt and pepper pork strips [completed] | Closest photo shows whole pork chops/ribs, not the recipe's salt-and-pepper pork strips. 近似/前批排除：Spicy salted pork chops.JPG 采用带标识示意图。 |
| 金钱蛋 / `jin-qian-dan` | Chinese tiger skin eggs chili [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese tiger skin eggs chili fried eggs [completed] | No Chinese money-egg/chili image found. 采用带标识示意图。 |
| 金针菇日本豆腐煲 / `jin-zhen-gu-ri-ben-dou-fu-bao` | enoki Japanese tofu casserole [not_completed_http_429]；site:commons.wikimedia.org/wiki/File enoki Japanese tofu casserole Chinese [completed] | The closest enoki/tofu photo also contains shrimp, Chinese cabbage, and asparagus beans, and is not a Japanese-tofu casserole. 采用带标识示意图。 |
| 金针菇汤 / `jin-zhen-gu-tang` | enoki mushroom egg soup [not_completed_http_429]；site:commons.wikimedia.org/wiki/File enoki mushroom egg soup Chinese [completed] | 检索只有添加面条/其他菌菇的汤及食材图，无本菜单一金针菇清汤合适照片。 采用带标识示意图。 |
| 咖喱炒蟹 / `ka-li-chao-xie` | curry crab coconut milk [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Chinese curry crab coconut milk [completed] | 候选Crab curry呈较干的咖喱附着，未对应本菜的浓稠椰浆蛋清酱形态，拒绝。 采用带标识示意图。 |
| 可乐炒饭 / `ke-le-chao-fan` | Coca Cola fried rice [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "Coca-Cola fried rice" [completed] | No Coca-Cola fried rice photo found. Parent has generated an image for review. 采用带标识示意图。 |
| 可乐桶 / `ke-le-tong` | whiskey coke lemon cocktail [not_completed_http_429]；site:commons.wikimedia.org/wiki/File whiskey coke lemon cocktail [completed] | Whisky-and-Coke photo is missing the recipe's lemon and ice; not an exact cola-bucket match. 近似/前批排除：Whisky and Coke.JPG 采用带标识示意图。 |
| 老干妈拌面 / `lao-gan-ma-ban-mian` | Lao Gan Ma chili oil noodles [not_completed_http_429]；site:commons.wikimedia.org/wiki/File "Lao Gan Ma" noodles [completed] | Search surfaced Lao Gan Ma condiment/rice/pita photos, but not Lao Gan Ma noodles. 采用带标识示意图。 |
| 醪糟小汤圆 / `lao-zao-xiao-tang-yuan` | Chinese fermented rice sweet rice dumplings tangyuan [not_completed_http_429]；site:commons.wikimedia.org/wiki/File tangyuan fermented rice sweet soup [completed] | No glutinous rice balls in fermented rice soup image found. 采用带标识示意图。 |
| 冷吃兔 / `leng-chi-tu` | Sichuan spicy rabbit cold rabbit [not_completed_http_429]；site:commons.wikimedia.org/wiki/File Sichuan cold spicy rabbit meat dish [completed] | No finished Sichuan cold spicy rabbit-meat dish found; rabbit-head and raw-rabbit images are not matches. 采用带标识示意图。 |
| 凉拌油麦菜 / `liang-ban-you-mai-cai` | cold lettuce sesame sauce salad [not_completed_http_429]；site:commons.wikimedia.org/wiki/File cold lettuce sesame sauce Chinese salad romaine [completed] | 候选Green Salad with Sesame Sauce含黄瓜番茄及混合生菜，非单一油麦菜，拒绝。 近似/前批排除：Green Salad with Sesame Sauce.jpg 采用带标识示意图。 |
| 萝卜炖羊排 / `luo-bo-dun-yang-pai` | 萝卜炖羊排；lamb ribs daikon stew | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 麻辣减脂荞麦面 / `ma-la-jian-zhi-qiao-mai-mian` | 麻辣减脂荞麦面；spicy buckwheat noodles with vegetables | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 魔芋蛋糕 / `mo-yu-dan-gao` | 魔芋蛋糕；konjac cocoa cake | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 牛油火锅底料 / `niu-you-huo-guo-di-liao` | 牛油火锅底料；Chinese beef tallow hot pot base | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 蒲烧茄子 / `pu-shao-qie-zi` | 蒲烧茄子；Japanese eggplant kabayaki | 两次定向查询只得到古籍扫描页与烤鳗鱼照片；未找到茄子成品图。 采用带标识示意图。 |
| 茄子炖土豆 / `qie-zi-dun-tu-dou` | 茄子炖土豆；Chinese eggplant potato stew | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 清蒸南瓜 / `qing-zheng-nan-gua` | 清蒸南瓜；Chinese steamed pumpkin | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 肉蛋盖饭 / `rou-dan-gai-fan` | 肉蛋盖饭；Chinese minced pork egg rice bowl | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 肉蟹煲 / `rou-xie-bao` | 肉蟹煲；Chinese crab pot with shrimp and rice cakes | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 陕北熬豆角 / `shan-bei-ao-dou-jiao` | 陕北熬豆角；Shaanbei braised green beans potatoes tomato | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 山西过油肉 / `shan-xi-guo-you-rou` | 山西过油肉；Shanxi guo you rou fried pork Chinese | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 商芝肉 / `shang-zhi-rou` | 商芝肉；Shaanxi shangzhi braised pork | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 水油焖蔬菜 / `shui-you-men-shu-cai` | 水油焖蔬菜；Chinese water braised leafy greens | 采用实拍，对应关系与限制见上节。 |
| 酸辣蕨根粉 / `suan-la-jue-gen-fen` | 酸辣蕨根粉；sour spicy fern root starch noodles | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 酸辣土豆丝 / `suan-la-tu-dou-si` | 酸辣土豆丝；Chinese sour spicy shredded potatoes | 两次定向查询只得到无关出版物；没有酸辣土豆丝成品照片。 采用带标识示意图。 |
| 蒜苔炒肉末 / `suan-tai-chao-rou-mo` | 蒜苔炒肉末；garlic scapes minced pork stir fry Chinese | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 糖醋汁 / `tang-cu-zhi` | 糖醋汁；Chinese sweet and sour sauce bowl | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 汤面 / `tang-mian` | 汤面 | 采用实拍，对应关系与限制见上节。 |
| 滕州菜煎饼 / `teng-zhou-cai-jian-bing` | 滕州菜煎饼；Tengzhou vegetable pancake cai jian bing | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 甜辣烤全翅 / `tian-la-kao-quan-chi` | 甜辣烤全翅；sweet chili roasted chicken wings | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 土豆炖排骨 / `tu-dou-dun-pai-gu` | 土豆炖排骨；Chinese potato pork ribs stew | 只找到此前已排除的照片，未发现新的匹配 Commons 文件。 近似/前批排除：{"title":"File:湘菜馆之土豆炖排骨.jpg","sha1":"a3ef6cc44ed5964f11f676676fce94bd9a8fe9a4"} 采用带标识示意图。 |
| 微波葱姜黑鳕鱼 / `wei-bo-cong-jiang-hei-xue-yu` | 微波葱姜黑鳕鱼；ginger scallion black cod Chinese | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 咸肉菜饭 / `xian-rou-cai-fan` | 咸肉菜饭；Chinese salted pork rice greens | 精确菜名照片已在 b4 清单中且被排除；英语查询只返回餐馆与菜单照片，没有新的菜品照片。 近似/前批排除：{"title":"File:江南名吃咸肉菜饭.jpg","sha1":"744c137674d1af6046a0ac94a4cf9810f8e74475"} 采用带标识示意图。 |
| 香干肉丝 / `xiang-gan-rou-si` | 香干肉丝；Chinese pork stir fry dried tofu strips | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 响油鳝丝 / `xiang-you-shan-si` | 响油鳝丝；Chinese sizzling eel strips | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 小米辣炒肉 / `xiao-mi-la-chao-rou` | 小米辣炒肉；Chinese pork stir fry small red chili | 近似结果是猪肉炒空心菜与辣椒，包含配方中没有的空心菜，按主食材不匹配排除。 采用带标识示意图。 |
| 洋葱炒猪肉 / `yang-cong-chao-zhu-rou` | 洋葱炒猪肉；Chinese pork onion stir fry | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 油醋爆蛋 / `you-cu-bao-dan` | 油醋爆蛋；Chinese vinegar fried eggs | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 油酥 / `you-su` | 油酥 | 近似结果为油酥烧饼成品，而本菜谱是用于烙饼的油酥配料，成品形态不匹配。 采用带标识示意图。 |
| 炸串酱料 / `zha-chuan-jiang-liao` | 炸串酱料；Chinese grilled skewer spice seasoning | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 蒸卤面 / `zheng-lu-mian` | 蒸卤面；Henan steamed braised noodles with pork celery | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 枝竹羊腩煲 / `zhi-zhu-yang-nan-bao` | 枝竹羊腩煲；Chinese lamb brisket tofu skin pot | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 近似/前批排除：{"title":"File:Lamb stew - Massachusetts.jpg","sha1":"ec81823b39018747b646e050a24a7b0fbd1d827f"} 采用带标识示意图。 |
| 中式馅饼 / `zhong-shi-xian-bing` | 中式馅饼；Chinese stuffed pork meat pie pan fried | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 煮泡面加蛋 / `zhu-pao-mian-jia-dan` | 煮泡面加蛋；instant noodles fried egg Chinese | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 近似/前批排除：{"title":"File:Instant noodle with boiled egg and spinach.jpg","sha1":"e43da5296714e087ba593207793c7f7e181f24fe"}；{"title":"File:Ramen with eggs.jpg","sha1":"0fd85d100e9ad739e958fbf0974e548b86c13000"} 采用带标识示意图。 |
| 猪肉烩酸菜 / `zhu-rou-hui-suan-cai` | 猪肉烩酸菜；Northeast Chinese pork sauerkraut stew | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 近似/前批排除：{"title":"File:Suan cai, pork, and Chinese blood sausage stew.jpg","sha1":"1ae4fd92ee59766099bd6342823533bc81960888"} 采用带标识示意图。 |
| 猪油拌饭 / `zhu-you-ban-fan` | 猪油拌饭；Chinese lard rice pork fat rice bowl | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |
| 紫菜蛋花汤 / `zi-cai-dan-hua-tang` | 紫菜蛋花汤；Chinese seaweed egg drop soup | 两个限定查询都没有找到同时匹配成品形态和主要食材且许可可验证的照片。 采用带标识示意图。 |

## AI成品复核

按现有食材及实际步骤组织提示词，68张均为单菜图、每菜独立调用内置imagegen，不使用拼图切块。初始68次生成，另3次修正：蒲烧茄子去皮、酱炖蟹切半、油醋爆蛋改煎蛋大块；修正后的最终源用于导入。PNG原件保留在本任务生成目录，提示词、源文件名与修正内容见[PROMPTS-BATCH-5](PROMPTS-BATCH-5.md)。

重点复核：全翅含翅根/翅中/翅尖，金钱蛋为熟蛋圆片，油醋爆蛋为煎蛋片；日本豆腐为圆形嫩黄色蛋豆腐，葱煎豆腐为矩形白豆腐；蒜苔炒肉末按实际步骤采用五花肉丝；中式馅饼按面糊混肉煎饼，不画成包馅面团。汤类、酱料、简单拌饭避免用附加主食材的近似照片填充。B52按该菜谱的伏特加变体画三层，并不代表常规Grand Marnier配方。

生成图只作外观示意，不作为内部熟度、精确配比、份量或操作教学证据。少量摆盘香草、葱碎与色泽表现可能不同于原文（例如金针菇汤出现少量绿叶配饰、微波鱼表面酱油着色），不回写为菜谱配料或额外步骤；做法与用量仍以原JSON为准。

## 逐项正式素材清单

以下路径统一为 `data/images/<id>/cover.jpg`。最终字节SHA256与尺寸用于运行响应核验，源身份见上文及提示词记录。

| 菜谱 / ID | 类型 | 尺寸 / 字节 | 最终SHA256 |
| --- | --- | --- | --- |
| 奥尔良风味烤鸡腿 / `ao-er-liang-feng-wei-kao-ji-tui` | 实拍 | 1200×897 / 227771 B | `bc9840e15c17c1d3234740ecac3e75b3910ab382d5088e9962cd426ef2e9f013` |
| B52轰炸机 / `b-5-2-hong-zha-ji` | AI 示意 | 1200×800 / 170189 B | `8c701a9be72885a479b32c7d93c77878b5b8c2ce42041a6c3e193ca5e1631af9` |
| 白菜猪肉炖粉条 / `bai-cai-zhu-rou-dun-fen-tiao` | AI 示意 | 1200×800 / 337444 B | `d555bd4848eb42f5c7f5f4bdc396b6405f3425155a5d77acb865d18d3a09648c` |
| 炒馍 / `chao-mo` | AI 示意 | 1200×800 / 308886 B | `6cbacdfc00450f788cac9fc320aafeb6dba745da4fdbceb31a23d823736c96b7` |
| 炒年糕 / `chao-nian-gao` | AI 示意 | 1200×800 / 294071 B | `666acedec74b942c8a198a5d02455b1403e9195dabe0ab4b0a7e0ebfb4a6faa6` |
| 炒茄子 / `chao-qie-zi` | 实拍 | 1200×675 / 350436 B | `7391df61ab436189858829baec435344e0b0346e6b79d6a446ccb6f8c7eea6af` |
| 炒青菜 / `chao-qing-cai` | 实拍 | 1200×903 / 242892 B | `33bbebf69b6394706a7debc7bfdd07702743445d19feca4f54ac14605626e97f` |
| 陈皮排骨汤 / `chen-pi-pai-gu-tang` | AI 示意 | 1200×800 / 277351 B | `221660bd643921de5ad685279428c223a4eb739e4eba5aeee3cb1a9cbdda8e7e` |
| 葱煎豆腐 / `cong-jian-dou-fu` | AI 示意 | 1200×800 / 326759 B | `90d7c2ca0af66f52c14fe457f36fdf3e258b151fedd97f669e03fbf73a11b4d2` |
| 葱烧鸡腿 / `cong-shao-ji-tui` | AI 示意 | 1200×800 / 319140 B | `0ff15a0f387941af428222e0a9bd31d5365807c26618dc35b09dd6d16e261d2d` |
| 葱油 / `cong-you` | AI 示意 | 1200×800 / 313873 B | `9eebc2a20c04e43f30736a7da54321d3b9a3ce10e71da9710d3affc618903e38` |
| 带把肘子 / `dai-ba-zhou-zi` | AI 示意 | 1200×800 / 338401 B | `e863028b3cb7512aaf57249dc03b2be79407cf96329947070f5ec0f3a1e842af` |
| 蛋煎糍粑 / `dan-jian-ci-ba` | AI 示意 | 1200×800 / 287432 B | `61019f7332790ab303f6182e357a727ddeca5c1338e7c6d6074b8b523dbd5b62` |
| 冬瓜桑拿鸡 / `dong-gua-sang-na-ji` | AI 示意 | 1200×800 / 288965 B | `efa796502df8b71ae9ceb86064593536efac93b7518c18c15f6735997ade57fe` |
| 番茄牛肉蛋花汤 / `fan-qie-niu-rou-dan-hua-tang` | AI 示意 | 1200×800 / 303676 B | `4f563ddc350cbce988aec39a07236d853bc7043eaee4bd7a313b2f36fb5abb78` |
| 腐乳肉 / `fu-ru-rou` | 实拍 | 1200×900 / 279124 B | `6bf9094d71f33df564eec43176eac1dc2fc3df123c398d5f663e832b09d4acf0` |
| 蚝油生菜 / `hao-you-sheng-cai` | AI 示意 | 1200×800 / 293053 B | `cc590928b67c81f649aa70f74ce2d81c2c37d227f1c5babab36ba3f6e71b32c6` |
| 红烧鱼头 / `hong-shao-yu-tou` | AI 示意 | 1200×800 / 343570 B | `14b367ed5997b91e4c71c2794355289632d7a14e7ea4bd10ba750aaf41a6d7fb` |
| 红柚蛋糕 / `hong-you-dan-gao` | AI 示意 | 1200×800 / 322338 B | `3c3673ea3bec6f2362b672cac43e9d6abaaac323e6f4cd201c9932ff738e90a4` |
| 黄瓜炒肉 / `huang-gua-chao-rou` | AI 示意 | 1200×800 / 310594 B | `aeac02ab85c03ae63b183e57970c017202259d71cc199a86aa8e016caf61e4f5` |
| 黄瓜皮蛋汤 / `huang-gua-pi-dan-tang` | AI 示意 | 1200×800 / 278690 B | `e590dfc73fac71269f164831886d1bf730bb17f0486f09133ef26f1a517c490e` |
| 鸡蛋火腿炒黄瓜 / `ji-dan-huo-tui-chao-huang-gua` | AI 示意 | 1200×800 / 290265 B | `33edbaa6f62e65059074a863ef1d75b43c04e056d931479f79c9fe056fc0561c` |
| 家常日本豆腐 / `jia-chang-ri-ben-dou-fu` | AI 示意 | 1200×800 / 334345 B | `f7250ae080c54d274a2a73b3a7c7858862758edc58b13e4650ad088757da6bf6` |
| 尖椒炒牛肉 / `jian-jiao-chao-niu-rou` | 实拍 | 1200×675 / 203329 B | `9f45c39c2730b1698764d77eea9b8df7607b2aa77ba078dcab83635ab704750b` |
| 简易版炒糖色 / `jian-yi-ban-chao-tang-se` | AI 示意 | 1200×800 / 234548 B | `2f663e7f9c528a96df8dae0f058f004f1ec742326486781452c7f58d15d587e1` |
| 姜葱捞鸡 / `jiang-cong-lao-ji` | AI 示意 | 1200×800 / 313486 B | `7259e72c307ef6e8dcfa93cdcf3c88f60e3e6ecacc22659d4e7e2b23420f091a` |
| 酱炖蟹 / `jiang-dun-xie` | AI 示意 | 1200×800 / 340549 B | `fa7e76c9f844ad1993dfdb833d61ee494a762136d2e36d72b3ca13ba0605a438` |
| 椒盐排条 / `jiao-yan-pai-tiao` | AI 示意 | 1200×800 / 348964 B | `b2df544ed146556d10e5316d0946d0744cba254b4b705b9627d5f664dbc6f49f` |
| 金钱蛋 / `jin-qian-dan` | AI 示意 | 1200×800 / 334710 B | `85a4b08ab5aa1b40ec9cdbdc7201a3ec78fba1175588029eff2bb81330a7bf4c` |
| 金针菇日本豆腐煲 / `jin-zhen-gu-ri-ben-dou-fu-bao` | AI 示意 | 1200×800 / 295552 B | `d3dd425cf3d2b8312523602e830a65469e2223e0032ef97370e49fa9ed38e963` |
| 金针菇汤 / `jin-zhen-gu-tang` | AI 示意 | 1200×800 / 261427 B | `458ed28e1c38b08e38e0972228ea35acd5ee23961009d5b7979e6e28c8894be3` |
| 咖喱炒蟹 / `ka-li-chao-xie` | AI 示意 | 1200×800 / 357212 B | `ce1dcafded375bef4c48d591ec60766de72836ce70b26f11c2b790a940f2811e` |
| 可乐炒饭 / `ke-le-chao-fan` | AI 示意 | 1200×800 / 329090 B | `671aca67ba0725b5e11bd1dcc2b660151fdb0e2e0bdbb0058090414a69d13857` |
| 可乐桶 / `ke-le-tong` | AI 示意 | 1200×800 / 328810 B | `f2f3a10f410e56c29a4f27ba7c60d049da4c4a87987adb4f8f70e413f0db2749` |
| 老干妈拌面 / `lao-gan-ma-ban-mian` | AI 示意 | 1200×800 / 318495 B | `65b427aebb5a3a5d40ef85c614ff183de277277c6b418f198d1693ea73435354` |
| 醪糟小汤圆 / `lao-zao-xiao-tang-yuan` | AI 示意 | 1200×800 / 229418 B | `03546be8a3cafb16466965cecf4280784c469fb05b49c5717adba99705d9483b` |
| 冷吃兔 / `leng-chi-tu` | AI 示意 | 1200×800 / 353238 B | `ed1899810ec13fe7b3256b23683a8312116e5faecabb28cb8c986af9e855e5ec` |
| 凉拌油麦菜 / `liang-ban-you-mai-cai` | AI 示意 | 1200×800 / 304068 B | `6c9157d8d9666a023c9fec2d367576cb397e3d3356827e0bad0aad50a7b84a28` |
| 萝卜炖羊排 / `luo-bo-dun-yang-pai` | AI 示意 | 1200×800 / 295369 B | `5ca1f511c306874e6ae45af072d4dda93cf70e504613d250bce5adca2e0fde15` |
| 麻辣减脂荞麦面 / `ma-la-jian-zhi-qiao-mai-mian` | AI 示意 | 1200×800 / 299205 B | `b19d8aaa189d2b817673bee2f43c673f6d48d90c6af4e011cab3609548f3bb07` |
| 魔芋蛋糕 / `mo-yu-dan-gao` | AI 示意 | 1200×800 / 333381 B | `5697de1d4a80c6f79719e08bd438a59e4a4acae22a2a73f45eefb8926215ae76` |
| 牛油火锅底料 / `niu-you-huo-guo-di-liao` | AI 示意 | 1200×800 / 334495 B | `bffc4207d2b88baa3e2b6d5dc6bd8d85dfe52b698a2bc915e989a80b587c7146` |
| 蒲烧茄子 / `pu-shao-qie-zi` | AI 示意 | 1200×800 / 312528 B | `1b390a5a4138938615287d02a701314b652f3b628d5b3033438761d99404903e` |
| 茄子炖土豆 / `qie-zi-dun-tu-dou` | AI 示意 | 1200×800 / 341081 B | `df4ceb8ea3410963cb185ac02d59236365f6cb981774e9a96620ab7273bffc93` |
| 清蒸南瓜 / `qing-zheng-nan-gua` | AI 示意 | 1200×800 / 266340 B | `d51aa76498999a15f8a5eac322506793ed8a761e7a49e1de8cdf187f7d3e22da` |
| 肉蛋盖饭 / `rou-dan-gai-fan` | AI 示意 | 1200×800 / 285301 B | `a064e0b7e4efa89987c4f300d60c6655b1400b5fcc2c76e8efd3a74de4e364e9` |
| 肉蟹煲 / `rou-xie-bao` | AI 示意 | 1200×800 / 349905 B | `fd98fb4d28aafc49683e48032d46245ab618e160a170c216e53c8a1e3a5f286b` |
| 陕北熬豆角 / `shan-bei-ao-dou-jiao` | AI 示意 | 1200×800 / 313825 B | `67e69918e095f4f6c8ace8a19161e6a9992f5f7d9e7ded9c06d379193707bdbb` |
| 山西过油肉 / `shan-xi-guo-you-rou` | AI 示意 | 1200×800 / 324475 B | `e2f15252a707c4a89eea0e774db7ccd6b2ef9e2ec0c87890efd257749d031b20` |
| 商芝肉 / `shang-zhi-rou` | AI 示意 | 1200×800 / 363320 B | `4daabee7e36bca3c028d883b007c4ad02380e9a6b462a895dca524a7708f639c` |
| 水油焖蔬菜 / `shui-you-men-shu-cai` | 实拍 | 1200×903 / 242892 B | `33bbebf69b6394706a7debc7bfdd07702743445d19feca4f54ac14605626e97f` |
| 酸辣蕨根粉 / `suan-la-jue-gen-fen` | AI 示意 | 1200×800 / 286562 B | `747e49ac428a4bf84618bd552b1f3340a94a1161e5cf63b67a9727b32162a593` |
| 酸辣土豆丝 / `suan-la-tu-dou-si` | AI 示意 | 1200×800 / 289621 B | `500e0046caedc75e28622db2c3ba6fa5583860ea7fcf879e76c0810e293f0153` |
| 蒜苔炒肉末 / `suan-tai-chao-rou-mo` | AI 示意 | 1200×800 / 332984 B | `9b34b8e22dca46f4154d56d02445d1c35e6ce4ba913b3b6f338cc3034199ea39` |
| 糖醋汁 / `tang-cu-zhi` | AI 示意 | 1200×800 / 208294 B | `419a8cffc8ed3534cb5db9528de505fd91acc7316e80c436d15b96850b745b7d` |
| 汤面 / `tang-mian` | 实拍 | 1200×896 / 381829 B | `1a8585c140e03a5275b8384040015d01d2863e05cebac9ca67e63c9d9dda908b` |
| 滕州菜煎饼 / `teng-zhou-cai-jian-bing` | AI 示意 | 1200×800 / 276165 B | `4d9ca2c00803979d512a3b62c5663770c737478ff04705aa132e095ae0557538` |
| 甜辣烤全翅 / `tian-la-kao-quan-chi` | AI 示意 | 1200×800 / 406984 B | `cdd1b13f3d39c2c2ed8ccf1694e6ae478b680f02596b2c7369fab51308c75a48` |
| 土豆炖排骨 / `tu-dou-dun-pai-gu` | AI 示意 | 1200×800 / 340774 B | `a2ed78a3714411b8dd2e4d0ef292c666d1c8cff532051b1ea20f8a63b25f066a` |
| 微波葱姜黑鳕鱼 / `wei-bo-cong-jiang-hei-xue-yu` | AI 示意 | 1200×800 / 299008 B | `192045cd9c3a5c3949732f725f9954be5f738d77c444a9f8fd8b9a3b0e5e2b2c` |
| 咸肉菜饭 / `xian-rou-cai-fan` | AI 示意 | 1200×800 / 298575 B | `19c19baa19bea5795440e16a83a74c5c9a96084e4cac53e350d84fd93b378ed1` |
| 香干肉丝 / `xiang-gan-rou-si` | AI 示意 | 1200×800 / 294364 B | `b12284132425a8e236b25d2624eef720ea738283259394708e468bb802f5fe54` |
| 响油鳝丝 / `xiang-you-shan-si` | AI 示意 | 1200×800 / 339518 B | `ab4b58496f8949d6d53af32a80cb7e8918083b9d69c80956524bc6124fb438a4` |
| 小米辣炒肉 / `xiao-mi-la-chao-rou` | AI 示意 | 1200×800 / 354583 B | `082e6b7d34411dc33253c44039e337efd28dfd95e600700b11bdca586274a44f` |
| 洋葱炒猪肉 / `yang-cong-chao-zhu-rou` | AI 示意 | 1200×800 / 319784 B | `2ceb71dca0ef0ae0a247ec61426206c86d258f19799eb5ed3068f3cbbf57a68d` |
| 油醋爆蛋 / `you-cu-bao-dan` | AI 示意 | 1200×800 / 330339 B | `c81c79e432fff238c0c68c1c36c82a1351bfdba57de542ad9cc21e842ac79e9c` |
| 油酥 / `you-su` | AI 示意 | 1200×800 / 214304 B | `47332840d68ca1441c27215cdb95ab15d57acac872e6d23de01ff42e23d8d930` |
| 炸串酱料 / `zha-chuan-jiang-liao` | AI 示意 | 1200×800 / 306600 B | `ce587eab418568ce890621cebcf324e230285a74d2d032278c14e2356e6f4dcb` |
| 蒸卤面 / `zheng-lu-mian` | AI 示意 | 1200×800 / 335180 B | `f8894249d7431b401e7f6890d39e19912cea7a3b8e2466fa73f5f6b50b598669` |
| 枝竹羊腩煲 / `zhi-zhu-yang-nan-bao` | AI 示意 | 1200×800 / 339832 B | `041048cba76863e303e0b9f6550424d3f1f8ab8707ea58d68af9c90db8483870` |
| 中式馅饼 / `zhong-shi-xian-bing` | AI 示意 | 1200×800 / 344494 B | `6efc9ee0e564e5de4d82a184336328a4f935958626b564c84a88f192189f6ba6` |
| 煮泡面加蛋 / `zhu-pao-mian-jia-dan` | AI 示意 | 1200×800 / 255817 B | `96623f22371954fc0cc8537b751ba0e6e31cec5e372ef21e8922514cdd0c359a` |
| 猪肉烩酸菜 / `zhu-rou-hui-suan-cai` | AI 示意 | 1200×800 / 290350 B | `57891b0d7082f249120d44d8b029af921a9b668379a23155484f2263fdba108f` |
| 猪油拌饭 / `zhu-you-ban-fan` | AI 示意 | 1200×800 / 321299 B | `39e3b5117dc6f908a98dd3635ecf2f3169971e4211eb12cd419b0cb6c6f66ebb` |
| 紫菜蛋花汤 / `zi-cai-dan-hua-tang` | AI 示意 | 1200×800 / 275424 B | `2cd33fd0f31dc22f99b032f47f16f4713fafd350b2ec1d5ae40bf5611e1d4a67` |

## 静态检查与自动化测试

- `npm run typecheck`：通过，三套tsconfig。
- `npm test`：26个测试文件、280项通过。
- `npm run check:data`：371个文件通过、0失败。首次沙箱运行因tsx本机IPC管道EPERM失败，允许本机管道后原命令重跑通过，未改校验逻辑。
- `npm run build`：通过。源码及交互不变，生成新署名页静态文件。
- 日志：`/private/tmp/cb013-b5-{typecheck,test,data,build}.log`。

## 真实运行与裁切

本机预览：`http://127.0.0.1:3099`，重新启动以扫描新增素材。Browser plugin不可用，使用现有Playwright及本机Chrome，未安装浏览器或依赖。

75个JPEG端点均为HTTP200/image/jpeg，响应SHA256与上表正式文件逐项一致；API总计371道、371道含封面、跳过0道。1440×1000和390×844两个视口分别完成75条搜索卡片→详情路径，共150条；图片解码、详情图片ID正确，无控制台错误或页面横向溢出。署名页98行、逐项新ID唯一，与本地HTML字节一致；两种视口的页脚入口及返回列表通过。

对实际截图集中审查：桌面/手机各7页、共14页审图表覆盖全部75张卡片和详情，68个AI标识在四种容器组合中完整保留；桌面详情窄横幅、手机方形小卡片均未截断标识。实拍成品主体可辨认；烤鸡腿宽横幅会裁掉部分腿端，B52桌面详情会裁掉上方火苗，但列表和手机详情仍保留整体形态，不把局部裁切当作额外做法证据。

首次脚本在陈皮排骨汤处选中同名旧ID `chen-pi-pai-gu-tang-2`，因此预期URL超时；独立页面复现确认应用没有报错，属于测试定位歧义。脚本改为同时用精确名称及对应图片路径定位卡片后整批重跑通过；未修改应用。工具执行退出码0，日志 `/private/tmp/cb013-b5-browser.log`，脚本 `/private/tmp/cb013-b5-browser.mjs`，截图 `/private/tmp/cb013-b5-parent/<id>-<width>-{card,hero}.png` 及 `rendered-<width>-<0..6>.png`。前7条部分成功不当作完整证据，最终以重跑的150条结果为准。

## 尚未验证与回滚边界

用户观感、真实手机及厨房距离可读性待反馈；不将浏览器390px视口称为真机。AI标识是图片像素，列表小缩略图中的文字较小，详情更清晰；不宣称屏幕阅读器能读取图片内文字。未做实际烹饪或营养验证。

撤回本批只涉及上表75个新增封面及本批7行署名，不触碰旧文件；实际删除仍须独立授权。图片按[数据模型](../../DATA_MODEL.md)作为用户持久素材，不纳入Git；本次提交保存规格、来源署名和复核记录。

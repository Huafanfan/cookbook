# CB-013 第五批生成提示词

日期：2026-09-30。68道未找到合适开放许可实拍的菜使用AI示意，独立调用内置imagegen共71次（68次初始生成与3次修正），未使用CLI/API批量生成或拼图切块。下列英文为实际提交的提示词内容。

## 公共提示词模板

把每道菜的具体成品描述代入`{dish}`，其他内容逐字相同；透明背景为false。新图不引用其他图片。

```text
Create ONE horizontal3:2 realistic-looking AI food illustration for a Chinese family cookbook. Dish: {dish} Natural window light,warm wood table,one centrally framed serving at45-degree view,appetizing ordinary home cooking,no people,no raw ingredients,no packaging,no collage. CRITICAL: a pale-cream rounded rectangle MUST cover the food at the EXACT GEOMETRIC CENTER of the full canvas,x=50%,y=50%,width18%,height7%,dark brown legible Chinese text exactly 'AI 示意图'. Never put the badge at bottom,rim,glass base,lower third,or below food. A thin horizontal center crop MUST preserve the entire badge. No other words,logos or labels. 标识必须直接覆盖食物正中，不准放下半部。
```

## 每道菜的描述与最终源

源PNG原件目录：`/Users/zhangyifan/.codex/generated_images/01a0f003-9644-7a50-8924-1d996953b2f8/`；图片保留原件，仅复制并编码成正式JPEG。正式文件字节与尺寸见[CHECK-BATCH-5](CHECK-BATCH-5.md)。

### B52轰炸机（b-5-2-hong-zha-ji）

具体成品描述：

```text
One small shot glass with exactly three horizontal layers: dark coffee liqueur lower third, opaque pale cream Irish cream middle third, clear colorless vodka upper third. Tiny pale blue flame just above rim. Unbranded glass, no bottles. This is this recipe's vodka variation of B52.
```

最终源：`exec-3c952c54-01bb-412c-b8e6-57967b629293.png`。

### 白菜猪肉炖粉条（bai-cai-zhu-rou-dun-fen-tiao）

具体成品描述：

```text
Chinese braise of cooked napa cabbage, thin pork belly slices and translucent brown potato-starch vermicelli in a little soy-brown broth; visibly all three main ingredients, no blood sausage.
```

最终源：`exec-fb1fda60-a059-4b11-91ae-6bd7073b65d1.png`。

### 炒馍（chao-mo）

具体成品描述：

```text
Small cubes of steamed wheat mantou stir-fried to golden brown with thin cooked egg coating, tiny scallion flecks and cumin seasoning. Dry appetizing plate, no potato cubes.
```

最终源：`exec-d18b9178-90c2-4dfb-a7ef-0fb0e5ce7b2a.png`。

### 炒年糕（chao-nian-gao）

具体成品描述：

```text
Chinese oval rice-cake slices stir-fried in light soy glaze with scrambled eggs, green leafy vegetables and scallions. Not Korean red tteokbokki, no fishcakes, no cylindrical sticks.
```

最终源：`exec-163bce0f-4b17-4774-b980-f5e52e5cb254.png`。

### 陈皮排骨汤（chen-pi-pai-gu-tang）

具体成品描述：

```text
Clear golden Cantonese herbal pork rib soup with 4-5 cooked pork rib chunks, a few dried tangerine peel pieces, American ginseng slices, dendrobium stalks, polygonatum slices and ophiopogon roots. Small ceramic stew pot, no corn or radish.
```

最终源：`exec-055cf4e2-5491-4be3-aec3-1e3ed3df145c.png`。

### 葱煎豆腐（cong-jian-dou-fu）

具体成品描述：

```text
Pan-fried rectangular tofu slices about5mm thick, golden on both sides, mixed with small green pepper squares and chopped scallions, a little clear reduced sauce. Not round Japanese egg tofu.
```

最终源：`exec-c7f7f92f-6d8b-40af-a212-5d2c799633cd.png`。

### 葱烧鸡腿（cong-shao-ji-tui）

具体成品描述：

```text
Fully cooked boneless chicken thigh diced2-3cm, browned and glossy with soy-oyster sauce, thick leek/scallion white rounds and short green scallion segments. No bone-in drumsticks.
```

最终源：`exec-02880d58-87f2-4695-815b-e65989e26a5a.png`。

### 葱油（cong-you）

具体成品描述：

```text
Homemade aromatic scallion oil in a small plain bowl, translucent amber-gold oil with fried brown scallion strands and a few ginger/onion pieces and dried shrimp. No noodles, no other dishes.
```

最终源：`exec-ea04db16-5f03-4adb-b04e-4ea8b4637506.png`。

### 带把肘子（dai-ba-zhou-zi）

具体成品描述：

```text
Shaanxi daiba pork elbow: a very tender glossy reddish-brown braised-steamed whole pork foreleg joint WITH attached small trotter curled toward the joint in a round shape, intact soft skin. Small side dish of scallion lengths and sweet bean paste only. No German crispy roast skin.
```

最终源：`exec-79711b9c-bd2a-452a-a258-79c4f728da26.png`。

### 蛋煎糍粑（dan-jian-ci-ba）

具体成品描述：

```text
Southern Chinese egg-fried glutinous rice cake: small rectangular white rice-cake blocks coated in thin golden cooked egg, softly chewy interior, lightly crisp golden surface, small touch of brown sugar. Not bread, no skewers.
```

最终源：`exec-208a8a3c-4aaf-48c8-a76c-f4695965d408.png`。

### 冬瓜桑拿鸡（dong-gua-sang-na-ji）

具体成品描述：

```text
Chinese steamed chicken chunks arranged over translucent thin winter melon slices and orange cordyceps flower mushrooms, fine ginger strips, moist cooked chicken, light soy juices. Round serving plate, no pumpkin.
```

最终源：`exec-874ddf0c-ecf8-4a9e-a096-ba0e756455d4.png`。

### 番茄牛肉蛋花汤（fan-qie-niu-rou-dan-hua-tang）

具体成品描述：

```text
Clear light tomato soup containing tender fully cooked thin beef slices, soft red tomato chunks, delicate pale yellow egg-drop ribbons and a few scallion flecks. No noodles or potatoes.
```

最终源：`exec-c599db6d-487a-4157-8bbc-9c798cb90db7.png`。

### 蚝油生菜（hao-you-sheng-cai）

具体成品描述：

```text
Blanched green leaf lettuce arranged alone on plate, lightly wilted leaves draped with glossy oyster-soy sauce and small minced garlic. No noodles, no pork or side dishes.
```

最终源：`exec-3c49b911-4284-4620-bd9e-fa9d40916535.png`。

### 红烧鱼头（hong-shao-yu-tou）

具体成品描述：

```text
Chinese soy-braised silver carp fish head cut into4-6 irregular bony sections, head features visibly recognizable, dark reddish brown reduced sauce, ginger garlic scallion and a little coriander and thin red chili rounds. NO mushrooms, tofu or curry.
```

最终源：`exec-f93dbb43-0de7-44f9-bb94-e7a64c1a9860.png`。

### 红柚蛋糕（hong-you-dan-gao）

具体成品描述：

```text
Simple homemade red pomelo cake baked in shallow foil pan, plain golden yellow-brown low rustic cake, cut piece revealing fine egg-flour crumb with tiny scattered pink pomelo pulp flecks. No frosting, no fresh fruit slices topping, no layered cream cake.
```

最终源：`exec-a38e67b3-f634-442c-b81c-74ed7970507a.png`。

### 黄瓜炒肉（huang-gua-chao-rou）

具体成品描述：

```text
Chinese stir-fry of fully cooked thin pork slices and oblique cucumber slices0.5cm thick, minced garlic and small red bird-eye chili pieces, light soy glaze. No egg, no ham.
```

最终源：`exec-ed46fa37-b910-4b0f-9a30-ac5b3f5dd120.png`。

### 黄瓜皮蛋汤（huang-gua-pi-dan-tang）

具体成品描述：

```text
Light slightly cloudy soup with very thin green cucumber slices and dark translucent century-egg wedges showing grey-green yolk, a few browned garlic halves and scallion flecks. No boiled white eggs, no noodles.
```

最终源：`exec-e6f004f8-d54b-474e-85a2-264b379bfb4e.png`。

### 鸡蛋火腿炒黄瓜（ji-dan-huo-tui-chao-huang-gua）

具体成品描述：

```text
Chinese stir-fry of half-round cucumber slices, half-round pink cooked ham sausage slices and fluffy fully set yellow scrambled eggs; a few red chili flecks, no other main foods.
```

最终源：`exec-23e9221e-12de-4404-bb15-28a6edb9ad7f.png`。

### 家常日本豆腐（jia-chang-ri-ben-dou-fu）

具体成品描述：

```text
Golden pan-fried round Japanese egg tofu discs1cm thick mixed with green pepper pieces, carrot slices, ham sausage slices and black wood-ear mushrooms in reddish soy-oyster-tomato sauce. Tofu smooth yellow inside, not white bean tofu cubes.
```

最终源：`exec-ecb1d892-dbd3-44ad-9f4d-a5b274fde6cf.png`。

### 简易版炒糖色（jian-yi-ban-chao-tang-se）

具体成品描述：

```text
Finished Chinese cooking caramel color: a small plain ceramic bowl containing a smooth reddish amber-brown pourable caramel cooking liquid, rich glossy surface, no pork or desserts, no spoon blocking contents. Do not show risky cooking process.
```

最终源：`exec-8a560763-f383-46c5-8a7a-da1965020730.png`。

### 姜葱捞鸡（jiang-cong-lao-ji）

具体成品描述：

```text
Cooked steamed chicken thigh meat hand-torn into coarse1cm-wide strips, tossed in fragrant scallion-ginger oil with finely chopped ginger and short green scallions. Pale golden moist chicken, no rice, no whole chopped chicken pieces.
```

最终源：`exec-68f66ae9-93e0-4c65-9b3c-ed1eaea9a450.png`。

### 酱炖蟹（jiang-dun-xie）

具体成品描述：

```text
Halved shell-on crab steamed cut-side-down on a thin layer of reddish dark bean paste sauce, ginger slices and scallion lengths on a plate. Warm cooked orange shells, no rice and no side vegetables.
```

最终源：`exec-220dc5db-7b06-40b2-9333-7b921d262c13.png`。

修正前源：`exec-428d06c1-fb4d-4b8f-ad90-f9dadce110d9.png`；以其本地路径作为唯一reference提交下面编辑提示，透明背景false：

```text
Edit this AI food illustration. Preserve lighting, plate, ginger, scallion and dark bean sauce and EXACT centered 'AI 示意图' badge. The recipe cuts each crab IN HALF through the body before steaming cut-side-down: show four separate cooked orange shell-on crab HALF-BODIES on the plate, each shell cap cut cleanly into a semicircle and corresponding legs/claw attached to each half, visible gap between halves. NO complete round whole crab shell anywhere. No new ingredients.
```

### 椒盐排条（jiao-yan-pai-tiao）

具体成品描述：

```text
Chinese salt-and-pepper pork strips: boneless pork loin cut into thick short strips, crisp golden battered outside, a few salt-pepper specks. Not ribs with bones, not chicken nuggets, no sweet sauce.
```

最终源：`exec-1c083e57-2a7e-41bb-a7e4-84eff8a6b179.png`。

### 金钱蛋（jin-qian-dan）

具体成品描述：

```text
Chinese golden coin eggs: hard-boiled eggs cut crosswise into thick round discs showing firm yellow yolk centers, pan-fried to light golden edges, tossed in bean paste soy sauce with chopped green long chili, red bird-eye chili and garlic. Not scrambled eggs or fried sunny-side eggs.
```

最终源：`exec-ce1c4632-d8b0-4616-922c-39a54684ccae.png`。

### 金针菇日本豆腐煲（jin-zhen-gu-ri-ben-dou-fu-bao）

具体成品描述：

```text
Small clay pot with pan-fried golden Japanese egg-tofu round slices layered over soft white enoki mushrooms, glossy brown soy-oyster reduced sauce, small red bird-eye chili and minced garlic. No meat or cheese.
```

最终源：`exec-898f90aa-6b5e-4de7-8d9a-65642e350d66.png`。

### 金针菇汤（jin-zhen-gu-tang）

具体成品描述：

```text
Simple clear enoki mushroom soup; cooked slender pale enoki stems cut shorter than5cm and small caps dispersed in clear lightly seasoned broth, no eggs because final steps do not add them, no carrots or meat.
```

最终源：`exec-ac61c983-01bd-4ca0-8fa7-fd2d0cfd275d.png`。

### 咖喱炒蟹（ka-li-chao-xie）

具体成品描述：

```text
Chinese-Thai style shell-on hard crab chunks, bright orange claws and shell visible, in rich creamy golden yellow coconut curry sauce thickened with cooked egg white and finely chopped onion/garlic. No whole softshell crab, no red Indian dry curry.
```

最终源：`exec-7644b017-4fab-4774-8435-4efaba7cb544.png`。

### 可乐炒饭（ke-le-chao-fan）

具体成品描述：

```text
Cooked Chinese cola fried rice with dark glossy soy-cola grains, golden fried egg pieces and pink ham sausage cubes, scallion flecks; every egg fully set, no drink bottle, no peas or corn.
```

最终源：`exec-e8730438-2128-457b-b310-725530c054b1.png`。

### 可乐桶（ke-le-tong）

具体成品描述：

```text
One large plain one-litre clear glass mug of dark brown cola-whisky cocktail with lots of ice and squeezed lemon quarters plus a lemon slice. No logo, no branded bottle, no other glasses.
```

最终源：`exec-45c07752-5d0b-4acc-b07b-28f16b5898a1.png`。

### 老干妈拌面（lao-gan-ma-ban-mian）

具体成品描述：

```text
Simple cooked wheat noodles tossed in soy sauce and dark red chili crisp oil, visible little crisp chili flakes, nothing else: no egg, meat, vegetables, jars or packaging.
```

最终源：`exec-215b134a-e857-4f41-b58a-4fcf071069d7.png`。

### 醪糟小汤圆（lao-zao-xiao-tang-yuan）

具体成品描述：

```text
Chinese sweet fermented rice soup: many very small plain white glutinous rice balls in pale clear cloudy rice-wine broth with visible soft fermented rice grains and a few red goji berries. No large filled tangyuan, no purple balls, no dark ginger syrup.
```

最终源：`exec-6c1f2ce0-1159-422b-b395-f602f8738cc9.png`。

### 冷吃兔（leng-chi-tu）

具体成品描述：

```text
Sichuan cold spicy rabbit: small2cm cooked golden-brown rabbit pieces, some small bones, tossed with abundant crisp dry red chili2cm segments, green Sichuan peppercorns, garlic and white sesame. Dry oily coating, not wet soup.
```

最终源：`exec-f5b16645-487b-47a5-8507-b19d56bf5c0b.png`。

### 凉拌油麦菜（liang-ban-you-mai-cai）

具体成品描述：

```text
Cold salad of fresh raw green Chinese narrow-leaf lettuce cut into4cm segments, tossed with creamy tan sesame paste dressing, minced garlic, vinegar and soy; no cucumber, tomatoes or mixed salad vegetables.
```

最终源：`exec-263a92aa-169f-40d4-87c1-9768685c412f.png`。

### 萝卜炖羊排（luo-bo-dun-yang-pai）

具体成品描述：

```text
Light clear lamb-rib and white radish stew, cooked bone-in lamb rib chunks and large white radish irregular3-5cm chunks, a few ginger and scallion pieces. No carrots, tomatoes or potatoes.
```

最终源：`exec-d7e5e522-b2a2-4823-9f9f-0446bce90d95.png`。

### 麻辣减脂荞麦面（ma-la-jian-zhi-qiao-mai-mian）

具体成品描述：

```text
Small pot of cooked buckwheat noodles in creamy light orange spicy milk-peanut-hotpot broth with napa baby cabbage and lettuce, slight red chili oil. No meat or eggs. No claims or printed nutritional text.
```

最终源：`exec-43cfb582-8a8a-42be-8489-1759265789a3.png`。

### 魔芋蛋糕（mo-yu-dan-gao）

具体成品描述：

```text
Plain cocoa konjac-egg cake baked in a simple metal cake tin and sliced: low rustic chocolate-brown airy sponge crumb made with eggs, cocoa and konjac powder, no wheat flour appearance labels; no icing, cream, fruit or chocolate toppings.
```

最终源：`exec-bc008a0c-1e82-4773-8aef-0f6ca6a2b2a5.png`。

### 牛油火锅底料（niu-you-huo-guo-di-liao）

具体成品描述：

```text
Homemade beef-tallow Sichuan hotpot base in a small storage bowl, deep cherry-red thick oily chili-bean spice paste with garlic, ginger and Sichuan pepper flecks, partly set opaque red tallow edges. Not a pot of diluted hotpot soup, no meat or vegetables ready to eat.
```

最终源：`exec-4e2ddab9-7331-49f2-815f-31049eccd8b4.png`。

### 蒲烧茄子（pu-shao-qie-zi）

具体成品描述：

```text
Peeled eggplant opened into flattened broad halves with lengthwise scoring, pan-seared and glazed deep glossy brown with sweet soy kabayaki sauce. Eggplant fibers clear, not grilled eel, no rice or sesame not in recipe.
```

最终源：`exec-e28c9472-ab7f-479e-a27f-ecc3e9b42daf.png`。

修正前源：`exec-0db1a640-01cd-476a-b727-932cf449760f.png`；以其本地路径作为唯一reference提交下面编辑提示，透明背景false：

```text
Edit this AI food illustration. Keep the dish, lighting, composition and EXACT centered 'AI 示意图' badge unchanged. Remove all purple or black eggplant SKIN. This recipe PEELS the eggplant completely: show broad flattened peeled eggplant flesh with lengthwise scoring, browned golden edges and deep soy-caramel glaze. The edges must look golden brown flesh, not dark purple skin. No eel, no other ingredients.
```

### 茄子炖土豆（qie-zi-dun-tu-dou）

具体成品描述：

```text
Chinese home braise of soft cooked purple eggplant chunks, golden potato chunks and thin cooked pork strips, a little pepper and garlic, reduced soy-brown sauce. No tomatoes.
```

最终源：`exec-f0ad7433-3309-487a-bf72-ae1503e986ff.png`。

### 清蒸南瓜（qing-zheng-nan-gua）

具体成品描述：

```text
Plain steamed orange pumpkin slices2cm thick, soft moist texture with thin rind edges, arranged on simple plate. No sugar, oil, seeds or other foods.
```

最终源：`exec-ec0a8f32-646f-42ab-9d9f-1c1ad228ba82.png`。

### 肉蛋盖饭（rou-dan-gai-fan）

具体成品描述：

```text
Bowl of steamed white rice topped with browned loose cooked pork mince and whole fried eggs with entirely set whites and firm golden yolks, soy-vinegar brown sauce and scallion. No steak, no runny raw egg.
```

最终源：`exec-bf338c65-942b-462d-b774-78691b9a2b72.png`。

### 肉蟹煲（rou-xie-bao）

具体成品描述：

```text
Chinese crab casserole: cut shell-on orange crab chunks with potato3cm cubes and oval rice-cake slices, onion segments, large green and red pepper diamonds in thick glossy reddish brown seafood-bean sauce. NO chicken feet, no tofu. Recipe lists shrimp but steps do not add them; omit shrimp.
```

最终源：`exec-72daefe9-79af-4467-ad90-f5e1773f4d2c.png`。

### 陕北熬豆角（shan-bei-ao-dou-jiao）

具体成品描述：

```text
Shaanbei stewed green beans cut2-10cm with small1cm potato cubes, softened tomato cooked into light red-brown sauce and thin green pepper strips, ginger garlic scallion and optional tiny coriander. Vegetables fully cooked, no meat.
```

最终源：`exec-57ad9919-8ea2-406b-be04-45bf0f2cfccb.png`。

### 山西过油肉（shan-xi-guo-you-rou）

具体成品描述：

```text
Shanxi guoyourou: silky cooked pork loin slices in light egg-starch coating, garlic scape3cm segments, black wood ear mushroom and onion diamond pieces, glossy light brown sauce. No thick batter or deep-red chili soup.
```

最终源：`exec-204b7e3c-c33b-4237-9fe2-6cdc76fdd995.png`。

### 商芝肉（shang-zhi-rou）

具体成品描述：

```text
Shaanxi shangzhi pork: very tender steamed skin-on pork belly slices10cm long arranged neatly overlapping and glossy reddish brown, cooked fern greens (bracken/shangzhi)3cm pieces below, a few thin triangular yellow egg-skin pieces in light brown gravy. No bamboo shoots.
```

最终源：`exec-e3052505-5d22-4da1-b0ad-1bd61670610d.png`。

### 酸辣蕨根粉（suan-la-jue-gen-fen）

具体成品描述：

```text
Cold sour-spicy bracken-root noodles: dark charcoal-brown thin translucent noodles tossed in red chili oil vinegar-soy dressing, chopped garlic scallion and tiny red bird-eye chili. No meat, peanuts or white wheat noodles.
```

最终源：`exec-450770f1-c8f2-4f96-9cf6-8bcacfc159c1.png`。

### 酸辣土豆丝（suan-la-tu-dou-si）

具体成品描述：

```text
Chinese sour-spicy potato julienne: very thin pale yellow cooked potato strips with a few thin green and red bell pepper strips, tiny dried chili segments and minced garlic, light glossy coating. Not fries or thick potato wedges.
```

最终源：`exec-efd9e74d-d9f9-4c8d-b008-bcf8ed76a0ce.png`。

### 蒜苔炒肉末（suan-tai-chao-rou-mo）

具体成品描述：

```text
Recipe actually uses pork belly strips5mm by5cm: stir-fried green garlic scape segments5cm with thin fully cooked pork belly strips and minced garlic in soy glaze. Do NOT show tiny minced pork; follow steps despite name.
```

最终源：`exec-40a98597-e57d-4dd3-ab5e-0464968e2576.png`。

### 糖醋汁（tang-cu-zhi）

具体成品描述：

```text
Small plain bowl of pourable Chinese sweet-sour cooking sauce, translucent soy-amber brown liquid made from water soy sugar vinegar cooking wine, glossy surface. No ketchup red sauce, no food immersed.
```

最终源：`exec-7ebb4001-4cf4-4989-a7c7-aeb40dc62f14.png`。

### 滕州菜煎饼（teng-zhou-cai-jian-bing）

具体成品描述：

```text
Tengzhou vegetable pancake: two thin wheat crepes enclosing thin cooked egg skin and shredded cabbage, carrot, short vermicelli, tofu cubes, chives, optional ham; pan-fried crisp golden, folded into10cm-wide rectangle and halved, cut edge revealing filling. Not a fluffy bread pie.
```

最终源：`exec-a2408819-4f25-4d78-ab74-bd02f31979f9.png`。

### 甜辣烤全翅（tian-la-kao-quan-chi）

具体成品描述：

```text
Exactly four roasted WHOLE chicken wings each with drumette, middle and pointed tip attached, bent natural shape, dark reddish glossy sweet spicy soy-paprika glaze, foil-lined pan. Not only wingettes, no chopped wing pieces.
```

最终源：`exec-fd15a400-faaa-44a0-a6fb-2a0f0445b281.png`。

### 土豆炖排骨（tu-dou-dun-pai-gu）

具体成品描述：

```text
Chinese soy-braised pork ribs cut into bone-in chunks and irregular golden potato chunks, thick glossy reddish brown sauce and chopped green scallions. No green peppers or other vegetables.
```

最终源：`exec-eea47fa7-7581-4fa5-9f57-99f2df8b0f6a.png`。

### 微波葱姜黑鳕鱼（wei-bo-cong-jiang-hei-xue-yu）

具体成品描述：

```text
Two fully cooked skin-on sablefish/black cod fillet portions with moist opaque white flaking flesh and dark skin edges, light soy sauce pooling below, very fine green scallion and ginger strips and shimmering hot-oil dressing. No whole fish, no bags or raw flesh.
```

最终源：`exec-7a182f70-f6a9-48cf-b6d0-9f13b3995340.png`。

### 咸肉菜饭（xian-rou-cai-fan）

具体成品描述：

```text
Chinese rice mixed thoroughly with small cured pork belly dice1cm, chopped bok choy stems and leaves, thin winter bamboo shoot slices and lard. Off-white grains and green flecks, no pork floss, egg or sausage.
```

最终源：`exec-c30ed459-4686-4017-9c63-e95c37e77172.png`。

### 香干肉丝（xiang-gan-rou-si）

具体成品描述：

```text
Stir-fried thin pork strips, firm brown-skinned dried tofu strips and green pepper strips, garlic slices in light glossy soy-starch sauce. No chicken, no soft round egg tofu.
```

最终源：`exec-0f2182f7-40e4-46ec-a13f-8261e5c56bc5.png`。

### 响油鳝丝（xiang-you-shan-si）

具体成品描述：

```text
Chinese sizzling eel strips: narrow fully cooked eel shreds in thick glossy dark soy-oyster sauce with chopped ginger and minced garlic, fresh minced garlic mound and small scallion flecks on top, shimmering hot lard dressing. No abundant long chives or other vegetables.
```

最终源：`exec-b9616868-dcf8-4122-b9ad-c520471ff09b.png`。

### 小米辣炒肉（xiao-mi-la-chao-rou）

具体成品描述：

```text
Fully cooked pork slices stir-fried with many red bird-eye chili diagonal pieces, minced ginger garlic, bean paste and soy glossy coating. No large green bell peppers.
```

最终源：`exec-6ec46ec1-34ec-4f82-815b-b7c2b26787ad.png`。

### 洋葱炒猪肉（yang-cong-chao-zhu-rou）

具体成品描述：

```text
Fully cooked pork slices and translucent browned onion petals, garlic in glossy brown soy sauce with slight tomato sauce undertone. No beef or large mixed vegetables.
```

最终源：`exec-5553119b-89ba-470e-9317-f6ff84c4dc66.png`。

### 油醋爆蛋（you-cu-bao-dan）

具体成品描述：

```text
Whole eggs pan-fried then cut into large irregular cooked pieces retaining recognizable egg white and firm yolk sections, glossy vinegar-soy sweet-sour glaze, minced garlic/red chili and3cm scallion segments. Not boiled egg discs or scrambled eggs.
```

最终源：`exec-88f0abeb-173b-4a08-9d3b-b4ce4776be9a.png`。

修正前源：`exec-6737f6b0-7d0e-4792-83a8-98f6385134e3.png`；以其本地路径作为唯一reference提交下面编辑提示，透明背景false：

```text
Edit this AI food illustration. Keep lighting, plate, brown vinegar-soy glaze, minced garlic/red chili and green scallion3cm pieces and the EXACT centered 'AI 示意图' badge. Replace ALL oval boiled egg halves with LARGE IRREGULAR PIECES OF PAN-FRIED SUNNY-SIDE EGGS cut with a spatula AFTER frying: thin flattened blistered crinkly golden egg-white sheets with crisp uneven edges, several flat firm golden yolk patches attached within the same white sheet pieces. Thin white layer only, NO thick smooth hard-boiled white ring, NO perfectly oval cross-section, NO round coin eggs, NO scrambled egg curds. Both whites and yolks entirely cooked.
```

### 油酥（you-su）

具体成品描述：

```text
Small ceramic bowl of smooth pale cream oil-flour roux paste with fine slightly sandy sheen, homogeneous pourable thick paste without lumps, spoon alongside rather than obscuring. No pastry or raw flour pile.
```

最终源：`exec-fa7d47b5-763d-49f2-8dd4-b63c87e5d09a.png`。

### 炸串酱料（zha-chuan-jiang-liao）

具体成品描述：

```text
Small bowl of thick dark red-brown Chinese skewer seasoning sauce, ground chili cumin Sichuan pepper sesame oily spice paste with visible white sesame seeds. No actual skewers or meat.
```

最终源：`exec-daa5f307-fc0b-4b06-a613-65bb67627e87.png`。

### 蒸卤面（zheng-lu-mian）

具体成品描述：

```text
Henan steamed braised noodles, thin wheat noodles evenly soy-brown and relatively dry, mixed with cooked pork belly slices, short celery segments and green pepper, small dried red chili. No noodle soup or bean sprouts.
```

最终源：`exec-2940eff2-8044-4491-8147-4e610feeffbf.png`。

### 枝竹羊腩煲（zhi-zhu-yang-nan-bao）

具体成品描述：

```text
Cantonese lamb belly claypot: cooked lamb chunks and softened fried tofu-skin5cm sticks, shiitake mushrooms and onion in thick dark brown fermented-tofu chu-hou sauce, scallion segments. No tomatoes or broccoli.
```

最终源：`exec-cd65d042-c531-48ed-9874-7c5783610bdc.png`。

### 中式馅饼（zhong-shi-xian-bing）

具体成品描述：

```text
This recipe uses batter rather than enclosed filling: one thin pan-fried savory wheat-egg pancake with fully cooked pork mince and fine carrot mixed THROUGHOUT the pancake and scallion segments on top. Golden on both sides, cut into wedges showing dense pancake interior; not a stuffed dough pocket.
```

最终源：`exec-440de1db-1619-456c-b112-8ff127b59ad5.png`。

### 煮泡面加蛋（zhu-pao-mian-jia-dan）

具体成品描述：

```text
Simple bowl of cooked curly instant noodles in seasoned broth with one whole poached egg, completely set opaque white and golden yolk; no sliced boiled eggs, vegetables, meat or other toppings.
```

最终源：`exec-073eb81e-e3e5-4169-ba4f-f92ee5d132a8.png`。

### 猪肉烩酸菜（zhu-rou-hui-suan-cai）

具体成品描述：

```text
Northeast Chinese braise of shredded fermented napa cabbage and soft cooked pork belly slices with a few pork rib pieces, very little light soy broth after reduction. No blood sausage or noodles.
```

最终源：`exec-68d653fb-b45e-498a-85ce-49f0b7f5d24f.png`。

### 猪油拌饭（zhu-you-ban-fan）

具体成品描述：

```text
Bowl of cooked rice fully tossed in soy-lard sauce, light brown glossy grains with small crispy pork fat cracklings and chopped scallion. No egg, mince, vegetables or braised pork slices.
```

最终源：`exec-de65b3b9-05ae-4353-b346-24213e589457.png`。

### 紫菜蛋花汤（zi-cai-dan-hua-tang）

具体成品描述：

```text
Chinese clear nori seaweed egg-drop soup with dark soft seaweed flakes, pale yellow cooked egg ribbons and tiny scallion flecks, a few tiny dried shrimps optional. No noodles or large seafood.
```

最终源：`exec-486fa9de-66d0-421d-bbdf-3a4d4554a3cb.png`。

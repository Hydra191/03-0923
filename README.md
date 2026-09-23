# PN 渗透压计算服务

基于 Node.js 20.18 + Express 的单接口服务，用于计算肠外营养液（PN）配方的总渗透压。

## 计算规则

- 终体积 = `base_volume_ml`（溶媒体积，缺省 **1000** ml）+ 所有合格成分的 `volume_ml` 之和
- 每种成分的毫渗量：

  ```
  mOsm/L = 质量(mg) ÷ 分子量 × 解离粒子数 × 1000 ÷ 终体积(ml)
  ```

- `hydrated: true`（含结晶水）的成分，先将质量 × **0.9091** 折算为无水物质量再计算
- 单项毫渗量 **低于 1 的按 0 计入**总和
- 总渗透压为各成分之和，结果**四舍五入到整数**
- 以下成分判定为不合格，返回其下标与原因并跳过（不计体积、不参与求和）：
  - `amount_mg`（质量）非正
  - `mw`（分子量）非正
  - `particles`（解离粒子数）非正
  - `volume_ml`（药液体积）为负

## 启动方式

要求 Node.js 20.18+。

```bash
npm install express
node server.js
# 可选自定义端口：PORT=8080 node server.js
```

服务默认监听 `http://localhost:3000`。

## 接口

### POST /api/v1/pn/osmolarity

请求体（JSON）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `base_volume_ml` | number | 溶媒体积，缺省 1000 |
| `components` | array | 成分数组 |

`components` 每项：

| 字段 | 类型 | 说明 |
|---|---|---|
| `amount_mg` | number | 溶质质量（mg） |
| `mw` | number | 分子量 |
| `particles` | number | 解离粒子数（如 NaCl 为 2） |
| `volume_ml` | number | 药液体积（ml），可省略，默认 0 |
| `hydrated` | boolean | 是否含结晶水，可省略，默认 false |

### 示例请求

```bash
curl -s -X POST http://localhost:3000/api/v1/pn/osmolarity \
  -H 'Content-Type: application/json' \
  -d '{
    "base_volume_ml": 1000,
    "components": [
      { "amount_mg": 5844, "mw": 58.44, "particles": 2, "volume_ml": 50, "hydrated": false },
      { "amount_mg": 1000, "mw": 180.16, "particles": 1, "volume_ml": 20 },
      { "amount_mg": 2460, "mw": 246.47, "particles": 2, "volume_ml": 10, "hydrated": true },
      { "amount_mg": -5, "mw": 100, "particles": 1, "volume_ml": 5 }
    ]
  }'
```

### 示例响应

```json
{
  "final_volume_ml": 1080,
  "total_osmolarity_mOsm_per_L": 207,
  "components": [
    {
      "index": 0,
      "hydrated": false,
      "effective_mass_mg": 5844,
      "osmolarity_mOsm_per_L": 185.1852,
      "counted_mOsm_per_L": 185.1852
    },
    {
      "index": 1,
      "hydrated": false,
      "effective_mass_mg": 1000,
      "osmolarity_mOsm_per_L": 5.1395,
      "counted_mOsm_per_L": 5.1395
    },
    {
      "index": 2,
      "hydrated": true,
      "effective_mass_mg": 2236.386,
      "osmolarity_mOsm_per_L": 16.8031,
      "counted_mOsm_per_L": 16.8031
    }
  ],
  "invalid_components": [
    { "index": 3, "reason": "amount_mg(溶质质量)必须为正数" }
  ]
}
```

字段说明：

- `final_volume_ml`：终体积（仅含合格成分的体积）
- `total_osmolarity_mOsm_per_L`：总渗透压（mOsm/L，四舍五入整数；单项 < 1 按 0 计）
- `components[].effective_mass_mg`：折算后实际参与计算的质量
- `components[].osmolarity_mOsm_per_L`：该成分原始毫渗量
- `components[].counted_mOsm_per_L`：实际计入总和的毫渗量（< 1 时为 0）
- `invalid_components`：不合格成分的下标及原因

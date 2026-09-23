# PN 渗透压计算 API

基于 Node.js 20.18 + Express 的单接口服务，用于计算肠外营养液（PN）的总渗透压（mOsm/L）。

## 环境要求

- Node.js 20.18+
- Express 4

## 启动方式

```bash
npm install express
node server.js
```

服务默认监听 `3000` 端口，可通过环境变量修改：

```bash
PORT=8080 node server.js
```

## 接口

### `POST /api/v1/pn/osmolarity`

#### 请求参数（JSON）

| 字段 | 类型 | 说明 |
|---|---|---|
| `base_volume_ml` | number | 溶媒体积（mL），缺省 `1000`，不可为负 |
| `components` | array | 成分数组 |

`components` 每一项：

| 字段 | 类型 | 说明 |
|---|---|---|
| `amount_mg` | number | 溶质质量（mg），必须为正 |
| `mw` | number | 分子量，必须为正 |
| `particles` | number | 解离粒子数，必须为正 |
| `volume_ml` | number | 药液体积（mL），不可为负，缺省 `0` |
| `hydrated` | boolean | 是否含结晶水；为 `true` 时质量先乘 `0.9091` 折算为无水物 |

#### 计算规则

- 终体积 = `base_volume_ml` + 所有**合格**成分的 `volume_ml` 之和
- 单项毫渗量：

  ```
  mOsm = (质量 × 含水系数) ÷ 分子量 × 粒子数 × 1000 ÷ 终体积
  ```

  其中 `hydrated` 为 `true` 时含水系数为 `0.9091`，否则为 `1`。
- 单项毫渗量低于 `1` 的按 `0` 计入总和
- 总渗透压 = 各合格成分计入值之和，四舍五入到整数
- 校验不合格的成分（质量或分子量非正、体积为负、粒子数非正）会被跳过：不计入终体积，也不参与求和，其下标与原因在响应的 `invalid` 中返回

#### 示例请求

```bash
curl -s -X POST http://localhost:3000/api/v1/pn/osmolarity \
  -H 'Content-Type: application/json' \
  -d '{
    "base_volume_ml": 1000,
    "components": [
      { "amount_mg": 5844, "mw": 58.44, "particles": 2, "volume_ml": 10, "hydrated": false },
      { "amount_mg": 1000, "mw": 180.16, "particles": 1, "volume_ml": 20, "hydrated": false },
      { "amount_mg": 2460, "mw": 123.0, "particles": 2, "volume_ml": 10, "hydrated": true },
      { "amount_mg": -5, "mw": 100, "particles": 1, "volume_ml": 5 }
    ]
  }'
```

#### 示例响应

```json
{
  "base_volume_ml": 1000,
  "final_volume_ml": 1040,
  "total_mosm": 233,
  "components": [
    {
      "index": 0,
      "amount_mg": 5844,
      "effective_amount_mg": 5844,
      "mw": 58.44,
      "particles": 2,
      "volume_ml": 10,
      "hydrated": false,
      "mosm": 192.31,
      "counted_mosm": 192.31
    },
    {
      "index": 1,
      "amount_mg": 1000,
      "effective_amount_mg": 1000,
      "mw": 180.16,
      "particles": 1,
      "volume_ml": 20,
      "hydrated": false,
      "mosm": 5.34,
      "counted_mosm": 5.34
    },
    {
      "index": 2,
      "amount_mg": 2460,
      "effective_amount_mg": 2236.386,
      "mw": 123,
      "particles": 2,
      "volume_ml": 10,
      "hydrated": true,
      "mosm": 34.97,
      "counted_mosm": 34.97
    }
  ],
  "invalid": [
    {
      "index": 3,
      "reasons": ["amount_mg must be a positive number"]
    }
  ]
}
```

> 单项 `mosm` 为实际计算值（保留两位小数，仅供查看）；`counted_mosm` 为实际计入总和的值（低于 1 时为 0）；`total_mosm` 由未四舍五入的计入值求和后再取整。

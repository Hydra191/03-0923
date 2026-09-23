const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_BASE_VOLUME_ML = 1000;
const HYDRATION_FACTOR = 0.9091; // 含结晶水药物折算为无水物的系数

app.use(express.json());

app.post('/api/v1/pn/osmolarity', (req, res) => {
  const body = req.body || {};

  // 溶媒体积：缺省 1000 mL，必须为非负数
  let baseVolume = body.base_volume_ml;
  if (baseVolume === undefined || baseVolume === null) {
    baseVolume = DEFAULT_BASE_VOLUME_ML;
  }
  if (typeof baseVolume !== 'number' || !Number.isFinite(baseVolume) || baseVolume < 0) {
    return res.status(400).json({
      error: 'base_volume_ml must be a non-negative number',
    });
  }

  const components = body.components;
  if (!Array.isArray(components)) {
    return res.status(400).json({
      error: 'components must be an array',
    });
  }

  // 第一遍：逐项校验，不合格的记下标与原因并跳过
  const invalid = [];
  const valid = [];

  components.forEach((item, index) => {
    const reasons = [];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      reasons.push('component must be an object');
    } else {
      const { amount_mg, mw, particles, volume_ml } = item;

      if (typeof amount_mg !== 'number' || !Number.isFinite(amount_mg) || amount_mg <= 0) {
        reasons.push('amount_mg must be a positive number');
      }
      if (typeof mw !== 'number' || !Number.isFinite(mw) || mw <= 0) {
        reasons.push('mw must be a positive number');
      }
      if (typeof particles !== 'number' || !Number.isFinite(particles) || particles <= 0) {
        reasons.push('particles must be a positive number');
      }
      const volume = volume_ml === undefined || volume_ml === null ? 0 : volume_ml;
      if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0) {
        reasons.push('volume_ml must be a non-negative number');
      }

      if (reasons.length === 0) {
        valid.push({
          index,
          amount_mg,
          mw,
          particles,
          volume_ml: volume,
          hydrated: item.hydrated === true,
        });
      }
    }

    if (reasons.length > 0) {
      invalid.push({ index, reasons });
    }
  });

  // 终体积 = 溶媒体积 + 所有合格成分的药液体积
  const finalVolumeMl = valid.reduce(
    (sum, c) => sum + c.volume_ml,
    baseVolume
  );

  if (finalVolumeMl <= 0) {
    return res.status(400).json({
      error: 'final volume must be positive (base_volume_ml plus valid component volumes is 0)',
    });
  }

  // 第二遍：计算每种成分的毫渗量
  let total = 0;
  const details = valid.map((c) => {
    const factor = c.hydrated ? HYDRATION_FACTOR : 1;
    const effectiveAmountMg = c.amount_mg * factor;
    // mOsm = 质量(mg) ÷ 分子量 × 粒子数 × 1000 ÷ 终体积(mL)
    const mosm =
      (effectiveAmountMg / c.mw) * c.particles * 1000 / finalVolumeMl;
    const countedMosm = mosm >= 1 ? mosm : 0; // 单项低于 1 按 0 计入
    total += countedMosm;

    return {
      index: c.index,
      amount_mg: c.amount_mg,
      effective_amount_mg: Number(effectiveAmountMg.toFixed(4)),
      mw: c.mw,
      particles: c.particles,
      volume_ml: c.volume_ml,
      hydrated: c.hydrated,
      mosm: Number(mosm.toFixed(2)),
      counted_mosm: Number(countedMosm.toFixed(2)),
    };
  });

  return res.json({
    base_volume_ml: baseVolume,
    final_volume_ml: Number(finalVolumeMl.toFixed(4)),
    total_mosm: Math.round(total),
    components: details,
    invalid,
  });
});

// JSON 解析失败等错误统一返回 400
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'request body must be valid JSON' });
  }
  return res.status(500).json({ error: 'internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PN osmolarity API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;

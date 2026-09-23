const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const isPosFinite = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

app.post('/api/v1/pn/osmolarity', (req, res) => {
  const body = req.body ?? {};
  const base_volume_ml = body.base_volume_ml === undefined ? 1000 : body.base_volume_ml;
  const { components } = body;

  if (typeof base_volume_ml !== 'number' || !Number.isFinite(base_volume_ml) || base_volume_ml < 0) {
    return res.status(400).json({ error: 'base_volume_ml 必须为非负数字' });
  }
  if (!Array.isArray(components)) {
    return res.status(400).json({ error: 'components 必须为数组' });
  }

  const invalid = [];
  const valid = [];

  components.forEach((c, index) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      invalid.push({ index, reason: '成分必须为对象' });
      return;
    }

    const { amount_mg, mw, particles, volume_ml = 0, hydrated = false } = c;
    const reasons = [];

    if (!isPosFinite(amount_mg)) reasons.push('amount_mg(溶质质量)必须为正数');
    if (!isPosFinite(mw)) reasons.push('mw(分子量)必须为正数');
    if (!isPosFinite(particles)) reasons.push('particles(解离粒子数)必须为正数');
    if (typeof volume_ml !== 'number' || !Number.isFinite(volume_ml) || volume_ml < 0) {
      reasons.push('volume_ml(药液体积)不能为负数');
    }

    if (reasons.length > 0) {
      // 不合格成分：返回下标与原因，跳过，不计体积也不参与求和
      invalid.push({ index, reason: reasons.join('；') });
      return;
    }

    valid.push({
      index,
      amount_mg,
      mw,
      particles,
      volume_ml,
      hydrated: Boolean(hydrated),
    });
  });

  const final_volume_ml = base_volume_ml + valid.reduce((sum, c) => sum + c.volume_ml, 0);

  if (final_volume_ml <= 0) {
    return res.status(400).json({ error: '终体积必须大于 0（请检查 base_volume_ml 与合格成分的 volume_ml）' });
  }

  const results = [];
  let total = 0;

  for (const c of valid) {
    // 含结晶水：先把质量 ×0.9091 折算成无水物
    const effective_mass_mg = c.hydrated ? c.amount_mg * 0.9091 : c.amount_mg;
    // 毫渗量 = 质量 ÷ 分子量 × 粒子数 × 1000 ÷ 终体积
    const raw_mOsm_per_L = (effective_mass_mg / c.mw) * c.particles * 1000 / final_volume_ml;
    // 单项低于 1 的按 0 计入
    const counted_mOsm_per_L = raw_mOsm_per_L < 1 ? 0 : raw_mOsm_per_L;

    total += counted_mOsm_per_L;
    results.push({
      index: c.index,
      hydrated: c.hydrated,
      effective_mass_mg: Number(effective_mass_mg.toFixed(4)),
      osmolarity_mOsm_per_L: Number(raw_mOsm_per_L.toFixed(4)),
      counted_mOsm_per_L: Number(counted_mOsm_per_L.toFixed(4)),
    });
  }

  return res.json({
    final_volume_ml,
    total_osmolarity_mOsm_per_L: Math.round(total),
    components: results,
    invalid_components: invalid,
  });
});

app.listen(PORT, () => {
  console.log(`PN osmolarity server listening on http://localhost:${PORT}`);
});

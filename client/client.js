// 和大人府邸 —— DSH 设置页里的一个栏目（settings.section）
// 把桌宠的所有可调项都收在这里：显示开关、甩飞阈值、亏空阈值、对话模型、余额来源。
// 数据来自宿主插件的 /heshen-pet/settings（同源，读改写都走它）。
window.__ModuleLoader__.load({
  id: 'dsh-hedaren-pet',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const box = {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      padding: '4px 2px 18px',
      color: 'inherit',
      fontSize: '13px',
      lineHeight: 1.6,
    }
    const row = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }
    const label = { flex: '0 0 96px', opacity: 0.72 }
    const hint = { opacity: 0.55, fontSize: '12px', margin: 0 }
    const card = {
      border: '1px solid rgba(127,127,127,.28)',
      borderRadius: '10px',
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }
    const input = {
      background: 'rgba(127,127,127,.12)',
      color: 'inherit',
      border: '1px solid rgba(127,127,127,.32)',
      borderRadius: '8px',
      padding: '4px 8px',
      fontSize: '13px',
      minWidth: '0',
    }
    const title = { fontSize: '15px', fontWeight: 600, margin: 0 }

    async function call(patch) {
      const res = await fetch('/heshen-pet/settings', {
        method: patch ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: patch ? { 'content-type': 'application/json' } : undefined,
        body: patch ? JSON.stringify(patch) : undefined,
      })
      return res.json()
    }

    function Field(props) {
      return h('div', { style: row }, h('span', { style: label }, props.name), props.children)
    }

    function HeshenSettings() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [saved, setSaved] = React.useState('')

      const apply = React.useCallback((payload) => {
        if (payload && payload.ok && payload.settings) setData(payload.settings)
        else setError((payload && payload.message) || '设置读不出来')
      }, [])

      React.useEffect(() => {
        let alive = true
        call()
          .then((payload) => {
            if (alive) apply(payload)
          })
          .catch((err) => {
            if (alive) setError(String((err && err.message) || err))
          })
        return () => {
          alive = false
        }
      }, [apply])

      const save = React.useCallback(
        async (patch, note) => {
          setError('')
          setSaved('')
          try {
            const payload = await call(patch)
            apply(payload)
            if (payload && payload.ok) setSaved(note || '已保存')
          } catch (err) {
            setError(String((err && err.message) || err))
          }
        },
        [apply],
      )

      if (!data) {
        return h('div', { style: box }, h('p', { style: hint }, error || '正在查和大人府邸的账本……'))
      }

      const models = Array.isArray(data.models) ? data.models : []
      const balance = data.balance || {}
      const sources = Array.isArray(balance.sources) ? balance.sources : []

      return h(
        'div',
        { style: box },
        h('h3', { style: title }, '和大人府邸'),
        h('p', { style: hint }, '和珅的桌面宠物：显示开关、甩飞手感、亏空阈值、聊天用哪个模型，都在这一页调。'),

        h(
          'div',
          { style: card },
          h(
            Field,
            { name: '桌宠显示' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(data.visible),
              onChange: (e) => void save({ visible: e.target.checked }, e.target.checked ? '已叫回和大人' : '已把和大人收起来'),
            }),
            h('span', { style: hint }, data.visible ? '此刻在桌面上' : '此刻隐藏着'),
          ),
          h(
            Field,
            { name: '大小' },
            h('input', {
              type: 'range',
              min: 70,
              max: 150,
              step: 5,
              value: Math.round((Number(data.scale) || 1) * 100),
              style: { flex: '1 1 160px' },
              onChange: (e) => apply({ ok: true, settings: { ...data, scale: Number(e.target.value) / 100 } }),
              onMouseUp: (e) => void save({ scale: Number(e.currentTarget.value) / 100 }),
              onTouchEnd: (e) => void save({ scale: Number(e.currentTarget.value) / 100 }),
            }),
            h('span', { style: { minWidth: '52px' } }, `${Math.round((Number(data.scale) || 1) * 100)}%`),
          ),
          h(
            Field,
            { name: '甩飞阈值' },
            h('input', {
              type: 'range',
              min: 50,
              max: 500,
              step: 10,
              value: Number(data.throwSettleMs) || 50,
              style: { flex: '1 1 160px' },
              onChange: (e) => apply({ ok: true, settings: { ...data, throwSettleMs: Number(e.target.value) } }),
              onMouseUp: (e) => void save({ throwSettleMs: Number(e.target.value) }),
              onTouchEnd: (e) => void save({ throwSettleMs: Number(e.currentTarget.value) }),
            }),
            h('span', { style: { minWidth: '52px' } }, `${Number(data.throwSettleMs) || 50} ms`),
            h('p', { style: hint }, '松手前静止超过这么久才甩出去；越小越灵敏。'),
          ),
          h(
            Field,
            { name: '亏空阈值' },
            h('input', {
              type: 'number',
              min: 0,
              max: 10000,
              step: 0.01,
              value: Number(data.jailThreshold) || 0,
              style: { ...input, width: '110px' },
              onChange: (e) => apply({ ok: true, settings: { ...data, jailThreshold: Number(e.target.value) } }),
              onBlur: (e) => void save({ jailThreshold: Number(e.target.value) }, '阈值已改'),
            }),
            h('span', { style: hint }, '余额低于这个数就进牢房（0 = 不关）'),
          ),
        ),

        h(
          'div',
          { style: card },
          h(
            Field,
            { name: '对话模型' },
            h(
              'span',
              { style: { flex: '1 1 220px' } },
              (() => {
                const hit = models.find((m) => m.id === data.chatModel)
                return hit ? `${hit.providerName} · ${hit.name}` : data.chatModel || '（还没选）'
              })(),
            ),
          ),
          h(
            'p',
            { style: hint },
            '这里只显示当前用的模型。要换模型请在「与和大人说话」窗口顶部那个下拉里选——选完立刻生效，下次也记得。',
          ),
        ),

        h(
          'div',
          { style: card },
          h('span', { style: { opacity: 0.72 } }, '国库余额'),
          h(
            'div',
            { style: { fontSize: '18px', fontWeight: 600 } },
            balance.amount === null || balance.amount === undefined
              ? '还没查到'
              : `${balance.currency === 'USD' ? '$' : '¥'}${Number(balance.amount).toFixed(2)}`,
            balance.label ? h('span', { style: { ...hint, marginLeft: '8px', fontWeight: 400 } }, `来自 ${balance.label}`) : null,
          ),
          h(
            'p',
            { style: hint },
            '能查到外部 api/plan 的余额就先报它（OpenRouter / 月之暗面），查不到才报 DeepSeek。当前已配置：' +
              (sources.filter((s) => s.configured).map((s) => s.label).join('、') || '无'),
          ),
        ),

        error ? h('p', { style: { ...hint, color: '#e06c75' } }, error) : null,
        saved ? h('p', { style: hint }, saved) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register
          ? ctx.slots.register(
              { name: 'settings.section', id: 'heshen-pet', order: 31, label: '和大人府邸' },
              HeshenSettings,
            )
          : undefined)
      },
    }
  },
})

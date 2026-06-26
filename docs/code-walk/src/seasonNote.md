# seasonNote

> 源路径：`src/seasonNote.ts`
> 总行数：约 128 行

根据今天日期推断当前所处节气，生成首页用的"今日 · XX"短文案。

## 文件概览

这是一个纯函数式的"季节感"小模块：内置一份二十四节气表（每个节气有近似月/日，足以驱动前端展示），给定日期时算出"现在正处于哪个节气附近 / 距离下一个节气还有几天"，再配上一组随季节轮换的"宜做"建议。它没有任何副作用，常被首页 / 列表页用来在角落渲染一行带节气氛围的提示。`createSeasonNote(date = new Date())` 是对外唯一入口；默认参数 `new Date()` 让调用方既能直接拿"今天"，也能在测试里传入固定日期验证逻辑。

## 节气表与季节建议

`solarTerms` 是 24 个 `{name, month, day}` 的近似日期表，足够前端展示用，但并非天文精确节气（真正的节气每年会浮动 1-2 天）。`seasonalSuggestions` 是按"季节索引"（春、夏、秋、冬 + 早春/冬末的兜底）分组的三句短语，由 `getSeasonIndex(monthIndex)` 决定取哪一组——它把 `getMonth()`（0-11）映射到 suggestions 数组的下标。

```ts
const solarTerms: SolarTerm[] = [
  { name: '小寒', month: 1, day: 5 },
  { name: '大寒', month: 1, day: 20 },
  // ... 立春、雨水、惊蛰 ... 冬至
];

const seasonalSuggestions = [
  ['读书', '写字', '整理旧稿'],
  ['散步', '听雨', '修订段落'],
  // ...
];
```

## createSeasonNote 主流程

主函数先取本地"当天 0 点"（避免 `getHours()` 在边界造成的天数偏移），算出"当前节气"和"下一个节气"。然后用天数差决定文案：

- 当前节气正是今天（`currentDistance === 0`）→ 标题用"今日 · XX"；
- 当前节气在 3 天内 → "今日 · XX后"；
- 否则看下一个节气，3 天内提示"近XX"，否则只展示建议。

```ts
if (currentDistance === 0) {
  return { title: `今日 · ${current.name}`, text: `宜：${suggestion.join('、')}` };
}
if (currentDistance <= 3) {
  return { title: `今日 · ${current.name}后`, text: `宜：${suggestion.join('、')}` };
}
return {
  title: `今日 · ${next.name}前`,
  text: nextDistance <= 3 ? `近${next.name}，宜：${suggestion.join('、')}` : `宜：${suggestion.join('、')}`,
};
```

## 节气定位辅助函数

`getCurrentSolarTerm` 与 `getNextSolarTerm` 是核心定位函数。前者把"去年的冬至"拼到本年节气表前面，这样 1 月初（在小寒之前）会落在"去年冬至"区间里；后者把"明年的小寒"拼到表末，让 12 月底（冬至之后）能找到下一个节气。两个函数都通过 `find` / `reverse().find` 找第一个满足条件的位置，并提供 fallback `?? terms[0]!`/`terms[terms.length - 1]!` 防御边界。

```ts
function getCurrentSolarTerm(date: Date, year: number) {
  const terms = [solarTerms[solarTerms.length - 1]!, ...solarTerms].map((term, index) => ({
    name: term.name,
    date: createTermDate(index === 0 ? year - 1 : year, term),
  }));
  return [...terms].reverse().find((term) => term.date <= date) ?? terms[0]!;
}
```

`getDayDistance` 把两个日期差转成"整天"数（除以 86400000 毫秒后四舍五入），这样夏令时引起的几小时偏差不会让结果跳一天。`startOfLocalDay` 把传入日期裁到本地 0 点，配合 `getDayDistance` 使用能保证节气距离是稳定的整数天。

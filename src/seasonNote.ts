type SolarTerm = {
  name: string;
  month: number;
  day: number;
};

export type SeasonNote = {
  title: string;
  text: string;
};

const solarTerms: SolarTerm[] = [
  { name: '小寒', month: 1, day: 5 },
  { name: '大寒', month: 1, day: 20 },
  { name: '立春', month: 2, day: 4 },
  { name: '雨水', month: 2, day: 19 },
  { name: '惊蛰', month: 3, day: 5 },
  { name: '春分', month: 3, day: 20 },
  { name: '清明', month: 4, day: 4 },
  { name: '谷雨', month: 4, day: 20 },
  { name: '立夏', month: 5, day: 5 },
  { name: '小满', month: 5, day: 21 },
  { name: '芒种', month: 6, day: 5 },
  { name: '夏至', month: 6, day: 21 },
  { name: '小暑', month: 7, day: 7 },
  { name: '大暑', month: 7, day: 22 },
  { name: '立秋', month: 8, day: 7 },
  { name: '处暑', month: 8, day: 23 },
  { name: '白露', month: 9, day: 7 },
  { name: '秋分', month: 9, day: 23 },
  { name: '寒露', month: 10, day: 8 },
  { name: '霜降', month: 10, day: 23 },
  { name: '立冬', month: 11, day: 7 },
  { name: '小雪', month: 11, day: 22 },
  { name: '大雪', month: 12, day: 7 },
  { name: '冬至', month: 12, day: 21 },
];

const seasonalSuggestions = [
  ['读书', '写字', '整理旧稿'],
  ['散步', '听雨', '修订段落'],
  ['早睡', '煮茶', '慢读'],
  ['观云', '夜行', '记一笔'],
  ['临水', '翻书', '写札记'],
  ['清扫', '备忘', '看月'],
];

export function createSeasonNote(date = new Date()): SeasonNote {
  const today = startOfLocalDay(date);
  const year = today.getFullYear();
  const current = getCurrentSolarTerm(today, year);
  const next = getNextSolarTerm(today, year);
  const currentDistance = getDayDistance(current.date, today);
  const nextDistance = getDayDistance(today, next.date);
  const suggestion = seasonalSuggestions[getSeasonIndex(today.getMonth())];

  if (currentDistance === 0) {
    return {
      title: `今日 · ${current.name}`,
      text: `宜：${suggestion.join('、')}`,
    };
  }

  if (currentDistance <= 3) {
    return {
      title: `今日 · ${current.name}后`,
      text: `宜：${suggestion.join('、')}`,
    };
  }

  return {
    title: `今日 · ${next.name}前`,
    text: nextDistance <= 3 ? `近${next.name}，宜：${suggestion.join('、')}` : `宜：${suggestion.join('、')}`,
  };
}

function getCurrentSolarTerm(date: Date, year: number) {
  const terms = [
    solarTerms[solarTerms.length - 1]!,
    ...solarTerms,
  ].map((term, index) => ({
    name: term.name,
    date: createTermDate(index === 0 ? year - 1 : year, term),
  }));

  return [...terms].reverse().find((term) => term.date <= date) ?? terms[0]!;
}

function getNextSolarTerm(date: Date, year: number) {
  const terms = [
    ...solarTerms,
    solarTerms[0]!,
  ].map((term, index) => ({
    name: term.name,
    date: createTermDate(index === solarTerms.length ? year + 1 : year, term),
  }));

  return terms.find((term) => term.date > date) ?? terms[terms.length - 1]!;
}

function createTermDate(year: number, term: SolarTerm) {
  return new Date(year, term.month - 1, term.day);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDistance(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function getSeasonIndex(monthIndex: number) {
  if (monthIndex >= 2 && monthIndex <= 3) {
    return 1;
  }

  if (monthIndex >= 4 && monthIndex <= 7) {
    return 3;
  }

  if (monthIndex >= 8 && monthIndex <= 10) {
    return 4;
  }

  return 2;
}

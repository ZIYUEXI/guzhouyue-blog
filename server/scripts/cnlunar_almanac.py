import json
import sys
from datetime import datetime

import cnlunar

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def compact_items(items, limit=6):
    result = []
    for item in items or []:
        text = str(item).strip()
        if text and text not in result:
            result.append(text)
        if len(result) >= limit:
            break
    return result


def main():
    date_text = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    date = datetime.strptime(date_text, "%Y-%m-%d")
    lunar = cnlunar.Lunar(date, godType="8char")
    solar_term = "" if lunar.todaySolarTerms == "无" else lunar.todaySolarTerms

    payload = {
        "date": date.strftime("%Y-%m-%d"),
        "weekDay": lunar.weekDayCn,
        "lunarYear": lunar.lunarYearCn,
        "lunarMonth": lunar.lunarMonthCn,
        "lunarDay": lunar.lunarDayCn,
        "zodiac": lunar.chineseYearZodiac,
        "solarTerm": solar_term,
        "nextSolarTerm": lunar.nextSolarTerm,
        "nextSolarTermDate": "%04d-%02d-%02d"
        % (lunar.nextSolarTermYear, lunar.nextSolarTermDate[0], lunar.nextSolarTermDate[1]),
        "dayGanzhi": lunar.day8Char,
        "monthGanzhi": lunar.month8Char,
        "yearGanzhi": lunar.year8Char,
        "zodiacClash": lunar.chineseZodiacClash,
        "levelName": lunar.thingLevelName,
        "goodThings": compact_items(lunar.goodThing),
        "badThings": compact_items(lunar.badThing),
        "source": "cnlunar",
    }

    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
